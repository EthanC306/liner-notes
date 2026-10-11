// Recommendations from Last.fm's similar artists (fetched by lastfm_similar.py), driven
// by the Recommend page's mixing board.
//
// 1. Seeds: either the 1-5 artists picked under "Sounds like" (weighted equally: you
//    chose them), or the main artists of the given songs (features don't count), each
//    weighted by the square root of how many of those songs it leads. A 27-song artist
//    counts about 5x a one-song artist, not 27x, so one big artist's sound-alikes don't
//    crowd out the artists similar to many of yours. Pass the shared filter's songs, so
//    picking a genre recommends from that genre's artists.
// 2. Every seed's similar artists score weight x match^curve, summed over seeds, so an
//    artist similar to several seeds floats up. The Safe <-> Adventurous fader decides how
//    far down each seed's list to look, the lowest match that counts, and the curve
//    (Safe favours very close matches; Adventurous flattens it to cast a wider net).
// 3. The Popular <-> Underground fader scales each score by the artist's Last.fm
//    listeners against the candidates' median.
// 4. Left out: anyone on the playlist (main artist or feature), Last.fm collaboration
//    entries that include one of them ("lil peep, lil tracy"), anyone hidden with
//    "Not for me", and, with "Never heard only", anyone in the listening history.
// 5. Each winner comes with its top songs, and a reason naming the seeds that contributed
//    most. Versions of one song ("October", "october (feat. lil peep)", "October Ft. Lil
//    Peep") count once; with minSongs, artists without that many different songs are skipped.
import { normalize } from "./build.js";

const TRACKS_SHOWN = 3;
const REASONS_SHOWN = 3;

// A song's title without the parts that make versions of it look different: case,
// punctuation, "(Live)", "[Remastered 2011]", " - Single Version", "feat. X" / "Ft. X".
export function songBase(title) {
  return normalize(String(title ?? "")
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+(?:feat|ft|featuring)\.?\s.*$/i, ""));
}

