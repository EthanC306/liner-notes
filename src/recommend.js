// Recommendations from Last.fm's similar artists (fetched by lastfm_similar.py).
//
// 1. Seeds: the main artists of the given songs (features don't count), weighted by the
//    square root of how many of those songs each one leads. A 27-song artist counts about
//    5x a one-song artist, not 27x, so one big artist's sound-alikes don't crowd out the
//    artists similar to many of yours. Pass the shared filter's songs, so picking a
//    genre recommends from that genre's artists.
// 2. Every seed's similar artists score weight x Last.fm's match (0-1); an artist similar
//    to several seeds adds them all up, which is what floats the overlaps to the top.
// 3. Anyone already on the playlist, as a main artist or a feature, is left out. So are
//    Last.fm's collaboration entries ("lil peep, lil tracy") that include one of them.
// 4. Each winner comes with its top songs. (They can't already be on the playlist: an
//    artist on it is never recommended.)
// 5. The reason names the seeds that contributed most.
import { normalize } from "./build.js";

const TRACKS_SHOWN = 3;
const REASONS_SHOWN = 3;

/**
 * songs:        the songs to take seeds from (usually the shared filter's songs)
 * allSongs:     every song on the playlist, for "already on the playlist"
 * lastfm:       { similar: { seed: [{ name, match, url }] }, top_tracks: { artist: [{ name, url }] } }
 * limit:        how many recommendations to return
 */
export function recommend({ songs, allSongs, lastfm, limit = 20 }) {
  const similar = lastfm?.similar || {};
  const topTracks = lastfm?.top_tracks || {};

  // 1. seeds and their weights
  const led = new Map();
  songs.forEach(s => {
    const main = s.artists[0];
    if (main) led.set(main, (led.get(main) || 0) + 1);
  });
  const weights = new Map([...led].map(([artist, n]) => [artist, Math.sqrt(n)]));

  // 3. everyone on the playlist, in any role
  const onPlaylist = new Set(allSongs.flatMap(s => s.artists).map(normalize));
  // A collaboration entry splits into its artists: "lil peep, lil tracy", "A & B", "A x B", "A feat. B".
  const parts = name => name.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b)\s*/i).map(normalize).filter(Boolean);
  const alreadyOn = name => onPlaylist.has(normalize(name)) || parts(name).some(p => onPlaylist.has(p));

  // 2. add up each candidate's score across seeds
  const candidates = new Map();
  for (const [seed, weight] of weights) {
    // Last.fm sometimes lists one artist twice for a seed (different capitalization):
    // each seed counts a candidate once, at its best match.
    const best = new Map();
    for (const match of similar[seed] || []) {
      const key = normalize(match.name);
      if (!key) continue;
      const seen = best.get(key);  // keep the first spelling, at the best score
      if (!seen) best.set(key, { ...match });
      else if (match.match > seen.match) seen.match = match.match;
    }
    for (const [key, match] of best) {
      if (alreadyOn(match.name) || !(match.match > 0)) continue;
      let c = candidates.get(key);
      if (!c) { c = { name: match.name, url: match.url || null, score: 0, from: [] }; candidates.set(key, c); }
      const points = weight * match.match;
      c.score += points;
      c.from.push({ seed, points });
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.from.length - a.from.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(c => {
      const because = c.from.sort((a, b) => b.points - a.points || a.seed.localeCompare(b.seed)).map(f => f.seed);
      // 4. their top songs
      const tracks = (topTracks[c.name] || []).slice(0, TRACKS_SHOWN);
      return { name: c.name, url: c.url, score: c.score, seeds: because.length, because: because.slice(0, REASONS_SHOWN), tracks };
    });
}

// "Modern Baseball", "Modern Baseball and Free Throw", "A, B and C"
export function reasonLine(names) {
  if (names.length <= 1) return names[0] || "";
  return names.slice(0, -1).join(", ") + " and " + names.at(-1);
}
