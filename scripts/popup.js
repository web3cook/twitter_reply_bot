import { Naruto, Mert, Medusa, sarcastic, intern } from './voices.js';
import { PROVIDERS, callLLM } from './models.js';

const STORAGE_KEY    = 'xReplyBotData';
const DRAFT_DELAY_MS = 200;

const VOICES = {
  naruto:    { label: 'Naruto',    prompt: Naruto },
  mert:      { label: 'Mert',      prompt: Mert },
  medusa:    { label: 'Medusa',    prompt: Medusa },
  sarcastic: { label: 'Sarcastic', prompt: sarcastic },
  intern:    { label: 'Intern',    prompt: intern },
};

const STATUS_LABELS = {
  drafted:  'drafted',
  posted:   'posted',
  error:    'error',
  notfound: 'post not found',
  saving:   'saving…',
  posting:  'posting…',
  pending:  'pending',
};

let xTabId           = null;
let replyItems       = [];
let composeInjected  = false;
let customVoices     = [];
let voiceOverrides   = {};
let editingVoiceKey  = null;
let selectedVoiceKey = 'naruto';
let selectedProvider = 'openai';
let autoLikeDefault  = false;
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
const likeAllCheckbox        = document.getElementById('like-all-checkbox');
const clearRow               = document.getElementById('clear-row');
const btnClearData           = document.getElementById('btn-clear-data');
const clearMsg               = document.getElementById('clear-msg');
const draftCounter           = document.getElementById('draft-counter');
const progressRow            = document.getElementById('progress-row');
const progressText           = document.getElementById('progress-text');
const progressBar            = document.getElementById('progress-bar');
const cardsSection           = document.getElementById('cards-section');
const providerSelect         = document.getElementById('provider-select');
const apiKeyLabel            = document.getElementById('api-key-label');
const apiKeyInput            = document.getElementById('api-key-input');
const btnSaveKey             = document.getElementById('btn-save-key');
const keySavedMsg            = document.getElementById('key-saved-msg');
const modelSelect            = document.getElementById('model-select');
const modelCustomInput       = document.getElementById('model-custom-input');
const modeButtonsContainer   = document.getElementById('mode-buttons');
const modeSavedMsg           = document.getElementById('mode-saved-msg');
const postCountInput         = document.getElementById('post-count-input');
const postDelayInput         = document.getElementById('post-delay-input');
const delayWarning           = document.getElementById('delay-warning');
const voiceButtonsContainer  = document.getElementById('voice-buttons');
const customVoiceScreen      = document.getElementById('custom-voice-screen');
const btnBack                 = document.getElementById('btn-back');
const customVoiceScreenTitle  = document.getElementById('custom-voice-screen-title');
const customVoiceNameInput    = document.getElementById('custom-voice-name');
const customVoicePromptInput  = document.getElementById('custom-voice-prompt');
const btnSaveVoice            = document.getElementById('btn-save-voice');
const btnResetVoice           = document.getElementById('btn-reset-voice');
const voiceSavedMsg           = document.getElementById('voice-saved-msg');
const savedVoicesSection     = document.getElementById('saved-voices-section');
const savedVoicesList        = document.getElementById('saved-voices-list');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getPostDelayMs() {
  const secs = parseFloat(postDelayInput.value) || 0;
  return Math.max(200, secs * 1000);
}

function updateDelayWarning() {
  const secs = parseFloat(postDelayInput.value) || 0;
  delayWarning.classList.toggle('hidden', secs >= 30);
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
  const isXActive = activeTab?.url?.startsWith('https://x.com') || false;
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
  editingVoiceKey               = null;
  customVoiceScreenTitle.textContent = 'Custom Voice';
  btnSaveVoice.textContent      = 'Save Voice';
  customVoiceNameInput.value    = '';
  customVoiceNameInput.readOnly = false;
  customVoicePromptInput.value  = '';
  btnResetVoice.classList.add('hidden');
  renderSavedVoicesList();
  customVoiceScreen.classList.remove('hidden');
}

