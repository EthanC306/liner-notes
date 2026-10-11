# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Web app (Vite, plain ES modules, no framework):

```bash
npm run dev       # dev server; reloads when src/ or any imported JSON data file changes
npm run build     # static build into dist/ (gitignored)
npm run preview   # serve dist/ on localhost:4173
```

Data pipeline (Python, run from the repo root with the venv):

```bash
.venv/bin/python spotify_playlist_export.py ["<playlist link>"] [--out file.json] [--no-artists]
    # Spotify login in the browser (opens the Windows browser under WSL), writes playlist_songs.json
    # and reapplies date_overrides.json. --out writes elsewhere (used for an old playlist lookup).
.venv/bin/python fix_added_dates.py old_playlist.json   # real added dates from an older playlist export
.venv/bin/python musicbrainz_artists.py                  # genres, hometown, start year -> musicbrainz_artists.json
.venv/bin/python musicbrainz_songs.py                    # original first-release dates -> musicbrainz_songs.json
LASTFM_API_KEY=... .venv/bin/python lastfm_genres.py     # Last.fm tags for artists MusicBrainz lacks
LASTFM_API_KEY=... .venv/bin/python lastfm_similar.py    # similar artists, their top songs and listener counts -> lastfm_similar.json
                                                         # (Recommend); resumable, only fetches what's missing
.venv/bin/python history_summary.py                      # data/history/Streaming_History_Audio_*.json -> listening_history.json
```

Tests (Vitest for the app logic, Python unittest for the data scripts):

```bash
npm test                                   # everything: Vitest (TZ=UTC) then Python unittest
npm run test:js                            # Vitest only
npm run test:py                            # Python only
npx vitest run tests/filter.test.js        # one file
npx vitest run -t "I Smoked Away My Brain" # tests whose name matches
python3 -m unittest tests.test_compare     # one Python test module
```

Run `npm test` before every commit; don't commit with failing tests.

Logic tests run against `tests/fixtures/` (13 songs once deduplicated: "I Smoked Away My Brain", a
duplicate by ID, a duplicate by title, a local file with no artist, "Tyler, The Creator", feature-only
artists, a remaster dated by its original release, songs missing from the old playlist).
`tests/snapshot.test.js` checks the real `playlist_songs.json` (389 songs) and skips when it's absent.
There is no linter.

## Architecture

**Data flows one way: Python scripts write JSON files, the app reads them at build time.**
`src/build.js` is the pure part: `buildPlaylist(sources)` takes the files' contents, so tests build from
the fixture. `src/data.js` only imports the real files and calls it. `data.js` imports `playlist_songs.json` directly and the optional enrichment files
(`musicbrainz_artists.json`, `musicbrainz_songs.json`, `artist_genres.json`, `lastfm_artists.json`,
`song_corrections.json`) through `import.meta.glob`, so a missing file is fine. It builds the song
and artist objects every page uses, applies `song_corrections.json` (official details for local files /
YouTube rips, keyed `"local:<file title>"`), and picks each song's first-release date as the earlier
of Spotify's album date and MusicBrainz. `summarize(songs)` derives artists/albums/counts for any song
list. `buildPlaylist` also deduplicates songs (`dedupeSongs`, earliest added date wins) and sets each
song's `groupId`, `decade` and `month`, which is what the filter reads. Spotify Development Mode limits matter: no popularity, audio features or genres; 5 users per app.

The MusicBrainz scripts write a `*.partial.json` while running and the real file once at the end;
writing the imported file repeatedly would make the dev server reload the page every second.

**Pages.** `src/main.js` is a hash router (`#overview`, `#breakdown`, `#artists`, …; `#overview/Artist%20Name`
also opens the artist popup from `src/artist-sheet.js`). Each visit renders into a fresh element because
pages attach click handlers to their root; reusing one root made handlers pile up. Pages in `src/pages/`
export `render(root, playlist)`.

**Genres.** `src/genres.js` maps MusicBrainz's specific genres onto broad groups with ordered regex rules
(first match wins; group ids stay stable when names change because saved filters store ids).
`src/genre-colors.js` ranks groups by song count once and assigns the CSS tokens `--genre-1..6` /
`--genre-rest` defined in `src/style.css` (light and dark values, checked with the dataviz palette validator).