// Top songs with versions of the same song kept once (the first, most played, spelling).
export function distinctSongs(tracks) {
  const seen = new Set();
  return (tracks || []).filter(t => {
    const key = songBase(t.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The Safe <-> Adventurous fader (0 = safe, 0.5 = middle, 1 = adventurous).
// At the middle: look 15 deep, count matches from 0.2, plain sum (curve 1).
export function adventureSettings(a) {
  const x = Math.min(1, Math.max(0, a));
  return {
    depth: Math.round(x <= 0.5 ? 6 + 18 * x : 15 + 30 * (x - 0.5)),       // 6 -> 15 -> 30
    minMatch: x <= 0.5 ? 0.5 - 0.6 * x : 0.2 - 0.3 * (x - 0.5),           // 0.5 -> 0.2 -> 0.05
    curve: 2 ** (1 - 2 * x),                                              // 2 -> 1 -> 0.5
  };
}

/**
 * songs:       the songs to take seeds from (usually the shared filter's songs)
 * allSongs:    every song on the playlist, for "already on the playlist"
 * lastfm:      { similar: { seed: [{ name, match, url }] }, top_tracks: { artist: [...] },
 *                info: { artist: { listeners } } }
 * seeds:       artist names picked under "Sounds like" (used instead of `songs` when given)
 * adventure:   Safe (0) <-> Adventurous (1); 0.5 is the middle
 * popularity:  Popular (-1) <-> Underground (1); 0 ignores listener counts
 * heard:       names to leave out for "Never heard only" (null when the switch is off)
 * hidden:      names hidden with "Not for me"
 * minSongs:    skip artists with fewer different top songs than this
 * limit:       how many recommendations to return
 */
export function recommend({ songs, allSongs, lastfm, seeds = null, bridges = null, adventure = 0.5, popularity = 0, heard = null, hidden = [], minSongs = 0, limit = 20 }) {
  const similar = lastfm?.similar || {};
  const topTracks = lastfm?.top_tracks || {};
  const info = lastfm?.info || {};
  const { depth, minMatch, curve } = adventureSettings(adventure);

  // 1. seeds and their weights
  let weights;
  if (seeds?.length) {
    weights = new Map(seeds.map(name => [name, 1]));
  } else {
    const led = new Map();
    songs.forEach(s => {
      const main = s.artists[0];
      if (main) led.set(main, (led.get(main) || 0) + 1);
    });
    weights = new Map([...led].map(([artist, n]) => [artist, Math.sqrt(n)]));
  }
  // Bridges: your own artists who are similar to a seed, borrowed at reduced weight when
  // the seeds alone don't find enough (see recommendAtLeast). `via` names the seed.
  const via = new Map();
  for (const b of bridges || []) {
    if (weights.has(b.name)) continue;
    weights.set(b.name, b.weight);
    via.set(b.name, { name: b.via, kind: b.kind });
  }

  // 4. who's left out
  const onPlaylist = new Set(allSongs.flatMap(s => s.artists).map(normalize));
  // A collaboration entry splits into its artists: "lil peep, lil tracy", "A & B", "A x B", "A feat. B".
  const parts = name => name.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b)\s*/i).map(normalize).filter(Boolean);
  const alreadyOn = name => onPlaylist.has(normalize(name)) || parts(name).some(p => onPlaylist.has(p));
  const heardSet = heard ? new Set([...heard].map(normalize)) : null;
  const hiddenSet = new Set([...hidden].map(normalize));
  const songsOf = name => distinctSongs(topTracks[name]);
  const leftOut = name => alreadyOn(name) || hiddenSet.has(normalize(name)) || Boolean(heardSet?.has(normalize(name)))
    || songsOf(name).length < minSongs;

  // 2. add up each candidate's score across seeds
  const candidates = new Map();
  for (const [seed, weight] of weights) {
    // Last.fm sometimes lists one artist twice for a seed (different capitalization):
    // each seed counts a candidate once, at its best match.
    const best = new Map();
    for (const match of (similar[seed] || []).slice(0, depth)) {
      const key = normalize(match.name);
      if (!key) continue;
      const seen = best.get(key);  // keep the first spelling, at the best score
      if (!seen) best.set(key, { ...match });
      else if (match.match > seen.match) seen.match = match.match;
    }
    for (const [key, match] of best) {
      if (!(match.match >= minMatch) || leftOut(match.name)) continue;
      let c = candidates.get(key);
      if (!c) { c = { name: match.name, url: match.url || null, score: 0, from: [] }; candidates.set(key, c); }
      const points = weight * match.match ** curve;
      c.score += points;
      c.from.push({ seed, points });
    }
  }

  // 3. popular <-> underground: listeners against the candidates' median
  const listenersOf = name => info[name]?.listeners || 0;
  const known = [...candidates.values()].map(c => listenersOf(c.name)).filter(n => n > 0).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 0;
  for (const c of candidates.values()) {
    c.match = c.score;  // similarity alone, for the match-strength bar
    const n = listenersOf(c.name);
    // Counts under 5,000 listeners are treated as 5,000, so a near-unknown artist similar
    // to one of yours can't win on obscurity alone (at most about a 3x lift).
    if (popularity && median && n > 0) c.score *= (Math.max(n, 5000) / median) ** (-0.3 * popularity);
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.from.length - a.from.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(c => {
      const because = c.from.sort((a, b) => b.points - a.points || a.seed.localeCompare(b.seed)).map(f => f.seed);
      const bridgedVia = because.length && via.has(because[0]) ? via.get(because[0]) : null;
      return {
        via: bridgedVia?.name || null,          // the seed a borrowed artist stands in for
        viaKind: bridgedVia?.kind || null,      // "similar" (Last.fm says so) or "genre" (same genre)
        name: c.name, url: c.url, score: c.score, match: c.match, listeners: listenersOf(c.name) || null,
        seeds: because.length, because: because.slice(0, REASONS_SHOWN),
        tracks: songsOf(c.name).slice(0, TRACKS_SHOWN),
      };
    });
}

// The page's guarantee: at least `minArtists` recommendations. When the board's settings
// find fewer, the Safe <-> Adventurous setting is widened step by step (toward
// Adventurous) until there are enough or it's all the way open. Returns the results and
// the adventure setting that was used.
//
// If that's still not enough, it reaches through your own artists: the playlist artists
// who are similar to a seed (Lil Peep -> EKKSTACY) lend their similar artists, weighted by
// how similar they are to the seed, at half strength. Those results say who they came
// through ("via").
export function recommendAtLeast(options, minArtists) {
  const start = options.adventure ?? 0.5;
  let adventure = start;
  let recs = recommend({ ...options, adventure });
  while (recs.length < minArtists && adventure < 1) {
    adventure = Math.min(1, Math.round((adventure + 0.1) * 10) / 10);
    recs = recommend({ ...options, adventure });
  }
  let bridged = false;
  // First through your artists similar to the seeds; then, if still short, also through
  // your artists in the same genre as the seeds.
  for (const reach of [bridgesFor, genreMatesFor]) {
    if (recs.length >= minArtists) break;
    const bridges = [...(bridged ? bridgesFor(options) : []), ...reach(options)];
    if (!bridges.length) continue;
    const more = recommend({ ...options, adventure, bridges });
    if (more.length > recs.length) { recs = more; bridged = true; }
  }
  const reachedBy = new Set(recs.map(r => r.viaKind).filter(Boolean));
  return { recs, adventure, widened: adventure !== start || bridged, bridged, reachedBy };
}

// The playlist's other main artists in the seeds' genre groups, as extra seeds at a
// quarter strength. Their results say which seed they stand in for.
function genreMatesFor({ songs, allSongs, lastfm, seeds }) {
  const similar = lastfm?.similar || {};
  const seedNames = new Set(seeds?.length ? seeds : songs.map(s => s.artists[0]).filter(Boolean));
  const groupOfArtist = new Map();
  allSongs.forEach(s => { if (s.artists[0] && s.groupId && !groupOfArtist.has(s.artists[0])) groupOfArtist.set(s.artists[0], s.groupId); });
  const out = [];
  for (const [artist, group] of groupOfArtist) {
    if (seedNames.has(artist) || !similar[artist]?.length || group === "none") continue;
    const seed = [...seedNames].find(n => groupOfArtist.get(n) === group);
    if (seed) out.push({ name: artist, weight: 0.25, via: seed, kind: "genre" });
  }
  return out;
}

// The playlist artists most similar to the seeds, as extra seeds at half strength.
function bridgesFor({ songs, allSongs, lastfm, seeds }) {
  const similar = lastfm?.similar || {};
  const seedNames = seeds?.length ? seeds : [...new Set(songs.map(s => s.artists[0]).filter(Boolean))];
  const mains = new Map(allSongs.filter(s => s.artists[0]).map(s => [normalize(s.artists[0]), s.artists[0]]));
  const out = new Map();
  for (const seed of seedNames) {
    for (const m of similar[seed] || []) {
      const own = mains.get(normalize(m.name));
      if (!own || own === seed || !similar[own]?.length) continue;
      const weight = 0.5 * m.match;
      if (!out.has(own) || out.get(own).weight < weight) out.set(own, { name: own, weight, via: seed, kind: "similar" });
    }
  }
  return [...out.values()];
}

// "Modern Baseball", "Modern Baseball and Free Throw", "A, B and C"
export function reasonLine(names) {
  if (names.length <= 1) return names[0] || "";
  return names.slice(0, -1).join(", ") + " and " + names.at(-1);
}
