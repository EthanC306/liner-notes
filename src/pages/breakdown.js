// Breakdown: every song sorted into one broad genre group, as bars you can click
// to filter, then a decades chart, a timeline of when songs were added, then specific
// genres to narrow it down further.
// Genres and decades are the shared filter, so picks here carry to the other tabs.
import { GROUPS, NO_GENRE, byCountOtherLast, searchGenres } from "../genres.js";
import { openArtist } from "../artist-sheet.js";
import { playOrOpen } from "../player.js";
import { esc, fmtDate } from "../util.js";
import { listeningHistory } from "../data.js";
import { hasHistory, songListening, playsText, bySongPlays, deadWeight, hasDeadWeight, NEW_SONG_DAYS } from "../listening.js";
import { filter } from "../filter.js";
import { filterSongs, countFor, stateFor, activeState, emptyState } from "../selection.js";
import { decadeLabel } from "../decades.js";
import { monthLabel } from "../months.js";
import { TOP_GENRES, genreColor, genreRank, isTopGenre, swatch } from "../genre-colors.js";

// The song list's order and the Dead weight threshold; kept across visits to the tab.
let songSort = "playlist";
let deadThreshold = null;  // until picked: the strictest threshold that has songs

export function render(root, { songs }, history = listeningHistory) {
  const withHistory = hasHistory(history);
  // Each song with its genre group (from its main artist, set in build.js), decade, month,
  // and every specific genre of every artist on it.
  const groupById = new Map([...GROUPS, NO_GENRE].map(g => [g.id, g]));
  const rows = songs.map(s => ({
    song: s,
    group: groupById.get(s.groupId),
    decade: s.decade,
    month: s.month,
    genres: s.genres,
  }));
  const rowOf = new Map(rows.map(r => [r.song, r]));
  // The genre chart lists every group with songs, biggest first; the order stays put
  // while counts change with the other filters.
  const groups = [...GROUPS, NO_GENRE]
    .map(g => ({ ...g, count: songs.filter(s => s.groupId === g.id).length }))
    .filter(g => g.count)
    .sort(byCountOtherLast);

  // Everything here comes from the shared filter (selection.js): the filtered songs, and
  // each chip and bar's count from running that filter for its selection.
  let state = emptyState();
  let picked = new Set();
  const readFilter = () => {
    state = activeState(songs, filter.state());
    picked = new Set(state.groups);
  };
  const rowsFor = st => filterSongs(songs, st).map(s => rowOf.get(s));
  const narrowed = new Set(); // specific genres
  const POPULAR_GENRES = 8;
  let specificCounts = new Map();  // specific genre -> songs, among the shared filter's songs
  let genreQuery = "";

  // Every decade from the earliest song to the latest, empty ones included, so the
  // chart reads as a timeline.
  const years = rows.map(r => r.decade).filter(d => d != null);
  const decades = [];
  for (let d = Math.min(...years); d <= Math.max(...years); d += 10) decades.push(d);
  let pickedDecades = new Set();

  // Every month from the first song added to the last, empty ones included so gaps show.
  // The axis covers all songs, so it stays put while the filters change the bar heights.
  const addedMonths = rows.map(r => r.month).filter(Boolean).sort();
  const months = [];
  if (addedMonths.length) {
    let [y, m] = addedMonths[0].split("-").map(Number);
    const last = addedMonths[addedMonths.length - 1];
    for (;;) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      months.push(key);
      if (key === last) break;
      if (++m > 12) { m = 1; y++; }
    }
  }
  const monthName = monthLabel;
  let pickedMonths = new Set();  // from the shared filter
  const readMonths = () => { pickedMonths = new Set(state.months); };
  const readDecades = () => { pickedDecades = new Set(state.decades); };

  root.innerHTML = `
  <section class="breakdown">
    <header class="breakdown-head">
      <h1 tabindex="-1">Breakdown</h1>
      <p class="lede">Every song is sorted into one genre group by its main artist’s top genre: from your genre file if you set one, otherwise from MusicBrainz or Last.fm. Pick groups to see their songs.</p>
    </header>

    <section class="genre-section" aria-labelledby="genreH">
      <div class="genre-head">
        <h2 id="genreH">Genres</h2>
        <button type="button" class="ghost-btn" id="clearGenres" hidden>Clear filters</button>
      </div>
      <ul class="genre-bars" id="genreBars"></ul>
    </section>

    <div class="time-charts">
    <ul class="legend time-legend" aria-label="Genre colors for the two charts below">
      ${TOP_GENRES.map(g => `<li>${swatch(g.id)}${esc(g.name)}</li>`).join("")}
      <li>${swatch("rest")}Other genres</li>
    </ul>

    <section class="decade-section" aria-labelledby="decadeH">
      <div class="genre-head">
        <h2 id="decadeH">When the music is from</h2>
        <p class="muted" id="decadeNote"></p>
      </div>
      <div class="month-chart" id="decadeChart">
        <ul class="decade-bars" id="decadeBars"></ul>
        <div class="chart-tip" id="decadeTip" hidden></div>
      </div>
      <div class="decade-detail" id="decadeDetail" hidden></div>
    </section>

    <section class="decade-section" aria-labelledby="addedH">
      <div class="genre-head">
        <h2 id="addedH">When you added it</h2>
        <p class="muted" id="addedNote"></p>
      </div>
      <div class="month-chart" id="monthChart">
        <div class="month-scroll" id="monthScroll">
          <div class="month-plot" id="monthPlot">
            <div class="year-bands" id="yearBands" aria-hidden="true"></div>
            <ul class="decade-bars month-bars" id="monthBars"></ul>
          </div>
        </div>
        <div class="chart-tip" id="monthTip" hidden></div>
      </div>
      <div class="decade-detail" id="monthDetail" hidden></div>
    </section>
    </div>

    <section class="genre-section" aria-label="Songs">

      <div class="narrow" id="narrow">
        <h3>Narrow down</h3>
        <div class="genre-search">
          <input id="genreQ" class="search" type="search" aria-label="Search genres" autocomplete="off" aria-controls="genreSuggest" aria-autocomplete="list">
          <ul class="seed-suggest" id="genreSuggest" aria-label="Matching genres" hidden></ul>
        </div>
        <ul class="narrow-chips" id="narrowPicked" aria-label="Picked genres"></ul>
        <div class="narrow-popular">
          <span class="muted">Popular</span>
          <ul class="narrow-chips" id="narrowChips" aria-label="Popular genres"></ul>
        </div>
      </div>

      <div class="genre-results">
        <div class="genre-results-head">
          <p class="muted" id="genreSummary" aria-live="polite"></p>
          ${withHistory ? `<div class="sort" role="group" aria-label="Sort songs">
            <button type="button" data-song-sort="playlist">Playlist order</button><button type="button" data-song-sort="plays">Most played</button>
          </div>` : ""}
        </div>
        <ol class="genre-songs" id="genreSongs"></ol>
      </div>
    </section>

    ${hasDeadWeight(history) ? `<section class="genre-section dead-weight" id="deadWeight" aria-labelledby="deadH">
      <div class="genre-head">
        <h2 id="deadH">Dead weight</h2>
        <div class="sort" role="group" aria-label="How rarely played" id="deadSwitch"></div>
      </div>
      <p class="muted" id="deadNote"></p>
      <div id="deadList"></div>
      <div class="dead-cant" id="deadCant"></div>
    </section>` : ""}
  </section>`;

  const $ = s => root.querySelector(s);

  function matching() {
    return rowsFor(state).filter(r => !narrowed.size || r.genres.some(g => narrowed.has(g)));
  }

  function draw() {
    readFilter();
    readDecades();
    readMonths();
    drawDecades();
    drawMonths();
    drawDeadWeight();
    const any = picked.size > 0;
    // Each bar: the shared filter run with just this genre (so picking genres never
    // shrinks this chart, but decade and month picks do).
    const genreCounts = new Map(groups.map(g => [g.id, countFor(songs, state, "groups", g.id)]));
    const max = Math.max(1, ...genreCounts.values());
    const base = filterSongs(songs, { ...state, groups: [] }).length || 1;
    $("#genreBars").innerHTML = groups.map(g => {
      const n = genreCounts.get(g.id);
      const pct = Math.round((n / base) * 100);
      return `<li>
        <button type="button" class="genre-bar${g.id === "none" ? " is-none" : ""}" data-group="${g.id}"
          aria-pressed="${picked.has(g.id)}"${any && !picked.has(g.id) ? ' data-dim=""' : ""}>
          <span class="gb-name">${esc(g.name)}</span>
          <span class="gb-track"><span class="gb-fill" style="width:${(n / max) * 100}%; background:${genreColor(g.id)}"></span></span>
          <span class="gb-num">${n} <span class="muted">(${pct}%)</span></span>
        </button>
      </li>`;
    }).join("");

    // Specific genres among the shared filter's songs, most common first.
    const pool = rowsFor(state);
    const counts = new Map();
    pool.forEach(r => r.genres.forEach(g => counts.set(g, (counts.get(g) || 0) + 1)));
    // Every specific genre is searchable; a few of the most common sit under the search.
    specificCounts = counts;
    for (const g of [...narrowed]) if (!counts.has(g)) narrowed.delete(g);
    const popular = [...counts].filter(([g]) => !narrowed.has(g))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, POPULAR_GENRES);
    $("#narrowPicked").innerHTML = [...narrowed].map(g =>
      `<li><button type="button" class="narrow-chip removable" data-genre="${esc(g)}" aria-pressed="true" title="Remove this genre">${esc(g)} <span class="chip-n">${counts.get(g)}</span></button></li>`).join("");
    $("#narrowPicked").hidden = !narrowed.size;
    $("#narrowChips").innerHTML = popular.map(([g, n]) =>
      `<li><button type="button" class="narrow-chip" data-genre="${esc(g)}" aria-pressed="false">${esc(g)} <span>${n}</span></button></li>`).join("");
    $("#genreQ").placeholder = `Search all ${counts.size} ${counts.size === 1 ? "genre" : "genres"}`;
    drawGenreSuggestions();
    $("#narrow").hidden = counts.size === 0;

    const list = matching();
    if (withHistory && songSort === "plays") { const by = bySongPlays(history); list.sort((a, b) => by(a.song, b.song)); }
    root.querySelectorAll("[data-song-sort]").forEach(b => b.setAttribute("aria-pressed", b.dataset.songSort === songSort));
    $("#clearGenres").hidden = !picked.size && !narrowed.size && !pickedDecades.size && !pickedMonths.size;
    const monthNames = [...pickedMonths].sort().map(m => monthName(m, "short"));
    const names = [...picked].map(id => groups.find(g => g.id === id).name);
    const decadeNames = [...pickedDecades].sort().map(decadeLabel);
    $("#genreSummary").textContent = !picked.size && !narrowed.size && !pickedDecades.size && !pickedMonths.size
      ? `All ${songs.length} songs. Pick a genre, decade or month above to filter.`
      : `${list.length} of ${songs.length} songs${names.length ? ` in ${names.join(" or ")}` : ""}${decadeNames.length ? ` from the ${decadeNames.join(" or ")}` : ""}${monthNames.length ? `, added in ${monthNames.join(" or ")}` : ""}${narrowed.size ? `, tagged ${[...narrowed].join(" or ")}` : ""}.`;
    $("#genreSongs").innerHTML = list.map(({ song: s, group, genres }) => `
      <li>
        <span class="num">${s.n}</span>
        <span class="gs-main">
          ${s.artists.length ? `<button type="button" class="linkish gs-title" data-song="${s.n}" data-song-artist="${esc(s.artists[0])}">${esc(s.title)}</button>` : `<span class="gs-title">${esc(s.title)}</span>`}
          <span class="gs-by">${s.artists.map(a => `<button type="button" class="linkish" data-artist="${esc(a)}">${esc(a)}</button>`).join(", ") || "Unknown artist"}</span>
        </span>
        <span class="gs-genres">${genres.slice(0, 3).map(esc).join(", ") || group.name}</span>
        ${withHistory ? (n => `<span class="plays${n ? "" : " never"}">${playsText(n)}</span>`)(songListening(history, s).plays) : ""}
      </li>`).join("");
  }

  // ---------- genre search ----------
  function drawGenreSuggestions() {
    const matches = searchGenres(specificCounts, genreQuery, narrowed);
    const list = $("#genreSuggest");
    list.hidden = !matches.length;
    list.innerHTML = matches.map(([g, n]) => `<li><button type="button" data-genre="${esc(g)}" data-from-search>${esc(g)} <span class="muted">${n}</span></button></li>`).join("");
    $("#genreQ").setAttribute("aria-expanded", matches.length > 0);
  }
  const genreQ = $("#genreQ");
  genreQ.addEventListener("input", () => { genreQuery = genreQ.value; drawGenreSuggestions(); });
  // Enter picks the top match; arrows move through the matches; Escape clears.
  genreQ.addEventListener("keydown", e => {
    if (e.key === "Enter") { const first = $("#genreSuggest button"); if (first) { e.preventDefault(); first.click(); } }
    if (e.key === "ArrowDown") { const first = $("#genreSuggest button"); if (first) { e.preventDefault(); first.focus(); } }
    if (e.key === "Escape") { genreQuery = genreQ.value = ""; drawGenreSuggestions(); }
  });
  // The matches close when focus leaves the search, and come back when it returns.
  $(".genre-search").addEventListener("focusout", e => {
    if (!e.currentTarget.contains(e.relatedTarget)) $("#genreSuggest").hidden = true;
  });
  genreQ.addEventListener("focus", drawGenreSuggestions);
  $("#genreSuggest").addEventListener("keydown", e => {
    const items = [...root.querySelectorAll("#genreSuggest button")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? items[i - 1] : genreQ).focus(); }
    if (e.key === "Escape") { genreQuery = genreQ.value = ""; drawGenreSuggestions(); genreQ.focus(); }
  });

  // ---------- dead weight ----------
  // From the shared filter's songs (genre, decade and added month); the narrow-down chips
  // above only refine the song list.
  const historyDay = day => day ? fmtDate(new Date(`${day}T12:00:00`)) : null;
  const byLine = s => s.artists.map(a => `<button type="button" class="linkish" data-artist="${esc(a)}">${esc(a)}</button>`).join(", ") || "Unknown artist";
  const titleOf = s => s.artists.length ? `<button type="button" class="linkish gs-title" data-song="${s.n}" data-song-artist="${esc(s.artists[0])}">${esc(s.title)}</button>` : `<span class="gs-title">${esc(s.title)}</span>`;
  function drawDeadWeight() {
    const section = $("#deadWeight");
    if (!section) return;
    const pool = filterSongs(songs, state);
    const counts = deadWeight(history, pool).thresholds;
    const pick = deadThreshold || (counts.find(t => t.count) || counts[0]).id;
    const dw = deadWeight(history, pool, pick);
    const shown = dw.thresholds.find(t => t.id === pick);
    section.hidden = !dw.thresholds.at(-1).count && !dw.cantTell.length && !dw.newCount;
    $("#deadSwitch").innerHTML = dw.thresholds.map(t =>
      `<button type="button" data-dead="${t.id}" aria-pressed="${t.id === shown.id}">${esc(t.label)} <span class="dead-count">${t.count}</span></button>`).join("");
    $("#deadNote").textContent = `Songs on the playlist you rarely play. Plays count only since each song was added, and songs added in the last ${NEW_SONG_DAYS} days of your history (after ${fmtDate(dw.cutoff)}) are left out${dw.newCount ? `: ${dw.newCount} ${dw.newCount === 1 ? "song" : "songs"}` : ""}.`;
    const label = shown.label.toLowerCase();
    $("#deadList").innerHTML = dw.rows.length ? `
      <table class="dead-table">
        <thead><tr><th scope="col">Song</th><th scope="col">Plays since added</th><th scope="col">Added</th><th scope="col">Last played</th></tr></thead>
        <tbody>${dw.rows.map(({ song: s, plays, everPlayed, last }) => `<tr>
          <td><span class="gs-main">${titleOf(s)}<span class="gs-by">${byLine(s)}</span></span></td>
          <td data-label="Plays since added" class="${plays ? "" : "never"}">${plays ? playsText(plays) : everPlayed ? "none since added" : "never played"}</td>
          <td data-label="Added">${s.addedAt ? fmtDate(s.addedAt) : "Unknown"}</td>
          <td data-label="Last played" class="${last ? "" : "never"}">${historyDay(last) || "never played"}</td>
        </tr>`).join("")}</tbody>
      </table>` : `<p class="muted">No songs ${label === "never played" ? "you've never played" : label.replace("under", "with under")} since they were added. Nice.</p>`;
    $("#deadCant").innerHTML = dw.cantTell.length ? `
      <h3>Can't tell <span class="muted">${dw.cantTell.length}</span></h3>
      <p class="muted">No Spotify ID (local files and YouTube rips), so their plays can't be matched to your history.</p>
      <ul class="dead-cant-list">${dw.cantTell.map(s => `<li><span class="gs-main">${titleOf(s)}<span class="gs-by">${byLine(s)}</span></span><span class="muted">Added ${s.addedAt ? fmtDate(s.addedAt) : "unknown"}</span></li>`).join("")}</ul>` : "";
  }

  // ---------- decades ----------
  function drawDecades() {
    // Bar heights count the songs the genre and month picks leave, so picking Metal
    // shows Metal's decades, and picking a month shows which decades it added.
    // Each bar is the shared filter run for that decade; its stack splits those songs by genre.
    const pool = rowsFor({ ...state, decades: [] });
    const perDecade = new Map(decades.map(d => [d, rowsFor(stateFor(state, "decades", d))]));
    const counts = new Map(decades.map(d => [d, perDecade.get(d).length]));
    const byGenre = new Map(decades.map(d => [d, tallyGenres(perDecade.get(d))]));
    const top = Math.max(1, ...counts.values());
    const anyPicked = pickedDecades.size > 0;
    const undated = pool.filter(r => r.decade == null).length;
    const names = [...picked].map(id => groups.find(g => g.id === id).name);
    const addedIn = [...pickedMonths].sort().map(m => monthName(m, "short"));
    $("#decadeNote").textContent = `By the year each song first came out${names.length ? `, in ${names.join(" or ")}` : ""}${addedIn.length ? `, added in ${addedIn.join(" or ")}` : ""}.${undated ? ` ${undated} ${undated === 1 ? "song has" : "songs have"} no date.` : ""}`;

    $("#decadeBars").innerHTML = decades.map(d => {
      const n = counts.get(d);
      return `<li>
        <button type="button" class="decade-bar" data-decade="${d}" data-name="${decadeLabel(d)}" aria-pressed="${pickedDecades.has(d)}"
          ${anyPicked && !pickedDecades.has(d) ? "data-dim" : ""} ${n || pickedDecades.has(d) ? "" : "disabled"}
          aria-label="${decadeLabel(d)}: ${n} ${n === 1 ? "song" : "songs"}${n ? `: ${spoken(byGenre.get(d))}` : ""}">${/* an empty decade can't be picked, but a picked one stays clickable to unpick */""}
          <span class="db-track" style="--h:${(n / top) * 100}%">
            <span class="db-fill db-stack">${stack(byGenre.get(d))}</span>${n ? `<span class="db-num">${n}</span>` : ""}
          </span>
          <span class="db-label">${decadeLabel(d)}</span>
        </button>
      </li>`;
    }).join("");

    // A short summary under the chart for each picked decade: its songs and top artists.
    const detail = $("#decadeDetail");
    detail.hidden = !anyPicked;
    detail.innerHTML = [...pickedDecades].sort().map(d => {
      const inDecade = perDecade.get(d) || [];
      const byArtist = new Map();
      inDecade.forEach(r => { const a = r.song.artists[0]; if (a) byArtist.set(a, (byArtist.get(a) || 0) + 1); });
      const top = [...byArtist].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
      return `<div class="dd-item">
        <p class="dd-head"><strong>${decadeLabel(d)}</strong> <span class="muted">${inDecade.length} ${inDecade.length === 1 ? "song" : "songs"}</span>
          <button type="button" class="dd-x" data-decade="${d}" aria-label="Remove the ${decadeLabel(d)} filter">×</button></p>
        <ol class="dd-artists">${top.map(([a, n]) => `<li><button type="button" class="linkish" data-artist="${esc(a)}">${esc(a)}</button> <span class="muted">${n}</span></li>`).join("")}</ol>
      </div>`;
    }).join("");
  }

  // A bar's songs counted by genre group, for its stack.
  function tallyGenres(list) {
    const m = new Map();
    list.forEach(r => m.set(r.group.id, (m.get(r.group.id) || 0) + 1));
    return m;
  }

  // ---------- when you added it ----------
  const groupName = id => groups.find(g => g.id === id)?.name || id;
  // A month's genres in stacking order: the six largest genres by size, bottom first,
  // then every other genre together as one grey segment on top.
  function segments(genreCounts) {
    const top = [...genreCounts].filter(([id]) => isTopGenre(id)).sort((a, b) => genreRank(a[0]) - genreRank(b[0]));
    const rest = [...genreCounts].filter(([id]) => !isTopGenre(id)).sort((a, b) => b[1] - a[1]);
    const segs = top.map(([id, n]) => ({ id, n, label: `${groupName(id)}: ${n}` }));
    const restN = rest.reduce((t, [, n]) => t + n, 0);
    if (restN) segs.push({ id: "rest", n: restN, label: `Other genres: ${restN} (${rest.map(([id, n]) => `${groupName(id)} ${n}`).join(", ")})` });
    return segs;
  }
  const stack = genreCounts => {
    const segs = segments(genreCounts), total = segs.reduce((t, x) => t + x.n, 0);
    return segs.map(x => `<span class="seg" style="flex-grow:${x.n}; background:${genreColor(x.id)}" data-tip="${esc(x.label)}"></span>`).join("") || "";
  };
  const spoken = genreCounts => segments(genreCounts).map(x => x.label.replace(/ \(.*\)$/, "")).join(", ");

  // The hover label for a genre segment, on both time charts.
  function hoverLabels(chart, area, tip) {
    area.addEventListener("pointermove", e => {
      const seg = e.target.closest(".seg");
      if (!seg) { tip.hidden = true; return; }
      const box = chart.getBoundingClientRect();
      const bar = seg.closest("[data-name]");
      tip.textContent = (bar ? bar.dataset.name + ": " : "") + seg.dataset.tip;
      tip.hidden = false;
      const x = Math.min(Math.max(e.clientX - box.left, tip.offsetWidth / 2 + 4), box.width - tip.offsetWidth / 2 - 4);
      tip.style.left = x + "px";
      tip.style.top = (e.clientY - box.top) + "px";
    });
    area.addEventListener("pointerleave", () => { tip.hidden = true; });
    area.addEventListener("scroll", () => { tip.hidden = true; });
  }
  hoverLabels($("#decadeChart"), $("#decadeBars"), $("#decadeTip"));
  hoverLabels($("#monthChart"), $("#monthScroll"), $("#monthTip"));

  function drawMonths() {
    // The shared filter's songs: picked genres and picked decades, like the rest of the page.
    // Each bar is the shared filter run for that month; its stack splits those songs by
    // genre: the six colored genres, then the rest as one grey segment.
    const perMonth = new Map(months.map(k => [k, rowsFor(stateFor(state, "months", k))]));
    const counts = new Map(months.map(k => [k, perMonth.get(k).length]));
    const byGenre = new Map(months.map(k => [k, tallyGenres(perMonth.get(k))]));
    const top = Math.max(1, ...counts.values());
    const names = [...picked].map(id => groups.find(g => g.id === id).name);
    const decadeNames = [...pickedDecades].sort().map(decadeLabel);
    $("#addedNote").textContent = `Songs added to the playlist each month${names.length ? `, in ${names.join(" or ")}` : ""}${decadeNames.length ? `, from the ${decadeNames.join(" or ")}` : ""}.`;

    $("#monthPlot").style.setProperty("--months", months.length);
    // Each year spans its months' columns, with its name once underneath. A thin line marks
    // where each year starts; the first year has none, since the chart's edge isn't a
    // January.
    const years = [];
    months.forEach((k, i) => {
      const y = k.slice(0, 4);
      if (years.length && years.at(-1).year === y) years.at(-1).end = i + 2;
      else years.push({ year: y, start: i + 1, end: i + 2 });
    });
    $("#yearBands").innerHTML = years.map((b, i) =>
      `<span class="year-band${i ? " year-start" : ""}" style="grid-column:${b.start} / ${b.end}"><span class="band-year">${b.year}</span></span>`).join("");
    $("#monthBars").innerHTML = months.map((k, i) => {
      const n = counts.get(k);
      const [y, m] = k.split("-");
      // All months fit across the chart, so only quarter months are named (Jan, Apr, Jul,
      // Oct, plus the first bar); each year is named once, in its band. Every month is
      // still named in its hover label and screen-reader label.
      const tick = i === 0 || ["01", "04", "07", "10"].includes(m);
      return `<li>
        <button type="button" class="decade-bar month-bar" data-month="${k}" data-name="${esc(monthName(k))}" aria-pressed="${pickedMonths.has(k)}"
          ${pickedMonths.size && !pickedMonths.has(k) ? "data-dim" : ""} ${n || pickedMonths.has(k) ? "" : "disabled"}
          aria-label="${monthName(k)}: ${n} ${n === 1 ? "song" : "songs"} added${n ? `: ${spoken(byGenre.get(k))}` : ""}">
          <span class="db-track" style="--h:${(n / top) * 100}%">
            <span class="db-fill db-stack">${stack(byGenre.get(k))}</span>${n ? `<span class="db-num${n < 5 ? " db-num-small" : ""}">${n}</span>` : ""}
          </span>
          <span class="db-label">${tick ? `<span class="mb-mon">${monthName(k, "short").split(" ")[0]}</span>` : ""}</span>
        </button>
      </li>`;
    }).join("");

    // A card under the chart for each picked month: songs added and the top artists then.
    const detail = $("#monthDetail");
    detail.hidden = !pickedMonths.size;
    detail.innerHTML = [...pickedMonths].sort().map(k => {
      const inMonth = perMonth.get(k) || [];
      const byArtist = new Map();
      inMonth.forEach(r => { const a = r.song.artists[0]; if (a) byArtist.set(a, (byArtist.get(a) || 0) + 1); });
      const topArtists = [...byArtist].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
      return `<div class="dd-item">
        <p class="dd-head"><strong>${esc(monthName(k))}</strong> <span class="muted">${inMonth.length} ${inMonth.length === 1 ? "song" : "songs"} added</span>
          <button type="button" class="dd-x" data-month="${k}" aria-label="Remove the ${esc(monthName(k))} filter">×</button></p>
        ${topArtists.length ? `<ol class="dd-artists">${topArtists.map(([a, n]) => `<li><button type="button" class="linkish" data-artist="${esc(a)}">${esc(a)}</button> <span class="muted">${n}</span></li>`).join("")}</ol>` : `<p class="muted">No songs match the other filters this month.</p>`}
      </div>`;
    }).join("");
  }

  root.addEventListener("click", e => {
    const dead = e.target.closest("[data-dead]");
    if (dead) { deadThreshold = dead.dataset.dead; return drawDeadWeight(); }
    const order = e.target.closest("[data-song-sort]");
    if (order) { songSort = order.dataset.songSort; return draw(); }
    const month = e.target.closest("[data-month]");
    if (month) return filter.toggleMonth(month.dataset.month);  // the subscription redraws
    const decade = e.target.closest("[data-decade]");
    if (decade) return filter.toggleDecade(Number(decade.dataset.decade));  // the subscription redraws
    const bar = e.target.closest("[data-group]");
    if (bar) return filter.toggleGroup(bar.dataset.group);  // the subscription below redraws
    const chip = e.target.closest("[data-genre]");
    if (chip) {
      const g = chip.dataset.genre;
      narrowed.has(g) ? narrowed.delete(g) : narrowed.add(g);
      const fromSearch = chip.hasAttribute("data-from-search");
      if (fromSearch) genreQuery = genreQ.value = "";
      draw();
      if (fromSearch) genreQ.focus();
      return;
    }
    if (e.target.closest("#clearGenres")) { narrowed.clear(); return filter.clear(); }
    const song = e.target.closest("[data-song]");
    if (song) return playOrOpen(song.dataset.song, song.dataset.songArtist);
    const artist = e.target.closest("[data-artist]");
    if (artist) openArtist(artist.dataset.artist);
  });

  const stop = filter.subscribe(() => (root.isConnected ? draw() : stop()));
  draw();
}