function showEditVoiceScreen(voiceKey) {
  editingVoiceKey               = voiceKey;
  customVoiceScreenTitle.textContent = 'Edit Voice';
  btnSaveVoice.textContent      = 'Save Changes';
  savedVoicesSection.classList.add('hidden');

  if (voiceKey.startsWith('cv:')) {
    const cv = customVoices.find(v => v.id === voiceKey);
    customVoiceNameInput.value    = cv?.name || '';
    customVoiceNameInput.readOnly = false;
    customVoicePromptInput.value  = cv?.prompt || '';
    btnResetVoice.classList.add('hidden');
  } else {
    const voice = VOICES[voiceKey];
    customVoiceNameInput.value    = voice.label;
    customVoiceNameInput.readOnly = true;
    customVoicePromptInput.value  = voiceOverrides[voiceKey] || voice.prompt;
    btnResetVoice.classList.remove('hidden');
  }
  customVoiceScreen.classList.remove('hidden');
}

function hideCustomVoiceScreen() {
  editingVoiceKey = null;
  customVoiceScreen.classList.add('hidden');
}

// ── Provider / model helpers ──────────────────────────────────────────────────

function populateModelsForProvider(provider, savedModel) {
  const p = PROVIDERS[provider];
  const target = savedModel || p.defaultModel;

  modelSelect.innerHTML = '';
  p.models.forEach(({ id, label }) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    modelSelect.appendChild(opt);
  });

  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Custom…';
  modelSelect.appendChild(customOpt);

  const knownIds = p.models.map(m => m.id);
  if (knownIds.includes(target)) {
    modelSelect.value = target;
    modelCustomInput.classList.add('hidden');
  } else {
    modelSelect.value      = 'custom';
    modelCustomInput.value = target;
    modelCustomInput.classList.remove('hidden');
  }
}

async function fetchModelsForProvider(provider, apiKey) {
  if (!apiKey || provider === 'anthropic') return null;

  const urls = {
    openai:   'https://api.openai.com/v1/models',
    deepseek: 'https://api.deepseek.com/models',
    xai:      'https://api.x.ai/v1/models',
  };
  const url = urls[provider];
  if (!url) return null;

  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (!resp.ok) return null;
  const { data } = await resp.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  let models = data.sort((a, b) => (b.created || 0) - (a.created || 0));
  if (provider === 'openai') {
    models = models.filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id));
  }
  return models.map(m => m.id);
}

function applyLiveModelIds(ids, target, provider) {
  const resolved = target || PROVIDERS[provider].defaultModel;
  modelSelect.innerHTML = '';
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

  if (ids.includes(resolved)) {
    modelSelect.value = resolved;
    modelCustomInput.classList.add('hidden');
  } else {
    modelSelect.value      = 'custom';
    modelCustomInput.value = resolved;
    modelCustomInput.classList.remove('hidden');
  }
}

// Show static list immediately, then swap in live models in the background
function loadModels(provider, apiKey, savedModel) {
  populateModelsForProvider(provider, savedModel);
  fetchModelsForProvider(provider, apiKey)
    .then(ids => { if (ids) applyLiveModelIds(ids, savedModel || modelSelect.value, provider); })
    .catch(() => {});
}

function updateProviderUI(provider, apiKeyValue) {
  const p = PROVIDERS[provider];
  apiKeyLabel.textContent  = p.keyLabel;
  apiKeyInput.placeholder  = p.keyPlaceholder;
  apiKeyInput.value        = apiKeyValue || '';
}

function getSelectedModel() {
  if (modelSelect.value === 'custom') {
    return modelCustomInput.value.trim() || PROVIDERS[selectedProvider].defaultModel;
  }
  return modelSelect.value || PROVIDERS[selectedProvider].defaultModel;
}

// ── Page script helpers ───────────────────────────────────────────────────────

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
  replyItems = (data[STORAGE_KEY] || []).map(item => ({
    liked: false, autoLike: false, ...item,
  }));
}

