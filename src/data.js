// Loads the data files once and builds the playlist every page shares (see build.js).
// ES modules run once, so every page that imports `playlist` gets the same object.
import data from "../playlist_songs.json";
import { buildPlaylist } from "./build.js";

// The enrichment files are optional: each exists once its script has run.
const optional = files => Object.values(files)[0] || {};

const built = buildPlaylist({
  data,
  mbArtists: optional(import.meta.glob("../musicbrainz_artists.json", { eager: true, import: "default" })),
  mbSongs: optional(import.meta.glob("../musicbrainz_songs.json", { eager: true, import: "default" })),
  overrides: optional(import.meta.glob("../artist_genres.json", { eager: true, import: "default" })),
  lastfm: optional(import.meta.glob("../lastfm_artists.json", { eager: true, import: "default" })),
  corrections: optional(import.meta.glob("../song_corrections.json", { eager: true, import: "default" })),
});

export const playlist = built.playlist;
// Last.fm's similar artists and their top songs, for the Recommend page (lastfm_similar.py).
export const lastfmSimilar = optional(import.meta.glob("../lastfm_similar.json", { eager: true, import: "default" }));
// Your listening history summary (history_summary.py). Gitignored and personal, so it's
// often missing: then "Never heard only" and "Bring it back" are unavailable.
export const listeningHistory = optional(import.meta.glob("../listening_history.json", { eager: true, import: "default" }));
export const artistByName = built.artistByName;
export const summarize = built.summarize;
