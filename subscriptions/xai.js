/**
 * xAI (Grok) subscription OAuth helpers for a pure client-side Chrome extension.
 *
 * Uses the public Grok CLI OAuth client + PKCE with manual paste of the loopback
 * callback URL (extensions cannot listen on 127.0.0.1:56121).
 *
 * Storage: chrome.storage.local under STORAGE_KEY / PENDING_KEY.
 * Tokens never leave the user's machine.
 */

export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const XAI_OAUTH_SCOPE =
  'openid profile email offline_access grok-cli:access api:access';
export const XAI_OAUTH_ISSUER = 'https://auth.x.ai';
export const XAI_OAUTH_DISCOVERY_URL =
  `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`;
export const XAI_OAUTH_REDIRECT_URI = 'http://127.0.0.1:56121/callback';

/** chrome.storage.local key for persisted tokens */
export const STORAGE_KEY = 'xaiOAuthTokens';
/** chrome.storage.local key for in-flight PKCE session (verifier/state) */
export const PENDING_KEY = 'xaiOAuthPending';

const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30 * 1000;

// ── Crypto / PKCE ────────────────────────────────────────────────────────────

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Match progrok/Grok CLI: verifier = 32 random bytes as hex; challenge = S256(verifier). */
export async function generatePKCE() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = bytesToHex(verifierBytes);
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return { verifier, challenge: base64UrlEncode(hash) };
}

export function generateState() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

// ── Discovery ────────────────────────────────────────────────────────────────

function requireTrustedEndpoint(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`OIDC discovery returned invalid ${label}: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`OIDC discovery returned non-HTTPS ${label}: ${url}`);
  }
  if (parsed.hostname !== 'x.ai' && !parsed.hostname.endsWith('.x.ai')) {
    throw new Error(`OIDC discovery returned untrusted ${label}: ${url}`);
  }
  return url;
}

export async function fetchOIDCDiscovery() {
  const res = await fetch(XAI_OAUTH_DISCOVERY_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
  const data = await res.json();
  return {
    authorizationEndpoint: requireTrustedEndpoint(
      data.authorization_endpoint,
      'authorization_endpoint',
    ),
    tokenEndpoint: requireTrustedEndpoint(
      data.token_endpoint,
      'token_endpoint',
    ),
  };
}

// ── Auth session (manual paste) ──────────────────────────────────────────────

/**
 * Start a PKCE login. Saves pending verifier/state to chrome.storage.local.
 * @returns {{ authorizeUrl: string, state: string }}
 */
export async function beginManualPasteLogin() {
  const discovery = await fetchOIDCDiscovery();
  const pkce = await generatePKCE();
  const state = generateState();

  const authorizeUrl = new URL(discovery.authorizationEndpoint);
  authorizeUrl.searchParams.set('client_id', XAI_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', XAI_OAUTH_REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', XAI_OAUTH_SCOPE);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  await chrome.storage.local.set({
    [PENDING_KEY]: {
      codeVerifier: pkce.verifier,
      state,
      tokenEndpoint: discovery.tokenEndpoint,
      createdAt: Date.now(),
    },
  });

  return { authorizeUrl: authorizeUrl.toString(), state };
}

/**
 * Extract an authorization code from a pasted callback URL, query string, or raw code.
 */
export function extractCodeFromInput(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (code) return code;
  } catch {
    // not a full URL
  }

  if (trimmed.startsWith('?')) {
    const params = new URLSearchParams(trimmed.slice(1));
    const code = params.get('code');
    if (code) return code;
  }

  // Bare code (long, no spaces)
  if (trimmed.length > 10 && !/\s/.test(trimmed) && !trimmed.includes('://')) {
    return trimmed;
  }

  // Sometimes the browser shows "This site can't be reached" but the address bar
  // still has the URL; also accept "code=...&state=..." without leading ?
  if (trimmed.includes('code=')) {
    const params = new URLSearchParams(
      trimmed.includes('?') ? trimmed.split('?').pop() : trimmed,
    );
    const code = params.get('code');
    if (code) return code;
  }

  return null;
}

/**
 * Also pull state from pasted input when present (for validation).
 */
export function extractStateFromInput(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.searchParams.get('state');
  } catch {
    // continue
  }
  if (trimmed.includes('state=')) {
    const params = new URLSearchParams(
      trimmed.includes('?') ? trimmed.split('?').pop() : trimmed,
    );
    return params.get('state');
  }
  return null;
}

/**
 * Complete login after the user pastes the failed loopback callback URL (or code).
 * @returns {Promise<object>} saved token record
 */
export async function completeManualPasteLogin(pastedInput) {
  const code = extractCodeFromInput(pastedInput);
  if (!code) {
    throw new Error(
      'Could not find an authorization code in what you pasted. Copy the full URL from the address bar after login.',
    );
  }

  const stored = await chrome.storage.local.get(PENDING_KEY);
  const pending = stored[PENDING_KEY];
  if (!pending?.codeVerifier || !pending?.tokenEndpoint) {
    throw new Error(
      'No login in progress. Click Sign in with Grok again, then paste the callback URL.',
    );
  }

  const pastedState = extractStateFromInput(pastedInput);
  if (pastedState && pending.state && pastedState !== pending.state) {
    throw new Error(
      'Login state did not match. Click Sign in with Grok again and use the new browser tab.',
    );
  }

  const tokenRes = await fetch(pending.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: XAI_OAUTH_CLIENT_ID,
      code,
      redirect_uri: XAI_OAUTH_REDIRECT_URI,
      code_verifier: pending.codeVerifier,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed: ${errText || tokenRes.status}`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    throw new Error('Token exchange returned no access_token. Try signing in again.');
  }

  const record = await saveTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    idToken: tokens.id_token,
    tokenEndpoint: pending.tokenEndpoint,
  });

  await chrome.storage.local.remove(PENDING_KEY);
  return record;
}

