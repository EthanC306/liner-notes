# liner-notes

Liner notes for a Spotify playlist. Export a playlist, and this app lays it out like a
burned mix CD with its insert: who you play most, which albums keep coming back, what
decade the music is from, when you added it, and every track in order.

It works with any playlist. The data in this repo is a sample (a 389-song playlist);
every number and sentence in the app is worked out from whatever playlist is loaded.

## What's in it

- **Overview**: your top 10 artists drawn as grooves on a disc, the albums you keep going
  back to, superlatives (oldest, newest, longest, shortest song, longest title, most common
  collaborators) and the full tracklist with search.
- **Breakdown**: songs by genre, by the decade they first came out, and by the month you
  added them, with charts stacked by genre.
- **Artists**: every artist with their photo and a popup of their songs, plus a tier list
  you can drag artists into from S to F.
- **Recommend**: a mixing board for artists you don't have yet, from Last.fm. Pick 1-5 of
  your artists or some genres under "Sounds like", slide Safe ↔ Adventurous and Popular ↔
  Underground, switch on "Never heard only" (needs your listening history), and hit
  **Burn it**. You get a top pick and a ranked list, each with a match bar, a "Because you
  like…" line and three songs; hide what's not for you and save the rest to check out.

Picking a genre, decade or month anywhere filters the Overview, Breakdown, Artists and
Recommend tabs together. Your picks and tier list are saved in your browser.

## Setup

You need Node.js, Python 3, and a Spotify account with Premium (Spotify requires Premium
for apps in development mode).

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install requests
```

### Make a Spotify app (once)

1. Go to https://developer.spotify.com/dashboard and create an app.
   - Redirect URI: `http://127.0.0.1:8888/callback`
   - API used: Web API
2. Copy the app's Client ID into `CLIENT_ID` at the top of `spotify_playlist_export.py`.
3. To export a playlist that isn't yours, or to let a friend use your app, add their
   Spotify email under **User Management** in the app's dashboard. A development-mode app
   allows 5 users, and can only read playlists those users own or collaborate on.

## Load your playlist

```bash
.venv/bin/python spotify_playlist_export.py "<playlist link>"
```

Copy the link from Spotify with **Share → Copy link to playlist**, and keep the quotes
around it. The script opens Spotify's login in your browser (the Windows browser when run
under WSL) and saves every song to `playlist_songs.json`. Run it again whenever the
playlist changes.

### Optional extras

Each of these adds to what the app can show. The app works without any of them.

| Command | What it adds |
|---|---|
| `.venv/bin/python musicbrainz_artists.py` | Genres, hometowns and start years from MusicBrainz (Spotify doesn't give genres to development-mode apps). |
| `.venv/bin/python musicbrainz_songs.py` | The year each song first came out, so a 2009 remaster of a 1969 single counts as the 1960s. |
| `LASTFM_API_KEY=... .venv/bin/python lastfm_genres.py` | Genres from Last.fm for artists MusicBrainz doesn't know. Get a free key at https://www.last.fm/api/account/create. |
| `LASTFM_API_KEY=... .venv/bin/python lastfm_similar.py` | The Recommend page: artists similar to yours, with their top songs and listener counts. Same free Last.fm key. The first run takes 20-30 minutes; it keeps what it has, so later runs are quick. |
| `.venv/bin/python history_summary.py` | Your listening history, for Recommend: request **Extended streaming history** from Spotify (Account → Privacy settings → Download your data), put the `Streaming_History_Audio_*.json` files in `data/history/` (kept out of git), then run this. |
| `.venv/bin/python fix_added_dates.py old_playlist.json` | Real added dates when songs were copied over from an older playlist. Export the old one first with `--out old_playlist.json --no-artists`. |

The MusicBrainz scripts take a few minutes the first time (MusicBrainz allows one request
a second); later runs only look up what's new.

### Set genres yourself

`artist_genres.json` maps an artist to a genre, like `"Perry Maysun": "rap"` or
`"Julia Wolf": ["emo", "indie rock"]`. It always wins over MusicBrainz and Last.fm, so use
it for artists the databases don't know or get wrong. The first genre picks the artist's
group (Midwest emo, Metal, Rap & hip hop and so on).

### Local files

Songs that are local files (YouTube rips and the like) show their file name. To show the
real title, artist and album instead, add them to `song_corrections.json`, keyed by
`"local:<file name>"`.

## Run the app

```bash
npm run dev       # open the address it prints; it reloads when the data changes
npm run build     # build a static site into dist/
npm run preview   # serve that build
```

## Tests

```bash
npm test
```

Runs the app logic tests (Vitest) and the data script tests (Python). They use a small
fixture playlist in `tests/fixtures/`, plus a check on the sample playlist's totals.
