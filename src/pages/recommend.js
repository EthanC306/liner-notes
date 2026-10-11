// Recommend: artists that sound like yours, from Last.fm's similar artists (see
// src/recommend.js). Seeds come from the shared filter's songs, so picking a genre,
// decade or month recommends from just those artists.
import { lastfmSimilar } from "../data.js";
import { filter } from "../filter.js";
import { filterSongs, activeState } from "../selection.js";
import { recommend, reasonLine } from "../recommend.js";
import { openArtist } from "../artist-sheet.js";
import { GROUPS, NO_GENRE } from "../genres.js";
import { decadeLabel } from "../decades.js";
import { monthLabel } from "../months.js";
import { esc } from "../util.js";

const SHOWN = 24;
const hasData = Object.keys(lastfmSimilar.similar || {}).length > 0;
const groupName = id => [...GROUPS, NO_GENRE].find(g => g.id === id)?.name || id;
// Spotify search for a song, since Last.fm gives no Spotify links.
const spotifySearch = (...words) => "https://open.spotify.com/search/" + encodeURIComponent(words.join(" "));

export function render(root, playlist) {
  root.innerHTML = `
  <section class="recommend-page">
    <header class="recommend-head">
      <h1 tabindex="-1">Recommend</h1>
      <p class="lede">Artists that sound like yours, from Last.fm. One that’s similar to several of your artists ranks higher, and artists with more songs on the playlist count for more.</p>
    </header>
    <div id="recBody"></div>
  </section>`;
  const body = root.querySelector("#recBody");

  function draw() {
    if (!hasData) {
      body.innerHTML = `
      <div class="rec-empty">
        <p class="rec-empty-title">No recommendations yet</p>
        <p>They come from Last.fm’s similar artists, which need a free API key. Get one at
          <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">last.fm/api/account/create</a>, then run:</p>
        <p><code>LASTFM_API_KEY=your_key .venv/bin/python lastfm_similar.py</code></p>
        <p class="muted">It takes a few minutes. This page fills in when it finishes.</p>
      </div>`;
      return;
    }

    const state = activeState(playlist.songs, filter.state());
    const songs = filterSongs(playlist.songs, state);
    const filtered = state.groups.length || state.decades.length || state.months.length;
    const filterNames = [
      ...state.groups.map(groupName),
      ...[...state.decades].sort().map(decadeLabel),
      ...[...state.months].sort().map(m => monthLabel(m, "short")),
    ];
    const filterTag = filtered
      ? `<p class="rec-filter"><span class="fchip rec-tag">Filtered: ${esc(filterNames.join(", "))}</span>
           <button type="button" class="ghost-btn" data-clear-filter>Clear filter</button></p>`
      : "";

    if (!songs.length) {
      body.innerHTML = `${filterTag}
      <div class="rec-empty">
        <p class="rec-empty-title">No songs match</p>
        <p>The filter leaves no songs to recommend from.</p>
        <p><button type="button" class="button" data-clear-filter>Clear all</button></p>
      </div>`;
      return;
    }

    const recs = recommend({ songs, allSongs: playlist.songs, lastfm: lastfmSimilar, limit: SHOWN });
    const seedCount = new Set(songs.map(s => s.artists[0]).filter(Boolean)).size;
    body.innerHTML = `${filterTag}
      <p class="muted rec-summary">${recs.length
        ? `The top ${recs.length}, from your ${seedCount} ${seedCount === 1 ? "artist" : "artists"}${filtered ? " in the filter" : ""}.`
        : `Last.fm has no similar artists for ${filtered ? "the artists in this filter" : "your artists"} that aren’t already on the playlist.`}</p>
      <ol class="rec-list">${recs.map((r, i) => `
        <li class="rec-card">
          <span class="rec-rank" aria-hidden="true">${i + 1}</span>
          <div class="rec-main">
            <h2 class="rec-name">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}</h2>
            <p class="rec-why">Because you like ${reasonLine(r.because.map(n => `<button type="button" class="linkish" data-artist="${esc(n)}">${esc(n)}</button>`))}</p>
            ${r.seeds > r.because.length ? `<p class="muted rec-more">Similar to ${r.seeds} of your artists.</p>` : ""}
            ${r.tracks.length ? `<ul class="rec-tracks">${r.tracks.map(t => `
              <li><a href="${esc(spotifySearch(r.name, t.name))}" target="_blank" rel="noopener">${esc(t.name)}</a></li>`).join("")}</ul>` : ""}
          </div>
        </li>`).join("")}
      </ol>`;
  }

  root.addEventListener("click", e => {
    if (e.target.closest("[data-clear-filter]")) return filter.clear();
    const artist = e.target.closest("[data-artist]");
    if (artist) openArtist(artist.dataset.artist);
  });

  const stop = filter.subscribe(() => (root.isConnected ? draw() : stop()));
  draw();
}

