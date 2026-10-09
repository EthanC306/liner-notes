import { esc, fmtLength, fmtRelease } from "../util.js";
import { openArtist } from "../artist-sheet.js";
import { filter } from "../filter.js";
import { artistByName, summarize } from "../data.js";
import { GROUPS, NO_GENRE, songGroup, byCountOtherLast } from "../genres.js";
import { decadeOf, decadeLabel } from "../decades.js";

const NS = "http://www.w3.org/2000/svg";
const ALL_GROUPS = [...GROUPS, NO_GENRE];

// The Overview follows the shared filter: with genres picked, everything on the
// page (disc, count, facts, albums, superlatives, tracklist) covers only those songs.
export function render(root, playlist) {
  // Each song's group comes from its main artist; featured artists don't count.
  const groupOfSong = new Map(playlist.songs.map(s => [s, songGroup(s, artistByName).id]));
  const songCount = id => playlist.songs.filter(s => groupOfSong.get(s) === id).length;
  const decadeCount = d => playlist.songs.filter(s => decadeOf(s) === d).length;
  let chipsOpen = false;  // whether every filter chip shows, or just the first three

  function show() {
    // A picked group with no songs here (like Other, whose artists are only ever
    // featured) is left out: no chip, and it doesn't filter anything.
    const picked = new Set([...filter.groups()].filter(id => songCount(id) > 0));
    const pickedDecades = [...filter.decades()].filter(d => decadeCount(d) > 0).sort();
    // A song has to match a picked genre and a picked decade (when there are any).
    const songs = playlist.songs.filter(s =>
      (!picked.size || picked.has(groupOfSong.get(s))) &&
      (!pickedDecades.length || pickedDecades.includes(decadeOf(s))));
    const chips = [
      ...ALL_GROUPS.filter(g => picked.has(g.id)).map(g => ({ ...g, count: songCount(g.id), remove: `data-unfilter="${g.id}"` })).sort(byCountOtherLast),
      ...pickedDecades.map(d => ({ id: "d" + d, name: decadeLabel(d), count: decadeCount(d), remove: `data-undecade="${d}"` })),
    ];
    // Three chips fit beside +N and Clear all; on a phone only two do.
    const visible = matchMedia("(max-width: 480px)").matches ? 2 : 3;
    if (chips.length <= visible) chipsOpen = false;
    // A fresh element each time, so this draw's click handlers go away with it.
    const inner = document.createElement("div");
    inner.className = "page";
    root.replaceChildren(inner);
    draw(inner, summarize(songs), { chips, total: playlist.songs.length, chipsOpen, visible });
    inner.addEventListener("click", e => {
      if (e.target.closest("[data-more-chips]")) { chipsOpen = !chipsOpen; show(); }
    });
  }

  const stop = filter.subscribe(() => (root.isConnected ? show() : stop()));
  show();
}

