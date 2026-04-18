const state = {
  activeDeviceId: "",
  activeDeviceName: "",
  currentTrackUri: "",
  queueTracks: [],
  devices: [],
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

function setDeviceText(text) {
  document.getElementById("deviceText").textContent = text;
}

function isDuplicateTrack(track) {
  if (!track?.uri) return false;
  if (track.uri === state.currentTrackUri) return true;
  return state.queueTracks.some(t => t.uri === track.uri);
}

function renderNowPlaying() {
  const nowPlayingEl = document.getElementById("nowPlayingBox");

  if (!state.currentTrackUri) {
    nowPlayingEl.innerHTML = `
      <div class="now-playing-item">
        <div class="track-meta">
          <div class="track-title">Nothing currently playing</div>
          <div class="track-subtitle">Start Spotify on your selected device.</div>
        </div>
      </div>
    `;
    return;
  }

  const current = state.currentTrackObj;
  if (!current) {
    nowPlayingEl.innerHTML = "";
    return;
  }

  const artists = (current.artists || []).map(a => a.name).join(", ");
  const album = current.album?.name || "";

  nowPlayingEl.innerHTML = `
    <div class="now-playing-item">
      <div class="track-meta">
        <div class="track-title">Now Playing: ${escapeHtml(current.name)}</div>
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

function renderDeviceSelect() {
  const select = document.getElementById("deviceSelect");
  select.innerHTML = "";

  if (!state.devices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No Spotify devices found";
    select.appendChild(option);
    return;
  }

  state.devices.forEach(device => {
    const option = document.createElement("option");
    option.value = device.id;

    let label = device.name;
    if (device.is_active) label += " (Active)";
    if (device.id === state.activeDeviceId) label += " (Selected)";

    option.textContent = label;
    option.selected = device.id === state.activeDeviceId;
    select.appendChild(option);
  });
}

async function refreshDeviceState() {
  try {
    const playback = await getCurrentPlayback();
    const devices = await getAvailableDevices();

    state.devices = devices;

    let activeDevice = playback?.device || devices.find(d => d.is_active) || null;

    const saved = localStorage.getItem("spotify_selected_device_id");
    if (!activeDevice && saved) {
      activeDevice = devices.find(d => d.id === saved) || null;
    }
    if (!activeDevice && devices.length > 0) {
      activeDevice = devices[0];
    }

    if (activeDevice) {
      state.activeDeviceId = activeDevice.id;
      state.activeDeviceName = activeDevice.name;
      localStorage.setItem("spotify_selected_device_id", activeDevice.id);
      setDeviceText(`Controlling: ${activeDevice.name}`);
    } else {
      state.activeDeviceId = "";
      state.activeDeviceName = "";
      setDeviceText("No active Spotify device found. Start Spotify on your phone first.");
    }

    renderDeviceSelect();
  } catch (err) {
    console.error(err);
    state.devices = [];
    renderDeviceSelect();
    setDeviceText("Could not load Spotify devices.");
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
        if (isDuplicateTrack(track)) {
          showMessage("That song is already playing or already in the queue.", true);
          return;
        }

        if (!state.activeDeviceId) {
          await refreshDeviceState();
        }

        if (!state.activeDeviceId) {
          showMessage("No Spotify device selected.", true);
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

async function useSelectedDevice() {
  const select = document.getElementById("deviceSelect");
  const deviceId = select.value;

  if (!deviceId) {
    showMessage("Select a Spotify device first.", true);
    return;
  }

  try {
    await transferPlaybackToDevice(deviceId, true);
    localStorage.setItem("spotify_selected_device_id", deviceId);
    await refreshAll();
    showMessage("Playback device updated.");
  } catch (err) {
    console.error(err);
    showMessage("Could not switch playback device.", true);
  }
}

function clearPreviewDisplayOnly() {
  document.getElementById("queuePreview").innerHTML =
    `<p class="empty-state">Preview cleared locally. Refresh Queue to load Spotify’s real queue again.</p>`;
  document.getElementById("nowPlayingBox").innerHTML = "";
  showMessage("Preview display cleared. Spotify’s actual queue was not changed.", true);
}

function setupPolling() {
  clearInterval(state.queuePollTimer);
  state.queuePollTimer = setInterval(async () => {
    await refreshQueueState();
  }, 10000);
}

async function initApp() {
  const ok = await hasValidSession();
  if (!ok) {
    window.location.replace("./index.html");
    return;
  }

  document.getElementById("logoutBtn").addEventListener("click", () => {
    logout();
    window.location.replace("./index.html");
  });

  document.getElementById("refreshBtn").addEventListener("click", refreshAll);
  document.getElementById("refreshQueueBtn").addEventListener("click", refreshQueueState);
  document.getElementById("useSelectedDeviceBtn").addEventListener("click", useSelectedDevice);
  document.getElementById("clearPreviewBtn").addEventListener("click", clearPreviewDisplayOnly);

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
    }, 300);
  });

  await refreshAll();
  setupPolling();
}

initApp();