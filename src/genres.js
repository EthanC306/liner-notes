// Sorts MusicBrainz's very specific genres ("midwest emo", "easycore", "cloud rap")
// into a few broad groups. Rules are checked in order and the first match wins,
// so "emo rap" lands in Emo & cloud rap, and "metalcore" in Metal before
// Emo & post-hardcore sees it.
export const GROUPS = [
  // Ids stay the same when a group is renamed, so filters saved in the browser keep working.
  { id: "emo", name: "Midwest emo", test: g => /\bemo\b|emocore|midwest emo/.test(g) && !/rap/.test(g) },
  { id: "emorap", name: "Emo & cloud rap", test: g => /emo rap|cloud rap|sad rap/.test(g) },
  { id: "metal", name: "Metal", test: g => /metal|deathcore|djent|grindcore/.test(g) },
  { id: "heavy", name: "Emo & post-hardcore", test: g => /hardcore(?! hip hop)|screamo|easycore|core$/.test(g) },
  { id: "punk", name: "Pop punk & punk", test: g => /punk|skate/.test(g) },
  { id: "rap", name: "Rap & hip hop", test: g => /hip hop|rap|trap|drill|boom bap|horrorcore|grime/.test(g) },
  { id: "rnb", name: "R&B & soul", test: g => /r&b|soul|funk/.test(g) },
  { id: "indie", name: "Indie & alternative", test: g => /indie|alternative|lo-fi|shoegaze|dream pop|math rock|experimental|slowcore|bedroom/.test(g) },
  { id: "rock", name: "Rock", test: g => /rock|grunge|new wave|britpop/.test(g) },
  { id: "pop", name: "Pop & electronic", test: g => /pop|electronic|dance|house|bass|synth|edm|disco|techno|step/.test(g) },
  { id: "other", name: "Other", test: () => true },
];
export const NO_GENRE = { id: "none", name: "No genre found" };
// Artists tab only: artists who are never the main artist on a song.
export const FEATURES_ONLY = { id: "features", name: "Features only" };

// The order genre groups are listed in everywhere: biggest first, then Other,
// Features only and No genre found. Give it groups with a count.
const LAST = { other: 1, features: 2, none: 3 };
export const byCountOtherLast = (a, b) => (LAST[a.id] || 0) - (LAST[b.id] || 0) || b.count - a.count;

const groupCache = new Map();
export function groupOf(genre) {
  if (!groupCache.has(genre)) groupCache.set(genre, GROUPS.find(gr => gr.test(genre.toLowerCase())));
  return groupCache.get(genre);
}

// An artist's genres, already picked from your file, MusicBrainz or Last.fm in data.js.
export const artistGenres = artist => artist?.genres || [];

// An artist's own group, from their top genre. The Artists tab filters on this.
export const artistGroup = artist => (artist?.genres?.length ? groupOf(artist.genres[0]) : NO_GENRE);

// Song pages (Overview, Breakdown) give each song exactly one group, from its main
// artist; featured artists don't count. A song's group comes from its main artist's top genre;
// if the main artist has none, the other artists on the song are tried.
export function songGroup(song, artistByName) {
  for (const name of song.artists) {
    const genres = artistGenres(artistByName(name));
    if (genres.length) return groupOf(genres[0]);
  }
  return NO_GENRE;
}

// The Breakdown genre search: specific genres (counts: Map genre -> songs) whose name contains
// the query, picked ones left out. Names starting with it come first, then by song count.
export function searchGenres(counts, query, picked = new Set(), limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return [...counts].filter(([g]) => g.toLowerCase().includes(q) && !picked.has(g))
    .sort(([a, an], [b, bn]) => b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q) || bn - an || a.localeCompare(b))
    .slice(0, limit);
}
