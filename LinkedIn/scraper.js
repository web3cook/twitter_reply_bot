// LinkedIn/scraper.js — runs in the linkedin.com page context (injected via executeScript).
//
// Targets LinkedIn's NEW redesigned feed. Class names there are hashed and change
// constantly, and posts carry NO `data-urn`/activity id. The stable hooks we rely on:
//   - data-testid="mainFeed"            → the feed list
//   - p[componentkey^="feed-commentary"] + [data-testid="expandable-text-box"] → post body
//   - componentkey="expanded<POSTID>FeedType_MAIN_FEED_RELEVANCE" on the post listitem
//   - aria-label="Open control menu for post by <Name>" → author display name
//
// Because the feed exposes no public permalink, each post's canonical `linkedinUrl` is a
// synthetic handle carrying the opaque POSTID; compose.js re-finds the post in the feed
// by that POSTID (all LinkedIn actions happen in-feed, no navigation needed).
//
// Canonical post shape: { username, linkedinText, linkedinUrl, timePostedISO }.

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
  const m = ck.match(/^expanded(.+?)FeedType_/);
  if (m) return m[1];
  if (ck.startsWith('expanded') && ck.length > 20) {
    return ck.replace(/^expanded/, '').split('FeedType')[0];
  }
  return null;
}

// All real feed posts currently in the DOM (skips job carousels and other modules
// that lack a commentary body). De-duped by POSTID.
function getFeedPosts() {
  const out = [];
  const seen = new Set();

  // Try finding via listitems with componentkey expanded
  for (const el of document.querySelectorAll('[role="listitem"]')) {
    const id = getPostId(el);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(el);
    }
  }

  // Fallback: finding via commentary
  for (const commentary of document.querySelectorAll('p[componentkey^="feed-commentary"]')) {
    const root = commentary.closest('[role="listitem"]') || commentary.closest('[componentkey^="expanded"]');
    if (!root) continue;
    const id = getPostId(root);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(root);
    }
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

  // Extract document container info if present
  let docInfo = null;
  const docContainer = root.querySelector('[componentkey^="document-container"]');
  if (docContainer) {
    const pElements = Array.from(docContainer.querySelectorAll('p'));
    let title = '';
    let pages = '';

    const titleEl = docContainer.querySelector('p');
    if (titleEl) title = titleEl.textContent.trim();

    const pagesEl = pElements.find(p => p.textContent.toLowerCase().includes('page'));
    if (pagesEl) pages = pagesEl.textContent.trim();

    const slides = [];
    for (const img of docContainer.querySelectorAll('img')) {
      const alt = img.getAttribute('alt') || '';
      const src = img.getAttribute('src') || '';
      if (alt || src) {
        slides.push({ alt: alt.trim(), src: src.trim() });
      }
    }
    docInfo = { title, pages, slides };
  }

  // Extract other post content images if not a document post
  const images = [];
  if (!docContainer) {
    for (const img of root.querySelectorAll('img')) {
      const isAvatar = img.closest('.feed-shared-actor') || 
                       img.closest('[class*="actor"]') || 
                       img.closest('[class*="avatar"]') ||
                       (img.getAttribute('src') || '').includes('profile-displayphoto');
      if (isAvatar) continue;

      const alt = img.getAttribute('alt') || '';
      const src = img.getAttribute('src') || '';
      if (src && !src.includes('data:image')) {
        images.push({ alt: alt.trim(), src: src.trim() });
      }
    }
  }

  // Build the complete post text representation for UI/LLM context
  let linkedinText = text;

  if (docInfo) {
    const docParts = [];
    if (docInfo.title) docParts.push(`Document Title: ${docInfo.title}`);
    if (docInfo.pages) docParts.push(`(${docInfo.pages})`);

    let docStr = `\n\n[Document: ${docParts.join(' ')}]`;
    if (docInfo.slides && docInfo.slides.length > 0) {
      const slideAlts = docInfo.slides
        .map((s, index) => s.alt ? `Slide ${index + 1}: ${s.alt}` : '')
        .filter(Boolean);
      if (slideAlts.length > 0) {
        docStr += `\n` + slideAlts.join('\n');
      }
    }
    linkedinText = (linkedinText + docStr).trim();
  } else if (images.length > 0) {
    const imgAlts = images
      .map((img, index) => img.alt ? `[Image ${index + 1}: ${img.alt}]` : '[Image]')
      .filter(Boolean);
    if (imgAlts.length > 0) {
      linkedinText = (linkedinText + `\n\n` + imgAlts.join('\n')).trim();
    }
  }

  if (!linkedinText) return null;

  const { displayName, username } = getAuthor(root);

  console.log(`[Scraped Post] Profile: ${displayName} (@${username})`, {
    username,
    displayName,
    linkedinText: linkedinText,
    linkedinUrl: `https://www.linkedin.com/feed/?postId=${id}`,
    timePostedISO: getTimeISO(root)
  });

  return {
    username: username || displayName || null,
    tweetText: linkedinText,
    linkedinText: linkedinText,
    tweetUrl: `https://www.linkedin.com/feed/?postId=${id}`,
    linkedinUrl: `https://www.linkedin.com/feed/?postId=${id}`,
    timePostedISO: getTimeISO(root),
  };
}

