// The artist popup: photo, where they're from, and every song of theirs on the playlist.
// Each song opens to show its album, dates and length.
import { artistByName, playlist, listeningHistory } from "./data.js";
import { esc, fmtLength, fmtTotal, fmtHours, fmtDate, fmtTime, fmtRelease } from "./util.js";
import { playSong, raisePlayer, trackId } from "./player.js";
import { hasHistory, artistListening, songListening, playsText, bySongPlays } from "./listening.js";

// Plays and hours come from your streaming history; without it those numbers are left out.
const withHistory = hasHistory(listeningHistory);

let dialog;
let current = null;
let sort = "playlist";

const SORTS = {
  playlist: { label: "Playlist order", fn: (a, b) => a.n - b.n },
  added: { label: "Recently added", fn: (a, b) => (b.addedAt || 0) - (a.addedAt || 0) || a.n - b.n },
  released: { label: "Release date", fn: (a, b) => (a.released?.release_date || "9999").localeCompare(b.released?.release_date || "9999") || a.n - b.n },
  ...(withHistory ? { plays: { label: "Most played", fn: bySongPlays(listeningHistory) } } : {}),
};
// History dates are local calendar days ("2019-02-12"); noon keeps them on that day.
const historyDate = day => day ? fmtDate(new Date(`${day}T12:00:00`)) : "–";

// ---------- formatting ----------
const ALBUM_TYPES = { album: "Album", single: "Single", compilation: "Compilation" };

function aboutLine(mb) {
  if (!mb) return "";
  if (!mb.mbid) return "Not found on MusicBrainz.";
  const place = mb.begin_area || mb.area;
  const kind = mb.type === "Person" ? "Artist" : mb.type === "Group" ? "Band" : "Artist";
  const year = mb.begin ? mb.begin.slice(0, 4) : null;
  const started = year ? (mb.type === "Person" ? `born ${year}` : `formed ${year}`) : "";
  const ended = mb.ended && mb.end ? `, until ${mb.end.slice(0, 4)}` : "";
  const parts = [`${kind}${place ? ` from ${place}` : ""}`];
  if (started) parts.push(started + ended);
  return parts.join(", ") + ".";
}

// ---------- building the dialog ----------
function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "artist-sheet";
  dialog.setAttribute("aria-labelledby", "sheetName");
  document.body.appendChild(dialog);

  // Clicking the dimmed backdrop closes it.
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("sheet-open");
    current = null;
    history.replaceState(null, "", pageHash());
  });
  dialog.addEventListener("click", e => {
    const close = e.target.closest("[data-close]");
    if (close) return dialog.close();
    const other = e.target.closest("[data-artist]");
    if (other) return openArtist(other.dataset.artist);
    const play = e.target.closest("[data-play]");
    if (play) return playSong(current.songs.find(s => s.n === Number(play.dataset.play)));
    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) { sort = sortBtn.dataset.sort; renderSongs(); return; }
    const row = e.target.closest(".song-row");
    if (row) {
      const open = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", open);
      document.getElementById(row.getAttribute("aria-controls")).hidden = !open;
    }
  });
  return dialog;
}

// The open artist is kept in the address (#overview/Artist%20Name), so a reload
// or a shared link opens the same artist again.
const pageHash = () => location.hash.split("/")[0] || "#overview";

export function closeArtist() {
  if (dialog?.open) dialog.close();
}

// song: a playlist position to open and scroll to, for links to one song.
export function openArtist(name, { song = null } = {}) {
  const artist = artistByName(name);
  if (!artist) return;
  ensureDialog();
  history.replaceState(null, "", `${pageHash()}/${encodeURIComponent(name)}`);
  current = artist;
  sort = "playlist";

  const songs = artist.songs;
  const mb = artist.mb;
  const genres = artist.genres.slice(0, 6);
  const added = songs.map(s => s.addedAt).filter(Boolean).sort((a, b) => a - b);
  const totalMs = songs.reduce((t, s) => t + (s.durationMs || 0), 0);
  const listened = artistListening(listeningHistory, name);
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  dialog.innerHTML = `
    <div class="sheet-inner">
      <button class="sheet-close" type="button" data-close aria-label="Close">✕</button>
      <header class="sheet-head">
        ${artist.image
          ? `<img class="artist-photo" src="${esc(artist.image)}" alt="" width="640" height="640">`
          : `<div class="artist-photo blank-photo" aria-hidden="true">${esc(initials || "?")}</div>`}
        <div class="sheet-title">
          <h2 id="sheetName">${esc(name)}</h2>
          ${aboutLine(mb) ? `<p class="about">${esc(aboutLine(mb))}${mb?.disambiguation ? ` <span class="muted">(${esc(mb.disambiguation)})</span>` : ""}</p>` : ""}
          ${genres.length ? `<ul class="genres" aria-label="Genres, from ${esc(artist.genreSource)}">${genres.map(g => `<li>${esc(g)}</li>`).join("")}</ul>
          <p class="genre-source muted">Genres from ${esc(artist.genreSource)}</p>` : ""}
          <p class="sheet-links">
            ${artist.url ? `<a href="${esc(artist.url)}" target="_blank" rel="noopener">Open in Spotify</a>` : ""}
            ${mb?.url ? `<a href="${esc(mb.url)}" target="_blank" rel="noopener">MusicBrainz page</a>` : ""}
          </p>
        </div>
      </header>

      <dl class="sheet-numbers">
        <div><dt>Songs</dt><dd>${songs.length}</dd></div>
        <div><dt>Albums</dt><dd>${artist.albums.size}</dd></div>
        <div><dt>Songs' length</dt><dd>${totalMs ? fmtTotal(totalMs) : "–"}</dd></div>
        ${withHistory ? `<div><dt>Plays</dt><dd>${listened.plays.toLocaleString()}</dd></div>
        <div><dt>Hours listened</dt><dd>${listened.plays ? fmtHours(listened.hours) : "–"}</dd></div>
        <div><dt>First played</dt><dd>${historyDate(listened.first)}</dd></div>
        <div><dt>Last played</dt><dd>${historyDate(listened.last)}</dd></div>` : ""}
        <div><dt>First added</dt><dd>${added.length ? fmtDate(added[0]) : "–"}</dd></div>
        <div><dt>Last added</dt><dd>${added.length ? fmtDate(added[added.length - 1]) : "–"}</dd></div>
      </dl>

      <div class="sheet-songs-head">
        <h3>Songs on the playlist</h3>
        <div class="sort" role="group" aria-label="Sort songs">
          ${Object.entries(SORTS).map(([k, v]) => `<button type="button" data-sort="${k}">${v.label}</button>`).join("")}
        </div>
      </div>
      <ol class="sheet-songs" id="sheetSongs"></ol>
    </div>`;

  renderSongs();
  if (!dialog.open) {
    dialog.showModal();
    document.documentElement.classList.add("sheet-open");
    raisePlayer();
  }
  dialog.querySelector(".sheet-inner").scrollTop = 0;
  const row = song != null && dialog.querySelector(`.song-row[aria-controls="song-${song}"]`);
  if (row) {
    row.setAttribute("aria-expanded", "true");
    document.getElementById(`song-${song}`).hidden = false;
    row.scrollIntoView({ block: "center" });
    row.focus({ preventScroll: true });
  } else {
    dialog.querySelector(".sheet-close").focus();
  }
}

