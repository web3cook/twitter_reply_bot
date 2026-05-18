import { JonWu, Naruto, Mert, Medusa, ChainYoda } from './voices.js';

const STORAGE_KEY    = 'xReplyBotData';
const DRAFT_DELAY_MS = 500;

const VOICES = {
  jonwu:     { label: 'Jon Wu',    prompt: JonWu },
  naruto:    { label: 'Naruto',    prompt: Naruto },
  mert:      { label: 'Mert',      prompt: Mert },
  medusa:    { label: 'Medusa',    prompt: Medusa },
  chainyoda: { label: 'ChainYoda', prompt: ChainYoda },
};

const STATUS_LABELS = {
  drafted: 'drafted',
  posted:  'posted',
  error:   'error',
  saving:  'saving…',
  posting: 'posting…',
  pending: 'pending',
};

let xTabId           = null;
let replyItems       = [];
let composeInjected  = false;
let customVoices     = [];
let selectedVoiceKey = 'jonwu';
let loggedInUsername = null;

const loginModal             = document.getElementById('login-modal');
const btnOpenXLogin          = document.getElementById('btn-open-x-login');
const btnCheckAgain          = document.getElementById('btn-check-again');
const contextBanner          = document.getElementById('context-banner');
const bannerIcon             = contextBanner.querySelector('.banner-icon');
const bannerText             = document.getElementById('context-banner-text');
const loginDot               = document.getElementById('login-dot');
const btnOpenX               = document.getElementById('btn-open-x');
const btnGoList              = document.getElementById('btn-go-list');
const listSection            = document.getElementById('list-section');
const btnGenerate            = document.getElementById('btn-generate');
const btnReplyCurrent        = document.getElementById('btn-reply-current');
const bulkRow                = document.getElementById('bulk-row');
const btnDraftAll            = document.getElementById('btn-draft-all');
const btnPostAll             = document.getElementById('btn-post-all');
const clearRow               = document.getElementById('clear-row');
const btnClearData           = document.getElementById('btn-clear-data');
const clearMsg               = document.getElementById('clear-msg');
const draftCounter           = document.getElementById('draft-counter');
const progressRow            = document.getElementById('progress-row');
const progressText           = document.getElementById('progress-text');
const progressBar            = document.getElementById('progress-bar');
const cardsSection           = document.getElementById('cards-section');
const apiKeyInput            = document.getElementById('api-key-input');
const btnSaveKey             = document.getElementById('btn-save-key');
const keySavedMsg            = document.getElementById('key-saved-msg');
const modelSelect            = document.getElementById('model-select');
const modelCustomInput       = document.getElementById('model-custom-input');
const modeButtonsContainer   = document.getElementById('mode-buttons');
const modeSavedMsg           = document.getElementById('mode-saved-msg');
const postCountInput         = document.getElementById('post-count-input');
const voiceButtonsContainer  = document.getElementById('voice-buttons');
const customVoiceScreen      = document.getElementById('custom-voice-screen');
const btnBack                = document.getElementById('btn-back');
const customVoiceNameInput   = document.getElementById('custom-voice-name');
const customVoicePromptInput = document.getElementById('custom-voice-prompt');
const btnSaveVoice           = document.getElementById('btn-save-voice');
const voiceSavedMsg          = document.getElementById('voice-saved-msg');
const savedVoicesSection     = document.getElementById('saved-voices-section');
const savedVoicesList        = document.getElementById('saved-voices-list');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function flashMessage(el) {
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

function statusToLabel(status) {
  return STATUS_LABELS[status] ?? 'pending';
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getXTab() {
  const tabs = await chrome.tabs.query({ url: ['https://x.com/*'] });
  return tabs.length ? tabs[0] : null;
}

async function ensureXTab() {
  if (xTabId) return true;
  const tab = await getXTab();
  if (!tab) { alert('No X tab found. Open x.com first.'); return false; }
  xTabId = tab.id;
  return true;
}

async function focusOrOpenXTab() {
  const tab = await getXTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: 'https://x.com' });
  }
  setTimeout(updateOpenXButton, 600);
}

