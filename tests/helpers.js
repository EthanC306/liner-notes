// Builds the playlist from the fixture in tests/fixtures, the same way data.js builds it
// from the real files.
import { readFileSync, existsSync } from "node:fs";
import { buildPlaylist } from "../src/build.js";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const readIfThere = path => (existsSync(new URL(path, import.meta.url)) ? read(path) : {});

export function fixture() {
  return buildPlaylist({
    data: read("./fixtures/playlist.json"),
    mbArtists: read("./fixtures/musicbrainz_artists.json"),
    mbSongs: read("./fixtures/musicbrainz_songs.json"),
    overrides: read("./fixtures/artist_genres.json"),
    lastfm: read("./fixtures/lastfm_artists.json"),
  });
}

// The real playlist in the repo root, or null if it isn't there.
export function realPlaylist() {
  if (!existsSync(new URL("../playlist_songs.json", import.meta.url))) return null;
  return buildPlaylist({
    data: read("../playlist_songs.json"),
    mbArtists: readIfThere("../musicbrainz_artists.json"),
    mbSongs: readIfThere("../musicbrainz_songs.json"),
    overrides: readIfThere("../artist_genres.json"),
    lastfm: readIfThere("../lastfm_artists.json"),
    corrections: readIfThere("../song_corrections.json"),
  });
}

export const byTitle = (songs, start) => songs.find(s => s.title.startsWith(start));
