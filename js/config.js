const SPOTIFY_CONFIG = {
  clientId: "YOUR_SPOTIFY_CLIENT_ID",
  redirectUri: "https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/callback.html",
  scopes: [
    "user-read-playback-state",
    "user-modify-playback-state"
  ],
  apiBase: "https://api.spotify.com/v1",
  authBase: "https://accounts.spotify.com/authorize",
  tokenUrl: "https://accounts.spotify.com/api/token"
};