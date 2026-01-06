// Helper functions - functions that run in the context of the X.com page or are utility functions

// This function runs in the context of the X.com page
function isLoggedIn() {
  // Check for indicators that user is logged in
  // The most reliable indicator is the Tweet/Post button which only appears when logged in
  
  // Primary check: Look for the Tweet/Post button (most reliable indicator)
  const tweetButton = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
  if (tweetButton && tweetButton.offsetParent !== null) {
    return true; // User is logged in
  }
  
  // Secondary checks: Look for other logged-in indicators
  const loggedInIndicators = [
    '[data-testid="AppTabBar_Home_Link"]',
    '[data-testid="AppTabBar_Profile_Link"]',
    '[aria-label*="Profile menu" i]',
    'a[href*="/compose/tweet"]',
    'nav[aria-label*="Primary" i]',
    '[data-testid="primaryColumn"]'
  ];
  
  for (const selector of loggedInIndicators) {
    try {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return true; // User appears to be logged in
      }
    } catch (e) {
      // Continue checking other selectors
    }
  }
  
  // Check for prominent sign-in/login buttons (indicates NOT logged in)
  const signInButtons = document.querySelectorAll('a[href*="/login"], a[href*="/i/flow/login"], a[href*="/i/flow/signup"]');
  for (const button of signInButtons) {
    const text = button.textContent.toLowerCase();
    const ariaLabel = button.getAttribute('aria-label') || '';
    if (text.includes('sign in') || text.includes('log in') || ariaLabel.toLowerCase().includes('sign in')) {
      // Found a prominent sign-in button, user is likely not logged in
      return false;
    }
  }
  
  // Check page content for logged-out indicators
  const bodyText = document.body.textContent.toLowerCase();
  const hasHappeningNow = bodyText.includes('happening now');
  const hasJoinToday = bodyText.includes('join today');
  
  // If we see these phrases and no tweet button, user is likely logged out
  if ((hasHappeningNow || hasJoinToday) && !tweetButton) {
    return false;
  }
  
  // If we can't find clear indicators, default to false (not logged in)
  // This is safer than assuming logged in
  return false;
}

// This function runs in the context of the X.com page to get username
function getUsername() {
  let username = null;
  
  // Method 1: Check profile link in sidebar navigation
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  if (profileLink) {
    const href = profileLink.getAttribute('href');
    if (href) {
      // Extract username from href like "/username" or "/home"
      const match = href.match(/\/([^\/\?]+)/);
      if (match && match[1] !== 'home' && match[1] !== 'i') {
        username = match[1];
      }
    }
  }
  
  // Method 2: Check profile menu button for username
  if (!username) {
    const profileMenu = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (profileMenu) {
      // Look for username in the account switcher
      const accountSwitcherText = profileMenu.getAttribute('aria-label') || profileMenu.textContent;
      // Sometimes the username appears in the text
      const usernameMatch = accountSwitcherText.match(/@(\w+)/);
      if (usernameMatch) {
        username = usernameMatch[1];
      }
    }
  }
  
  // Method 3: Check sidebar for profile link with username
  if (!username) {
    const sidebarLinks = document.querySelectorAll('a[href*="/"][data-testid]');
    for (const link of sidebarLinks) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('home') && !href.includes('i/') && !href.includes('compose')) {
        const match = href.match(/^\/([^\/\?]+)$/);
        if (match && match[1].length > 0 && !['explore', 'notifications', 'messages', 'bookmarks', 'lists', 'communities', 'premium'].includes(match[1])) {
          username = match[1];
          break;
        }
      }
    }
  }
  
  // Method 4: Check if we're on a profile page and extract from URL
  if (!username) {
    const currentUrl = window.location.pathname;
    if (currentUrl && currentUrl !== '/' && currentUrl !== '/home' && !currentUrl.includes('/i/')) {
      const match = currentUrl.match(/^\/([^\/\?]+)$/);
      if (match && match[1]) {
        username = match[1];
      }
    }
  }
  
  // Method 5: Look for profile section in sidebar
  if (!username) {
    const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (accountSwitcher) {
      const parent = accountSwitcher.closest('a[href*="/"]');
      if (parent) {
        const href = parent.getAttribute('href');
        if (href) {
          const match = href.match(/^\/([^\/\?]+)$/);
          if (match && match[1] && match[1] !== 'home') {
            username = match[1];
          }
        }
      }
    }
  }
  
  return username;
}

// This function runs in the context of the X.com page
// Finds and clicks the span element with the exact list name
function clickListByName(listName) {
  // Find all span elements
  const spans = document.querySelectorAll('span');
  
  // Look for a span with exact text matching the list name
  for (const span of spans) {
    // Check if the span's text content (trimmed) exactly matches the list name
    const spanText = span.textContent.trim();
    if (spanText === listName) {
      // Found matching span, try to click it
      try {
        // First try clicking the span directly
        span.click();
        console.log(`Clicked on list: ${listName}`);
        return true;
      } catch (e) {
        // If span is not directly clickable, try clicking parent elements
        let element = span.parentElement;
        while (element && element !== document.body) {
          // Check if parent is clickable (link, button, or has click handler)
          if (element.tagName === 'A' || element.tagName === 'BUTTON' || 
              element.onclick || element.getAttribute('role') === 'button' ||
              element.style.cursor === 'pointer') {
            try {
              element.click();
              console.log(`Clicked on list via parent element: ${listName}`);
              return true;
            } catch (e2) {
              // Continue to next parent
            }
          }
          element = element.parentElement;
        }
        
        // If all else fails, try dispatching a click event
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        span.dispatchEvent(clickEvent);
        console.log(`Dispatched click event on list: ${listName}`);
        return true;
      }
    }
  }
  
  // If no exact match found, log and return false
  console.log(`List not found: ${listName}`);
  return false;
}

