// History: your Spotify listening history (listening_history.json). Only reachable when a
// summary is loaded; main.js hides the tab otherwise.
import { listeningHistory, oldPlaylistArtists } from "../data.js";
import { hasHistory, rangeOptions, validRange, thenVsNow, ghosts, eras } from "../history.js";
import { openArtist } from "../artist-sheet.js";
import { esc, initials } from "../util.js";

const STORE_KEY = "playlist-stat:history-range";

export function render(root, playlist, summary = listeningHistory, oldArtists = oldPlaylistArtists) {
  if (!hasHistory(summary)) {
    root.replaceChildren();
    return;
  }
  let range = "all";
  try { range = localStorage.getItem(STORE_KEY) || "all"; } catch { /* storage blocked */ }
  range = validRange(summary, range);
  const comparison = thenVsNow(summary, playlist);
  const timeline = eras(summary);
  const hours = value => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
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
    <section class="history-eras" aria-labelledby="eras-heading" ${timeline.years.length ? "" : "hidden"}>
      <header class="history-comparison-title"><h2 id="eras-heading">Eras</h2><span>YOUR HISTORY · YEAR BY YEAR</span></header>
      <p class="muted">Who defined each year? Select a bar to revisit it.</p>
      <ul class="eras-legend" aria-label="Artist colors">${timeline.legend.map(a => `<li><span class="${a.color === "var(--genre-rest)" ? "eras-segment-rest" : ""}" style="background:${a.color}" aria-hidden="true"></span>${esc(a.name)}</li>`).join("")}</ul>
      <div class="eras-scroll"><div class="eras-chart">
        ${timeline.years.map(y => `<button type="button" class="eras-year" data-range="${esc(y.year)}" aria-label="${esc(y.year)}: ${hours(y.hours)} total hours${y.leader ? `; number one ${esc(y.leader.name)}, ${hours(y.leader.hours)} hours` : ""}. Select this year.">
          <span class="eras-plot"><span class="eras-column" style="height:${y.height}%">
            <span class="eras-total">${hours(y.hours)}<small> hr</small></span>
            ${y.segments.map(a => `<span class="eras-segment${a.color === "var(--genre-rest)" ? " eras-segment-rest" : ""}" style="height:${a.percent}%;background:${a.color}" title="${esc(a.name)}: ${hours(a.hours)} hours"></span>`).join("")}
          </span></span>
          <span class="eras-year-label">${esc(y.year)}</span>
          <span class="eras-leader">${y.leader ? esc(y.leader.name) : "No listening"}</span>
          <span class="eras-leader-hours">${y.leader ? `${hours(y.leader.hours)} hr` : "—"}</span>
        </button>`).join("")}
      </div></div>
    </section>
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

  const GHOSTS_SHOWN = 6;
  let ghostsExpanded = false;
  const date = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Unknown";
  const plural = (n, word) => `${n.toLocaleString()} ${n === 1 ? word : `${word}s`}`;
  // The one playlist song opens the artist popup; the name itself goes to Spotify.
  const ghost = a => `<li class="ghost-card${a.rank === 1 ? " ghost-featured" : ""}">
    <span class="ghost-photo">${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy">` : `<span class="artist-initials" aria-hidden="true">${esc(initials(a.name))}</span>`}</span>
    <div class="ghost-body">
      <div class="ghost-main">
        <span class="ghost-rank" aria-hidden="true">${String(a.rank).padStart(2, "0")}</span>
        <div class="ghost-name">
          <a href="${esc(a.url)}" target="_blank" rel="noopener" title="Open ${esc(a.name)} in Spotify">${esc(a.name)}</a>
          ${a.songCount ? `<button type="button" class="history-tag ghost-tag" data-artist="${esc(a.name)}" title="See it on the playlist">${plural(a.songCount, "song")} on playlist</button>` : `<span class="history-tag ghost-tag">0 songs on playlist</span>`}
        </div>
        <span class="ghost-hours">${hours(a.hours)}<small> hr</small></span>
      </div>
      <span class="history-bar ghost-bar" aria-hidden="true"><span style="width:${a.width}%"></span></span>
      <p class="ghost-meta"><span>${plural(a.plays, "play")}</span> <span aria-hidden="true">·</span> <span>Peak year ${esc(a.peak_year ?? "unknown")}</span> <span aria-hidden="true">·</span> <span>Last played ${esc(date(a.last))}</span></p>
      ${a.top_songs.length ? `<ol class="ghost-songs" aria-label="Most played songs by ${esc(a.name)}">${a.top_songs.map(s => `<li>
        <span class="ghost-song-title" title="${esc(s.title)}">${esc(s.title)}</span>
        <span class="ghost-song-bar" aria-hidden="true"><span style="width:${s.width}%"></span></span>
        <span class="ghost-song-plays">${plural(s.plays, "play")}</span>
      </li>`).join("")}</ol>` : ""}
    </div>
  </li>`;

  function draw() {
    root.querySelectorAll("[data-range]").forEach(b => b.setAttribute("aria-pressed", b.dataset.range === range));
    const result = ghosts(summary, playlist, range, oldArtists);
    const label = rangeOptions(summary).find(o => o.id === range)?.label || range;
    const shown = ghostsExpanded ? result.rows : result.rows.slice(0, GHOSTS_SHOWN);
    root.querySelector(".history-ghosts").innerHTML = `
      <header class="history-comparison-title"><h2 id="ghosts-heading">Ghosts</h2><span>10+ HOURS · 0–1 PLAYLIST SONGS</span></header>
      ${result.rows.length ? `
        <p class="ghost-headline">${esc(result.headline)}</p>
        <ol class="ghost-list">${shown.map(ghost).join("")}${result.rows.length > GHOSTS_SHOWN ? `<li class="ghost-more${shown.length % 2 ? " ghost-more-wide" : ""}">
          <button type="button" class="show-more" data-ghosts-more aria-expanded="${ghostsExpanded}">${ghostsExpanded ? "Show fewer" : `Show all ${result.rows.length} ghosts`}</button>
        </li>` : ""}</ol>` : `
        <div class="ghost-empty">
          <p class="ghost-headline">No ghosts in ${range === "all" ? "your history" : esc(label === "Last 12 months" ? "the last 12 months" : label)}.</p>
          <p class="muted">A ghost is an artist with 10 or more hours of listening and at most one song on the playlist. Nobody fits that here.</p>
          ${range === "all" ? "" : `<button type="button" class="show-more ghost-empty-all" data-range="all">See all time</button>`}
        </div>`}`;
  }

  root.addEventListener("click", e => {
    const artist = e.target.closest("[data-artist]");
    if (artist) return openArtist(artist.dataset.artist);
    if (e.target.closest("[data-ghosts-more]")) {
      ghostsExpanded = !ghostsExpanded;
      draw();
      root.querySelector("[data-ghosts-more]")?.focus();
      return;
    }
    const b = e.target.closest("[data-range]");
    if (!b) return;
    range = b.dataset.range;
    try { localStorage.setItem(STORE_KEY, range); } catch { /* storage blocked */ }
    draw();
    // The empty state's button disappears on redraw; keep focus on the switch it changed.
    if (!b.isConnected) root.querySelector(`.range-switch [data-range="${range}"]`)?.focus();
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
