# Privacy Policy for brainX

**Last Updated: June 23, 2026**

This Privacy Policy explains how the **brainX** Chrome Extension ("we," "our," or "the Extension") collects, uses, handles, stores, and shares user data. We are committed to protecting your privacy and ensuring you have complete control over your data.

By using the Extension, you agree to the practices described in this policy.

---

## 1. What Data We Collect
The Extension collects and processes only the minimum data required to perform its single core function (generating AI-powered social media replies). This data is categorized as follows:

*   **API Keys:** User-provided API keys for third-party AI services (OpenAI, Anthropic/Claude, DeepSeek, and xAI/Grok).
*   **Social Media Content (Scraped Data):** Text content, author usernames, and URLs of posts/tweets from x.com (Twitter) and linkedin.com tabs that are currently open and active.
*   **User Preferences & Configuration:** Custom voices/personas, active display mode preferences (popup vs. side panel), active model/provider selection, custom prompts, and draft statuses of generated replies.

---

## 2. How We Collect and Handle Data
All data collection is performed transparently and in direct support of the Extension’s single purpose:

*   **Scraped Content:** Post contents are scraped in-memory from active browser tabs using dynamic content scripts. This collection only occurs when you actively interact with the Extension (e.g., clicking "Generate Replies" or "Reply Current"). The scraped content is used immediately as context for the AI prompt to generate replies.
*   **API Keys & Preferences:** Inputted keys and custom personas are saved directly inside your browser.

---

## 3. How We Store Data
We prioritize secure local storage to keep your data private:

*   **Local Storage only:** All stored data—including API keys, custom voices, settings, and cached reply drafts—is stored strictly in your browser's local sandbox using the `chrome.storage.local` API.
*   **No Developer Servers:** We do not own, operate, or maintain any external servers. None of your data is sent to us, and we have no access to your API keys, scraped content, or browsing history.
*   **Data Control & Deletion:** You can delete your data at any time. Removing an API key or custom voice in the Settings panel deletes it instantly from storage. Uninstalling the Extension or clearing Chrome's extension data permanently deletes all stored configurations, keys, and drafts.

---

## 4. How We Share Data (Third Parties)
We do not sell, rent, trade, or lease your data. Your data is shared **only** with the specific third-party AI providers you select and configure, solely to generate reply content:

*   **AI Providers:** When generating a reply, the scraped post text, custom prompt instructions, and your API key are sent securely via HTTPS directly to the endpoint of your chosen provider:
    *   **OpenAI, LLC** (if using OpenAI models)
    *   **Anthropic, PBC** (if using Claude models)
    *   **DeepSeek** (if using DeepSeek models)
    *   **xAI, Corp.** (if using Grok models)
*   **Direct API Connections:** These requests are sent directly from your browser to the official AI provider APIs. No intermediate or developer-controlled proxy servers are used.
*   **Policy Compliance:** You should review the privacy policies of the respective AI providers (OpenAI, Anthropic, DeepSeek, xAI) regarding how they handle data sent to their API endpoints.

---

## 5. Security of Your Data
We protect your data by transmitting all API requests via secure, encrypted HTTPS protocols. Additionally, storing API keys in Chrome's sandboxed local storage ensures other websites or extensions cannot access them.

---

## 6. Policy Changes
We may update this Privacy Policy from time to time. Any changes will be reflected by the "Last Updated" date at the top of this policy and will be updated in future releases of the Extension.

---

## 7. Contact
If you have any questions about this Privacy Policy, please contact [@sincerelycheesy](https://x.com/sincerelycheesy) or [@web3cook](https://x.com/web3cook)
