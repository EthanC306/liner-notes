// Recommend: a mixing board on top, results underneath. The board's settings only take
// effect when "Burn it" is pressed; everything runs on data already saved by
// lastfm_similar.py (and history_summary.py), so burning is instant.
//
// Sounds like: the shared filter's songs (the whole playlist, or the genres picked here,
// which are the shared filter's genre chips), or 1-5 artists picked by name instead.
import { lastfmSimilar, listeningHistory } from "../data.js";
import { filter } from "../filter.js";
import { filterSongs, activeState, mainArtistsOf } from "../selection.js";
import { recommendAtLeast, reasonLine } from "../recommend.js";
import { openArtist } from "../artist-sheet.js";
import { GROUPS, NO_GENRE, byCountOtherLast } from "../genres.js";
import { swatch } from "../genre-colors.js";
import { decadeLabel } from "../decades.js";
import { monthLabel } from "../months.js";
import { esc, reducedMotion, spotifySearch } from "../util.js";

const SHOWN = 20;
// Every burn shows at least 5 artists, each with 3 different songs (so at least 15 songs).
const MIN_ARTISTS = 5;
const SONGS_EACH = 3;
const MAX_SEEDS = 5;
const hasData = Object.keys(lastfmSimilar.similar || {}).length > 0;
const heardNames = Object.keys(listeningHistory.artists || {});
const hasHistory = heardNames.length > 0;  // without a history, its switch is left out entirely

// ---------- saved in this browser ----------
const KEYS = { board: "playlist-stat:board", hidden: "playlist-stat:hidden", saved: "playlist-stat:saved" };
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } };

