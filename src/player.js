// The docked player: clicking a song name anywhere plays it in a Spotify embed at the bottom
// of the page. Logged in to Spotify in this browser, the embed plays whole songs; otherwise
// Spotify plays 30-second previews. Songs with no Spotify ID (local files, YouTube rips) can't
// play, so their names keep opening the artist popup.
import { playlist } from "./data.js";
import { openArtist } from "./artist-sheet.js";

const API = "https://open.spotify.com/embed/iframe-api/v1";

// The Spotify track ID of a playlist song, or null for local files.
export function trackId(song) {
  if (!song || song.local) return null;
  const fromUrl = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/.exec(song.url || "")?.[1];
  return fromUrl || (song.historyKey && !song.historyKey.startsWith("local:") ? song.historyKey : null);
}

let bar, controller, ready, pending;

// Loads Spotify's iFrame API once, then makes one controller that later songs reuse.
function load(uri) {
  if (ready) return ready.then(c => { c.loadUri(uri); c.play(); });
  // A popover, so it sits in the top layer: above the artist popup (a modal dialog) and usable.
  bar = document.createElement("div");
  bar.className = "player";
  bar.popover = "manual";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Player");
  bar.innerHTML = `<div class="player-inner"><div class="player-embed"><div id="playerEmbed"></div></div>
    <button type="button" class="player-close" aria-label="Stop and close the player">✕</button></div>`;
  document.body.append(bar);
  bar.querySelector(".player-close").addEventListener("click", close);
  pending = uri;
  ready = new Promise(resolve => {
    window.onSpotifyIframeApiReady = IFrameAPI => {
      IFrameAPI.createController(bar.querySelector("#playerEmbed"), { uri: pending, width: "100%", height: 80 }, c => {
        controller = c;
        c.addListener("ready", () => c.play());
        resolve(c);
      });
    };
  });
  const script = document.createElement("script");
  script.src = API;
  script.async = true;
  document.head.append(script);
  return ready;
}

// Showing it again puts it back on top of the top layer; that doesn't reload the embed.
function raise() {
  if (bar.matches(":popover-open")) bar.hidePopover();
  bar.showPopover();
}

function show() {
  raise();
  document.documentElement.classList.add("player-open");
}

// For the artist popup: after it opens over a playing player, bring the player back on top.
export function raisePlayer() {
  if (bar && document.documentElement.classList.contains("player-open")) raise();
}

function close() {
  controller?.pause();
  bar.hidePopover();
  document.documentElement.classList.remove("player-open");
}

// Plays a playlist song; false if it has no Spotify ID.
export function playSong(song) {
  const id = trackId(song);
  if (!id) return false;
  const uri = "spotify:track:" + id;
  pending = uri;
  load(uri);
  show();
  return true;
}

// What a song name does on every page: play it, or open its artist with the song expanded.
export function playOrOpen(n, artist) {
  const song = playlist.songs.find(s => s.n === Number(n));
  if (!playSong(song)) openArtist(artist, { song: Number(n) });
}
