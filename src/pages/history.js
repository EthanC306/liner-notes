// History: your Spotify listening history (listening_history.json). Only reachable when a
// summary is loaded; main.js hides the tab otherwise.
import { listeningHistory } from "../data.js";
import { hasHistory, rangeOptions, validRange, thenVsNow, ghosts } from "../history.js";
import { openArtist } from "../artist-sheet.js";
import { esc } from "../util.js";

const STORE_KEY = "playlist-stat:history-range";

export function render(root, playlist, summary = listeningHistory) {
  if (!hasHistory(summary)) {
    root.replaceChildren();
    return;
  }
  let range = "all";
  try { range = localStorage.getItem(STORE_KEY) || "all"; } catch { /* storage blocked */ }
  range = validRange(summary, range);
  const comparison = thenVsNow(summary, playlist);
  const list = (rows, label) => `<ol class="history-ranking" aria-label="${label}">${rows.map(a => `<li data-history-artist="${esc(a.name)}">
    <div class="history-rank-row">
      <span class="history-rank">${String(a.rank).padStart(2, "0")}</span>
      <div class="history-rank-detail">
        <div class="history-row-top">
          ${a.onPlaylist ? `<button type="button" data-artist="${esc(a.name)}" title="${esc(a.name)}">${esc(a.name)}</button>` : `<span class="history-artist" title="${esc(a.name)}">${esc(a.name)}</span>`}
          <span class="history-hours">${a.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> hr</small></span>
        </div>
        <span class="history-bar" aria-hidden="true"><span style="width:${a.width}%"></span></span>
        <div class="history-row-meta"><span>${a.plays.toLocaleString()} plays</span>${a.onPlaylist ? "" : '<span class="history-tag">not on playlist</span>'}</div>
      </div>
    </div>
  </li>`).join("")}</ol>`;

  root.innerHTML = `
  <section class="history-page">
    <header class="history-head">
      <h1 tabindex="-1">History</h1>
      <p class="lede">Your Spotify listening history, in ${esc(summary.timezone || "UTC")} time.</p>
    </header>
    <div class="sort range-switch" role="group" aria-label="Time range">
      ${rangeOptions(summary).map(o => `<button type="button" data-range="${esc(o.id)}">${esc(o.label)}</button>`).join("")}
    </div>
    <section class="history-ghosts" aria-labelledby="ghosts-heading"></section>
    <section class="history-comparison" aria-labelledby="then-now-heading">
      <header class="history-comparison-title"><h2 id="then-now-heading">Then vs now</h2><span>YOUR TOP 10 · BY HOURS</span></header>
      <p class="muted">The long-time favorites. The current rotation.</p>
      <div class="history-compare-scroll">
        <div class="history-compare-head"><h3>All time<span>The full history</span></h3><h3>Last 12 months<span>Of your listening history</span></h3></div>
        <div class="history-compare-lists">
          ${list(comparison.all, "All time")}
          <svg class="history-connections" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden="true">
            ${comparison.connections.map(c => {
              const from = (c.from - .5) * 100, to = (c.to - .5) * 100;
              return `<g data-history-artist="${esc(c.name)}"><path d="M 5 ${from} C 45 ${from}, 55 ${to}, 95 ${to}" /><circle cx="5" cy="${from}" r="2" /><circle cx="95" cy="${to}" r="2" /></g>`;
            }).join("")}
          </svg>
          ${comparison.recent.length ? list(comparison.recent, "Last 12 months") : '<p class="muted">No listening time in the last 12 months.</p>'}
        </div>
      </div>
      <p class="history-compare-note">Lines follow artists in both lists. Each list has its own bar scale. This comparison stays the same when you change the time range.</p>
    </section>
  </section>`;

  function draw() {
    root.querySelectorAll("[data-range]").forEach(b => b.setAttribute("aria-pressed", b.dataset.range === range));
    const result = ghosts(summary, playlist, range);
    const date = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Unknown";
    root.querySelector(".history-ghosts").innerHTML = `
      <header class="history-comparison-title"><h2 id="ghosts-heading">Ghosts</h2><span>10+ HOURS · 0–1 PLAYLIST SONGS</span></header>
      <p class="ghost-headline">${esc(result.headline)}</p>
      <ol class="ghost-list">${result.rows.map(a => `<li>
        <div class="ghost-main">
          <div>${a.songCount ? `<button type="button" data-artist="${esc(a.name)}">${esc(a.name)}</button>` : `<strong>${esc(a.name)}</strong>`}<span class="ghost-playlist">${a.songCount} ${a.songCount === 1 ? "song" : "songs"} on playlist</span></div>
          <span class="ghost-hours">${a.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> hr</small></span>
        </div>
        <p class="ghost-meta">${a.plays.toLocaleString()} plays <span>·</span> Peak year ${esc(a.peak_year)} <span>·</span> Last played ${esc(date(a.last))}</p>
        <ol class="ghost-songs" aria-label="Most played songs by ${esc(a.name)}">${(a.top_songs || []).map(s => `<li><span>${esc(s.title)}</span><span>${s.plays.toLocaleString()} plays</span></li>`).join("")}</ol>
      </li>`).join("")}</ol>`;
  }

  root.addEventListener("click", e => {
    const artist = e.target.closest("[data-artist]");
    if (artist) return openArtist(artist.dataset.artist);
    const b = e.target.closest("[data-range]");
    if (!b) return;
    range = b.dataset.range;
    try { localStorage.setItem(STORE_KEY, range); } catch { /* storage blocked */ }
    draw();
  });

  draw();

  // Follow a connection without making the full web of lines visually dominant.
  function highlight(target) {
    const name = target?.closest("[data-history-artist]")?.dataset.historyArtist;
    root.querySelectorAll("[data-history-artist]").forEach(node => {
      node.classList.toggle("history-highlight", Boolean(name) && node.dataset.historyArtist === name);
    });
  }
  root.addEventListener("pointerover", e => highlight(e.target));
  root.addEventListener("pointerleave", () => highlight(null));
  root.addEventListener("focusin", e => highlight(e.target));
  root.addEventListener("focusout", e => highlight(e.relatedTarget));
}