function draw(root, { songs, artists, albums, onceCount, rips }, { chips, total, chipsOpen, visible }) {
  const filtered = chips.length > 0;
  root.innerHTML = `
  <header class="sleeve">
    <div class="disc-col">
      <div class="disc-wrap" id="discWrap">
        <div class="disc-clip">
          <div class="disc spin" aria-hidden="true"></div>
          <svg class="disc-svg spin" id="discSvg" viewBox="0 0 100 100" role="group" aria-label="Top 10 artists by number of songs"></svg>
        </div>
        <div class="tip" id="tip" hidden></div>
      </div>
      <p class="disc-note">Each groove is one artist. The longer the groove, the more songs they have on the playlist. Pick one to see that artist’s songs.</p>
    </div>

    <div class="front">
      ${filtered ? `<ul class="filter-chips${chipsOpen ? " open" : ""}" aria-label="Filtered to">
        ${/* the longest name gives up its space first, so short ones like "Metal" stay whole */""}
        ${(chipsOpen ? chips : chips.slice(0, visible)).map((g, i, shown) => `<li style="flex-shrink:${g.name.length === Math.max(...shown.map(x => x.name.length)) ? 1000 : 1}"><button type="button" class="fchip" ${g.remove} aria-label="Remove the ${esc(g.name)} filter" title="${esc(g.name)}"><span class="fchip-name">${esc(g.name)}</span> <span class="fchip-n">${g.count}</span><span class="fchip-x" aria-hidden="true">×</span></button></li>`).join("")}
        ${chips.length > visible ? `<li><button type="button" class="fchip-more" data-more-chips aria-expanded="${chipsOpen}">${chipsOpen ? "Fewer" : `+${chips.length - visible}`}</button></li>` : ""}
        ${chips.length > 1 ? `<li><button type="button" class="fchip-clear" data-clear-filter>Clear all</button></li>` : ""}
      </ul>` : ""}
      <h1 class="scrawl" tabindex="-1">${songs.length} ${songs.length === 1 ? "song" : "songs"}<small>${filtered ? `of ${total}` : "burned from Spotify"}</small></h1>
      <div class="facts" id="facts"></div>
      <p class="also" id="also"></p>
    </div>
  </header>

  <section class="albums" aria-labelledby="albumsH">
    <header>
      <h2 id="albumsH">Albums you keep going back to</h2>
      <p class="muted" id="albumsNote"></p>
    </header>
    <ol class="album-list" id="albumList"></ol>
  </section>

  <section class="superlatives" aria-labelledby="superH">
    <h2 id="superH">Superlatives</h2>
    <ul class="super-grid" id="superGrid"></ul>
  </section>

  <section class="tracks" id="tracks" aria-labelledby="tracksH">
    <div class="tracks-head">
      <div>
        <h2 id="tracksH">Tracklist</h2>
        <p class="muted" id="trackSummary"></p>
      </div>
      <div class="controls">
        <input id="q" class="search" type="search" placeholder="Search the tracklist" aria-label="Search the tracklist" autocomplete="off">
      </div>
    </div>
    <div class="jcard">
      <ol class="track-list" id="trackList"></ol>
      <p class="empty" id="empty" hidden></p>
    </div>
  </section>`;

  const $ = id => root.querySelector("#" + id);

  // ---------- front ----------
  const top = artists.slice(0, 10);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // Featured artists don't count as the playlist's artists (the same rule as the Artists
  // tab's genre chips), so they're listed separately as guests.
  const mainCount = new Set(songs.map(s => s.artists[0]).filter(Boolean)).size;
  const guests = artists.length - mainCount;
  const topTwo = top.length > 1 ? songs.filter(s => s.artists.includes(top[0].name) || s.artists.includes(top[1].name)).length : 0;
  $("facts").innerHTML = `
    <p><strong>${plural(mainCount, "artist", "artists")}</strong> across <strong>${plural(albums.length, "album", "albums")}</strong>${guests ? `, plus ${plural(guests, "featured guest", "featured guests")}` : ""}.</p>
    ${topTwo && top[1].count > 1 && topTwo < songs.length ? `<p>${esc(top[0].name)} and ${esc(top[1].name)} alone cover <strong>${topTwo} songs</strong>, about one in ${Math.round(songs.length / topTwo)}.</p>` : ""}
    ${onceCount ? `<p><strong>${plural(onceCount, "artist", "artists")}</strong> ${onceCount === 1 ? "shows" : "show"} up only once.</p>` : ""}
    ${rips ? `<p>${plural(rips, "song", "songs")} came from a YouTube rip instead of Spotify’s catalog.</p>` : ""}`;
  const also = artists.slice(10, 22);
  $("also").hidden = !also.length;
  $("also").innerHTML = "Also all over it: " +
    also.map(a => `<button type="button" class="linkish" data-artist="${esc(a.name)}">${esc(a.name)}</button> ${a.count}`).join(", ") + ".";

  // ---------- disc ----------
  const svg = $("discSvg"), tip = $("tip"), wrap = $("discWrap");
  const DEG_PER_SONG = 290 / top[0].count;
  const R0 = 46.5, STEP = 2.9;
  const pt = (r, deg) => { const a = deg * Math.PI / 180; return [50 + r * Math.sin(a), 50 - r * Math.cos(a)]; };
  const arcPath = (r, deg) => {
    const [x0, y0] = pt(r, 0), [x1, y1] = pt(r, deg);
    return `M${x0.toFixed(3)} ${y0.toFixed(3)} A${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
  };
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  top.forEach((a, i) => {
    const r = R0 - i * STEP;
    el("circle", { cx: 50, cy: 50, r, class: "groove-track" }, svg);
    const g = el("g", { class: "artist-g", tabindex: 0, role: "button",
      "aria-label": `${a.name}, ${a.count} songs. Open artist.` }, svg);
    g.dataset.artist = a.name;
    const deg = a.count * DEG_PER_SONG;
    el("path", { d: arcPath(r, deg), class: "arc" }, g);
    el("path", { d: arcPath(r, deg), class: "arc-hit" }, g);
    const name = el("text", { x: 48.4, y: 50 - r, "text-anchor": "end", "dominant-baseline": "central", class: "name" }, g);
    name.textContent = a.name + " ";
    el("tspan", { class: "count" }, name).textContent = a.count;

    const show = (x, y) => {
      tip.innerHTML = `<b>${esc(a.name)}</b><br>${a.count} songs from ${a.albums.size} ${a.albums.size === 1 ? "album" : "albums"}`;
      tip.style.left = x + "px"; tip.style.top = y + "px"; tip.hidden = false;
    };
    g.addEventListener("pointermove", e => { const b = wrap.getBoundingClientRect(); show(e.clientX - b.left, e.clientY - b.top); });
    g.addEventListener("pointerleave", () => { tip.hidden = true; });
    g.addEventListener("focus", () => {
      const s = wrap.getBoundingClientRect().width / 100;
      const [fx, fy] = pt(r, deg / 2); show(fx * s, fy * s);
    });
    g.addEventListener("blur", () => { tip.hidden = true; });
    const pick = () => { tip.hidden = true; openArtist(a.name); };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });

  // ---------- albums ----------
  const tallySvg = n => {
    const w = Math.ceil(n / 5) * 22 - 6;
    const jit = k => ((k * 7919) % 5 - 2) * .25;
    let d = "";
    for (let i = 0; i < n; i++) {
      const x0 = Math.floor(i / 5) * 22, k = i % 5;
      if (k < 4) { const x = x0 + k * 4.5 + 1; d += `M${x + jit(i)} ${2 + jit(i + 1) * .5}L${x - jit(i + 2)} ${28 + jit(i + 3) * .5}`; }
      else d += `M${x0 - 2} 22L${x0 + 16.5} 7`;
    }
    return `<svg viewBox="-3 0 ${w + 6} 30" aria-hidden="true"><path d="${d}"/></svg>`;
  };
  // Four or more songs makes an album "one you keep going back to"; a small genre
  // may not have three of those, so then two or more counts.
  const min = albums.filter(a => a.count >= 4).length >= 3 ? 4 : 2;
  const repeat = albums.filter(a => a.count >= min);
  $("albumsNote").textContent = repeat.length
    ? `Albums with ${min === 4 ? "four" : "two"} or more songs${filtered ? " in this genre" : " on the playlist"}, counted in tally marks.`
    : `No album has more than one song${filtered ? " in this genre" : ""}.`;
  $("albumList").innerHTML = repeat.map(a => `
    <li><span class="t">${esc(a.album)}</span><span class="a">${a.artist ? `<button type="button" class="linkish" data-artist="${esc(a.artist)}">${esc(a.artist)}</button>` : ""}</span>
    <span class="tally">${tallySvg(a.count)}<span class="n" aria-label="${a.count} songs">${a.count}</span></span></li>`).join("");

  // ---------- superlatives ----------
  const artistLinks = names => names.map(n => `<button type="button" class="linkish" data-artist="${esc(n)}">${esc(n)}</button>`).join(", ");
  // A song title that opens its artist's popup with that song expanded.
  const songLink = s => s.artists.length
    ? `<button type="button" class="linkish" data-song="${s.n}" data-song-artist="${esc(s.artists[0])}">${esc(s.title)}</button>`
    : esc(s.title);
  const songCard = (label, value, s, note = "") => `
    <li class="super-card">
      <p class="super-label">${label}</p>
      <p class="super-value">${value}</p>
      <p class="super-song">${songLink(s)}</p>
      <p class="super-by">${s.artists.length ? artistLinks(s.artists) : "Unknown artist"}${note ? `<br><span class="muted">${note}</span>` : ""}</p>
    </li>`;

  const dated = songs.filter(s => s.released);
  const byRelease = [...dated].sort((a, b) => a.released.release_date.localeCompare(b.released.release_date));
  const timed = songs.filter(s => s.durationMs);
  const longest = timed.reduce((m, s) => (s.durationMs > m.durationMs ? s : m), timed[0]);
  const shortest = timed.reduce((m, s) => (s.durationMs < m.durationMs ? s : m), timed[0]);
  const titled = songs.filter(s => !s.rip);
  const longTitle = titled.reduce((m, s) => (s.title.length > m.title.length ? s : m), titled[0]);

  // Most common collaborator: the pair of artists who share the most songs.
  const pairs = new Map();
  songs.forEach(s => {
    const names = [...new Set(s.artists)];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const key = [names[i], names[j]].sort().join("\u0001");
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  });
  const topPair = [...pairs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  $("superGrid").closest("section").hidden = !songs.length;

  const cards = [];
  if (byRelease.length) {
    const old = byRelease[0], young = byRelease[byRelease.length - 1];
    cards.push(songCard("Oldest song", old.releaseYear, old, `Released ${esc(fmtRelease(old.released))}`));
    cards.push(songCard("Newest song", young.releaseYear, young, `Released ${esc(fmtRelease(young.released))}`));
  }
  if (longest) cards.push(songCard("Longest song", fmtLength(longest.durationMs), longest, esc(longest.album)));
  if (shortest) cards.push(songCard("Shortest song", fmtLength(shortest.durationMs), shortest, esc(shortest.album)));
  if (longTitle) cards.push(songCard("Longest title", `${longTitle.title.length}<span class="unit">characters</span>`, longTitle));
  if (topPair) {
    const [a, b] = topPair[0].split("\u0001");
    const shared = songs.filter(s => s.artists.includes(a) && s.artists.includes(b));
    cards.push(`
    <li class="super-card">
      <p class="super-label">Most common collaborators</p>
      <p class="super-value">${topPair[1]}<span class="unit">${topPair[1] === 1 ? "song" : "songs"} together</span></p>
      <p class="super-song">${artistLinks([a])} and ${artistLinks([b])}</p>
      <p class="super-by muted">${shared.slice(0, 3).map(songLink).join(", ")}${shared.length > 3 ? `, and ${shared.length - 3} more` : ""}</p>
    </li>`);
  }
  $("superGrid").innerHTML = cards.join("");

  // ---------- tracklist ----------
  const state = { q: "" };
  const q = $("q");
  q.addEventListener("input", () => { state.q = q.value.trim(); renderTracks(); });

  // Any artist name on this page opens that artist.
  root.addEventListener("click", e => {
    if (e.target.closest("[data-clear-filter]")) return filter.clear();
    const offDecade = e.target.closest("[data-undecade]");
    if (offDecade) return filter.toggleDecade(Number(offDecade.dataset.undecade));
    const off = e.target.closest("[data-unfilter]");
    if (off) return filter.toggleGroup(off.dataset.unfilter);  // the page redraws itself
    const song = e.target.closest("button[data-song]");
    if (song) return openArtist(song.dataset.songArtist, { song: Number(song.dataset.song) });
    const b = e.target.closest("button[data-artist]");
    if (b) openArtist(b.dataset.artist);
  });
  function hl(text) {
    if (!state.q) return esc(text);
    const i = text.toLowerCase().indexOf(state.q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + state.q.length)) + "</mark>" + esc(text.slice(i + state.q.length));
  }
  function renderTracks() {
    const needle = state.q.toLowerCase();
    const list = songs.filter(s =>
      (!needle || s.title.toLowerCase().includes(needle) || s.artistText.toLowerCase().includes(needle) || s.album.toLowerCase().includes(needle)));
    $("trackList").innerHTML = list.map(s => `
      <li><span class="num">${s.n}</span><span><span class="ti">${s.artists.length ? `<button type="button" class="linkish" data-song="${s.n}" data-song-artist="${esc(s.artists[0])}">${hl(s.title)}</button>` : hl(s.title)}</span>${s.rip ? '<span class="rip">YouTube rip</span>' : ""}<br>
      <span class="ar">${s.artists.length ? s.artists.map(a => `<button type="button" class="linkish" data-artist="${esc(a)}">${hl(a)}</button>`).join(", ") : "Unknown artist"}</span></span></li>`).join("");
    const empty = $("empty");
    empty.hidden = list.length > 0;
    if (!list.length) empty.textContent = `No songs match “${state.q}”. Try a shorter search.`;
    $("trackSummary").textContent = state.q
      ? `${list.length} of ${songs.length} songs, in playlist order.`
      : `All ${songs.length} songs, in playlist order.`;
  }
  renderTracks();
}
