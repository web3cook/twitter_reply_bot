// platform.js — per-platform adapter registry + detection helpers.
//
// Every adapter has the SAME shape so popup.js can stay platform-neutral: it
// resolves an `activePlatform` adapter once and routes all platform-specific
// behaviour (URLs, login/scroll selectors, inject paths, page-fn names) through it.
//
// The page-context scripts (X/scraper.js, X/compose.js, LinkedIn/*) each define
// the SAME set of global functions with identical signatures and return shapes,
// so the `pageFns` arrows below are byte-identical across platforms — only the
// injected file differs. Posts everywhere use the canonical shape
//   { username, tweetText, tweetUrl, timePostedISO }
// (LinkedIn maps its data into this shape), so card rendering needs no per-field
// adapter. The arrows are serialized by chrome.scripting.executeScript and run in
// the page, so they must reference ONLY page globals + their args (no closures).

const PAGE_FNS_X = {
  autoScrollAndScrape:  (n)       => autoScrollAndScrape(n),
  scrapeCurrentView:    ()        => scrapeCurrentView(),
  scrapeAuthoredPosts:  (h, n, c) => scrapeAuthoredTweets(h, n, c),
  openReply:            (url, t)  => openReply(url, t),
  postReply:            (url, t)  => postReply(url, t),
  saveDraft:            (url, t)  => saveDraft(url, t),
  likePost:             (url)     => likeTweet(url),
};

const PAGE_FNS_LINKEDIN = {
  autoScrollAndScrape:  (n)       => autoScrollAndScrape(n),
  scrapeCurrentView:    ()        => scrapeCurrentView(),
  scrapeAuthoredPosts:  (h, n, c) => scrapeAuthoredPosts(h, n, c),
  openReply:            (url, t)  => openReply(url, t),
  postReply:            (url, t)  => postReply(url, t),
  saveDraft:            (url, t)  => saveDraft(url, t),
  likePost:             (url)     => likePost(url),
};

export const PLATFORMS = {
  x: {
    id: 'x',
    name: 'X',
    hostMatch: ['https://x.com/*'],
    homeUrl: 'https://x.com',
    urlPrefix: 'https://x.com',
    openButtonLabel: { open: 'Open X →', active: 'X Open' },
    loginLabel: 'Not logged in to X',
    scraperFile: 'X/scraper.js',
    composeFile: 'X/compose.js',

    loginCheckFn: () =>
      !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
      !!document.querySelector('[data-testid="AppTabBar_Home_Link"]'),

    loggedInUserFn: () => {
      const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
      return a ? a.getAttribute('href').replace(/^\//, '').toLowerCase() : null;
    },

    profileUrl: (h) => `https://x.com/${h}`,
    repliesUrl: (h) => `https://x.com/${h}/with_replies`,
    listsUrl:   (h) => (h ? `https://x.com/${h}/lists` : 'https://x.com/i/lists'),

    // Normalize @handle / handle / profile-URL into a bare handle.
    stripProfileInput: (raw) =>
      raw.replace(/^@/, '')
         .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
         .split(/[/?#]/)[0]
         .trim(),

    parseStatusId: (url) => url.match(/\/status\/(\d+)/)?.[1] || null,

    // Page-context: scroll the article for `sid` into view (falls back to top
    // if X virtualized it out of the DOM).
    scrollToPendingFn: (sid) => {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      for (const a of articles) {
        if (a.querySelector(`a[href*="/status/${sid}"]`)) {
          a.scrollIntoView({ behavior: 'instant', block: 'center' });
          return;
        }
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    },

    pageFns: PAGE_FNS_X,

    caps: { supportsDrafts: true, reactLabel: 'Like' },

    contextHints: {
      listMarker: '/lists/',
      profileSuffixes: ['', '/with_replies', '/media', '/likes'],
      ownProfileWarning: "This is your profile. Open a page with other people's posts for replies.",
      nonListTip: 'Works best on X List pages. Go to My Lists for the best results.',
    },
  },

  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    hostMatch: ['https://www.linkedin.com/*'],
    homeUrl: 'https://www.linkedin.com/feed/',
    urlPrefix: 'https://www.linkedin.com',
    openButtonLabel: { open: 'Open LinkedIn →', active: 'LinkedIn Open' },
    loginLabel: 'Not logged in to LinkedIn',
    scraperFile: 'LinkedIn/scraper.js',
    composeFile: 'LinkedIn/compose.js',

    // New-feed signals: the main feed list + the "Start a post" sharebox.
    loginCheckFn: () =>
      !!document.querySelector('[data-testid="mainFeed"]') ||
      !!document.querySelector('[aria-label="Start a post"]'),

    // The sharebox profile link carries the current member's vanity slug.
    loggedInUserFn: () => {
      const a = document.querySelector('a[componentkey="shareboxProfilePictureComponentRef"]');
      const href = a?.getAttribute('href') || '';
      return href.match(/\/in\/([^/?#]+)/)?.[1]?.toLowerCase() || null;
    },

    // TODO(linkedin): verify vanity-profile + activity paths.
    profileUrl: (h) => `https://www.linkedin.com/in/${h}/`,
    repliesUrl: (h) => `https://www.linkedin.com/in/${h}/recent-activity/comments/`,
    listsUrl:   () => 'https://www.linkedin.com/feed/',

    stripProfileInput: (raw) =>
      raw.replace(/^@/, '')
         .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '')
         .split(/[/?#]/)[0]
         .trim(),

    // The new feed has no public activity id; the scraper encodes an opaque
    // per-post POSTID into the synthetic tweetUrl (?postId=…).
    parseStatusId: (url) => url.match(/[?&#](?:postId=|post-)([\w-]+)/)?.[1] || null,

    // Page-context: scroll the post for `sid` (POSTID) into view (falls back to
    // top if LinkedIn virtualized it out of the DOM).
    scrollToPendingFn: (sid) => {
      const el = sid && document.querySelector(
        `[role="listitem"][componentkey="expanded${sid}FeedType_MAIN_FEED_RELEVANCE"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    },

    pageFns: PAGE_FNS_LINKEDIN,

    caps: { supportsDrafts: false, reactLabel: 'Like' },

    // No list/profile banners on LinkedIn (empty → init skips banner logic).
    contextHints: {},
  },
};

// Domain → platform id, or null.
export function detectPlatform(url) {
  if (!url) return null;
  if (url.startsWith('https://x.com')) return 'x';
  if (url.startsWith('https://www.linkedin.com')) return 'linkedin';
  return null;
}

// Resolution order: stored manual override → active-tab domain → any open
// platform tab → default 'x'.
export async function resolveActivePlatformId() {
  const { platformOverride } = await chrome.storage.local.get('platformOverride');
  if (platformOverride && PLATFORMS[platformOverride]) return platformOverride;

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const byActive = detectPlatform(active?.url);
  if (byActive) return byActive;

  for (const id of Object.keys(PLATFORMS)) {
    const tabs = await chrome.tabs.query({ url: PLATFORMS[id].hostMatch });
    if (tabs.length) return id;
  }
  return 'x';
}