function showBanner(type, text) {
  bannerIcon.textContent = type === 'warn' ? '⚠' : 'ℹ';
  bannerText.textContent = text;
  contextBanner.className = `banner ${type}`;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function resolvePrompt() {
  if (selectedVoiceKey.startsWith('cv:')) {
    const cv = customVoices.find(v => v.id === selectedVoiceKey);
    return cv?.prompt?.trim() || VOICES.naruto.prompt;
  }
  return voiceOverrides[selectedVoiceKey] || VOICES[selectedVoiceKey]?.prompt || VOICES.naruto.prompt;
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
  const postBtnClass = item.status === 'posted' ? 'posted' : '';

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
      <label class="like-label" title="${item.liked ? 'Already liked' : 'Like when posting'}">
        <input type="checkbox" class="like-checkbox" data-idx="${idx}"
          ${item.autoLike || item.liked ? 'checked' : ''}
          ${item.liked ? 'disabled' : ''} />
        ♥ Like
      </label>
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

function updateLikeToggle(idx) {
  const item = replyItems[idx];
  const card = cardsSection.querySelector(`.reply-card[data-idx="${idx}"]`);
  if (!card) return;
  const cb = card.querySelector('.like-checkbox');
  if (!cb) return;
  cb.checked  = item.autoLike || item.liked;
  cb.disabled = item.liked;
}

function updateGlobalLikeToggle() {
  likeAllCheckbox.checked = autoLikeDefault;
}

function updateLikedStatus(idx) {
  replyItems[idx].liked = true;
  updateLikeToggle(idx);
  updateDraftCounter();
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

// ── Compose helpers ───────────────────────────────────────────────────────────

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
    updateCardStatus(idx, err.message === 'post not found' ? 'notfound' : 'error');
  }
}

async function saveSingleDraft(idx) {
  await executeCompose(idx, (url, text) => saveDraft(url, text), 'saving', 'drafted');
}

async function postSingleReply(idx) {
  const item      = replyItems[idx];
  const replyText = getCardReplyText(idx);
  if (!await ensureXTab()) return;

  updateCardStatus(idx, 'posting');
  try {
    await ensureComposeInjected();

    if (item.autoLike && !item.liked) {
      try {
        await callPageFn(xTabId, (url) => likeTweet(url), [item.post.tweetUrl]);
        updateLikedStatus(idx);
        await saveItems();
      } catch (likeErr) {
        console.error('Auto-like failed (continuing with post):', likeErr);
      }
    }

    await callPageFn(xTabId, (url, text) => postReply(url, text), [item.post.tweetUrl, replyText]);
    replyItems[idx].reply = replyText;
    updateCardStatus(idx, 'posted');
    await saveItems();
  } catch (err) {
    console.error('Post error:', err);
    updateCardStatus(idx, err.message === 'post not found' ? 'notfound' : 'error');
  }
}

// ── Generate flow ─────────────────────────────────────────────────────────────

async function processPostsToReplies(posts, apiKey) {
  if (loggedInUsername) {
    posts = posts.filter(p => p.username?.toLowerCase() !== loggedInUsername);
  }

  if (!posts || posts.length === 0) {
    alert('No tweets found. Make sure there are tweets visible on the page.');
    return false;
  }

  const prevByUrl = new Map(replyItems.map(i => [i.post.tweetUrl, i]));
  replyItems             = [];
  cardsSection.innerHTML = '';
  composeInjected        = false;

  progressRow.classList.remove('hidden');
  progressBar.style.width = '0%';

  const prompt   = resolvePrompt();
  const model    = getSelectedModel();
  const provider = selectedProvider;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    progressText.textContent = `Generating ${i + 1} / ${posts.length} (@${post.username || '?'})…`;
    progressBar.style.width  = `${Math.round((i / posts.length) * 100)}%`;

    const prev     = prevByUrl.get(post.tweetUrl);
    const liked    = prev?.liked || false;
    const autoLike = liked ? false : (prev?.autoLike ?? autoLikeDefault);
    let   reply    = '';
    let   status   = 'pending';

    if (prev && (prev.status === 'drafted' || prev.status === 'posted')) {
      reply  = prev.reply;
      status = prev.status;
    } else {
      try {
        reply = await callLLM(post.tweetText, apiKey, prompt, model, provider);
      } catch (err) {
        if (err.message === 'RECHARGE_REQUIRED') {
          progressRow.classList.add('hidden');
          alert(`Your ${PROVIDERS[provider].name} API key has run out of credits.\n\nPlease recharge your account and try again.`);
          await saveItems();
          updateDraftCounter();
          return false;
        }
        status = 'error';
        console.error('LLM error for', post.tweetUrl, err);
      }
    }

    replyItems.push({ post, reply, status, liked, autoLike });
    renderCard(replyItems[replyItems.length - 1], replyItems.length - 1);
  }

  progressBar.style.width  = '100%';
  progressText.textContent = `Done — ${posts.length} tweet${posts.length === 1 ? '' : 's'} processed`;

  await saveItems();
  updateDraftCounter();
  return true;
}

