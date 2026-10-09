// Breakdown: every song sorted into one broad genre group, as bars you can click
// to filter, then specific genres to narrow it down further.
import { artistByName } from "../data.js";
import { GROUPS, NO_GENRE, songGroup, artistGenres } from "../genres.js";
import { openArtist } from "../artist-sheet.js";
import { esc } from "../util.js";

export function render(root, { songs }) {
  // Each song's group, and every specific genre of every artist on it.
  const rows = songs.map(s => ({
    song: s,
    group: songGroup(s, artistByName),
    genres: [...new Set(s.artists.flatMap(n => artistGenres(artistByName(n))))],
  }));
  const groups = [...GROUPS, NO_GENRE]
    .map(g => ({ ...g, count: rows.filter(r => r.group.id === g.id).length }))
    .filter(g => g.count)
    .sort((a, b) => (a.id === "none") - (b.id === "none") || b.count - a.count);
  const max = Math.max(...groups.map(g => g.count));

  const picked = new Set();   // group ids
  const narrowed = new Set(); // specific genres

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
      (!narrowed.size || r.genres.some(g => narrowed.has(g))));
  }

  function draw() {
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
    const pool = rows.filter(r => !picked.size || picked.has(r.group.id));
    const counts = new Map();
    pool.forEach(r => r.genres.forEach(g => counts.set(g, (counts.get(g) || 0) + 1)));
    const chips = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24);
    for (const g of [...narrowed]) if (!counts.has(g)) narrowed.delete(g);
    $("#narrowChips").innerHTML = chips.map(([g, n]) =>
      `<li><button type="button" class="narrow-chip" data-genre="${esc(g)}" aria-pressed="${narrowed.has(g)}">${esc(g)} <span>${n}</span></button></li>`).join("");
    $("#narrow").hidden = chips.length === 0;

    const list = matching();
    $("#clearGenres").hidden = !picked.size && !narrowed.size;
    const names = [...picked].map(id => groups.find(g => g.id === id).name);
    $("#genreSummary").textContent = !picked.size && !narrowed.size
      ? `All ${songs.length} songs. Pick a genre above to filter.`
      : `${list.length} of ${songs.length} songs${names.length ? ` in ${names.join(" or ")}` : ""}${narrowed.size ? `, tagged ${[...narrowed].join(" or ")}` : ""}.`;
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

  root.addEventListener("click", e => {
    const bar = e.target.closest("[data-group]");
    if (bar) { const id = bar.dataset.group; picked.has(id) ? picked.delete(id) : picked.add(id); return draw(); }
    const chip = e.target.closest("[data-genre]");
    if (chip) { const g = chip.dataset.genre; narrowed.has(g) ? narrowed.delete(g) : narrowed.add(g); return draw(); }
    if (e.target.closest("#clearGenres")) { picked.clear(); narrowed.clear(); return draw(); }
    const song = e.target.closest("[data-song]");
    if (song) return openArtist(song.dataset.songArtist, { song: Number(song.dataset.song) });
    const artist = e.target.closest("[data-artist]");
    if (artist) openArtist(artist.dataset.artist);
  });

  draw();
}
