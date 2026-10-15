# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

brainX is a Manifest V3 Chrome extension that scrapes X/Twitter and LinkedIn feeds and generates AI replies in a selectable voice. Full architecture, stored-key reference, and usage are in @README.md; read it before making changes.

## Two execution contexts (most common source of bugs)

Code runs in two contexts that **cannot share state or call each other's APIs**:

- **Extension context**: `scripts/popup.js`, `scripts/background.js`, and everything in `utils/`. Has `chrome.*` APIs (`chrome.storage`, `chrome.tabs`, `chrome.scripting`). `popup.js` is an ES module.
- **Page context**: `X/scraper.js`, `X/compose.js`, `LinkedIn/scraper.js`, `LinkedIn/compose.js`. Injected into the platform tab via `chrome.scripting.executeScript`. **No `chrome.*` APIs.** These files run in the page's DOM and communicate only through the values they return to `executeScript`.

Before adding an API call, confirm which context the file runs in.

## No build step

This is an unpacked extension; files are loaded raw, there is no bundler, no `package.json`, and no lint/test tooling. Do not add a build step or `import` from `node_modules`.

- ES modules are loaded directly by the browser (`<script type="module">` in `popup.html`). Use relative paths with the `.js` extension (e.g. `import { callLLM } from '../utils/models.js'`).
- After any code change, reload the extension at `chrome://extensions` (Load unpacked → repo root, then the refresh icon). I'll do this step manually

## Gotchas

- **Adding an LLM provider or API host:** add the endpoint to the relevant `host_permissions` entry in `manifest.json`, or the `fetch` is blocked by CORS. Anthropic requests must include the `anthropic-dangerous-direct-browser-access: true` header (see `utils/models.js`).
- **Keep `X/` and `LinkedIn/` symmetric:** both expose the same scraper/composer surface (`autoScrollAndScrape()`, `openReply`/`saveDraft`/`postReply`/`likePost`). A change to one platform's flow usually needs the mirror change in the other, plus its `*_voices.js`.
- **Icons** are regenerated from `brainX-black.png`, not hand-edited: `sips -s format png -z <size> <size> brainX-black.png --out icons/icon<size>.png`.

## Workflow

Work on a feature branch (e.g. the current `linkedIn`) and open a PR to `main. just write code on local. I'll test and commit it.

## DONT's
- Never use emdash in any doc or in replies with me
- Don't assume anything

## DO's before every run
- Ask clarifying questions to get the scope before editing