async function generateReplies() {
  const p = PROVIDERS[selectedProvider];
  const stored = await chrome.storage.local.get(p.storageKey);
  const apiKey = stored[p.storageKey];
  if (!apiKey) {
    alert(`Set your ${p.name} API key in Settings first.`);
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

  await processPostsToReplies(posts, apiKey);
  btnGenerate.disabled    = false;
  btnGenerate.textContent = 'Generate Replies';
}

async function generateCurrentReplies() {
  const p = PROVIDERS[selectedProvider];
  const stored = await chrome.storage.local.get(p.storageKey);
  const apiKey = stored[p.storageKey];
  if (!apiKey) {
    alert(`Set your ${p.name} API key in Settings first.`);
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

  await processPostsToReplies(posts, apiKey);
  btnReplyCurrent.disabled    = false;
  btnReplyCurrent.textContent = 'Reply Current';
}

async function scrollToFirstPending() {
  const first = replyItems.find(i => i.status === 'pending');
  if (!first || !await ensureXTab()) return;
  const statusId = first.post.tweetUrl.match(/\/status\/(\d+)/)?.[1];
  if (!statusId) return;
  await callPageFn(xTabId, (sid) => {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const a of articles) {
      if (a.querySelector(`a[href*="/status/${sid}"]`)) {
        a.scrollIntoView({ behavior: 'instant', block: 'center' });
        return;
      }
    }
    // Tweet virtualized out of DOM — scroll to top so it re-renders
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [statusId]);
  await sleep(600);
}

async function draftAll() {
  btnDraftAll.disabled = true;
  btnPostAll.disabled  = true;
  await scrollToFirstPending();
  for (let i = 0; i < replyItems.length; i++) {
    if (replyItems[i].status !== 'pending') continue;
    await saveSingleDraft(i);
    await sleep(getPostDelayMs());
  }
  btnDraftAll.disabled = false;
  btnPostAll.disabled  = false;
  updateDraftCounter();
}

async function postAll() {
  btnDraftAll.disabled = true;
  btnPostAll.disabled  = true;
  await scrollToFirstPending();
  for (let i = 0; i < replyItems.length; i++) {
    if (replyItems[i].status !== 'pending') continue;
    await postSingleReply(i);
    await sleep(getPostDelayMs());
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

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const stored = await chrome.storage.local.get([
    'openaiApiKey', 'deepseekApiKey', 'anthropicApiKey', 'xaiApiKey',
    'selectedProvider', 'selectedVoice', 'customVoices', 'voiceOverrides',
    'displayMode', 'selectedModel', 'autoLikeEnabled', 'postDelay',
  ]);

  selectedProvider     = stored.selectedProvider || 'openai';
  providerSelect.value = selectedProvider;
  updateProviderUI(selectedProvider, stored[PROVIDERS[selectedProvider].storageKey]);
  loadModels(selectedProvider, stored[PROVIDERS[selectedProvider].storageKey], stored.selectedModel);

  const displayMode = stored.displayMode || 'sidepanel';
  renderModeButtons(displayMode);
  if (displayMode === 'popup') document.body.classList.add('popup-mode');

  autoLikeDefault = stored.autoLikeEnabled || false;
  updateGlobalLikeToggle();

  if (stored.postDelay != null) postDelayInput.value = stored.postDelay;
  updateDelayWarning();

  customVoices     = stored.customVoices  || [];
  voiceOverrides   = stored.voiceOverrides || {};
  selectedVoiceKey = stored.selectedVoice || 'naruto';
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

  // ── Event listeners ─────────────────────────────────────────────────────────

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

  voiceButtonsContainer.addEventListener('dblclick', (e) => {
    const btn = e.target.closest('.voice-btn');
    if (!btn || btn.dataset.voice === '__add__') return;
    showEditVoiceScreen(btn.dataset.voice);
  });

  btnBack.addEventListener('click', hideCustomVoiceScreen);

  btnSaveVoice.addEventListener('click', async () => {
    const prompt = customVoicePromptInput.value.trim();
    if (!prompt) return;

    if (editingVoiceKey !== null) {
      // ── Edit mode ──────────────────────────────────────────────────────────
      if (editingVoiceKey.startsWith('cv:')) {
        const cv = customVoices.find(v => v.id === editingVoiceKey);
        if (cv) {
          const name = customVoiceNameInput.value.trim();
          if (name) cv.name = name;
          cv.prompt = prompt;
        }
        await chrome.storage.local.set({ customVoices });
      } else {
        if (prompt === VOICES[editingVoiceKey]?.prompt) {
          delete voiceOverrides[editingVoiceKey];
        } else {
          voiceOverrides[editingVoiceKey] = prompt;
        }
        await chrome.storage.local.set({ voiceOverrides });
      }
      flashMessage(voiceSavedMsg);
      setTimeout(() => { hideCustomVoiceScreen(); renderVoiceButtons(); }, 1000);
      return;
    }

    // ── Create mode ────────────────────────────────────────────────────────
    const name = customVoiceNameInput.value.trim();
    if (!name) return;

    const newVoice = { id: `cv:${Date.now()}`, name, prompt };
    customVoices.push(newVoice);
    selectedVoiceKey = newVoice.id;

    await chrome.storage.local.set({ customVoices, selectedVoice: selectedVoiceKey });
    customVoiceNameInput.value   = '';
    customVoicePromptInput.value = '';

    flashMessage(voiceSavedMsg);
    renderSavedVoicesList();
    setTimeout(() => { hideCustomVoiceScreen(); renderVoiceButtons(); }, 1000);
  });

  btnResetVoice.addEventListener('click', async () => {
    if (!editingVoiceKey || editingVoiceKey.startsWith('cv:')) return;
    delete voiceOverrides[editingVoiceKey];
    await chrome.storage.local.set({ voiceOverrides });
    customVoicePromptInput.value = VOICES[editingVoiceKey].prompt;
    flashMessage(voiceSavedMsg);
  });

  savedVoicesList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete-voice');
    if (!btn) return;
    const id = btn.dataset.id;
    customVoices = customVoices.filter(cv => cv.id !== id);
    if (selectedVoiceKey === id) selectedVoiceKey = 'naruto';
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

  likeAllCheckbox.addEventListener('change', async () => {
    autoLikeDefault = likeAllCheckbox.checked;
    replyItems.forEach((item, i) => {
      if (!item.liked) {
        item.autoLike = autoLikeDefault;
        updateLikeToggle(i);
      }
    });
    await chrome.storage.local.set({ autoLikeEnabled: autoLikeDefault });
    await saveItems();
  });

  providerSelect.addEventListener('change', async () => {
    selectedProvider = providerSelect.value;
    const p = PROVIDERS[selectedProvider];
    const stored = await chrome.storage.local.get(p.storageKey);
    updateProviderUI(selectedProvider, stored[p.storageKey]);
    loadModels(selectedProvider, stored[p.storageKey], null);
    await chrome.storage.local.set({ selectedProvider, selectedModel: p.defaultModel });
  });

  btnSaveKey.addEventListener('click', async () => {
    const k = apiKeyInput.value.trim();
    if (!k) return;
    const p = PROVIDERS[selectedProvider];
    await chrome.storage.local.set({ [p.storageKey]: k });
    flashMessage(keySavedMsg);
    loadModels(selectedProvider, k, getSelectedModel());
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

  postDelayInput.addEventListener('change', async () => {
    const val = parseFloat(postDelayInput.value) || 0;
    postDelayInput.value = Math.max(0, val);
    updateDelayWarning();
    await chrome.storage.local.set({ postDelay: postDelayInput.value });
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

  cardsSection.addEventListener('input', (e) => {
    if (!e.target.classList.contains('card-textarea')) return;
    const idx = parseInt(e.target.closest('.reply-card')?.dataset.idx, 10);
    if (!isNaN(idx) && replyItems[idx]) replyItems[idx].reply = e.target.value;
  });

  cardsSection.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('like-checkbox')) return;
    const idx = parseInt(e.target.dataset.idx, 10);
    if (isNaN(idx) || replyItems[idx].liked) return;
    replyItems[idx].autoLike = e.target.checked;
    await saveItems();
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
