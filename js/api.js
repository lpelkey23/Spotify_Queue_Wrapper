async function spotifyFetch(path, options = {}) {
  const token = await getValidAccessToken();

  const res = await fetch(`${SPOTIFY_CONFIG.apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 204) return null;

  if (res.status === 401) {
    window.location.replace("./index.html");
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await res.json();
  }

  return null;
}

async function getAvailableDevices() {
  const data = await spotifyFetch("/me/player/devices");
  return data?.devices || [];
}

async function getCurrentPlayback() {
  try {
    return await spotifyFetch("/me/player");
  } catch (err) {
    return null;
  }
}

async function getUserQueue() {
  try {
    return await spotifyFetch("/me/player/queue");
  } catch (err) {
    return {
      currently_playing: null,
      queue: []
    };
  }
}

async function searchTracks(query) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("type", "track");
  params.set("limit", "20");

  const data = await spotifyFetch(`/search?${params.toString()}`);
  return data?.tracks?.items || [];
}

async function queueTrack(trackUri, deviceId) {
  const params = new URLSearchParams({ uri: trackUri });
  if (deviceId) {
    params.set("device_id", deviceId);
  }

  return await spotifyFetch(`/me/player/queue?${params.toString()}`, {
    method: "POST"
  });
}