// Your listening history (the summary history_summary.py writes) as the pages show it.
// Pure: every function takes the summary, so tests pass a fixture. The summary is often
// missing (it's personal and gitignored); then everything here returns empty.

export const hasHistory = history => Object.keys(history?.artists || {}).length > 0;

// An artist's totals, or zeros when the history has no plays by them.
export function artistListening(history, name) {
  const a = history?.artists?.[name];
  return { plays: a?.plays || 0, hours: a?.hours || 0, skips: a?.skips || 0 };
}

// A playlist song's totals (looked up by its historyKey, see build.js).
export function songListening(history, song) {
  const s = history?.songs?.[song.historyKey];
  return { plays: s?.plays || 0, hours: s?.hours || 0, skips: s?.skips || 0 };
}

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
