function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isLoggedIn() {
  return !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
         !!document.querySelector('[data-testid="AppTabBar_Home_Link"]');
}

function getArticleUsername(article) {
  const a = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
  if (!a) return null;
  return a.getAttribute('href').replace(/^\//, '');
}

function getArticleTweetUrl(article) {
  const a = article.querySelector('a[href*="/status/"]');
  if (!a) return null;
  const href = a.getAttribute('href');
  return href.startsWith('http') ? href : 'https://x.com' + href;
}

function getArticleTimestamp(article) {
  const time = article.querySelector('time');
  return time ? time.getAttribute('datetime') : null;
}

async function autoScrollAndScrape(maxPosts = 10) {
  const seenUrls = new Set();
  const posts = [];
  let noNewContentRounds = 0;

  while (noNewContentRounds < 3 && posts.length < maxPosts) {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    let newFound = false;

    for (const article of articles) {
      if (posts.length >= maxPosts) break;

      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      if (!tweetTextEl) continue;

      const tweetText = tweetTextEl.innerText.trim();
      if (!tweetText) continue;

      const tweetUrl = getArticleTweetUrl(article);
      if (!tweetUrl || seenUrls.has(tweetUrl)) continue;

      seenUrls.add(tweetUrl);
      newFound = true;
      posts.push({
        username: getArticleUsername(article),
        tweetText,
        tweetUrl,
        timePostedISO: getArticleTimestamp(article),
      });
    }

    if (!newFound) {
      noNewContentRounds++;
    } else {
      noNewContentRounds = 0;
    }

    if (posts.length < maxPosts) {
      window.scrollBy(0, 900);
      await sleep(1200);
    }
  }

  return { posts, loggedIn: isLoggedIn() };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Display name from the profile header (e.g. "Mert" for @mert)
function getProfileDisplayName() {
  const header = document.querySelector('[data-testid="UserName"]');
  if (!header) return null;
  const span = header.querySelector('span');
  return span ? span.innerText.trim() : null;
}

// True if this article is a repost (X shows a "<name> reposted" social-context label)
function isRepost(article) {
  const ctx = article.querySelector('[data-testid="socialContext"]');
  return !!ctx && /repost/i.test(ctx.textContent || '');
}

// The author handle of a tweet, read from its timestamp permalink (/<author>/status/<id>)
function getArticleAuthorHandle(article) {
  const time = article.querySelector('a[href*="/status/"] time');
  const anchor = time ? time.closest('a[href*="/status/"]') : null;
  const href = anchor ? anchor.getAttribute('href') : '';
  const m = href.match(/^\/([^/]+)\/status\/\d+/);
  return m ? m[1].toLowerCase() : null;
}

// Scrapes the currently-loaded profile feed (posts or with_replies) for tweets
// authored by `handle`, scrolling with human-like lag. Skips tweets longer than
// maxChars. Returns { texts, displayName, loggedIn }.
async function scrapeAuthoredTweets(handle, maxCount = 50, maxChars = 300) {
  const target = String(handle).replace(/^@/, '').toLowerCase();
  const seen = new Set();
  const texts = [];
  let stale = 0;
  let lastHeight = 0;

  while (texts.length < maxCount && stale < 4) {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    let newFound = false;

    for (const article of articles) {
      if (texts.length >= maxCount) break;
      if (isRepost(article)) continue;                       // skip reposts by the person
      if (getArticleAuthorHandle(article) !== target) continue;

      const textEl = article.querySelector('[data-testid="tweetText"]');
      if (!textEl) continue;
      const text = textEl.innerText.trim();
      if (!text || text.length > maxChars) continue;

      const link = article.querySelector('a[href*="/status/"]');
      const key = link ? link.getAttribute('href') : text;
      if (seen.has(key)) continue;

      seen.add(key);
      texts.push(text);
      newFound = true;
    }

    if (texts.length >= maxCount) break;

    // Human-like behaviour: variable scroll distance and variable pause
    window.scrollBy(0, randInt(450, 1000));
    await sleep(randInt(700, 1700));
    // Occasionally pause a little longer, like a person reading
    if (Math.random() < 0.2) await sleep(randInt(800, 1600));

    const height = document.documentElement.scrollHeight;
    if (!newFound && height === lastHeight) stale++;
    else stale = 0;
    lastHeight = height;
  }

  return { texts, displayName: getProfileDisplayName(), loggedIn: isLoggedIn() };
}

function scrapeCurrentView() {
  const viewportHeight = window.innerHeight;
  const seenUrls = new Set();
  const posts = [];

  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const rect = article.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= viewportHeight) continue;

    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    if (!tweetTextEl) continue;

    const tweetText = tweetTextEl.innerText.trim();
    if (!tweetText) continue;

    const tweetUrl = getArticleTweetUrl(article);
    if (!tweetUrl || seenUrls.has(tweetUrl)) continue;

    seenUrls.add(tweetUrl);
    posts.push({
      username:      getArticleUsername(article),
      tweetText,
      tweetUrl,
      timePostedISO: getArticleTimestamp(article),
    });
  }

  return { posts, loggedIn: isLoggedIn() };
}
