// Your listening history (the summary history_summary.py writes) as the pages show it.
// Pure: every function takes the summary, so tests pass a fixture. The summary is often
// missing (it's personal and gitignored); then everything here returns empty.

export const hasHistory = history => Object.keys(history?.artists || {}).length > 0;

// An artist's all-time totals, or zeros when the history has no plays by them. First and
// last played are local dates ("2019-02-12"), null when never played.
export function artistListening(history, name) {
  const a = history?.artists?.[name];
  return { plays: a?.plays || 0, hours: a?.hours || 0, skips: a?.skips || 0,
    first: a?.plays ? a.first || null : null, last: a?.plays ? a.last || null : null };
}

// A playlist song's totals (looked up by its historyKey, see build.js).
export function songListening(history, song) {
  const s = history?.songs?.[song.historyKey];
  return { plays: s?.plays || 0, hours: s?.hours || 0, skips: s?.skips || 0 };
}

// A play count as the song lists show it: "1 play", "1,204 plays", or "never played" (not 0).
export const playsText = plays => !plays ? "never played" : `${plays.toLocaleString()} ${plays === 1 ? "play" : "plays"}`;

// "Most played" sorts. Songs: plays, then playlist order. Artists: plays, then songs, then name.
export const bySongPlays = history => (a, b) =>
  songListening(history, b).plays - songListening(history, a).plays || a.n - b.n;
export const byArtistPlays = history => (a, b) =>
  artistListening(history, b.name).plays - artistListening(history, a.name).plays || b.count - a.count || a.name.localeCompare(b.name);

// The artists you listened to most, by hours: all time, or the last 12 months of the history.
// Includes artists who aren't on the playlist; onPlaylist says which are.
export function topArtists(history, { recent = false, limit = 10, onPlaylist = () => false } = {}) {
  const hoursKey = recent ? "recent_hours" : "hours";
  const playsKey = recent ? "recent_plays" : "plays";
  return Object.entries(history?.artists || {})
    .filter(([, a]) => a[hoursKey] > 0)
    .sort(([an, a], [bn, b]) => b[hoursKey] - a[hoursKey] || an.localeCompare(bn))
    .slice(0, limit)
    .map(([name, a]) => ({ name, hours: a[hoursKey], plays: a[playsKey], onPlaylist: onPlaylist(name) }));
}

// ---------- Dead weight (Breakdown) ----------
// Playlist songs you rarely play. Plays count only since each song was added (the summary's
// plays_since_added), and songs added in the last NEW_SONG_DAYS of the history are left out, so
// new songs aren't punished. Songs with no Spotify ID (local files, YouTube rips) are "can't tell".
export const NEW_SONG_DAYS = 60;
export const DEAD_WEIGHT_THRESHOLDS = [
  { id: "never", label: "Never played", max: 0 },
  { id: "under3", label: "Under 3 plays", max: 2 },
  { id: "under10", label: "Under 10 plays", max: 9 },
];

// Older summaries don't have plays since added; then Dead weight hides like any History feature.
export const hasDeadWeight = history => hasHistory(history)
  && Object.values(history.songs || {}).some(s => "plays_since_added" in s);

// songs: the shared filter's songs. Returns null without a (new enough) history.
export function deadWeight(history, songs, threshold = "never") {
  if (!hasDeadWeight(history)) return null;
  const end = history.to ? new Date(history.to) : new Date();
  const cutoff = new Date(end.getTime() - NEW_SONG_DAYS * 86_400_000);
  const cantTell = songs.filter(s => s.historyKey.startsWith("local:"));
  const matchable = songs.filter(s => !s.historyKey.startsWith("local:"));
  const isNew = s => s.addedAt && s.addedAt > cutoff;
  const rows = matchable.filter(s => !isNew(s)).map(song => {
    const heard = history.songs?.[song.historyKey];
    return { song, plays: heard?.plays_since_added || 0, everPlayed: (heard?.plays || 0) > 0, last: heard?.last || null };
  });
  const max = (DEAD_WEIGHT_THRESHOLDS.find(t => t.id === threshold) || DEAD_WEIGHT_THRESHOLDS[0]).max;
  return {
    cutoff,
    newCount: matchable.filter(isNew).length,
    thresholds: DEAD_WEIGHT_THRESHOLDS.map(t => ({ ...t, count: rows.filter(r => r.plays <= t.max).length })),
    // Fewest plays first; among equals, the longest on the playlist first.
    rows: rows.filter(r => r.plays <= max)
      .sort((a, b) => a.plays - b.plays || (a.song.addedAt || 0) - (b.song.addedAt || 0) || a.song.n - b.song.n),
    cantTell,
  };
}
