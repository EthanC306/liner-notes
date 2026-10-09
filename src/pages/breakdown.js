// Breakdown: every song sorted into one broad genre group, as bars you can click
// to filter, then a decades chart, then specific genres to narrow it down further.
// Genres and decades are the shared filter, so picks here carry to the other tabs.
import { artistByName } from "../data.js";
import { GROUPS, NO_GENRE, songGroup, artistGenres, byCountOtherLast } from "../genres.js";
import { openArtist } from "../artist-sheet.js";
import { esc } from "../util.js";
import { filter } from "../filter.js";
import { decadeOf, decadeLabel } from "../decades.js";

export function render(root, { songs }) {
  // Each song's group, and every specific genre of every artist on it.
  const rows = songs.map(s => ({
    song: s,
    group: songGroup(s, artistByName),
    decade: decadeOf(s),
    genres: [...new Set(s.artists.flatMap(n => artistGenres(artistByName(n))))],
  }));
  const groups = [...GROUPS, NO_GENRE]
    .map(g => ({ ...g, count: rows.filter(r => r.group.id === g.id).length }))
    .filter(g => g.count)
    .sort(byCountOtherLast);
  const max = Math.max(...groups.map(g => g.count));

  // Genre groups come from the shared filter, so a pick here carries to the other tabs.
  // A picked group with no songs (like Other) is left out, the same as on the Overview.
  let picked = new Set();
  const readFilter = () => { picked = new Set([...filter.groups()].filter(id => groups.some(g => g.id === id))); };
  const narrowed = new Set(); // specific genres

  // Every decade from the earliest song to the latest, empty ones included, so the
  // chart reads as a timeline.
  const years = rows.map(r => r.decade).filter(d => d != null);
  const decades = [];
  for (let d = Math.min(...years); d <= Math.max(...years); d += 10) decades.push(d);
  let pickedDecades = new Set();
  const readDecades = () => { pickedDecades = new Set([...filter.decades()].filter(d => rows.some(r => r.decade === d))); };

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

    <section class="decade-section" aria-labelledby="decadeH">
      <div class="genre-head">
        <h2 id="decadeH">Decades</h2>
        <p class="muted" id="decadeNote"></p>
      </div>
      <ul class="decade-bars" id="decadeBars"></ul>
      <div class="decade-detail" id="decadeDetail" hidden></div>
    </section>

    <section class="genre-section" aria-label="Songs">

      <div class="narrow" id="narrow">
        <h3>Narrow down</h3>
        <ul class="narrow-chips" id="narrowChips"></ul>
      </div>

      <div class="genre-results">
        <p class="muted" id="genreSummary" aria-live="polite"></p>
        <ol class="genre-songs" id="genreSongs"></ol>
      </div>
    </section>
  </section>`;

  const $ = s => root.querySelector(s);

  function matching() {
    return rows.filter(r =>
      (!picked.size || picked.has(r.group.id)) &&
      (!pickedDecades.size || pickedDecades.has(r.decade)) &&
      (!narrowed.size || r.genres.some(g => narrowed.has(g))));
  }

  function draw() {
    readFilter();
    readDecades();
    drawDecades();
    const any = picked.size > 0;
    $("#genreBars").innerHTML = groups.map(g => {
      const pct = Math.round((g.count / songs.length) * 100);
      return `<li>
        <button type="button" class="genre-bar${g.id === "none" ? " is-none" : ""}" data-group="${g.id}"
          aria-pressed="${picked.has(g.id)}"${any && !picked.has(g.id) ? ' data-dim=""' : ""}>
          <span class="gb-name">${esc(g.name)}</span>
          <span class="gb-track"><span class="gb-fill" style="width:${(g.count / max) * 100}%"></span></span>
          <span class="gb-num">${g.count} <span class="muted">(${pct}%)</span></span>
        </button>
      </li>`;
    }).join("");

    // Specific genres among the songs the group filter leaves, most common first.
    const pool = rows.filter(r => (!picked.size || picked.has(r.group.id)) && (!pickedDecades.size || pickedDecades.has(r.decade)));
    const counts = new Map();
    pool.forEach(r => r.genres.forEach(g => counts.set(g, (counts.get(g) || 0) + 1)));
    const chips = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24);
    for (const g of [...narrowed]) if (!counts.has(g)) narrowed.delete(g);
    $("#narrowChips").innerHTML = chips.map(([g, n]) =>
      `<li><button type="button" class="narrow-chip" data-genre="${esc(g)}" aria-pressed="${narrowed.has(g)}">${esc(g)} <span>${n}</span></button></li>`).join("");
    $("#narrow").hidden = chips.length === 0;

    const list = matching();
    $("#clearGenres").hidden = !picked.size && !narrowed.size && !pickedDecades.size;
    const names = [...picked].map(id => groups.find(g => g.id === id).name);
    const decadeNames = [...pickedDecades].sort().map(decadeLabel);
    $("#genreSummary").textContent = !picked.size && !narrowed.size && !pickedDecades.size
      ? `All ${songs.length} songs. Pick a genre or decade above to filter.`
      : `${list.length} of ${songs.length} songs${names.length ? ` in ${names.join(" or ")}` : ""}${decadeNames.length ? ` from the ${decadeNames.join(" or ")}` : ""}${narrowed.size ? `, tagged ${[...narrowed].join(" or ")}` : ""}.`;
    $("#genreSongs").innerHTML = list.map(({ song: s, group, genres }) => `
      <li>
        <span class="num">${s.n}</span>
        <span class="gs-main">
          ${s.artists.length ? `<button type="button" class="linkish gs-title" data-song="${s.n}" data-song-artist="${esc(s.artists[0])}">${esc(s.title)}</button>` : `<span class="gs-title">${esc(s.title)}</span>`}
          <span class="gs-by">${s.artists.map(a => `<button type="button" class="linkish" data-artist="${esc(a)}">${esc(a)}</button>`).join(", ") || "Unknown artist"}</span>
        </span>
        <span class="gs-genres">${genres.slice(0, 3).map(esc).join(", ") || group.name}</span>
      </li>`).join("");
  }

  // ---------- decades ----------
  function drawDecades() {
    // Bar heights count the songs the genre filter leaves, so picking Metal shows Metal's decades.
    const pool = rows.filter(r => !picked.size || picked.has(r.group.id));
    const counts = new Map(decades.map(d => [d, pool.filter(r => r.decade === d).length]));
    const top = Math.max(1, ...counts.values());
    const anyPicked = pickedDecades.size > 0;
    const undated = pool.filter(r => r.decade == null).length;
    const names = [...picked].map(id => groups.find(g => g.id === id).name);
    $("#decadeNote").textContent = `By the year each song first came out${names.length ? `, in ${names.join(" or ")}` : ""}.${undated ? ` ${undated} ${undated === 1 ? "song has" : "songs have"} no date.` : ""}`;

    $("#decadeBars").innerHTML = decades.map(d => {
      const n = counts.get(d);
      return `<li>
        <button type="button" class="decade-bar" data-decade="${d}" aria-pressed="${pickedDecades.has(d)}"
          ${anyPicked && !pickedDecades.has(d) ? "data-dim" : ""} ${n || pickedDecades.has(d) ? "" : "disabled"}
          aria-label="${decadeLabel(d)}: ${n} ${n === 1 ? "song" : "songs"}">${/* an empty decade can't be picked, but a picked one stays clickable to unpick */""}
          <span class="db-num">${n}</span>
          <span class="db-track"><span class="db-fill" style="height:${(n / top) * 100}%"></span></span>
          <span class="db-label">${decadeLabel(d)}</span>
        </button>
      </li>`;
    }).join("");

    // A short summary under the chart for each picked decade: its songs and top artists.
    const detail = $("#decadeDetail");
    detail.hidden = !anyPicked;
    detail.innerHTML = [...pickedDecades].sort().map(d => {
      const inDecade = pool.filter(r => r.decade === d);
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

  root.addEventListener("click", e => {
    const decade = e.target.closest("[data-decade]");
    if (decade) return filter.toggleDecade(Number(decade.dataset.decade));  // the subscription redraws
    const bar = e.target.closest("[data-group]");
    if (bar) return filter.toggleGroup(bar.dataset.group);  // the subscription below redraws
    const chip = e.target.closest("[data-genre]");
    if (chip) { const g = chip.dataset.genre; narrowed.has(g) ? narrowed.delete(g) : narrowed.add(g); return draw(); }
    if (e.target.closest("#clearGenres")) { narrowed.clear(); return filter.clear(); }
    const song = e.target.closest("[data-song]");
    if (song) return openArtist(song.dataset.songArtist, { song: Number(song.dataset.song) });
    const artist = e.target.closest("[data-artist]");
    if (artist) openArtist(artist.dataset.artist);
  });

  const stop = filter.subscribe(() => (root.isConnected ? draw() : stop()));
  draw();
}