**Shared filter.** `src/filter.js` is the state: genre, decade and added-month picks, saved to
localStorage, synced across browser tabs, `filter.state()` to read it, subscribers notified on change.
`src/selection.js` is the only filtering logic: `filterSongs(songs, state)` gives the one filtered list,
`countFor(songs, state, type, value)` / `stateFor(...)` give every chip and bar its count (the filter run
with that type's picks replaced by one value, so a chart never shrinks from its own picks), and
`activeState` drops saved picks no song has. Pages subscribe with
`filter.subscribe(() => root.isConnected ? redraw() : stop())`. Decades and months come from
`src/decades.js` and `src/months.js`.

**Recommend.** `lastfm_similar.py` only fetches; `src/recommend.js` does all the scoring in the browser, so the
mixing board re-ranks saved data instantly. Seeds are 1-5 picked artists (equal weight) or the main artists
of the shared filter's songs (weight = square root of songs led, so overlap outranks one big artist's
sound-alikes). Score = sum over seeds of weight x match^curve; Safe <-> Adventurous sets depth/min match/
curve (`adventureSettings`, middle = plain sum); Popular <-> Underground scales by Last.fm listeners vs the
median (floored at 5,000). Excluded: playlist artists (features too), Last.fm collaboration entries that
include one, "Not for me" hides, and with "Never heard only" anyone in `listening_history.json`. Board
settings, hides and saves live in localStorage. Note `listening_history.json` is bundled into the build
when present, so a built `dist/` contains it.

**Streaming history.** `data/history/` holds Spotify's raw extended streaming history; it's gitignored
because every play includes an IP address. Only `history_summary.py` reads it, writing per-artist
plays, skips, hours (all time and the 12 months ending at the last play) and per-playlist-song totals to
`listening_history.json`, which is gitignored too (it's the user's whole listening record); the app must
work without it. A play under 30 seconds is a skip: its listening time adds to hours, but it does not add
to the play count. History dates and calendar years use the listener's local time zone (or `HISTORY_TZ`),
not Spotify's UTC timestamps. Plays match playlist songs like
duplicates do (Spotify ID, then title + main artist; duplicates share the first copy's key, local files
match under their `song_corrections.json` details); songs are keyed by Spotify ID or `local:<file title>`
(`song.historyKey`). `src/listening.js` is the lookup; the artist popup and the Artists tab's
"Most listened" (`src/pages/listened.js`, not filtered: it includes artists not on the playlist) use it.
Every History feature must hide cleanly when no history summary is loaded, because most users will not
have one. Every History feature must have a test for its calculation. Before building History UI, run the
summary and review its total hours, total plays and top 10 artists by hours.

**Styling.** All colors are tokens on `:root` with dark values under both `prefers-color-scheme` and
`[data-theme="dark"]`. Fonts: Permanent Marker (handwriting) and Barlow Condensed.

## Project rules

Product
- This is a tool for any playlist. The current playlist is
  sample data. Nothing is hardcoded to it, and every stat and
  sentence is computed from the loaded data.
- Visual theme is a burned CD with Sharpie handwriting.

Data
- Count duplicate songs once. Match songs by Spotify ID first,
  then by title plus main artist.
- Added dates come from the original playlist lookup, falling
  back to the current playlist's date.
- Release date means the song's original first release.

Genres
- Lookup order: my override file, then MusicBrainz, then
  Last.fm, then "No genre found".
- A song's genre comes from its main artist. Features don't
  count. An artist belongs to a genre only if they are the main
  artist on at least one song in it.
- Feature-only artists go under "Features only", which is an
  Artists tab view and not part of the shared filter.
- One fixed color per genre, used everywhere. The six largest
  get colors, the rest share one grey. Stacks keep the same
  order in every bar, largest on the bottom, grey on top.

Filters
- There is one shared filter state and one function that turns
  it into one filtered song list. Every section computes from
  that list. Never filter inside a section.
- Filter types are genre, decade, and added month. Multiple
  values of one type mean "any of these". Different types
  combine as "all of these".
- The chart for the thing being filtered never shrinks. It
  highlights the selection and dims the rest.
- Chip and chart counts come from running the shared filter,
  never from a separate tally.
- Show a "Filtered: X" tag with a clear button, a "No songs
  match" state with Clear all, and hide cards with no data.

Charts
- Counts sit directly on their bars. The whole column is the
  click target. Bar scale stays constant across a chart.

Workflow
- Build in stages and stop for review after each one.
- Stop for the user's review before committing any History work.
- Commit other work after each working stage.
- Run the filter tests before every commit. "I Smoked Away My
  Brain" (three artists, three genres) is a required test case.
- Run tests before every commit (`npm test`).
