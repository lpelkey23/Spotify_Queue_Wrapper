const LOCKED_DEVICE_NAME = "iPhone"; // change this if Spotify shows a slightly different name

const state = {
  activeDeviceId: "",
  activeDeviceName: "",
  currentTrackUri: "",
  currentTrackObj: null,
  queueTracks: [],
  searchTimer: null,
  lastQuery: "",
  lastResults: [],
  queuePollTimer: null
};

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, isError = false) {
  const box = document.getElementById("messageBox");
  box.textContent = text;
  box.classList.remove("hidden", "error");
  if (isError) box.classList.add("error");

  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => {
    box.classList.add("hidden");
  }, 3000);
}

function getLockedIphone(devices) {
  return devices.find(
    d =>
      d.name === LOCKED_DEVICE_NAME ||
      d.name.toLowerCase() === LOCKED_DEVICE_NAME.toLowerCase()
  ) || null;
}

function isDuplicateTrack(track) {
  if (!track?.uri) return false;
  if (track.uri === state.currentTrackUri) return true;
  return state.queueTracks.some(t => t.uri === track.uri);
}

function renderNowPlaying() {
  const nowPlayingEl = document.getElementById("nowPlayingBox");

  if (!state.currentTrackObj) {
    nowPlayingEl.innerHTML = `
      <div class="now-playing-item">
        <div class="track-meta">
          <div class="track-title">Nothing currently playing</div>
          <div class="track-subtitle">Start Spotify on Logan's iPhone first.</div>
        </div>
      </div>
    `;
    return;
  }

  const artists = (state.currentTrackObj.artists || []).map(a => a.name).join(", ");
  const album = state.currentTrackObj.album?.name || "";

  nowPlayingEl.innerHTML = `
    <div class="now-playing-item">
      <div class="track-meta">
        <div class="track-title">Now Playing: ${escapeHtml(state.currentTrackObj.name)}</div>
        <div class="track-subtitle">${escapeHtml(artists)} · ${escapeHtml(album)}</div>
      </div>
      <div class="queue-badge">Live</div>
    </div>
  `;
}

function renderQueuePreview() {
  const previewEl = document.getElementById("queuePreview");

  if (!state.queueTracks.length) {
    previewEl.innerHTML = `<p class="empty-state">No queued songs right now.</p>`;
    return;
  }

  previewEl.innerHTML = "";

  state.queueTracks.forEach((track, index) => {
    const artists = (track.artists || []).map(a => a.name).join(", ");
    const album = track.album?.name || "";

    const row = document.createElement("div");
    row.className = "queue-item";
    row.innerHTML = `
      <div class="track-meta">
        <div class="track-title">${escapeHtml(track.name)}</div>
        <div class="track-subtitle">${escapeHtml(artists)} · ${escapeHtml(album)}</div>
      </div>
      <div class="queue-badge">#${index + 1}</div>
    `;
    previewEl.appendChild(row);
  });
}

function renderResults(tracks) {
  const resultsEl = document.getElementById("results");

  if (!tracks.length) {
    resultsEl.innerHTML = `<p class="empty-state">No results yet.</p>`;
    return;
  }

  resultsEl.innerHTML = "";

  for (const track of tracks) {
    const artists = (track.artists || []).map(a => a.name).join(", ");
    const album = track.album?.name || "";
    const duplicate = isDuplicateTrack(track);

    const row = document.createElement("div");
    row.className = "result-item";

    row.innerHTML = `
      <div class="track-meta">
        <div class="track-title">${escapeHtml(track.name)}</div>
        <div class="track-subtitle">${escapeHtml(artists)} · ${escapeHtml(album)}</div>
      </div>
      <button class="queue-btn" ${duplicate ? "disabled" : ""}>
        ${duplicate ? "Already Queued" : "Queue"}
      </button>
    `;

    row.querySelector(".queue-btn").addEventListener("click", async () => {
      try {
        if (!state.activeDeviceId) {
          showMessage("Logan's iPhone is not currently available in Spotify.", true);
          return;
        }

        if (isDuplicateTrack(track)) {
          showMessage("That song is already playing or already in the queue.", true);
          return;
        }

        await queueTrack(track.uri, state.activeDeviceId);
        showMessage(`Queued: ${track.name}`);

        await refreshQueueState();
      } catch (err) {
        console.error(err);
        showMessage("Could not queue track.", true);
      }
    });

    resultsEl.appendChild(row);
  }
}

async function refreshDeviceState() {
  try {
    const devices = await getAvailableDevices();
    const iphone = getLockedIphone(devices);

    if (!iphone) {
      state.activeDeviceId = "";
      state.activeDeviceName = "";
      return;
    }

    state.activeDeviceId = iphone.id;
    state.activeDeviceName = iphone.name;
  } catch (err) {
    console.error(err);
    state.activeDeviceId = "";
    state.activeDeviceName = "";
  }
}

async function refreshQueueState() {
  try {
    const queueData = await getUserQueue();

    state.currentTrackObj = queueData?.currently_playing || null;
    state.currentTrackUri = queueData?.currently_playing?.uri || "";
    state.queueTracks = Array.isArray(queueData?.queue) ? queueData.queue : [];

    renderNowPlaying();
    renderQueuePreview();
    renderResults(state.lastResults);
  } catch (err) {
    console.error(err);
    showMessage("Could not refresh queue.", true);
  }
}

async function refreshAll() {
  await refreshDeviceState();
  await refreshQueueState();
}

async function performSearch(query) {
  try {
    state.lastQuery = query;
    const tracks = await searchTracks(query);

    if (state.lastQuery !== query) return;

    state.lastResults = tracks;
    renderResults(tracks);
  } catch (err) {
    console.error(err);
    showMessage("Search failed.", true);
  }
}

function setupPolling() {
  clearInterval(state.queuePollTimer);
  state.queuePollTimer = setInterval(refreshQueueState, 10000);
}

function setupKeyboardAvoidance() {
  if (!window.visualViewport) return;

  let lastVVHeight = window.visualViewport.height;

  window.visualViewport.addEventListener("resize", () => {
    const newHeight = window.visualViewport.height;
    const delta = lastVVHeight - newHeight;
    lastVVHeight = newHeight;

    // keyboard just opened
    if (delta > 150 && state.lastResults.length > 0) {
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

async function initApp() {
  const ok = await hasValidSession();
  if (!ok) {
    window.location.replace("./index.html");
    return;
  }

  document.getElementById("searchInput").addEventListener("input", (e) => {
    const query = e.target.value.trim();

    clearTimeout(state.searchTimer);

    if (!query) {
      state.lastResults = [];
      renderResults([]);
      return;
    }

    state.searchTimer = setTimeout(async () => {
      await performSearch(query);
    }, 250);
  });

  setupKeyboardAvoidance();
  await refreshAll();
  renderResults([]);
  setupPolling();
}

initApp();
