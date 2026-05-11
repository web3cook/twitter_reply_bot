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

async function autoScrollAndScrape() {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const cutoff = Date.now() - TWO_HOURS_MS;

  const seenUrls = new Set();
  const posts = [];
  let noNewContentRounds = 0;

  while (noNewContentRounds < 3) {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    let newFound = false;
    let foundOlderTweet = false;

    for (const article of articles) {
      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      if (!tweetTextEl) continue;

      const tweetText = tweetTextEl.innerText.trim();
      if (!tweetText) continue;

      const tweetUrl = getArticleTweetUrl(article);
      if (!tweetUrl || seenUrls.has(tweetUrl)) continue;

      const timePostedISO = getArticleTimestamp(article);
      if (timePostedISO) {
        const tweetTime = new Date(timePostedISO).getTime();
        if (tweetTime < cutoff) {
          foundOlderTweet = true;
          continue;
        }
      }

      seenUrls.add(tweetUrl);
      newFound = true;
      posts.push({ username: getArticleUsername(article), tweetText, tweetUrl, timePostedISO });
    }

    if (foundOlderTweet) break;

    if (!newFound) {
      noNewContentRounds++;
    } else {
      noNewContentRounds = 0;
    }

    window.scrollBy(0, 900);
    await sleep(1200);
  }

  return { posts, loggedIn: isLoggedIn() };
}
