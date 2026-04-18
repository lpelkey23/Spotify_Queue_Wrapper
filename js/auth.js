function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const values = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    result += chars[values[i] % chars.length];
  }
  return result;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(arrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generatePkcePair() {
  const verifier = randomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  return { verifier, challenge };
}

function getStoredToken() {
  return localStorage.getItem("spotify_access_token");
}

function getStoredRefreshToken() {
  return localStorage.getItem("spotify_refresh_token");
}

function getStoredExpiry() {
  return Number(localStorage.getItem("spotify_expires_at") || "0");
}

function storeTokens(data) {
  const expiresIn = Number(data.expires_in || 3600);
  const expiresAt = Date.now() + (expiresIn - 60) * 1000;

  if (data.access_token) {
    localStorage.setItem("spotify_access_token", data.access_token);
  }
  if (data.refresh_token) {
    localStorage.setItem("spotify_refresh_token", data.refresh_token);
  }
  localStorage.setItem("spotify_expires_at", String(expiresAt));
}

async function hasValidSession() {
  const token = getStoredToken();
  const expiresAt = getStoredExpiry();

  if (!token) return false;
  if (Date.now() < expiresAt) return true;

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}

async function redirectToSpotifyLogin() {
  const { verifier, challenge } = await generatePkcePair();
  localStorage.setItem("spotify_code_verifier", verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    response_type: "code",
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    scope: SPOTIFY_CONFIG.scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  window.location.href = `${SPOTIFY_CONFIG.authBase}?${params.toString()}`;
}

async function handleSpotifyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  const verifier = localStorage.getItem("spotify_code_verifier");

  if (error) {
    throw new Error(`Spotify auth error: ${error}`);
  }
  if (!code || !verifier) {
    throw new Error("Missing code or PKCE verifier.");
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    code_verifier: verifier
  });

  const res = await fetch(SPOTIFY_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = await res.json();
  storeTokens(data);
  localStorage.removeItem("spotify_code_verifier");
}

async function refreshAccessToken() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token found.");
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const res = await fetch(SPOTIFY_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Refresh failed: ${text}`);
  }

  const data = await res.json();
  storeTokens(data);
  return data.access_token || getStoredToken();
}

async function getValidAccessToken() {
  const token = getStoredToken();
  const expiresAt = getStoredExpiry();

  if (token && Date.now() < expiresAt) {
    return token;
  }

  return await refreshAccessToken();
}

function logout() {
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_expires_at");
  localStorage.removeItem("spotify_code_verifier");
  localStorage.removeItem("spotify_selected_device_id");
}