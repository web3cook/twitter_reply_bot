// Posts data fetching functionality

// This function runs in the context of the X.com page
// Extracts all posts data from the current list page
function getAllPostsData() {
  const posts = [];
  
  // Find all tweet articles on the page
  const tweetArticles = document.querySelectorAll('article[data-testid="tweet"]');
  
  tweetArticles.forEach((article, index) => {
    try {
      const postData = {
        index: index + 1,
        username: null,
        displayName: null,
        repliedTo: [],
        timePosted: null,
        timePostedISO: null,
        images: [],
        tweetText: null,
        tweetUrl: null
      };
      
      // Extract username - look for @username pattern in the article
      const usernameElement = article.querySelector('[data-testid="User-Name"]');
      if (usernameElement) {
        // Try to find the @username link
        const usernameLink = usernameElement.querySelector('a[href^="/"]');
        if (usernameLink) {
          const href = usernameLink.getAttribute('href');
          if (href && href.startsWith('/') && !href.includes('/status/') && !href.includes('/i/')) {
            postData.username = href.replace('/', '').split('/')[0];
          }
        }
        
        // Also try to extract display name
        const displayNameSpan = usernameElement.querySelector('span');
        if (displayNameSpan) {
          postData.displayName = displayNameSpan.textContent.trim();
        }
      }
      
      // Fallback: look for @username pattern near the top of the article (author username)
      if (!postData.username) {
        // Find the first @username link that's not in "Replying to" section
        const allLinks = article.querySelectorAll('a[href^="/"]');
        for (const link of allLinks) {
          const href = link.getAttribute('href');
          // Skip status links, i/ links, and links in "Replying to" sections
          if (href && href.startsWith('/') && 
              !href.includes('/status/') && 
              !href.includes('/i/') &&
              !link.closest('[dir="ltr"]')?.textContent.includes('Replying to')) {
            const potentialUsername = href.replace('/', '').split('/')[0];
            // Make sure it's a valid username (not empty, not common paths)
            if (potentialUsername && 
                !['home', 'explore', 'notifications', 'messages', 'bookmarks', 'lists'].includes(potentialUsername)) {
              // Check if there's an @username pattern nearby
              const linkText = link.textContent.trim();
              if (linkText.startsWith('@') || link.closest('[data-testid="User-Name"]')) {
                postData.username = potentialUsername;
                break;
              }
            }
          }
        }
      }
      
      // Extract time posted
      const timeElement = article.querySelector('time[datetime]');
      if (timeElement) {
        postData.timePostedISO = timeElement.getAttribute('datetime');
        postData.timePosted = timeElement.textContent.trim();
      }
      
      // Extract "replied to" information
      // Look for "Replying to" text and extract usernames
      const articleText = article.textContent;
      if (articleText.includes('Replying to')) {
        // Find all @username patterns after "Replying to"
        const repliedToSection = article.querySelector('[dir="ltr"]');
        if (repliedToSection && repliedToSection.textContent.includes('Replying to')) {
          const repliedToLinks = repliedToSection.querySelectorAll('a[href^="/"]');
          repliedToLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('/') && !href.includes('/status/') && !href.includes('/i/')) {
              const username = href.replace('/', '');
              if (!postData.repliedTo.includes(username)) {
                postData.repliedTo.push(username);
              }
            }
          });
        }
      }
      
      // Extract images
      const imageElements = article.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="tweetPhoto"] [style*="background-image"]');
      imageElements.forEach(img => {
        let imageUrl = null;
        
        // Check if it's an img tag
        if (img.tagName === 'IMG' && img.src) {
          imageUrl = img.src;
        }
        // Check if it's a background image
        else if (img.style.backgroundImage) {
          const match = img.style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (match) {
            imageUrl = match[1];
          }
        }
        
        if (imageUrl && !postData.images.includes(imageUrl)) {
          postData.images.push(imageUrl);
        }
      });
      
      // Extract tweet text
      const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
      if (tweetTextElement) {
        postData.tweetText = tweetTextElement.textContent.trim();
      }
      
      // Extract tweet URL
      const tweetLink = article.querySelector('a[href*="/status/"]');
      if (tweetLink) {
        const href = tweetLink.getAttribute('href');
        if (href) {
          postData.tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
        }
      }
      
      posts.push(postData);
    } catch (error) {
      console.error(`Error extracting data from post ${index + 1}:`, error);
    }
  });
  
  return {
    totalPosts: posts.length,
    posts: posts,
    extractedAt: new Date().toISOString()
  };
}

// This function runs in the extension context (background/popup)
// Finds the X/Twitter tab and extracts all posts data
function fetchAllPostsData() {
  // Find the X/Twitter tab and extract all posts data
  chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, function(tabs) {
    if (tabs.length > 0) {
      const targetTab = tabs[0];
      chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        function: getAllPostsData
      }, function(results) {
        if (chrome.runtime.lastError) {
          console.error('Error fetching posts data:', chrome.runtime.lastError);
          alert('Error fetching posts data. Make sure you are on a list page.');
          return;
        }
        
        if (results && results[0] && results[0].result) {
          const postsData = results[0].result;
          console.log('Posts Data:', postsData);
          
          // Display the data in console and also show a summary
          const summary = `Found ${postsData.totalPosts} posts\n\n` +
            postsData.posts.map((post, idx) => {
              return `Post ${idx + 1}:\n` +
                `  Username: @${post.username || 'N/A'}\n` +
                `  Display Name: ${post.displayName || 'N/A'}\n` +
                `  Time: ${post.timePosted || 'N/A'}\n` +
                `  Replied To: ${post.repliedTo.length > 0 ? post.repliedTo.map(u => `@${u}`).join(', ') : 'None'}\n` +
                `  Images: ${post.images.length}\n` +
                `  Text: ${post.tweetText ? post.tweetText.substring(0, 50) + '...' : 'N/A'}\n`;
            }).join('\n');
          
          console.log(summary);
          alert(`Found ${postsData.totalPosts} posts. Check console for full details.`);
          
          // Return the data for potential use
          return postsData;
        } else {
          alert('No posts found on this page. Make sure you are on a list page with posts.');
        }
      });
    } else {
      alert('No X/Twitter tab found. Please open X first.');
    }
  });
}

