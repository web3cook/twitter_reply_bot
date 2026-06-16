// tabs.js — generic, adapter-parameterized tab helpers shared by all platforms.
// popup.js owns the cached `platformTabId`; these functions just operate on
// chrome.tabs using the adapter's host globs / home URL.

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// First open tab matching the platform's host globs, or null.
export async function getPlatformTab(adapter) {
  const tabs = await chrome.tabs.query({ url: adapter.hostMatch });
  return tabs.length ? tabs[0] : null;
}

// Resolve once the tab finishes loading (status === 'complete') or time out.
export function waitForTabComplete(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = setInterval(async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') { clearInterval(check); resolve(); }
        else if (Date.now() - start > timeout) { clearInterval(check); reject(new Error('tab load timeout')); }
      } catch (err) { clearInterval(check); reject(err); }
    }, 300);
  });
}

// Navigate a tab to a URL and wait for it to finish loading + hydrate the SPA.
export async function navigateTab(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await sleep(500);
  await waitForTabComplete(tabId);
  await sleep(1500); // let the SPA render the feed before scraping
}
