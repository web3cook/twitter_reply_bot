// LinkedIn/scraper.js — runs in the linkedin.com page context (injected via executeScript).
//
// Targets LinkedIn's NEW redesigned feed. Class names there are hashed and change
// constantly, and posts carry NO `data-urn`/activity id. The stable hooks we rely on:
//   - data-testid="mainFeed"            → the feed list
//   - p[componentkey^="feed-commentary"] + [data-testid="expandable-text-box"] → post body
//   - componentkey="expanded<POSTID>FeedType_MAIN_FEED_RELEVANCE" on the post listitem
//   - aria-label="Open control menu for post by <Name>" → author display name
//
// Because the feed exposes no public permalink, each post's canonical `tweetUrl` is a
// synthetic handle carrying the opaque POSTID; compose.js re-finds the post in the feed
// by that POSTID (all LinkedIn actions happen in-feed, no navigation needed).
//
// Canonical post shape: { username, tweetText, tweetUrl, timePostedISO }.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isLoggedIn() {
  return !!document.querySelector('[data-testid="mainFeed"]') ||
         !!document.querySelector('[aria-label="Start a post"]');
}

// Opaque per-post tracking id from the listitem's componentkey, e.g.
// "expandedSFKwOZ…nepdcFeedType_MAIN_FEED_RELEVANCE" → "SFKwOZ…nepdc".
function getPostId(root) {
  const ck = root.getAttribute('componentkey') || '';
  const m = ck.match(/^expanded(.+)FeedType_MAIN_FEED_RELEVANCE$/);
  return m ? m[1] : null;
}

// All real feed posts currently in the DOM (skips job carousels and other modules
// that lack a commentary body). De-duped by POSTID.
function getFeedPosts() {
  const out = [];
  const seen = new Set();
  for (const commentary of document.querySelectorAll('p[componentkey^="feed-commentary"]')) {
    const root = commentary.closest('[role="listitem"]');
    if (!root) continue;
    const id = getPostId(root);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(root);
  }
  return out;
}

// Strip LinkedIn's "…more" / "see more" expander text innerText tacks on.
function cleanPostText(text) {
  return text
    .replace(/\s*…\s*more\s*$/i, '')
    .replace(/\s*see more\s*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Promoted posts (ads) — skip them.
function isPromoted(root) {
  return [...root.querySelectorAll('p[componentkey] span')]
    .some(s => (s.textContent || '').trim() === 'Promoted');
}

// Relative age string ("1w", "8h", "2d") → approximate ISO timestamp, or null.
function relativeToISO(text) {
  const m = text.match(/(\d+)\s*(s|m|h|d|w|mo|yr|y)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const ms = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 2592e6, y: 31536e6, yr: 31536e6 }[m[2]];
  if (!ms) return null;
  return new Date(Date.now() - n * ms).toISOString();
}

// Best-effort post age from the actor subline (which shows e.g. "1w • 🌐").
function getTimeISO(root) {
  for (const s of root.querySelectorAll('p[componentkey] span')) {
    const t = (s.textContent || '').trim();
    if (/^\d+\s*(s|m|h|d|w|mo|yr|y)\b/.test(t) && (t.includes('•') || s.querySelector('svg'))) {
      const iso = relativeToISO(t);
      if (iso) return iso;
    }
  }
  return null;
}

// Author display name (from the control-menu aria-label, which is reliably the post
// author) + their /in/ or /company/ vanity slug matched back to that name.
function getAuthor(root) {
  let displayName = null;
  const menuBtn = root.querySelector('button[aria-label^="Open control menu for post by "]');
  if (menuBtn) {
    displayName = menuBtn.getAttribute('aria-label')
      .replace(/^Open control menu for post by\s+/i, '')
      .trim();
  }

  let username = null;
  if (displayName) {
    for (const a of root.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
      const labelText = (a.getAttribute('aria-label') || a.innerText || '').trim();
      const innerLabel = a.querySelector('[aria-label]')?.getAttribute('aria-label') || '';
      if (labelText.includes(displayName) || innerLabel.includes(displayName)) {
        const slug = (a.getAttribute('href') || '').match(/\/(?:in|company)\/([^/?#]+)/)?.[1];
        if (slug) { username = slug; break; }
      }
    }
  }
  return { displayName, username: username || displayName };
}

// A feed-post element → canonical post object, or null to skip.
function extractPost(root) {
  const id = getPostId(root);
  if (!id || isPromoted(root)) return null;

  const textEl = root.querySelector('p[componentkey^="feed-commentary"] [data-testid="expandable-text-box"]');
  const text = textEl ? cleanPostText(textEl.innerText) : '';
  if (!text) return null;

  const { displayName, username } = getAuthor(root);

  return {
    username: username || displayName || null,
    tweetText: text,
    tweetUrl: `https://www.linkedin.com/feed/?postId=${id}`,
    timePostedISO: getTimeISO(root),
  };
}

// Auto-scroll the feed and scrape up to maxPosts posts (human-like lag).
async function autoScrollAndScrape(maxPosts = 10) {
  const seen = new Set();
  const posts = [];
  let stale = 0;
  let lastHeight = 0;

  while (posts.length < maxPosts && stale < 4) {
    for (const el of getFeedPosts()) {
      if (posts.length >= maxPosts) break;
      const post = extractPost(el);
      if (!post || seen.has(post.tweetUrl)) continue;
      seen.add(post.tweetUrl);
      posts.push(post);
    }
    if (posts.length >= maxPosts) break;

    window.scrollBy(0, randInt(600, 1000));
    await sleep(randInt(800, 1600));

    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) stale++; else stale = 0;
    lastHeight = height;
  }

  return { posts, loggedIn: isLoggedIn() };
}

// Scrape only the posts currently in the viewport.
function scrapeCurrentView() {
  const viewportHeight = window.innerHeight;
  const seen = new Set();
  const posts = [];

  for (const el of getFeedPosts()) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= viewportHeight) continue;
    const post = extractPost(el);
    if (!post || seen.has(post.tweetUrl)) continue;
    seen.add(post.tweetUrl);
    posts.push(post);
  }

  return { posts, loggedIn: isLoggedIn() };
}

// Member display name from a profile / recent-activity header.
function getProfileDisplayName() {
  const h1 = document.querySelector('h1');
  return h1 ? h1.innerText.trim() : null;
}

// Scrape a member's authored post text (for tone generation), scrolling with
// human-like lag. Runs on /in/<vanity>/recent-activity/* pages.
async function scrapeAuthoredTweets(handle, maxCount = 50, maxChars = 300) {
  const seen = new Set();
  const texts = [];
  let stale = 0;
  let lastHeight = 0;

  while (texts.length < maxCount && stale < 4) {
    let newFound = false;
    for (const node of document.querySelectorAll('[data-testid="expandable-text-box"]')) {
      if (texts.length >= maxCount) break;
      const text = cleanPostText(node.innerText.trim());
      if (!text || text.length > maxChars || seen.has(text)) continue;
      seen.add(text);
      texts.push(text);
      newFound = true;
    }
    if (texts.length >= maxCount) break;

    window.scrollBy(0, randInt(500, 1000));
    await sleep(randInt(800, 1600));
    if (Math.random() < 0.2) await sleep(randInt(700, 1500));

    const height = document.documentElement.scrollHeight;
    if (!newFound && height === lastHeight) stale++; else stale = 0;
    lastHeight = height;
  }

  return { texts, displayName: getProfileDisplayName(), loggedIn: isLoggedIn() };
}
