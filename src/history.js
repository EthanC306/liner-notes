// What the History page needs from listening_history.json (history_summary.py). Pure, so
// each calculation is tested. The summary is personal and gitignored, so most people won't
// have one: every History feature checks hasHistory() and hides itself when it's false.

import { topArtists } from "./listening.js";

export const hasHistory = summary => Object.keys(summary?.artists || {}).length > 0;

// Both rankings always use the full summary, independently of the page range/filter.
export function thenVsNow(summary, playlist = { artists: [] }) {
  const names = new Set((playlist.artists || []).map(a => a.name));
  const ranked = recent => {
    const rows = topArtists(summary, { recent, onPlaylist: name => names.has(name) });
    const max = rows[0]?.hours || 1;
    return rows.map((row, i) => ({ ...row, rank: i + 1, width: row.hours / max * 100 }));
  };
  const all = ranked(false), recent = ranked(true);
  const connections = all.flatMap(a => {
    const b = recent.find(b => b.name === a.name);
    return b ? [{ name: a.name, from: a.rank, to: b.rank }] : [];
  });
  return { all, recent, connections };
}

// The time range switch: All time, Last 12 months, then each year in the history, newest
// first. Years are the summary's own, which are in the listener's local time zone.
export function rangeOptions(summary) {
  if (!hasHistory(summary)) return [];
  const years = Object.keys(summary.years || {}).sort().reverse();
  return [
    { id: "all", label: "All time" },
    { id: "recent", label: "Last 12 months" },
    ...years.map(y => ({ id: y, label: y })),
  ];
}

// A saved choice that no longer exists (an old year after a new export) falls back to All time.
export const validRange = (summary, id) => (rangeOptions(summary).some(o => o.id === id) ? id : "all");

export function ghosts(summary, playlist = { artists: [] }, range = "all") {
  if (!hasHistory(summary)) return { rows: [], headline: "" };
  const counts = new Map((playlist.artists || []).map(a => [a.name, a.songs?.length ?? a.count ?? 0]));
  const ranked = Object.entries(summary.artists).flatMap(([name, artist]) => {
    const detail = artist.ranges?.[range];
    return detail ? [{ name, ...detail, songCount: counts.get(name) || 0 }] : [];
  }).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  const rows = ranked.filter(a => a.hours >= 10 && a.songCount <= 1).slice(0, 10);
  if (!rows.length) return { rows, headline: "No ghosts in this time range." };
  const top = rows[0];
  const period = range === "all" ? "all time" : range === "recent" ? "the last 12 months" : range;
  const songs = `${top.songCount} ${top.songCount === 1 ? "song" : "songs"}`;
  const headline = ranked[0].name === top.name
    ? `Your most listened-to artist ${range === "all" ? "ever" : `in ${period}`} has ${songs} on your playlist.`
    : `${top.name} has ${top.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hours in ${period}, but ${songs} on your playlist.`;
  return { rows, headline };
}