async function updateOpenXButton() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isXActive = activeTab?.url?.startsWith('https://x.com') ||
                    false;
  if (isXActive) {
    btnOpenX.classList.add('secondary');
    btnOpenX.textContent = 'X Open';
  } else {
    btnOpenX.classList.remove('secondary');
    btnOpenX.textContent = 'Open X →';
  }
}

function renderVoiceButtons() {
  voiceButtonsContainer.innerHTML = '';

  Object.entries(VOICES).forEach(([key, voice]) => {
    const btn = document.createElement('button');
    btn.className    = 'voice-btn' + (selectedVoiceKey === key ? ' active' : '');
    btn.dataset.voice = key;
    btn.textContent  = voice.label;
    voiceButtonsContainer.appendChild(btn);
  });

  customVoices.forEach(cv => {
    const btn = document.createElement('button');
    btn.className    = 'voice-btn' + (selectedVoiceKey === cv.id ? ' active' : '');
    btn.dataset.voice = cv.id;
    btn.textContent  = cv.name;
    voiceButtonsContainer.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.className    = 'voice-btn add-custom';
  addBtn.dataset.voice = '__add__';
  addBtn.textContent  = '+ Add';
  voiceButtonsContainer.appendChild(addBtn);
}

function renderModeButtons(activeMode) {
  modeButtonsContainer.innerHTML = '';
  [['sidepanel', 'Side Panel'], ['popup', 'Popup']].forEach(([mode, label]) => {
    const btn = document.createElement('button');
    btn.className    = 'mode-btn' + (activeMode === mode ? ' active' : '');
    btn.dataset.mode = mode;
    btn.textContent  = label;
    modeButtonsContainer.appendChild(btn);
  });
}

function renderSavedVoicesList() {
  if (customVoices.length === 0) {
    savedVoicesSection.classList.add('hidden');
    return;
  }
  savedVoicesSection.classList.remove('hidden');
  savedVoicesList.innerHTML = '';
  customVoices.forEach(cv => {
    const item = document.createElement('div');
    item.className = 'saved-voice-item';
    item.innerHTML = `
      <span class="saved-voice-name">${escapeHtml(cv.name)}</span>
      <button class="btn-delete-voice secondary small" data-id="${cv.id}">Delete</button>
    `;
    savedVoicesList.appendChild(item);
  });
}

function showCustomVoiceScreen() {
  renderSavedVoicesList();
  customVoiceScreen.classList.remove('hidden');
}

function hideCustomVoiceScreen() {
  customVoiceScreen.classList.add('hidden');
}

function getSelectedModel() {
  if (modelSelect.value === 'custom') {
    return modelCustomInput.value.trim() || 'gpt-5.4';
  }
  return modelSelect.value || 'gpt-5.4';
}

async function fetchAndPopulateModels(apiKey, savedModelName = 'gpt-5.4') {
  if (!apiKey) return;

  modelSelect.innerHTML = '<option disabled selected>Loading models…</option>';
  modelSelect.disabled  = true;

  try {
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const { data } = await resp.json();

    const ids = data
      .filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id))
      .sort((a, b) => b.created - a.created)
      .map(m => m.id);

    modelSelect.innerHTML = '';
    modelSelect.disabled  = false;
    ids.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      modelSelect.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Custom…';
    modelSelect.appendChild(customOpt);

    if (ids.includes(savedModelName)) {
      modelSelect.value = savedModelName;
      modelCustomInput.classList.add('hidden');
    } else {
      modelSelect.value         = 'custom';
      modelCustomInput.value    = savedModelName;
      modelCustomInput.classList.remove('hidden');
    }
  } catch {
    modelSelect.disabled  = false;
    modelSelect.innerHTML = `
      <option value="gpt-5.4">gpt-5.4 (default)</option>
      <option value="gpt-4o">gpt-4o</option>
      <option value="gpt-4o-mini">gpt-4o-mini</option>
      <option value="gpt-4-turbo">gpt-4-turbo</option>
      <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
      <option value="custom">Custom…</option>
    `;
    const fallbacks = ['gpt-5.4', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    if (fallbacks.includes(savedModelName)) {
      modelSelect.value = savedModelName;
    } else {
      modelSelect.value      = 'custom';
      modelCustomInput.value = savedModelName;
      modelCustomInput.classList.remove('hidden');
    }
  }
}

function resolvePrompt() {
  if (selectedVoiceKey.startsWith('cv:')) {
    const cv = customVoices.find(v => v.id === selectedVoiceKey);
    return cv?.prompt?.trim() || VOICES.jonwu.prompt;
  }
  return VOICES[selectedVoiceKey]?.prompt || VOICES.jonwu.prompt;
}

async function callOpenAI(tweetText, apiKey, prompt, model) {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-5.4',
      max_output_tokens: 150,
      temperature: 0.7,
      instructions: prompt,
      input: tweetText + ' Reply in character.',
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error ${resp.status}`);
  }
  const data = await resp.json();
  return data.output[0].content[0].text.replace(/\n{2,}/g, '\n').trim();
}

async function injectFile(tabId, file) {
  await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
}

async function callPageFn(tabId, fn, args = []) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, function: fn, args });
  return results[0].result;
}

async function checkLogin(tabId) {
  try {
    const loggedIn = await callPageFn(tabId, () => {
      return !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
             !!document.querySelector('[data-testid="AppTabBar_Home_Link"]');
    }, []);
    loginDot.className = 'dot ' + (loggedIn ? 'dot-green' : 'dot-red');
    loginDot.title = loggedIn ? 'Logged in' : 'Not logged in';
    if (!loggedIn) loginModal.classList.remove('hidden');
    return loggedIn;
  } catch {
    loginDot.className = 'dot dot-gray';
    loginDot.title = 'Could not check login';
    return false;
  }
}

async function saveItems() {
  await chrome.storage.local.set({ [STORAGE_KEY]: replyItems });
}

async function loadItems() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  replyItems = data[STORAGE_KEY] || [];
}

function showBanner(type, text) {
  bannerIcon.textContent = type === 'warn' ? '⚠' : 'ℹ';
  bannerText.textContent = text;
  contextBanner.className = `banner ${type}`;
}

function updateDraftCounter() {
  const drafted = replyItems.filter(i => i.status === 'drafted').length;
  const posted  = replyItems.filter(i => i.status === 'posted').length;
  const pending = replyItems.filter(i => i.status === 'pending').length;
  const total   = replyItems.length;

  if (total) {
    const parts = [];
    if (drafted) parts.push(`${drafted} drafted`);
    if (posted)  parts.push(`${posted} posted`);
    draftCounter.textContent = parts.length ? `${parts.join(', ')} / ${total}` : `0 / ${total}`;
    bulkRow.classList.remove('hidden');
  } else {
    draftCounter.textContent = '';
    bulkRow.classList.add('hidden');
  }

  btnDraftAll.disabled = pending === 0;
  btnPostAll.disabled  = pending === 0;
  clearRow.classList.toggle('hidden', total === 0);
}

function renderCards() {
  cardsSection.innerHTML = '';
  replyItems.forEach((item, idx) => renderCard(item, idx));
  updateDraftCounter();
}

function renderCard(item, idx) {
  const card          = document.createElement('div');
  const isDone        = item.status === 'drafted' || item.status === 'posted';
  const doneClass     = item.status === 'drafted' ? ' drafted' : item.status === 'posted' ? ' posted' : '';
  const draftBtnClass = item.status === 'drafted' ? 'success' : 'secondary';
  const postBtnClass  = item.status === 'posted'  ? 'posted'  : '';

  card.className   = 'reply-card' + doneClass;
  card.dataset.idx = idx;
  card.innerHTML   = `
    <div class="card-header">
      <span class="card-username">@${item.post.username || '?'}</span>
      <div class="card-header-right">
        <span class="card-status ${item.status}">${statusToLabel(item.status)}</span>
        <button class="btn-remove-card" data-idx="${idx}" title="Remove">×</button>
      </div>
    </div>
    <div class="card-tweet">${escapeHtml(item.post.tweetText)}</div>
    <textarea class="card-textarea" rows="3">${escapeHtml(item.reply || '')}</textarea>
    <div class="card-actions">
      <button class="btn-open-reply secondary small" data-idx="${idx}">Open</button>
      <button class="btn-save-draft ${draftBtnClass} small" data-idx="${idx}" ${isDone ? 'disabled' : ''}>
        ${item.status === 'drafted' ? 'Drafted ✓' : 'Save Draft'}
      </button>
      <button class="btn-post-reply ${postBtnClass} small" data-idx="${idx}" ${isDone ? 'disabled' : ''}>
        ${item.status === 'posted' ? 'Posted ✓' : 'Post'}
      </button>
    </div>
  `;
  cardsSection.appendChild(card);
}

function updateCardStatus(idx, status) {
  replyItems[idx].status = status;
  const card = cardsSection.querySelector(`.reply-card[data-idx="${idx}"]`);
  if (!card) return;

  const statusEl     = card.querySelector('.card-status');
  const saveDraftBtn = card.querySelector('.btn-save-draft');
  const postReplyBtn = card.querySelector('.btn-post-reply');

  statusEl.className   = `card-status ${status}`;
  statusEl.textContent = statusToLabel(status);

  if (status === 'drafted') {
    card.className           = 'reply-card drafted';
    saveDraftBtn.textContent = 'Drafted ✓';
    saveDraftBtn.className   = 'btn-save-draft success small';
    saveDraftBtn.disabled    = true;
    postReplyBtn.disabled    = true;
  } else if (status === 'posted') {
    card.className           = 'reply-card posted';
    postReplyBtn.textContent = 'Posted ✓';
    postReplyBtn.className   = 'btn-post-reply posted small';
    postReplyBtn.disabled    = true;
    saveDraftBtn.disabled    = true;
  } else if (status === 'saving') {
    saveDraftBtn.textContent = 'Saving…';
    saveDraftBtn.disabled    = true;
    postReplyBtn.disabled    = true;
  } else if (status === 'posting') {
    postReplyBtn.textContent = 'Posting…';
    postReplyBtn.disabled    = true;
    saveDraftBtn.disabled    = true;
  } else if (status === 'error') {
    saveDraftBtn.textContent = 'Save Draft';
    saveDraftBtn.disabled    = false;
    postReplyBtn.textContent = 'Post';
    postReplyBtn.disabled    = false;
  }

  updateDraftCounter();
}

function getCardReplyText(idx) {
  const textarea = cardsSection.querySelector(`.reply-card[data-idx="${idx}"] .card-textarea`);
  return textarea ? textarea.value.trim() : replyItems[idx].reply;
}

async function ensureComposeInjected() {
  if (!composeInjected) {
    await injectFile(xTabId, 'scripts/page_compose.js');
    composeInjected = true;
  }
}

async function executeCompose(idx, pageFn, pendingStatus, doneStatus) {
  const item      = replyItems[idx];
  const replyText = getCardReplyText(idx);
  if (!await ensureXTab()) return;

  updateCardStatus(idx, pendingStatus);
  try {
    await ensureComposeInjected();
    await callPageFn(xTabId, pageFn, [item.post.tweetUrl, replyText]);
    replyItems[idx].reply = replyText;
    updateCardStatus(idx, doneStatus);
    await saveItems();
  } catch (err) {
    console.error(`${doneStatus} error:`, err);
    updateCardStatus(idx, 'error');
  }
}

async function saveSingleDraft(idx) {
  await executeCompose(idx, (url, text) => saveDraft(url, text), 'saving', 'drafted');
}

async function postSingleReply(idx) {
  await executeCompose(idx, (url, text) => postReply(url, text), 'posting', 'posted');
}

async function processPostsToReplies(posts, openaiApiKey) {
  if (loggedInUsername) {
    posts = posts.filter(p => p.username?.toLowerCase() !== loggedInUsername);
  }

  if (!posts || posts.length === 0) {
    alert('No tweets found. Make sure there are tweets visible on the page.');
    return false;
  }

  const doneByUrl = new Map(
    replyItems
      .filter(i => i.status === 'drafted' || i.status === 'posted')
      .map(i => [i.post.tweetUrl, i])
  );
  replyItems             = [];
  cardsSection.innerHTML = '';
  composeInjected        = false;

  progressRow.classList.remove('hidden');
  progressBar.style.width = '0%';

  const prompt = resolvePrompt();
  const model  = getSelectedModel();

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    progressText.textContent = `Generating ${i + 1} / ${posts.length} (@${post.username || '?'})…`;
    progressBar.style.width  = `${Math.round((i / posts.length) * 100)}%`;

    let reply  = '';
    let status = 'pending';

    if (doneByUrl.has(post.tweetUrl)) {
      const prev = doneByUrl.get(post.tweetUrl);
      reply  = prev.reply;
      status = prev.status;
    } else {
      try {
        reply = await callOpenAI(post.tweetText, openaiApiKey, prompt, model);
      } catch (err) {
        status = 'error';
        console.error('OpenAI error for', post.tweetUrl, err);
      }
    }

    replyItems.push({ post, reply, status });
    renderCard(replyItems[replyItems.length - 1], replyItems.length - 1);
  }

  progressBar.style.width  = '100%';
  progressText.textContent = `Done — ${posts.length} tweet${posts.length === 1 ? '' : 's'} processed`;

  await saveItems();
  updateDraftCounter();
  return true;
}

async function generateReplies() {
  const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
  if (!openaiApiKey) {
    alert('Set your OpenAI API key in Settings first.');
    document.getElementById('settings-section').open = true;
    return;
  }

  if (!await ensureXTab()) return;

  btnGenerate.disabled    = true;
  btnGenerate.textContent = 'Scrolling & scraping…';

  let posts;
  try {
    const maxPosts = Math.max(1, parseInt(postCountInput.value, 10) || 10);
    await injectFile(xTabId, 'scripts/page_scraper.js');
    const result = await callPageFn(xTabId, (n) => autoScrollAndScrape(n), [maxPosts]);
    posts = result.posts;
  } catch (err) {
    alert('Scrape failed: ' + err.message);
    btnGenerate.disabled    = false;
    btnGenerate.textContent = 'Generate Replies';
    return;
  }

  await processPostsToReplies(posts, openaiApiKey);
  btnGenerate.disabled    = false;
  btnGenerate.textContent = 'Generate Replies';
}

async function generateCurrentReplies() {
  const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
  if (!openaiApiKey) {
    alert('Set your OpenAI API key in Settings first.');
    document.getElementById('settings-section').open = true;
    return;
  }

  if (!await ensureXTab()) return;

  btnReplyCurrent.disabled    = true;
  btnReplyCurrent.textContent = 'Scanning…';

  let posts;
  try {
    await injectFile(xTabId, 'scripts/page_scraper.js');
    const result = await callPageFn(xTabId, () => scrapeCurrentView());
    posts = result.posts;
  } catch (err) {
    alert('Scrape failed: ' + err.message);
    btnReplyCurrent.disabled    = false;
    btnReplyCurrent.textContent = 'Reply Current';
    return;
  }

  await processPostsToReplies(posts, openaiApiKey);
  btnReplyCurrent.disabled    = false;
  btnReplyCurrent.textContent = 'Reply Current';
}

async function draftAll() {
  btnDraftAll.disabled = true;
  btnPostAll.disabled  = true;
  for (let i = 0; i < replyItems.length; i++) {
    if (replyItems[i].status !== 'pending') continue;
    await saveSingleDraft(i);
    await sleep(DRAFT_DELAY_MS);
  }
  btnDraftAll.disabled = false;
  btnPostAll.disabled  = false;
  updateDraftCounter();
}

async function postAll() {
  btnDraftAll.disabled = true;
  btnPostAll.disabled  = true;
  for (let i = 0; i < replyItems.length; i++) {
    if (replyItems[i].status !== 'pending') continue;
    await postSingleReply(i);
    await sleep(DRAFT_DELAY_MS);
  }
  btnDraftAll.disabled = false;
  btnPostAll.disabled  = false;
  updateDraftCounter();
}

async function clearExtensionData() {
  await chrome.storage.local.remove(STORAGE_KEY);
  replyItems             = [];
  cardsSection.innerHTML = '';
  composeInjected        = false;
  flashMessage(clearMsg);
  updateDraftCounter();
}

async function init() {
  const stored = await chrome.storage.local.get(['openaiApiKey', 'selectedVoice', 'customVoices', 'displayMode', 'selectedModel', 'customModel']);

  if (stored.openaiApiKey) apiKeyInput.value = stored.openaiApiKey;

  await fetchAndPopulateModels(stored.openaiApiKey, stored.selectedModel || 'gpt-5.4');

  const displayMode = stored.displayMode || 'sidepanel';
  renderModeButtons(displayMode);
  if (displayMode === 'popup') document.body.classList.add('popup-mode');

  customVoices     = stored.customVoices || [];
  selectedVoiceKey = stored.selectedVoice || 'jonwu';
  renderVoiceButtons();

  await updateOpenXButton();

  const xTab = await getXTab();

  if (xTab) {
    xTabId = xTab.id;
    const loggedIn = await checkLogin(xTabId);

    if (loggedIn) {
      try {
        loggedInUsername = await callPageFn(xTabId, () => {
          const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
          return a ? a.getAttribute('href').replace(/^\//, '').toLowerCase() : null;
        }, []);
      } catch { }

      const xUrl            = xTab.url || '';
      const urlPath         = new URL(xUrl).pathname.toLowerCase().replace(/\/$/, '');
      const isListPage      = xUrl.includes('/lists/');
      const profileSuffixes = ['', '/with_replies', '/media', '/likes'];
      const isOwnProfile    = loggedInUsername &&
        profileSuffixes.some(s => urlPath === `/${loggedInUsername}${s}`);

      if (isOwnProfile) {
        showBanner('warn', "This is your profile. Open a page with other people's posts for replies.");
      } else if (!isListPage) {
        showBanner('tip', 'Works best on X List pages. Go to My Lists for the best results.');
      }

      listSection.classList.remove('hidden');
      await loadItems();
      if (replyItems.length > 0) renderCards();
    }
  }

  btnOpenXLogin.addEventListener('click', focusOrOpenXTab);
  btnCheckAgain.addEventListener('click', async () => {
    loginModal.classList.add('hidden');
    if (xTabId) {
      const ok = await checkLogin(xTabId);
      if (!ok) loginModal.classList.remove('hidden');
    }
  });

  btnOpenX.addEventListener('click', focusOrOpenXTab);
  btnGoList.addEventListener('click', async () => {
    const tab = await getXTab();
    let listsUrl = 'https://x.com/i/lists';
    if (tab) {
      try {
        const username = await callPageFn(tab.id, () => {
          const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
          return a ? a.getAttribute('href').replace(/^\//, '') : null;
        }, []);
        if (username) listsUrl = `https://x.com/${username}/lists`;
      } catch { }
      await chrome.tabs.update(tab.id, { url: listsUrl, active: true });
    } else {
      await chrome.tabs.create({ url: listsUrl });
    }
  });

  voiceButtonsContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.voice-btn');
    if (!btn) return;
    const voiceKey = btn.dataset.voice;
    if (voiceKey === '__add__') {
      showCustomVoiceScreen();
      return;
    }
    selectedVoiceKey = voiceKey;
    await chrome.storage.local.set({ selectedVoice: voiceKey });
    renderVoiceButtons();
  });

  btnBack.addEventListener('click', hideCustomVoiceScreen);

  btnSaveVoice.addEventListener('click', async () => {
    const name   = customVoiceNameInput.value.trim();
    const prompt = customVoicePromptInput.value.trim();
    if (!name || !prompt) return;

    const newVoice = { id: `cv:${Date.now()}`, name, prompt };
    customVoices.push(newVoice);
    selectedVoiceKey = newVoice.id;

    await chrome.storage.local.set({ customVoices, selectedVoice: selectedVoiceKey });
    customVoiceNameInput.value   = '';
    customVoicePromptInput.value = '';

    flashMessage(voiceSavedMsg);
    renderSavedVoicesList();
    setTimeout(() => {
      hideCustomVoiceScreen();
      renderVoiceButtons();
    }, 1000);
  });

  savedVoicesList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete-voice');
    if (!btn) return;
    const id = btn.dataset.id;
    customVoices = customVoices.filter(cv => cv.id !== id);
    if (selectedVoiceKey === id) selectedVoiceKey = 'jonwu';
    await chrome.storage.local.set({ customVoices, selectedVoice: selectedVoiceKey });
    renderSavedVoicesList();
    renderVoiceButtons();
  });

  chrome.tabs.onActivated.addListener(updateOpenXButton);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') updateOpenXButton();
  });

  btnGenerate.addEventListener('click', generateReplies);
  btnReplyCurrent.addEventListener('click', generateCurrentReplies);
  btnDraftAll.addEventListener('click', draftAll);
  btnPostAll.addEventListener('click', postAll);
  btnClearData.addEventListener('click', clearExtensionData);

  btnSaveKey.addEventListener('click', async () => {
    const k = apiKeyInput.value.trim();
    if (!k) return;
    await chrome.storage.local.set({ openaiApiKey: k });
    flashMessage(keySavedMsg);
    await fetchAndPopulateModels(k, getSelectedModel());
  });

  modelSelect.addEventListener('change', async () => {
    const isCustom = modelSelect.value === 'custom';
    modelCustomInput.classList.toggle('hidden', !isCustom);
    if (!isCustom) {
      await chrome.storage.local.set({ selectedModel: modelSelect.value });
    }
  });

  modelCustomInput.addEventListener('change', async () => {
    const val = modelCustomInput.value.trim();
    if (val) await chrome.storage.local.set({ selectedModel: val });
  });

  modeButtonsContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    await chrome.storage.local.set({ displayMode: mode });
    document.body.classList.toggle('popup-mode', mode === 'popup');
    renderModeButtons(mode);
    flashMessage(modeSavedMsg);
  });

  cardsSection.addEventListener('click', async (e) => {
    const idx = parseInt(e.target.dataset.idx, 10);
    if (isNaN(idx)) return;

    if (e.target.classList.contains('btn-remove-card')) {
      replyItems.splice(idx, 1);
      await saveItems();
      renderCards();
    } else if (e.target.classList.contains('btn-save-draft')) {
      await saveSingleDraft(idx);
    } else if (e.target.classList.contains('btn-post-reply')) {
      await postSingleReply(idx);
    } else if (e.target.classList.contains('btn-open-reply')) {
      if (!await ensureXTab()) return;
      const item      = replyItems[idx];
      const replyText = getCardReplyText(idx);
      try {
        await ensureComposeInjected();
        await callPageFn(xTabId, (url, text) => openReply(url, text), [item.post.tweetUrl, replyText]);
      } catch (err) {
        alert('Could not open reply compose: ' + err.message);
      }
    }
  });
}

init();