export async function cancelPendingLogin() {
  await chrome.storage.local.remove(PENDING_KEY);
}

// ── Token storage ────────────────────────────────────────────────────────────

function emailFromIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return undefined;
  try {
    const parts = idToken.split('.');
    if (!parts[1]) return undefined;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return typeof payload.email === 'string' ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {{ accessToken: string, refreshToken?: string, expiresIn?: number, idToken?: string, tokenEndpoint?: string }} input
 */
export async function saveTokens(input) {
  const existing = await loadTokens();
  const data = {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken || existing?.refreshToken,
    expiresAt:
      typeof input.expiresIn === 'number'
        ? Date.now() + input.expiresIn * 1000
        : existing?.expiresAt,
    tokenEndpoint: input.tokenEndpoint || existing?.tokenEndpoint || `${XAI_OAUTH_ISSUER}/oauth2/token`,
    idToken: input.idToken || existing?.idToken,
    email: emailFromIdToken(input.idToken) || existing?.email,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  return data;
}

export async function loadTokens() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || null;
}

export async function clearTokens() {
  await chrome.storage.local.remove([STORAGE_KEY, PENDING_KEY]);
}

export function isSignedIn(tokens) {
  return !!(tokens && (tokens.accessToken || tokens.refreshToken));
}

/**
 * Return a valid access token, refreshing if near expiry.
 * @throws if not signed in or refresh fails
 */
export async function getValidAccessToken() {
  const tokens = await loadTokens();
  if (!tokens?.accessToken && !tokens?.refreshToken) {
    throw new Error('Not signed in with Grok. Sign in from Settings.');
  }

  const needsRefresh =
    !tokens.accessToken ||
    (tokens.expiresAt && Date.now() + TOKEN_REFRESH_SKEW_MS >= tokens.expiresAt);

  if (!needsRefresh) return tokens.accessToken;

  if (!tokens.refreshToken) {
    await clearTokens();
    throw new Error('Grok session expired. Sign in again from Settings.');
  }

  const tokenEndpoint =
    tokens.tokenEndpoint || `${XAI_OAUTH_ISSUER}/oauth2/token`;

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: XAI_OAUTH_CLIENT_ID,
      refresh_token: tokens.refreshToken,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    await clearTokens();
    const errText = await res.text().catch(() => '');
    throw new Error(
      `Grok session refresh failed. Sign in again. ${errText || res.status}`,
    );
  }

  const refreshed = await res.json();
  if (!refreshed.access_token) {
    await clearTokens();
    throw new Error('Grok session refresh returned no access token. Sign in again.');
  }

  await saveTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresIn: refreshed.expires_in,
    idToken: refreshed.id_token,
    tokenEndpoint,
  });

  return refreshed.access_token;
}
