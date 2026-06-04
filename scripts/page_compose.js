// page_compose.js — runs in the X.com page context (injected via executeScript)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitFor(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error(`waitFor timeout: ${selector}`));
      }
    }, 200);
  });
}

function waitForEnabled(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el && el.getAttribute('aria-disabled') !== 'true' && !el.disabled) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error(`waitForEnabled timeout: ${selector}`));
      }
    }, 200);
  });
}

function waitForGone(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (!document.querySelector(selector)) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error(`Post not confirmed — compose dialog still open after ${timeout}ms`));
      }
    }, 200);
  });
}

function getStatusId(tweetUrl) {
  const m = tweetUrl.match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

function findArticleByStatusId(statusId) {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  for (const article of articles) {
    const a = article.querySelector(`a[href*="/status/${statusId}"]`);
    if (a) return article;
  }
  return null;
}

async function insertTextIntoCompose(replyText) {
  const textarea = await waitFor('[data-testid="tweetTextarea_0"][contenteditable="true"]');

  textarea.click();
  await sleep(100);
  textarea.focus();

  // Collapse multiple blank lines to single newline so spacing is clean
  const cleanText = replyText.replace(/\n{2,}/g, '\n').trim();

  // Use clipboard paste — more reliable than execCommand for multi-line text
  // in React's contenteditable (execCommand drops everything before the last \n)
  document.execCommand('selectAll', false, null);
  const dt = new DataTransfer();
  dt.setData('text/plain', cleanText);
  textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await sleep(150);

  return textarea;
}

async function openReply(tweetUrl, replyText) {
  const statusId = getStatusId(tweetUrl);
  if (!statusId) throw new Error('Could not extract status ID from URL: ' + tweetUrl);

  const article = findArticleByStatusId(statusId);
  if (!article) throw new Error('Could not find article for status: ' + statusId);

  // Step 1: click the reply icon on the tweet
  const replyBtn = article.querySelector('[data-testid="reply"]');
  if (!replyBtn) throw new Error('No reply button found on article');
  replyBtn.click();

  await insertTextIntoCompose(replyText);
  return { success: true };
}

async function postReply(tweetUrl, replyText) {
  const statusId = getStatusId(tweetUrl);
  if (!statusId) throw new Error('Could not extract status ID from URL: ' + tweetUrl);

  const article = findArticleByStatusId(statusId);
  if (!article) throw new Error('Could not find article for status: ' + statusId);

  // Scroll article into view so X doesn't virtual-DOM it away mid-interaction
  article.scrollIntoView({ behavior: 'instant', block: 'center' });
  await sleep(150);

  // Step 1: click the reply icon on the tweet
  const replyBtn = article.querySelector('[data-testid="reply"]');
  if (!replyBtn) throw new Error('No reply button found on article');
  replyBtn.click();
  // no fixed sleep — insertTextIntoCompose uses waitFor to detect when compose is ready

  // Steps 2 & 3: click compose box then paste text
  await insertTextIntoCompose(replyText);

  // Step 4: wait for the reply/post button to become enabled
  const postBtn = await waitForEnabled(
    '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
    10000
  );

  // Step 5: press the reply button
  postBtn.click();

  // Step 6: confirm post was actually sent — wait for compose textarea to disappear
  await waitForGone('[data-testid="tweetTextarea_0"]', 10000);

  return { success: true };
}

async function likeTweet(tweetUrl) {
  const statusId = getStatusId(tweetUrl);
  if (!statusId) throw new Error('Could not extract status ID from URL: ' + tweetUrl);

  const article = findArticleByStatusId(statusId);
  if (!article) throw new Error('Could not find article for status: ' + statusId);

  article.scrollIntoView({ behavior: 'instant', block: 'center' });
  await sleep(150);

  // Already liked — nothing to do
  if (article.querySelector('[data-testid="unlike"]')) return { success: true };

  const likeBtn = article.querySelector('[data-testid="like"]');
  if (!likeBtn) throw new Error('Like button not found');
  likeBtn.click();
  await sleep(100);

  return { success: true };
}

async function saveDraft(tweetUrl, replyText) {
  await openReply(tweetUrl, replyText);
  await sleep(400);

  const closeBtn =
    document.querySelector('[data-testid="app-bar-close"]') ||
    document.querySelector('[role="dialog"] button[aria-label="Close"]');

  if (!closeBtn) throw new Error('Could not find close button on compose dialog');
  closeBtn.click();

  const saveBtn = await waitFor('[data-testid="confirmationSheetConfirm"]', 6000);
  saveBtn.click();
  await sleep(300);

  return { success: true };
}
