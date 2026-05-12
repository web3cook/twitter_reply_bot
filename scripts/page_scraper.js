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
