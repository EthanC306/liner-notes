// Turns the data files into the playlist every page uses. Pure: it takes the files'
// contents as arguments, so tests can build from a fixture and the app from the real files.
import { groupOf, songGroup } from "./genres.js";
import { decadeOf } from "./decades.js";
import { monthOf } from "./months.js";

// ---------- duplicates ----------
// "Don’t Kill My Vibe" and "Don't kill my vibe" are the same: no accents, case or punctuation.
export function normalize(text) {
  return String(text ?? "").replace(/['’`]/g, "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Two entries are the same song when they share a Spotify ID, or else the same title and
// main artist (the same song released twice, on an album and a single, has two IDs).
export const songKeys = s => [
  ...(s.id ? ["id:" + s.id] : []),
  "name:" + normalize(s.title) + "|" + normalize(s.artists?.[0]?.name),
];

// Each song once: the first entry in playlist order stays, with the earliest added date
// any copy of it has.
export function dedupeSongs(rawSongs) {
  const kept = [], byKey = new Map();
  for (const s of rawSongs) {
    const match = songKeys(s).map(k => byKey.get(k)).find(Boolean);
    if (match) {
      if (s.added_at && (!match.added_at || s.added_at < match.added_at)) match.added_at = s.added_at;
      songKeys(s).forEach(k => byKey.set(k, match));
      continue;
    }
    const copy = { ...s };
    kept.push(copy);
    songKeys(copy).forEach(k => byKey.set(k, copy));
  }
  return kept;
}

// ---------- genres ----------
// Tags are free text ("seen live", "american"), so only ones that name a genre count.
const genreLike = tags => (tags || []).filter(t => groupOf(t).id !== "other");
// Your file can say "emo", ["emo", "math rock"] or "emo, math rock"; any of them
// becomes a clean lowercase list.
export const asGenreList = v => (Array.isArray(v) ? v : String(v ?? "").split(","))
  .map(g => String(g).trim().toLowerCase()).filter(Boolean);

// An artist's genres and where they came from: your override file, then MusicBrainz's
// genres, then its user tags, then Last.fm, then nothing ("No genre found").
export function resolveGenres(name, { override, mb, lastfm }) {
  const yours = asGenreList(override);
  if (yours.length) return { genres: yours, genreSource: "your genre file" };
  if (mb?.genres?.length) return { genres: mb.genres, genreSource: "MusicBrainz" };
  if (genreLike(mb?.tags).length) return { genres: genreLike(mb.tags), genreSource: "MusicBrainz tags" };
  if (lastfm?.genres?.length) return { genres: lastfm.genres, genreSource: "Last.fm" };
  return { genres: [], genreSource: null };
}

// ---------- songs ----------
// "1969", "1969-04" or "1969-04-11", as { release_date, release_date_precision } like Spotify's albums.
const asRelease = date => ({ release_date: date, release_date_precision: date.length === 4 ? "year" : date.length === 7 ? "month" : "day" });

// Files downloaded from YouTube through Y2Mate keep the site's naming in the title.
function cleanRip(title) {
  const m = title.match(/^Y2Mate\.is - (.*?)-[A-Za-z0-9_-]{11}-\d+k-\d+$/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

/**
 * sources: {
 *   data:        playlist_songs.json
 *   mbArtists:   musicbrainz_artists.json  (optional)
 *   mbSongs:     musicbrainz_songs.json    (optional)
 *   overrides:   artist_genres.json        (optional)
 *   lastfm:      lastfm_artists.json       (optional)
 *   corrections: song_corrections.json     (optional)
 * }
 */
export function buildPlaylist({ data, mbArtists = {}, mbSongs = {}, overrides = {}, lastfm = {}, corrections = {} }) {
  // MusicBrainz details: by Spotify id, or by MusicBrainz id for artists not on Spotify.
  const mbArtist = a => mbArtists[a.id] || (a.musicbrainz_id && mbArtists["mb:" + a.musicbrainz_id]) || null;

  // A local file with a correction shows the official title, artists and album;
  // everything else (added date, position, length) stays as Spotify has it.
  function corrected(s) {
    const fix = s.is_local && corrections["local:" + s.title];
    if (!fix) return s;
    const album = fix.album || {};
    return {
      ...s,
      title: fix.title,
      artists: fix.artists,
      album: { ...s.album, name: album.name || "", type: album.type || null, release_date: album.release_date || null,
               release_date_precision: album.release_date_precision || null, image: album.image || null, url: album.url || null },
      correction: fix.source || null,
    };
  }

  // The earlier of the album's date and MusicBrainz's first release, so a 2009 remaster
  // on a 1973 compilation counts from 1969.
  function firstReleased(s) {
    const album = s.album.release_date ? s.album : null;
    const mb = mbSongs[s.id]?.first_release_date;
    if (mb && (!album || mb.slice(0, 10) < album.release_date)) return { ...asRelease(mb), source: "musicbrainz" };
    return album ? { release_date: album.release_date, release_date_precision: album.release_date_precision, source: "spotify" } : null;
  }

  const artistInfo = data.artists || {};
  const unique = dedupeSongs(data.songs);

  const songs = unique.map(original => {
    const rip = cleanRip(original.title);
    const s = corrected(original);
    const names = s.artists.map(a => a.name).filter(Boolean);
    const released = firstReleased(s);
    return {
      n: s.position,
      title: s.correction ? s.title : rip || s.title,
      rip: !!rip,
      local: s.is_local,
      artists: names,
      artistRefs: s.artists,
      artistText: names.join(", "),
      album: s.album.name,
      albumInfo: s.album,
      released,
      releaseYear: released ? Number(released.release_date.slice(0, 4)) : null,
      durationMs: s.duration_ms,
      explicit: s.explicit,
      addedAt: s.added_at ? new Date(s.added_at) : null,
      url: s.url,
      correction: s.correction || null,
      // How listening_history.json names this song: its Spotify ID, or its file title if local.
      historyKey: original.id || "local:" + original.title,
      raw: s,
    };
  });

  const byArtist = new Map();
  songs.forEach(song => song.artistRefs.forEach(a => {
    if (!a.name) return;
    let e = byArtist.get(a.name);
    if (!e) {
      const info = artistInfo[a.id] || {};
      e = { name: a.name, id: a.id, image: info.image || null, url: info.url || a.url || null,
            mb: mbArtist(a), ...resolveGenres(a.name, { override: overrides[a.name], mb: mbArtist(a), lastfm: lastfm[a.name] }),
            count: 0, albums: new Set(), songs: [] };
      byArtist.set(a.name, e);
    }
    e.count++;
    e.songs.push(song);
    if (song.album) e.albums.add(song.album);
  }));
  const artistByName = name => byArtist.get(name);

  // What the shared filter needs on every song: its genre group (from its main artist;
  // features don't count), the decade it first came out, and the month it was added.
  songs.forEach(s => {
    s.genres = [...new Set(s.artists.flatMap(n => byArtist.get(n)?.genres || []))];
    s.groupId = songGroup(s, artistByName).id;
    s.decade = decadeOf(s);
    s.month = monthOf(s);
  });

  const artists = [...byArtist.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Artists, albums and counts for any set of songs: the whole playlist, or the songs
  // a filter leaves. Artist entries keep their photo, genres and so on, but count and
  // songs only cover the given songs.
  function summarize(list) {
    const counted = new Map();
    list.forEach(song => song.artists.forEach(name => {
      const full = byArtist.get(name);
      if (!full) return;
      let e = counted.get(name);
      if (!e) { e = { ...full, count: 0, albums: new Set(), songs: [] }; counted.set(name, e); }
      e.count++;
      e.songs.push(song);
      if (song.album) e.albums.add(song.album);
    }));
    const listArtists = [...counted.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const byAlbum = new Map();
    list.forEach(s => {
      if (!s.album) return;
      const k = s.album + "\u0001" + (s.artists[0] || "");
      const e = byAlbum.get(k) || { album: s.album, artist: s.artists[0] || "", count: 0 };
      e.count++;
      byAlbum.set(k, e);
    });
    const albums = [...byAlbum.values()].sort((a, b) => b.count - a.count || a.album.localeCompare(b.album));

    return {
      songs: list,
      artists: listArtists,
      albums,
      onceCount: listArtists.filter(a => a.count === 1).length,
      rips: list.filter(s => s.rip).length,
    };
  }

  const playlist = {
    info: data.playlist,
    exportedAt: data.exported_at ? new Date(data.exported_at) : null,
    ...summarize(songs),
    artists,  // the full entries, with every song of each artist
    duplicatesRemoved: data.songs.length - songs.length,
  };
  return { playlist, artistByName, summarize };
}