function scrollFeed(distance) {
  // 1. Try global window scroll
  window.scrollBy(0, distance);

  // 2. Try scrolling element
  if (document.scrollingElement) {
    document.scrollingElement.scrollTop += distance;
  }

  // 3. Try any overflow scrollable div containers on the page
  const scrollableDivs = Array.from(document.querySelectorAll('div')).filter(el => {
    const style = window.getComputedStyle(el);
    return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
  });
  for (const div of scrollableDivs) {
    div.scrollTop += distance;
  }
}

function getScrollHeight() {
  let maxHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
  const scrollableDivs = Array.from(document.querySelectorAll('div')).filter(el => {
    const style = window.getComputedStyle(el);
    return (style.overflowY === 'auto' || style.overflowY === 'scroll');
  });
  for (const div of scrollableDivs) {
    maxHeight = Math.max(maxHeight, div.scrollHeight);
  }
  return maxHeight;
}

// Auto-scroll the feed and scrape up to maxPosts posts (human-like lag).
async function autoScrollAndScrape(maxPosts = 10) {
  const seen = new Set();
  const posts = [];
  const processedIds = new Set();

  while (posts.length < maxPosts) {
    const feedPosts = getFeedPosts();

    // Find the first post element we haven't processed yet
    const nextEl = feedPosts.find(el => {
      const id = getPostId(el);
      return id && !processedIds.has(id);
    });

    if (nextEl) {
      // Scroll to post by bringing it on the screen
      nextEl.scrollIntoView({ behavior: 'instant', block: 'center' });
      await sleep(500); // Sleep to let the post settle/render

      const post = extractPost(nextEl);
      if (post && !seen.has(post.linkedinUrl)) {
        seen.add(post.linkedinUrl);
        posts.push(post);
      }
      
      const id = getPostId(nextEl);
      processedIds.add(id);
    } else {
      // If the next post is still loading, scroll the last post into view to trigger loading
      if (feedPosts.length > 0) {
        const lastEl = feedPosts[feedPosts.length - 1];
        lastEl.scrollIntoView({ behavior: 'instant', block: 'center' });
      } else {
        scrollFeed(800);
      }

      console.log(`[Scraper] Waiting for new posts to load...`);
      let loadedNew = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(4000);
        const currentFeedPosts = getFeedPosts();
        const hasNew = currentFeedPosts.some(el => {
          const id = getPostId(el);
          return id && !processedIds.has(id);
        });
        if (hasNew) {
          console.log(`[Scraper] New posts loaded!`);
          loadedNew = true;
          break;
        }
      }

      // If no new posts loaded after 20 seconds, we stop to avoid an infinite loop
      if (!loadedNew) {
        console.log(`[Scraper] No new posts loaded after 20 seconds. Stopping scrape.`);
        break;
      }
    }
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
    if (!post || seen.has(post.linkedinUrl)) continue;
    seen.add(post.linkedinUrl);
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
async function scrapeAuthoredPosts(handle, maxCount = 50, maxChars = 300) {
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