const DEFAULT_BOARD = { seeds: [], adventure: 50, popularity: 50, neverHeard: false };
const sameBoard = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const groupName = id => [...GROUPS, NO_GENRE].find(g => g.id === id)?.name || id;
const fmtListeners = n => !n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M listeners` : n >= 1000 ? `${Math.round(n / 1000)}K listeners` : `${n} listeners`;

export function render(root, playlist) {
  // The board as it's set now (draft), and as it was when last burned (burned).
  let draft = { ...DEFAULT_BOARD, ...load(KEYS.board, {}) };
  draft.seeds = (draft.seeds || []).filter(n => playlist.artists.some(a => a.name === n)).slice(0, MAX_SEEDS);
  let burned = null;
  let burnedFilter = null;
  let hidden = load(KEYS.hidden, []);
  let saved = load(KEYS.saved, []);
  let lastHidden = null;
  let onScreen = new Map();  // the burned results, by name, for "Save"
  let query = "";

  // Artists you can pick under "Sounds like": main artists, most songs first.
  const led = new Map();
  playlist.songs.forEach(s => s.artists[0] && led.set(s.artists[0], (led.get(s.artists[0]) || 0) + 1));
  const pickable = [...led].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  const genreChips = [...GROUPS, NO_GENRE]
    .map(g => ({ ...g, count: playlist.songs.filter(s => s.groupId === g.id).length }))
    .filter(g => g.count).sort(byCountOtherLast);

  root.innerHTML = `
  <section class="recommend-page">
    <header class="recommend-head">
      <h1 tabindex="-1">Recommend</h1>
      <p class="lede">Set the board, then burn a mix of artists you don’t have yet. Everything comes from Last.fm’s similar artists, matched against yours.</p>
    </header>
    ${hasData ? `
    <div class="board" id="board">
      <div class="board-sounds">
        <p class="board-label">Sounds like</p>
        <div class="seed-picker">
          <ul class="seed-chips" id="seedChips" aria-label="Picked artists"></ul>
          <input id="seedInput" class="search seed-input" type="search" placeholder="Pick up to 5 of your artists" aria-label="Pick an artist" autocomplete="off">
          <ul class="seed-suggest" id="seedSuggest" hidden></ul>
        </div>
        <p class="board-or muted" id="genreLead">or recommend from your whole playlist, or just these genres:</p>
        <ul class="narrow-chips board-genres" id="boardGenres">
          ${genreChips.map(g => `<li><button type="button" class="narrow-chip" data-group="${g.id}">${swatch(g.id)}${esc(g.name)}</button></li>`).join("")}
        </ul>
      </div>
      <div class="board-faders">
        <label class="fader">
          <span class="fader-end">Adventurous</span>
          <input type="range" id="adventure" min="0" max="100" step="1" aria-label="Safe to adventurous">
          <span class="fader-end">Safe</span>
        </label>
        <label class="fader">
          <span class="fader-end">Underground</span>
          <input type="range" id="popularity" min="0" max="100" step="1" aria-label="Popular to underground">
          <span class="fader-end">Popular</span>
        </label>
      </div>
      <div class="board-end">
        ${hasHistory ? `<div class="switch-wrap">
          <button type="button" class="switch" id="neverHeard" role="switch">
            <span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span>
            <span>Never heard only</span>
          </button>
          <p class="muted switch-note">Hides anyone in your listening history (${heardNames.length.toLocaleString()} artists).</p>
        </div>` : ""}
        <button type="button" class="burn" id="burn"><span class="burn-fill" aria-hidden="true"></span><span class="burn-label">Burn it</span></button>
        <p class="muted burn-note" id="burnNote" aria-live="polite"></p>
      </div>
    </div>` : ""}
    <div id="recBody"></div>
    <section class="saved" id="saved" aria-labelledby="savedH" hidden>
      <h2 id="savedH">Saved to check out</h2>
      <ol class="saved-list" id="savedList"></ol>
    </section>
  </section>`;

  const $ = s => root.querySelector(s);
  const body = $("#recBody");

  if (!hasData) {
    body.innerHTML = `
    <div class="rec-empty">
      <p class="rec-empty-title">No recommendations yet</p>
      <p>They come from Last.fm’s similar artists, which need a free API key. Get one at
        <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">last.fm/api/account/create</a>, then run:</p>
      <p><code>LASTFM_API_KEY=your_key .venv/bin/python lastfm_similar.py</code></p>
      <p class="muted">The first run takes a while. This page fills in when it finishes.</p>
    </div>`;
    return;
  }

  // ---------- the board ----------
  function drawBoard() {
    $("#adventure").value = draft.adventure;
    $("#popularity").value = draft.popularity;
    $("#neverHeard")?.setAttribute("aria-checked", hasHistory && draft.neverHeard);
    $("#seedChips").innerHTML = draft.seeds.map(n =>
      `<li><button type="button" class="fchip" data-unseed="${esc(n)}" aria-label="Remove ${esc(n)}">${esc(n)}<span class="fchip-x" aria-hidden="true">×</span></button></li>`).join("");
    $("#seedInput").disabled = draft.seeds.length >= MAX_SEEDS;
    $("#seedInput").placeholder = draft.seeds.length >= MAX_SEEDS ? "Five artists picked" : draft.seeds.length ? "Add another artist" : "Pick up to 5 of your artists";
    // Genres are the shared filter's; while artists are picked they're set aside.
    const groups = new Set(filter.state().groups);
    root.querySelectorAll("[data-group]").forEach(b => b.setAttribute("aria-pressed", groups.has(b.dataset.group)));
    $("#boardGenres").classList.toggle("set-aside", draft.seeds.length > 0);
    $("#genreLead").textContent = draft.seeds.length
      ? "Picked artists are used instead of the genres below. Remove them to go back."
      : "or recommend from your whole playlist, or just these genres:";
    drawSuggestions();
    const dirty = burned && (!sameBoard(draft, burned) || !sameBoard(filter.state(), burnedFilter));
    $("#burn").classList.toggle("dirty", Boolean(dirty));
    $("#burnNote").textContent = dirty ? "Changes not burned yet." : "";
  }

  function drawSuggestions() {
    const list = $("#seedSuggest");
    const q = query.trim().toLowerCase();
    const matches = q ? pickable.filter(n => n.toLowerCase().includes(q) && !draft.seeds.includes(n)).slice(0, 8) : [];
    list.hidden = !matches.length;
    list.innerHTML = matches.map(n => `<li><button type="button" data-seed="${esc(n)}">${esc(n)} <span class="muted">${led.get(n)}</span></button></li>`).join("");
  }

  function setDraft(change) {
    draft = { ...draft, ...change };
    store(KEYS.board, draft);
    drawBoard();
  }

  // ---------- burning ----------
  function burn({ animate = true } = {}) {
    burned = { ...draft, seeds: [...draft.seeds] };
    burnedFilter = filter.state();
    store(KEYS.board, draft);
    const button = $("#burn");
    if (animate && !reducedMotion()) {
      button.classList.add("burning");
      button.disabled = true;
      setTimeout(() => { button.classList.remove("burning"); button.disabled = false; drawResults(); drawBoard(); }, 650);
    } else {
      drawResults();
      drawBoard();
    }
  }

  // ---------- results ----------
  function drawResults() {
    const state = activeState(playlist.songs, burnedFilter);
    const songs = filterSongs(playlist.songs, state);
    const filtered = state.groups.length || state.decades.length || state.months.length;
    const usingSeeds = burned.seeds.length > 0;
    const filterNames = [...state.groups.map(groupName), ...[...state.decades].sort().map(decadeLabel), ...[...state.months].sort().map(m => monthLabel(m, "short"))];
    const filterTag = filtered && !usingSeeds
      ? `<p class="rec-filter"><span class="fchip rec-tag">Filtered: ${esc(filterNames.join(", "))}</span>
           <button type="button" class="ghost-btn" data-clear-filter>Clear filter</button></p>` : "";

    if (!usingSeeds && !songs.length) {
      body.innerHTML = `${filterTag}
      <div class="rec-empty">
        <p class="rec-empty-title">No songs match</p>
        <p>The filter leaves no songs to recommend from.</p>
        <p><button type="button" class="button" data-clear-filter>Clear all</button></p>
      </div>`;
      return;
    }

    const { recs, adventure: usedAdventure, widened, reachedBy } = recommendAtLeast({
      songs, allSongs: playlist.songs, lastfm: lastfmSimilar, limit: SHOWN,
      seeds: usingSeeds ? burned.seeds : null,
      adventure: burned.adventure / 100,
      popularity: (burned.popularity - 50) / 50,
      heard: hasHistory && burned.neverHeard ? heardNames : null,
      hidden,
      minSongs: SONGS_EACH,
    }, MIN_ARTISTS);
    const ways = [
      usedAdventure > burned.adventure / 100 && `toward Adventurous (${Math.round(usedAdventure * 100)} on the fader)`,
      reachedBy.has("similar") && "through your artists who are similar to them",
      reachedBy.has("genre") && "through your artists in the same genre",
    ].filter(Boolean);
    const widenedLine = !widened ? "" : `<p class="muted rec-widened">These settings matched fewer than ${MIN_ARTISTS} artists, so the search
        reached further ${reasonLine(ways)}.${recs.length < MIN_ARTISTS && recs.length ? " This is everything it found." : ""}</p>`;
    const from = usingSeeds ? reasonLine(burned.seeds) : `your ${mainArtistsOf(songs).size} artists${filtered ? " in the filter" : ""}`;
    const hiddenLine = hidden.length
      ? `<p class="muted rec-hidden">${hidden.length} hidden with “Not for me”.
           ${lastHidden ? `<button type="button" class="linkish" data-undo-hide>Undo ${esc(lastHidden)}</button> ·` : ""}
           <button type="button" class="linkish" data-unhide-all>Show them again</button></p>` : "";

    if (!recs.length) {
      body.innerHTML = `${filterTag}${hiddenLine}
      <div class="rec-empty">
        <p class="rec-empty-title">Nothing new to burn</p>
        <p>With these settings, every similar artist is already on your playlist${hasHistory && burned.neverHeard ? " or in your listening history" : ""}${hidden.length ? ", or hidden" : ""}.
          Try sliding toward Adventurous${hasHistory && burned.neverHeard ? ", turning off Never heard only" : ""}, or picking other artists.</p>
      </div>`;
      return;
    }

    onScreen = new Map(recs.map(r => [r.name, r]));
    const top = Math.max(...recs.map(r => r.match));
    const savedSet = new Set(saved.map(s => s.name));
    const why = r => `Because you like ${reasonLine(r.because.map(n => `<button type="button" class="linkish" data-artist="${esc(n)}">${esc(n)}</button>`))}${r.via ? `, ${r.viaKind === "genre" ? "in the same genre as" : "who’s like"} <button type="button" class="linkish" data-artist="${esc(r.via)}">${esc(r.via)}</button>` : ""}`;
    const bar = r => `<span class="match" title="Match strength"><span class="match-fill" style="width:${Math.max(4, (r.match / top) * 100)}%"></span></span>`;
    const songsOf = (r, cls) => r.tracks.length
      ? `<ul class="${cls}">${r.tracks.map(t => `<li><a href="${esc(spotifySearch(r.name, t.name))}" target="_blank" rel="noopener">${esc(t.name)}</a></li>`).join("")}</ul>` : "";
    const actions = r => `<div class="rec-actions">
        <button type="button" class="ghost-btn" data-hide="${esc(r.name)}">Not for me</button>
        <button type="button" class="ghost-btn save-btn" data-save="${esc(r.name)}" aria-pressed="${savedSet.has(r.name)}">${savedSet.has(r.name) ? "Saved" : "Save"}</button>
      </div>`;
    const [first, ...rest] = recs;

    const songCount = recs.reduce((t, r) => t + r.tracks.length, 0);
    body.innerHTML = `${filterTag}
      <p class="muted rec-summary">Burned from ${from}: ${recs.length} ${recs.length === 1 ? "artist" : "artists"}, ${songCount} songs.</p>
      ${widenedLine}
      ${hiddenLine}
      <article class="top-pick">
        <p class="top-pick-label">Top pick</p>
        <h2 class="top-pick-name">${first.url ? `<a href="${esc(first.url)}" target="_blank" rel="noopener">${esc(first.name)}</a>` : esc(first.name)}</h2>
        <div class="top-pick-meta">${bar(first)}<span class="muted">${fmtListeners(first.listeners)}</span></div>
        <p class="rec-why">${why(first)}</p>
        ${songsOf(first, "top-pick-songs")}
        ${actions(first)}
      </article>
      <ol class="rec-cards" start="2">${rest.map((r, i) => `
        <li class="rec-card">
          <div class="rec-card-head">
            <span class="rec-rank" aria-hidden="true">${i + 2}</span>
            <div class="rec-card-title">
              <p class="rec-row-name">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}</p>
              <p class="muted rec-listeners">${fmtListeners(r.listeners)}</p>
            </div>
          </div>
          ${bar(r)}
          <p class="rec-why">${why(r)}</p>
          ${songsOf(r, "rec-card-songs")}
          ${actions(r)}
        </li>`).join("")}
      </ol>`;
  }

  // ---------- saved list ----------
  function drawSaved() {
    $("#saved").hidden = !saved.length;
    $("#savedList").innerHTML = saved.map(s => `
      <li>
        <span class="saved-name">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</span>
        ${s.song ? `<a class="muted" href="${esc(spotifySearch(s.name, s.song))}" target="_blank" rel="noopener">${esc(s.song)}</a>` : ""}
        <button type="button" class="dd-x" data-unsave="${esc(s.name)}" aria-label="Remove ${esc(s.name)} from the list">×</button>
      </li>`).join("");
  }

  // ---------- events ----------
  $("#adventure").addEventListener("input", e => setDraft({ adventure: +e.target.value }));
  $("#popularity").addEventListener("input", e => setDraft({ popularity: +e.target.value }));
  $("#seedInput").addEventListener("input", e => { query = e.target.value; drawSuggestions(); });
  $("#seedInput").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const first = $("#seedSuggest [data-seed]");
      if (first) { e.preventDefault(); first.click(); }
    }
    if (e.key === "Escape") { query = ""; e.target.value = ""; drawSuggestions(); }
  });

  root.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#burn")) return burn();
    if (t.closest("#neverHeard")) return setDraft({ neverHeard: !draft.neverHeard });
    const seed = t.closest("[data-seed]");
    if (seed) {
      query = "";
      $("#seedInput").value = "";
      setDraft({ seeds: [...draft.seeds, seed.dataset.seed].slice(0, MAX_SEEDS) });
      return $("#seedInput").focus();
    }
    const unseed = t.closest("[data-unseed]");
    if (unseed) return setDraft({ seeds: draft.seeds.filter(n => n !== unseed.dataset.unseed) });
    const group = t.closest("[data-group]");
    if (group) return filter.toggleGroup(group.dataset.group);  // the subscription redraws the board
    if (t.closest("[data-clear-filter]")) { filter.clear(); return burn({ animate: false }); }
    const hide = t.closest("[data-hide]");
    if (hide) { lastHidden = hide.dataset.hide; hidden = [...hidden, lastHidden]; store(KEYS.hidden, hidden); return drawResults(); }
    if (t.closest("[data-undo-hide]")) { hidden = hidden.filter(n => n !== lastHidden); lastHidden = null; store(KEYS.hidden, hidden); return drawResults(); }
    if (t.closest("[data-unhide-all]")) { hidden = []; lastHidden = null; store(KEYS.hidden, hidden); return drawResults(); }
    const save = t.closest("[data-save]");
    if (save) {
      const name = save.dataset.save;
      if (saved.some(s => s.name === name)) saved = saved.filter(s => s.name !== name);
      else {
        const r = onScreen.get(name);
        saved = [...saved, { name, url: r?.url || null, song: r?.tracks[0]?.name || null }];
      }
      store(KEYS.saved, saved);
      drawSaved();
      return drawResults();
    }
    const unsave = t.closest("[data-unsave]");
    if (unsave) { saved = saved.filter(s => s.name !== unsave.dataset.unsave); store(KEYS.saved, saved); drawSaved(); return drawResults(); }
    const artist = t.closest("[data-artist]");
    if (artist) openArtist(artist.dataset.artist);
  });

  // The shared filter can change here (genre chips) or on another tab; the board shows
  // it, and the results follow on the next burn.
  const stop = filter.subscribe(() => (root.isConnected ? drawBoard() : stop()));

  burn({ animate: false });
  drawSaved();
}
