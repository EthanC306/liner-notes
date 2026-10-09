// Artists: every artist on the playlist as a photo tile, with search, sorting and
// genre filters. A tile opens the artist popup.
import { openArtist } from "../artist-sheet.js";
import { GROUPS, NO_GENRE, FEATURES_ONLY, artistGroup, byCountOtherLast } from "../genres.js";
import { esc, fmtDate } from "../util.js";
import * as tierList from "./tiers.js";
import { filter } from "../filter.js";

const STORE_KEY = "playlist-stat:artists-view";

const lastAdded = a => Math.max(0, ...a.songs.map(s => s.addedAt || 0));
const firstAdded = a => Math.min(Infinity, ...a.songs.map(s => s.addedAt || Infinity));

const SORTS = {
  songs: { label: "Most songs", fn: (a, b) => b.count - a.count || a.name.localeCompare(b.name) },
  name: { label: "A to Z", fn: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) },
  recent: { label: "Recently added", fn: (a, b) => lastAdded(b) - lastAdded(a) || b.count - a.count },
  first: { label: "First added", fn: (a, b) => firstAdded(a) - firstAdded(b) || b.count - a.count },
};

const initials = name => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

export function render(root, playlist) {
  const { artists } = playlist;
  // Featured artists don't count toward a genre: an artist is in their genre's chip
  // only if they're the main artist on at least one song. Everyone else is "Features only".
  const mainArtists = new Set(playlist.songs.map(s => s.artists[0]).filter(Boolean));
  const tabGroup = a => (mainArtists.has(a.name) ? artistGroup(a) : FEATURES_ONLY);
  let view = { sort: "songs", q: "" };  // the genre filter is the shared one in filter.js
  let expanded = false;
  try { view.sort = JSON.parse(localStorage.getItem(STORE_KEY) || "{}").sort || view.sort; } catch { /* storage blocked */ }
  if (!SORTS[view.sort]) view.sort = "songs";

  const groups = [...GROUPS, NO_GENRE, FEATURES_ONLY]
    .map(g => ({ ...g, count: artists.filter(a => tabGroup(a).id === g.id).length }))
    .filter(g => g.count)
    .sort(byCountOtherLast);

  root.innerHTML = `
  <section class="artists-page">
    <header class="artists-head">
      <h1 tabindex="-1">Artists</h1>
      <p class="lede">All ${artists.length} artists on the playlist. Pick one to see their songs.</p>
    </header>

    <div class="artists-controls">
      <input id="artistSearch" class="search" type="search" placeholder="Find an artist" aria-label="Find an artist" autocomplete="off">
      <div class="sort" role="group" aria-label="Sort artists">
        ${Object.entries(SORTS).map(([k, v]) => `<button type="button" data-sort="${k}">${v.label}</button>`).join("")}
      </div>
    </div>
    <ul class="narrow-chips" aria-label="Filter by genre">
      ${groups.map(g => `<li><button type="button" class="narrow-chip removable" data-group="${g.id}">${esc(g.name)} <span class="chip-n">${g.count}</span></button></li>`).join("")}
    </ul>

    <p class="muted" id="artistCount" aria-live="polite"></p>
    <ul class="artist-grid" id="artistGrid"></ul>
    <p class="empty" id="artistEmpty" hidden></p>
    <button type="button" class="show-more" id="showMore" aria-controls="artistGrid" hidden></button>
  </section>
  <div id="tierListHere"></div>`;

  const $ = s => root.querySelector(s);

  function draw() {
    root.querySelectorAll("[data-sort]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sort === view.sort));
    // Only groups that have a chip here count. A saved pick for a group that's since
    // emptied (like "No genre found" once every artist has a genre) has no chip to
    // undo it with, so it's ignored, the same as on the Overview and Breakdown.
    const picked = new Set([...filter.groups()].filter(id => groups.some(g => g.id === id)));
    root.querySelectorAll("[data-group]").forEach(b => {
      b.setAttribute("aria-pressed", picked.has(b.dataset.group));
      b.title = picked.has(b.dataset.group) ? "Remove this filter" : "";
    });
    const q = view.q.toLowerCase();
    const list = artists
      .filter(a => (!picked.size || picked.has(tabGroup(a).id)) && (!q || a.name.toLowerCase().includes(q)))
      .sort(SORTS[view.sort].fn);

    const groupName = picked.size ? groups.filter(g => picked.has(g.id)).map(g => g.name).join(" or ") : null;
    $("#artistCount").textContent = list.length === artists.length
      ? `${artists.length} artists, ${SORTS[view.sort].label.toLowerCase()}.`
      : `${list.length} of ${artists.length} artists${groupName ? ` in ${groupName}` : ""}${view.q ? ` matching “${view.q}”` : ""}.`;

    // Collapsed, only one row shows: as many artists as the grid has columns right now.
    const columns = getComputedStyle($("#artistGrid")).gridTemplateColumns.split(" ").length || 1;
    const shown = expanded ? list : list.slice(0, columns);
    const more = $("#showMore");
    more.hidden = list.length <= columns;
    more.textContent = expanded ? "Show fewer" : `Show all ${list.length} artists`;
    more.setAttribute("aria-expanded", expanded);
    lastColumns = columns;

    $("#artistGrid").innerHTML = shown.map(a => {
      const added = view.sort === "recent" ? lastAdded(a) : view.sort === "first" ? firstAdded(a) : null;
      const detail = added && isFinite(added) && added > 0 ? `Added ${fmtDate(new Date(added))}` : (a.genres[0] || "");
      return `<li>
        <button type="button" class="artist-card" data-artist="${esc(a.name)}">
          ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy">` : `<span class="artist-initials" aria-hidden="true">${esc(initials(a.name))}</span>`}
          <span class="ac-name">${esc(a.name)}</span>
          <span class="ac-meta">${a.count} ${a.count === 1 ? "song" : "songs"}${detail ? `<br>${esc(detail)}` : ""}</span>
        </button>
      </li>`;
    }).join("");
    const empty = $("#artistEmpty");
    empty.hidden = list.length > 0;
    empty.textContent = `No artist matches “${view.q}”${groupName ? ` in ${groupName}` : ""}.`;

    try { localStorage.setItem(STORE_KEY, JSON.stringify({ sort: view.sort })); } catch { /* storage blocked */ }
  }

  let lastColumns = 0;
  $("#showMore").addEventListener("click", () => {
    expanded = !expanded;
    draw();
    if (!expanded) $(".artists-controls").scrollIntoView({ block: "nearest" });
  });
  // Resizing changes how many artists fit in the first row.
  const onResize = () => {
    if (!root.contains($("#artistGrid"))) return window.removeEventListener("resize", onResize);
    const columns = getComputedStyle($("#artistGrid")).gridTemplateColumns.split(" ").length;
    if (!expanded && columns !== lastColumns) draw();
  };
  window.addEventListener("resize", onResize);

  root.addEventListener("click", e => {
    if (e.target.closest("#tierListHere")) return;  // the tier list handles its own clicks
    const sort = e.target.closest("[data-sort]");
    if (sort) { view.sort = sort.dataset.sort; return draw(); }
    const group = e.target.closest("[data-group]");
    if (group) return filter.toggleGroup(group.dataset.group);  // the subscription below redraws
    const card = e.target.closest("[data-artist]");
    if (card) openArtist(card.dataset.artist);
  });
  $("#artistSearch").addEventListener("input", e => { view.q = e.target.value.trim(); draw(); });

  // Redraw when the shared filter changes, here or anywhere else; stop once this page is gone.
  const stop = filter.subscribe(() => {
    if (!root.contains($("#artistGrid"))) return stop();
    draw();
  });

  draw();
  tierList.render($("#tierListHere"), playlist);
}