function renderSongs() {
  const list = [...current.songs].sort(SORTS[sort].fn);
  dialog.querySelectorAll("[data-sort]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sort === sort));
  const total = playlist.songs.length;

  dialog.querySelector("#sheetSongs").innerHTML = list.map(s => {
    const others = s.artists.filter(a => a !== current.name);
    const a = s.albumInfo;
    const detailId = `song-${s.n}`;
    const heard = withHistory && songListening(listeningHistory, s);
    return `
    <li>
      <button class="song-row" type="button" aria-expanded="false" aria-controls="${detailId}">
        <span class="song-title">${esc(s.title)}${s.explicit ? ' <abbr class="explicit" title="Explicit">E</abbr>' : ""}</span>
        <span class="song-album">${esc(s.album || (s.local ? "Local file" : ""))}</span>
        ${heard ? `<span class="song-plays${heard.plays ? "" : " never"}">${playsText(heard.plays)}</span>` : ""}
        <span class="song-len">${fmtLength(s.durationMs)}</span>
      </button>
      <div class="song-detail" id="${detailId}" hidden>
        ${a.image ? `<img class="cover" src="${esc(a.image)}" alt="Cover of ${esc(a.name)}" width="640" height="640" loading="lazy">` : ""}
        <dl>
          ${s.album ? `<div><dt>Album</dt><dd>${esc(s.album)}</dd></div>` : ""}
          ${a.type ? `<div><dt>Type</dt><dd>${ALBUM_TYPES[a.type] || esc(a.type)}</dd></div>` : ""}
          <div><dt>Released</dt><dd>${s.released ? esc(fmtRelease(s.released)) : "Unknown"}</dd></div>
          ${s.released?.source === "musicbrainz" && a.release_date ? `<div><dt>This album</dt><dd>${esc(fmtRelease(a))}</dd></div>` : ""}
          <div><dt>Length</dt><dd>${fmtLength(s.durationMs)}</dd></div>
          <div><dt>Explicit</dt><dd>${s.explicit == null ? "Unknown" : s.explicit ? "Yes" : "No"}</dd></div>
          <div><dt>Added</dt><dd>${s.addedAt ? `${fmtDate(s.addedAt)} at ${fmtTime(s.addedAt)}` : "Unknown"}</dd></div>
          <div><dt>Position</dt><dd>${s.n} of ${total}</dd></div>
          ${heard ? `<div><dt>Played</dt><dd>${heard.plays ? `${heard.plays.toLocaleString()} ${heard.plays === 1 ? "time" : "times"}, ${fmtHours(heard.hours)}` : "Never played"}</dd></div>` : ""}
          ${others.length ? `<div><dt>With</dt><dd>${others.map(o => `<button type="button" class="linkish" data-artist="${esc(o)}">${esc(o)}</button>`).join(", ")}</dd></div>` : ""}
          ${s.local ? `<div><dt>Source</dt><dd>${s.rip ? "YouTube rip" : "Local file"}, not on Spotify${s.correction ? `. Details from <a href="${esc(s.correction.url)}" target="_blank" rel="noopener">${esc(s.correction.name)}</a>` : ""}</dd></div>` : ""}
        </dl>
        ${s.url ? `<p class="song-links">${trackId(s) ? `<button type="button" class="song-play" data-play="${s.n}">▶ Play</button>` : ""}<a href="${esc(s.url)}" target="_blank" rel="noopener">Open in Spotify</a>${a.url ? ` <a href="${esc(a.url)}" target="_blank" rel="noopener">Album on Spotify</a>` : ""}</p>` : ""}
      </div>
    </li>`;
  }).join("");
}
