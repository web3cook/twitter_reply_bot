chrome.runtime.onInstalled.addListener(applyStoredDisplayMode);
chrome.runtime.onStartup.addListener(applyStoredDisplayMode);


chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.displayMode) {
    applyDisplayMode(changes.displayMode.newValue);
  }
});

async function applyStoredDisplayMode() {
  const { displayMode } = await chrome.storage.local.get('displayMode');
  applyDisplayMode(displayMode || 'sidepanel');
}

function applyDisplayMode(mode) {
  if (mode === 'popup') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    chrome.action.setPopup({ popup: 'popup.html' });
  } else {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    chrome.action.setPopup({ popup: '' });
  }
}
