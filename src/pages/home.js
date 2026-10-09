import { labelDisc } from "./label-disc.js";

export function render(root, { songs, artists }) {
  root.innerHTML = `
  <header class="hero">
    <div class="disc-col">${labelDisc(`the ${songs.length} mix`, `${artists.length} artists`)}</div>
    <div class="hero-text">
      <h1 tabindex="-1">Your Spotify playlist, laid out like a mix CD</h1>
      <p class="lede">This app reads the songs exported from your playlist and shows what it’s made of: who you play most, which albums keep coming back, and every track in order.</p>
      <p><a class="button" href="#overview">See the overview</a></p>
      <p class="muted">${songs.length} songs from ${artists.length} artists loaded from playlist_songs.json.</p>
    </div>
  </header>

  <section class="pages" aria-labelledby="pagesH">
    <h2 id="pagesH">What’s on each page</h2>
    <ul class="page-list">
      <li>
        <a href="#overview">Overview</a><span class="status ready">Ready</span>
        <p>Your top 10 artists drawn as grooves on a disc, the albums you keep going back to, and the full tracklist with search.</p>
      </li>
      <li>
        <a href="#breakdown">Breakdown</a><span class="status ready">Ready</span>
        <p>Your songs split into genres like emo, rap and post-hardcore. Click a genre to see its songs.</p>
      </li>
      <li>
        <a href="#artists">Artists</a><span class="status ready">Ready</span>
        <p>Every artist on the playlist with their photo, and a tier list to drag them into from S to F.</p>
      </li>
      <li>
        <a href="#filter">Filter</a><span class="status">Not built yet</span>
        <p>Narrow the playlist down to just the songs you want.</p>
      </li>
      <li>
        <a href="#recommend">Recommend</a><span class="status">Not built yet</span>
        <p>Find songs that fit what’s already on the playlist.</p>
      </li>
    </ul>
  </section>

  <section class="update" aria-labelledby="updateH">
    <h2 id="updateH">Updating the songs</h2>
    <ol class="steps">
      <li>Run <code>python spotify_playlist_export.py</code> and log in to Spotify when your browser opens.</li>
      <li>The script saves every song in the playlist to <code>playlist_songs.json</code> in this folder.</li>
      <li>Optional: run <code>python musicbrainz_artists.py</code> and <code>python musicbrainz_songs.py</code> to add genres, hometowns and the year each song first came out. Each takes a few minutes the first time.</li>
      <li>Reload this page. While <code>npm run dev</code> is running, it reloads on its own.</li>
    </ol>
  </section>`;
}
