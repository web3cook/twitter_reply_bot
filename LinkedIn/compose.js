// LinkedIn/compose.js — runs in the linkedin.com page context (injected via executeScript).
//
// Targets LinkedIn's NEW redesigned feed (see LinkedIn/scraper.js for the hook rationale).
// Posts are re-found in the feed by the opaque POSTID carried in the synthetic linkedinUrl
// (no navigation — all actions happen inline in the feed):
//   - openReply(url, text) → open the comment box and insert text (no submit)
//   - postReply(url, text) → post a comment
//   - likePost(url)        → React (Like)
//   - saveDraft(url, text) → not supported (Draft UI is hidden for LinkedIn)
//
// Stable hooks: componentkey="expanded<POSTID>FeedType_MAIN_FEED_RELEVANCE" (post root),
// the Comment action button (identified by its visible "Comment" text — it has no
// aria-label/testid), and aria-label="Reaction button state: …" (the React button).
//
// CAVEAT: the comment composer DOM was not available when this was written, so the
// editor/submit selectors below are best-effort (Quill contenteditable + text-matched
// submit). They need a live verification pass with a comment box open.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Poll a finder fn until it returns truthy, or time out.
function waitFor(finder, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      let el = null;
      try { el = finder(); } catch { el = null; }
      if (el) { clearInterval(interval); resolve(el); }
      else if (Date.now() - start > timeout) { clearInterval(interval); reject(new Error('waitFor timeout')); }
    }, 200);
  });
}

// Poll a predicate until true, or time out.
function waitUntil(predicate, timeout = 10000, errMsg = 'waitUntil timeout') {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      let ok = false;
      try { ok = predicate(); } catch { ok = false; }
      if (ok) { clearInterval(interval); resolve(); }
      else if (Date.now() - start > timeout) { clearInterval(interval); reject(new Error(errMsg)); }
    }, 200);
  });
}

// Opaque POSTID from the synthetic feed URL produced by the scraper.
function getPostId(url) {
  return (url.match(/[?&#](?:postId=|post-)([\w-]+)/) || [])[1] || null;
}

// The post listitem for a given POSTID, currently in the DOM.
function findUpdateById(postId) {
  return document.querySelector(
    `[role="listitem"][componentkey="expanded${postId}FeedType_MAIN_FEED_RELEVANCE"]`
  );
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

// Scroll the feed until the target post is in the DOM, then return it.
async function waitForUpdate(postId, timeout = 60000) {
  const start = Date.now();
  const scrollStep = Math.round(window.innerHeight * 0.8);

  while (true) {
    const update = findUpdateById(postId);
    if (update) {
      update.scrollIntoView({ behavior: 'instant', block: 'center' });
      await sleep(200);
      return update;
    }
    if (Date.now() - start >= timeout) throw new Error('post not found in feed');

    // Scroll by bringing the last loaded post listitem into the viewport
    const updates = document.querySelectorAll('[role="listitem"][componentkey^="expanded"]');
    if (updates.length > 0) {
      updates[updates.length - 1].scrollIntoView({ behavior: 'instant', block: 'center' });
    } else {
      scrollFeed(scrollStep);
    }
    await sleep(500);
  }
}

// The "Comment" action button (has no aria-label/testid — only visible "Comment" text).
function findCommentButton(update) {
  return [...update.querySelectorAll('button[type="button"]')]
    .find(b => (b.innerText || '').trim() === 'Comment') || null;
}

// The React/Like button in a post's action bar.
function findLikeButton(update) {
  return update.querySelector('button[aria-label^="Reaction button state:" i]');
}

function isAlreadyReacted(btn) {
  const label = btn.getAttribute('aria-label') || '';
  return !/no reaction/i.test(label);
}

// The comment editor (a contenteditable) once the comment box is open.
function findCommentEditor(update) {
  return (
    update.querySelector('.ql-editor[contenteditable="true"]') ||
    update.querySelector('[contenteditable="true"][role="textbox"]') ||
    update.querySelector('[contenteditable="true"]')
  );
}

// The submit button inside the open comment box — identified by its "Post"/"Comment"
// text and excluding the original action-bar trigger.
function findSubmitButton(update, triggerBtn) {
  const editor = findCommentEditor(update);
  return [...update.querySelectorAll('button')]
    .find(b => {
      if (b === triggerBtn) return false;
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
      const txt = (b.innerText || '').trim();
      if (!/^(post|comment|reply)$/i.test(txt)) return false;
      // prefer a button positioned after the editor (the composer's submit)
      return !editor || (editor.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    }) || null;
}

// Insert text into the comment editor via a paste event (reliable for multi-line
// contenteditable; setting innerText drops the editor's internal model).
async function insertCommentText(editor, text) {
  editor.click();
  await sleep(100);
  editor.focus();

  const clean = text.replace(/\n{2,}/g, '\n').trim();

  document.execCommand('selectAll', false, null);
  const dt = new DataTransfer();
  dt.setData('text/plain', clean);
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await sleep(150);
}

// Open the comment composer for a post and insert text (does not submit).
async function openReply(url, text) {
  const postId = getPostId(url);
  if (!postId) throw new Error('Could not extract post id from URL: ' + url);

  const update = await waitForUpdate(postId);

  let editor = findCommentEditor(update);
  if (!editor) {
    const commentBtn = findCommentButton(update);
    if (!commentBtn) throw new Error('No comment button found on post');
    commentBtn.click();
    editor = await waitFor(() => findCommentEditor(update), 8000);
  }

  await insertCommentText(editor, text);
  return { success: true };
}

// Post a comment on a post.
async function postReply(url, text) {
  const postId = getPostId(url);
  if (!postId) throw new Error('Could not extract post id from URL: ' + url);

  const update = await waitForUpdate(postId);

  // Open the comment box + insert text.
  let editor = findCommentEditor(update);
  const commentBtn = findCommentButton(update);
  if (!editor) {
    if (!commentBtn) throw new Error('No comment button found on post');
    commentBtn.click();
    editor = await waitFor(() => findCommentEditor(update), 8000);
  }
  await insertCommentText(editor, text);

  // Wait for the submit button to appear/enable, then click it.
  const submitBtn = await waitFor(() => findSubmitButton(update, commentBtn), 10000);
  submitBtn.click();

  // Confirm the comment posted — the editor clears back to empty.
  await waitUntil(() => {
    const e = findCommentEditor(update);
    return !e || !(e.innerText || '').trim();
  }, 10000, 'Comment not confirmed — editor still has text after 10s');

  return { success: true };
}

// React (Like) to a post.
async function likePost(url) {
  const postId = getPostId(url);
  if (!postId) throw new Error('Could not extract post id from URL: ' + url);

  const update = await waitForUpdate(postId);

  const likeBtn = findLikeButton(update);
  if (!likeBtn) throw new Error('Like button not found');

  // Already reacted — nothing to do.
  if (isAlreadyReacted(likeBtn)) return { success: true };

  likeBtn.click();
  await sleep(150);

  return { success: true };
}

// LinkedIn has no draft concept — the Draft UI is hidden, so this is never called.
async function saveDraft(url, text) {
  throw new Error('Drafts are not supported on LinkedIn');
}
