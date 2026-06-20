# brainX — X/Twitter Reply Bot

A Manifest V3 Chrome extension that scrapes X/Twitter pages, generates AI replies in a selectable voice/persona, and saves them as drafts or posts them directly. Replies can be generated with **OpenAI, DeepSeek, Claude (Anthropic), or xAI (Grok)**.

## Features

- **Multiple AI providers** — OpenAI, DeepSeek, Claude (Anthropic), and xAI (Grok). Each provider has its own API key, and models are fetched live from the provider once a key is saved.
- **Voices / personas** — built-in personas (Mert, Sarcastic, Intern) plus your own custom voices. Double-click a voice to edit its prompt; built-in voices can be reset to default.
- **Bulk actions** — generate replies for many posts at once, then Draft All or Post All. Optionally **Like All** posts you reply to.
- **Configurable pacing** — set how many posts to reply to and a delay (seconds) between posts. A warning appears below 30s, since short intervals can flag your account as spam.
- **Edit before posting** — every generated reply is editable; your edits are what gets posted.
- **Side panel or popup** — runs as a side panel by default; switch to popup mode in Settings.

## Loading the Extension

No build step.

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the repo root
4. After any code change, click the refresh icon on the extension card

Minimum Chrome version: **116** (required for `chrome.sidePanel.setPanelBehavior`).

## Setup

1. Open the extension and expand **⚙ Settings**.
2. Pick a **Provider** and paste its **API Key** (e.g. OpenAI `sk-...`, Anthropic `sk-ant-...`, xAI `xai-...`).
3. Choose an **AI Model** (the list populates from the provider once a key is saved) or enter a custom model name.
4. Make sure you're logged in to X / Twitter in a tab.

The extension works best on **List** pages, where the feed is focused.

## Usage

1. Open or navigate to an x.com tab. If you're not logged in, the extension prompts you to sign in.
2. Pick a **voice** at the top.
3. Set **Posts to reply** and **Delay between posts (s)**.
4. Click **Generate Replies** (bulk) or **Reply Current** (the open post).
5. Review and edit the generated replies in the cards.
6. Use per-card **Save Draft** / **Post Reply**, or **Draft All** / **Post All** for the batch. Toggle **Like All** to like each post you reply to.

State is saved to `chrome.storage.local` after each action, and already-drafted/posted items are preserved across re-generates.

## Architecture

Code runs in two contexts that cannot share state or use each other's APIs.

### Extension context

- **`scripts/popup.js`** — orchestration: tab management, `chrome.storage` reads/writes, and all UI. ES module (`<script type="module">`). Imports platform-specific voice prompts from `utils/twitter_voices.js` or `utils/linkedin_voices.js` and provider/LLM logic from `utils/models.js`.
- **`utils/models.js`** — all LLM logic. Exports a `PROVIDERS` config (per-provider name, key label/placeholder, storage key, default model, model list) and `callLLM(tweetText, apiKey, prompt, model, provider)`, which dispatches to each provider's API:
  - OpenAI — Responses API (`POST /v1/responses`)
  - Anthropic — Messages API (`POST /v1/messages`), sent with the `anthropic-dangerous-direct-browser-access: true` header so the browser request passes CORS
  - DeepSeek & xAI — OpenAI-compatible chat completions
  - Insufficient-credit / billing errors surface a "recharge your API key" popup.
- **`utils/twitter_voices.js`** & **`utils/linkedin_voices.js`** — ES modules exporting persona system prompts per platform. `popup.js` maps them in a `VOICES` object dynamically based on the active platform; default voice is `mert` (on X/Twitter) or the first available voice/fallback system prompt. Users can also create custom personas (`cv:<timestamp>` IDs) and override built-in voice prompts.
- **`scripts/background.js`** — toggles between side-panel and popup display modes by listening to `chrome.storage.onChanged`.

### Page context

Injected into platform tabs via `chrome.scripting.executeScript`. No access to Chrome extension APIs.

- **`X/scraper.js`** & **`LinkedIn/scraper.js`** — page context scrapers. `autoScrollAndScrape()` auto-scrolls and scrapes visible posts, returning `{ posts, loggedIn }`. The LinkedIn scraper parses document/PDF carousels (titles, page counts, slide alt text), regular post images, prints the scraped details to the browser console, and returns `linkedinText` / `linkedinUrl` along with legacy keys.
- **`X/compose.js`** & **`LinkedIn/compose.js`** — page context composer actions: `openReply(url, text)`, `saveDraft(url, text)`, `postReply(url, text)`, `likePost(url)`. Re-finds posts by ID, manages the reply editing DOM interactions, and confirms submissions.

### Stored keys (`chrome.storage.local`)

| Key | Value |
|-----|-------|
| `openaiApiKey` / `deepseekApiKey` / `anthropicApiKey` / `xaiApiKey` | Per-provider API keys |
| `selectedProvider` | Active provider (`openai` \| `deepseek` \| `anthropic` \| `xai`) |
| `selectedModel` | Model name for the active provider |
| `selectedVoice` | Active voice key (`mert` \| `sarcastic` \| `intern` \| `cv:<timestamp>`) |
| `customVoices` | Array of `{ id: 'cv:<timestamp>', name, prompt }` |
| `voiceOverrides` | Map of built-in voice key → edited prompt |
| `autoLikeEnabled` | "Like All" default |
| `postDelay` | Delay between posts (seconds) |
| `displayMode` | `'sidepanel'` (default) or `'popup'` |
| `replyBotData_x` / `replyBotData_linkedin` | Persisted `replyItems` array per platform |

## Icons

Sized PNGs live in `icons/` (16, 32, 48, 128px), generated from `brainX-black.png`:

```bash
sips -s format png -z <size> <size> brainX-black.png --out icons/icon<size>.png
```

`manifest.json` references these in both the top-level `icons` field and `action.default_icon`.
