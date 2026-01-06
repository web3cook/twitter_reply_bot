// Core logic - main business logic functions

function openX() {
  // Check if X is already open
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, function(tabs) {
    let targetTab = null;
    
    if (tabs.length > 0) {
      // Switch to the first existing X tab
      targetTab = tabs[0];
      chrome.tabs.update(targetTab.id, { active: true });
      // Don't focus the window to keep popup open
      // chrome.windows.update(targetTab.windowId, { focused: true });
      
      // Check if tab is already loaded, then check login status
      chrome.tabs.get(targetTab.id, function(tab) {
        if (tab.status === 'complete') {
          // Tab is already loaded, check after a short delay
          setTimeout(() => {
            checkLoginStatus(targetTab.id);
          }, 1500);
        } else {
          // Tab is still loading, wait for it to complete
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === targetTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(() => {
                checkLoginStatus(targetTab.id);
              }, 1500);
            }
          });
        }
      });
    } else {
      // Create a new tab if X is not open
      chrome.tabs.create({ url: 'https://x.com' }, function(tab) {
        // Wait for the page to load, then check login status
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(() => {
              checkLoginStatus(tab.id);
            }, 1500);
          }
        });
      });
    }
  });
}

function checkLoginStatusOnPopupOpen() {
  // Check if X is already open and get login status
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, function(tabs) {
    if (tabs.length > 0) {
      const targetTab = tabs[0];
      chrome.tabs.get(targetTab.id, function(tab) {
        if (tab.status === 'complete') {
          checkLoginStatusForButton(targetTab.id);
        } else {
          // Wait for tab to load
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === targetTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(() => {
                checkLoginStatusForButton(targetTab.id);
              }, 500);
            }
          });
        }
      });
    } else {
      // No X tab open, button stays disabled
      updateOpenListsButton(false);
    }
  });
}

function checkLoginStatusForButton(tabId) {
  // Inject script to check if user is logged in
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: isLoggedIn
  }, function(results) {
    if (chrome.runtime.lastError) {
      console.error('Error checking login status:', chrome.runtime.lastError);
      updateOpenListsButton(false);
      return;
    }
    
    const isLoggedIn = results && results[0] && results[0].result === true;
    updateOpenListsButton(isLoggedIn);
  });
}

function updateOpenListsButton(isLoggedIn) {
  const openListsButton = document.getElementById('openLists');
  if (openListsButton) {
    openListsButton.disabled = !isLoggedIn;
    // Add tooltip for disabled button
    if (!isLoggedIn) {
      openListsButton.title = 'Login required\n\nPlease log in to X to continue.';
    } else {
      openListsButton.title = '';
    }
  }
}

function checkLoginStatus(tabId) {
  // Inject script to check if user is logged in
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: isLoggedIn
  }, function(results) {
    if (chrome.runtime.lastError) {
      console.error('Error checking login status:', chrome.runtime.lastError);
      return;
    }
    
    const isLoggedIn = results && results[0] && results[0].result === true;
    updateOpenListsButton(isLoggedIn);
    
    // Removed alert - tooltip on disabled button will show message instead
  });
}

function logToTwitterConsole() {
  // Find the X/Twitter tab and navigate to user's lists page
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, function(tabs) {
    if (tabs.length > 0) {
      const targetTab = tabs[0];
      // Get username and navigate to lists page
      chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        function: getUsername
      }, function(results) {
        if (chrome.runtime.lastError) {
          console.error('Error getting username:', chrome.runtime.lastError);
          return;
        }
        
        const username = results && results[0] && results[0].result;
        if (username) {
          chrome.tabs.update(targetTab.id, { url: `https://x.com/${username}/lists` });
        } else {
          // Fallback to i/lists if username not found
          chrome.tabs.update(targetTab.id, { url: 'https://x.com/i/lists' });
        }
      });
    } else {
      // If no X tab is open, create a new one with lists page (will need login first)
      chrome.tabs.create({ url: 'https://x.com/i/lists' });
    }
  });
}

function checkIfOnListsPage() {
  // Check if user is currently on a lists page
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, function(tabs) {
    const listInteraction = document.getElementById('listInteraction');
    
    if (tabs.length > 0) {
      // Find the active X tab, or use the first one
      let activeTab = tabs.find(tab => tab.active) || tabs[0];
      const url = activeTab.url;
      
      // Check if URL contains /lists (matches patterns like /username/lists or /i/lists)
      if (url && (url.includes('/lists') || url.match(/\/[^\/]+\/lists/))) {
        if (listInteraction) {
          listInteraction.style.display = 'block';
        }
      } else {
        if (listInteraction) {
          listInteraction.style.display = 'none';
        }
      }
    } else {
      // No X tab open, hide the section
      if (listInteraction) {
        listInteraction.style.display = 'none';
      }
    }
  });
}

function logListNameToConsole(listName) {
  // Find the X/Twitter tab and inject script to find and click the list element
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, function(tabs) {
    if (tabs.length > 0) {
      const targetTab = tabs[0];
      chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        function: clickListByName,
        args: [listName]
      }, function(results) {
        if (chrome.runtime.lastError) {
          console.error('Error clicking list:', chrome.runtime.lastError);
          return;
        }
        
        if (results && results[0] && results[0].result === false) {
          console.log(`Could not find list with name: ${listName}`);
        }
      });
    }
  });
}

