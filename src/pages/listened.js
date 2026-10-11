// Most listened: your top artists by hours, all time next to the last 12 months, from your
// streaming history. It covers everything you played, artists not on the playlist too, so
// the shared filter (which narrows playlist songs) doesn't apply. Hidden without a history.
import { openArtist } from "../artist-sheet.js";
import { listeningHistory } from "../data.js";
import { hasHistory, topArtists } from "../listening.js";
import { esc, fmtHours } from "../util.js";

const monthYear = ts => new Date(ts).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

function list(rows) {
  const max = rows[0]?.hours || 1;  // one scale per list: the top artist fills the track
  return rows.map((a, i) => {
    const inner = `
      <span class="ls-rank">${i + 1}</span>
      <span class="ls-name">${esc(a.name)}${a.onPlaylist ? "" : ` <span class="ls-off">not on the playlist</span>`}</span>
      <span class="ls-track"><span class="ls-fill" style="width:calc((100% - 4.5rem) * ${(a.hours / max).toFixed(4)})"></span><span class="ls-num">${fmtHours(a.hours)}</span></span>`;
    const label = `${a.name}: ${fmtHours(a.hours)}, ${a.plays.toLocaleString()} plays`;
    return `<li>${a.onPlaylist
      ? `<button type="button" class="ls-row" data-artist="${esc(a.name)}" aria-label="${esc(label)}">${inner}</button>`
      : `<div class="ls-row" aria-label="${esc(label)}" role="group">${inner}</div>`}</li>`;
  }).join("");
}

export function render(root, playlist) {
  const h = listeningHistory;
  if (!hasHistory(h)) return;
  const onPlaylist = name => playlist.artists.some(a => a.name === name);
  const allTime = topArtists(h, { onPlaylist });
  const recent = topArtists(h, { recent: true, onPlaylist });

  root.innerHTML = `
  <section class="listened" aria-labelledby="listenedTitle">
    <header class="listened-head">
      <h2 id="listenedTitle">Most listened</h2>
      <p class="muted">Hours played, from your Spotify streaming history (${monthYear(h.from)} to ${monthYear(h.to)}).
        Plays under 30 seconds count as skips. This is everything you played, so the filter doesn't apply here.</p>
    </header>
    <div class="listened-cols">
      <div>
        <h3>All time</h3>
        <ol class="ls-list">${list(allTime)}</ol>
      </div>
      ${recent.length ? `<div>
        <h3>Last 12 months <span class="muted">${monthYear(h.recent_from)} to ${monthYear(h.to)}</span></h3>
        <ol class="ls-list">${list(recent)}</ol>
      </div>` : ""}
    </div>
  </section>`;

  root.addEventListener("click", e => {
    const row = e.target.closest("[data-artist]");
    if (row) openArtist(row.dataset.artist);
  });
}
