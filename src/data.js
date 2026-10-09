// Loads playlist_songs.json once and works out everything the pages share.
// ES modules run once, so every page that imports `playlist` gets the same object.
import data from "../playlist_songs.json";
import { groupOf } from "./genres.js";

// musicbrainz_artists.json is optional: it exists once musicbrainz_artists.py has run.
const mbFile = Object.values(import.meta.glob("../musicbrainz_artists.json", { eager: true, import: "default" }))[0] || {};
// musicbrainz_songs.json is optional too: the date each song first came out, from musicbrainz_songs.py.
const mbSongs = Object.values(import.meta.glob("../musicbrainz_songs.json", { eager: true, import: "default" }))[0] || {};
// artist_genres.json: genres you set by hand. lastfm_artists.json: genres from lastfm_genres.py.
const yourGenres = Object.values(import.meta.glob("../artist_genres.json", { eager: true, import: "default" }))[0] || {};
const lastfm = Object.values(import.meta.glob("../lastfm_artists.json", { eager: true, import: "default" }))[0] || {};

// An artist's genres and where they came from. Your file wins, then MusicBrainz's genres,
// then MusicBrainz's user tags, then Last.fm's tags. Tags are free text ("seen live",
// "american"), so only ones that name a genre count.
const genreLike = tags => (tags || []).filter(t => groupOf(t).id !== "other");
// Your file can say "emo", ["emo", "math rock"] or "emo, math rock"; any of them
// becomes a clean lowercase list.
const asGenreList = v => (Array.isArray(v) ? v : String(v ?? "").split(","))
  .map(g => String(g).trim().toLowerCase()).filter(Boolean);

function genreInfo(name, mb) {
  const yours = asGenreList(yourGenres[name]);
  if (yours.length) return { genres: yours, genreSource: "your genre file" };
  if (mb?.genres?.length) return { genres: mb.genres, genreSource: "MusicBrainz" };
  if (genreLike(mb?.tags).length) return { genres: genreLike(mb.tags), genreSource: "MusicBrainz tags" };
  if (lastfm[name]?.genres?.length) return { genres: lastfm[name].genres, genreSource: "Last.fm" };
  return { genres: [], genreSource: null };
}

// song_corrections.json: official details for local files, keyed "local:<file title>".
const corrections = Object.values(import.meta.glob("../song_corrections.json", { eager: true, import: "default" }))[0] || {};

// Musicbrainz details for an artist: by Spotify id, or by MusicBrainz id for artists not on Spotify.
const mbArtist = a => mbFile[a.id] || (a.musicbrainz_id && mbFile["mb:" + a.musicbrainz_id]) || null;

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

// "1969", "1969-04" or "1969-04-11", as { release_date, release_date_precision } like Spotify's albums.
const asRelease = date => ({ release_date: date, release_date_precision: date.length === 4 ? "year" : date.length === 7 ? "month" : "day" });

// The earlier of the album's date and MusicBrainz's first release, so a 2009 remaster
// on a 1973 compilation counts from 1969.
function firstReleased(s) {
  const album = s.album.release_date ? s.album : null;
  const mb = mbSongs[s.id]?.first_release_date;
  if (mb && (!album || mb.slice(0, 10) < album.release_date)) return { ...asRelease(mb), source: "musicbrainz" };
  return album ? { release_date: album.release_date, release_date_precision: album.release_date_precision, source: "spotify" } : null;
}

// Files downloaded from YouTube through Y2Mate keep the site's naming in the title.
function cleanRip(title) {
  const m = title.match(/^Y2Mate\.is - (.*?)-[A-Za-z0-9_-]{11}-\d+k-\d+$/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

const artistInfo = data.artists || {};

const songs = data.songs.map(original => {
  const rip = cleanRip(original.title);
  const s = corrected(original);
  const names = s.artists.map(a => a.name).filter(Boolean);
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
    released: firstReleased(s),
    releaseYear: firstReleased(s) ? Number(firstReleased(s).release_date.slice(0, 4)) : null,
    durationMs: s.duration_ms,
    explicit: s.explicit,
    addedAt: s.added_at ? new Date(s.added_at) : null,
    url: s.url,
    correction: s.correction || null,
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
          mb: mbArtist(a), ...genreInfo(a.name, mbArtist(a)), count: 0, albums: new Set(), songs: [] };
    byArtist.set(a.name, e);
  }
  e.count++;
  e.songs.push(song);
  if (song.album) e.albums.add(song.album);
}));
// Every genre of every artist on each song.
songs.forEach(s => { s.genres = [...new Set(s.artists.flatMap(n => byArtist.get(n)?.genres || []))]; });

const artists = [...byArtist.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

export const artistByName = name => byArtist.get(name);

// Artists, albums and counts for any set of songs: the whole playlist, or the songs
// a filter leaves. Artist entries keep their photo, genres and so on, but count and
// songs only cover the given songs.
export function summarize(list) {
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
  const artists = [...counted.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

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
    artists,
    albums,
    onceCount: artists.filter(a => a.count === 1).length,
    rips: list.filter(s => s.rip).length,
  };
}

export const playlist = {
  info: data.playlist,
  exportedAt: data.exported_at ? new Date(data.exported_at) : null,
  ...summarize(songs),
  artists,  // the full entries, with every song of each artist
};
