// Artists: every artist on the playlist as a photo tile, with search, sorting and
// genre filters. A tile opens the artist popup.
import { openArtist } from "../artist-sheet.js";
import { GROUPS, NO_GENRE, FEATURES_ONLY, byCountOtherLast } from "../genres.js";
import { filterSongs, stateFor, activeState, mainArtistsOf } from "../selection.js";
import { esc, fmtDate } from "../util.js";
import * as tierList from "./tiers.js";
import { filter } from "../filter.js";
import { decadeLabel } from "../decades.js";
import { monthLabel } from "../months.js";
import { swatch } from "../genre-colors.js";

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
  // The grid lists the main artists of the shared filter's songs; features don't count.
  // Artists who are never a main artist are the "Features only" view, which is this
  // tab's own toggle, not part of the shared filter.
  const mains = mainArtistsOf(playlist.songs);
  const featureOnly = artists.filter(a => !mains.has(a.name));
  let featuresView = false;
  // Main artists of the songs a filter state leaves, and feature-only artists on them.
  const mainsFor = st => mainArtistsOf(filterSongs(playlist.songs, st));
  const featuredFor = st => {
    const onSongs = new Set(filterSongs(playlist.songs, st).flatMap(s => s.artists.slice(1)));
    return featureOnly.filter(a => onSongs.has(a.name));
  };
  let view = { sort: "songs", q: "" };  // the genre filter is the shared one in filter.js
  let expanded = false;
  try { view.sort = JSON.parse(localStorage.getItem(STORE_KEY) || "{}").sort || view.sort; } catch { /* storage blocked */ }
  if (!SORTS[view.sort]) view.sort = "songs";

  // Genre chips in a fixed order (by how many main artists each has overall); their
  // counts are redrawn from the shared filter.
  const groups = [...GROUPS, NO_GENRE]
    .map(g => ({ ...g, count: mainsFor(stateFor({}, "groups", g.id)).size }))
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
      ${groups.map(g => `<li><button type="button" class="narrow-chip removable" data-group="${g.id}">${swatch(g.id)}${esc(g.name)} <span class="chip-n"></span></button></li>`).join("")}
      <li class="decade-chips" id="decadeChips"></li>
      ${featureOnly.length ? `<li><button type="button" class="narrow-chip removable view-chip" id="featuresView">${esc(FEATURES_ONLY.name)} <span class="chip-n"></span></button></li>` : ""}
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
    // The shared filter, minus picks no song has (see activeState). Genre picks that have
    // no chip here count too: every chip is redrawn below.
    const state = activeState(playlist.songs, filter.state());
    const picked = new Set(state.groups);
    const pickedDecades = [...state.decades].sort();
    const pickedMonths = [...state.months].sort();
    // Each chip's count: main artists of the shared filter run for that chip's pick.
    const chipCount = (type, value) => mainsFor(stateFor(state, type, value)).size;
    root.querySelectorAll("[data-group]").forEach(b => {
      b.setAttribute("aria-pressed", picked.has(b.dataset.group));
      b.title = picked.has(b.dataset.group) ? "Remove this filter" : "";
      b.querySelector(".chip-n").textContent = chipCount("groups", b.dataset.group);
    });
    // Decades and months are picked on the Breakdown tab; here they show as chips you can remove.
    $("#decadeChips").innerHTML = [
      ...pickedDecades.map(d =>
        `<button type="button" class="narrow-chip removable" data-decade="${d}" aria-pressed="true" title="Remove this filter">${decadeLabel(d)} <span class="chip-n">${chipCount("decades", d)}</span></button>`),
      ...pickedMonths.map(m =>
        `<button type="button" class="narrow-chip removable" data-month="${m}" aria-pressed="true" title="Remove this filter">${monthLabel(m, "short")} <span class="chip-n">${chipCount("months", m)}</span></button>`),
    ].join("");
    $("#decadeChips").hidden = !pickedDecades.length && !pickedMonths.length;
    const featured = featuredFor(state);
    const fv = $("#featuresView");
    if (fv) {
      fv.setAttribute("aria-pressed", featuresView);
      fv.title = featuresView ? "Back to main artists" : "";
      fv.querySelector(".chip-n").textContent = featured.length;
    }
    const q = view.q.toLowerCase();
    const shownArtists = featuresView ? featured : artists.filter(a => mainsFor(state).has(a.name));
    const list = shownArtists
      .filter(a => !q || a.name.toLowerCase().includes(q))
      .sort(SORTS[view.sort].fn);

    const groupName = picked.size ? groups.filter(g => picked.has(g.id)).map(g => g.name).join(" or ") : null;
    const filtering = picked.size || pickedDecades.length || pickedMonths.length || view.q;
    $("#artistCount").textContent = featuresView
      ? `${list.length} ${list.length === 1 ? "artist" : "artists"} who only appear as features${filtering ? ", on the filtered songs" : ""}.`
      : !filtering
      ? `${list.length} main artists, ${SORTS[view.sort].label.toLowerCase()}. ${featureOnly.length} more only appear as features.`
      : `${list.length} of ${mains.size} main artists${groupName ? ` in ${groupName}` : ""}${pickedDecades.length ? ` with songs from the ${pickedDecades.map(decadeLabel).join(" or ")}` : ""}${pickedMonths.length ? `${pickedDecades.length ? "," : ""} with songs added in ${pickedMonths.map(m => monthLabel(m, "short")).join(" or ")}` : ""}${view.q ? ` matching “${view.q}”` : ""}.`;

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
    if (e.target.closest("#featuresView")) { featuresView = !featuresView; return draw(); }
    const group = e.target.closest("[data-group]");
    if (group) return filter.toggleGroup(group.dataset.group);  // the subscription below redraws
    const decade = e.target.closest("[data-decade]");
    if (decade) return filter.toggleDecade(Number(decade.dataset.decade));
    const month = e.target.closest("[data-month]");
    if (month) return filter.toggleMonth(month.dataset.month);
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
