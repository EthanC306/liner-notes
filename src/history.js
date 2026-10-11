// What the History page needs from listening_history.json (history_summary.py). Pure, so
// each calculation is tested. The summary is personal and gitignored, so most people won't
// have one: every History feature checks hasHistory() and hides itself when it's false.

import { topArtists } from "./listening.js";
import { spotifySearch } from "./util.js";

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

// Rank colors once across the whole history; keep that same bottom-to-top order every year.
export function eras(summary) {
  if (!hasHistory(summary)) return { legend: [], years: [] };
  const artists = Object.entries(summary.artists).sort(([an, a], [bn, b]) =>
    (b.hours ?? b.ranges?.all?.hours ?? 0) - (a.hours ?? a.ranges?.all?.hours ?? 0) || an.localeCompare(bn));
  const legend = artists.slice(0, 6).map(([name], i) => ({ name, color: `var(--genre-${i + 1})` }));
  const years = Object.entries(summary.years || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([year, total]) => {
    const ranked = artists.map(([name, a]) => ({ name, hours: a.ranges?.[year]?.hours || 0 }))
      .filter(a => a.hours > 0).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
    const sum = ranked.reduce((n, a) => n + a.hours, 0);
    const top = new Map(ranked.map(a => [a.name, a.hours]));
    const segments = legend.map(a => ({ ...a, hours: top.get(a.name) || 0 }));
    const names = new Set(legend.map(a => a.name));
    segments.push({ name: "Everyone else", color: "var(--genre-rest)", hours: ranked.filter(a => !names.has(a.name)).reduce((n, a) => n + a.hours, 0) });
    return { year, hours: total.hours || 0, leader: ranked[0] || null,
      segments: segments.filter(a => a.hours > 0).map(a => ({ ...a, percent: sum ? a.hours / sum * 100 : 0 })) };
  });
  const max = Math.max(0, ...years.map(y => y.hours));
  return { legend: [...legend, { name: "Everyone else", color: "var(--genre-rest)" }],
    years: years.map(y => ({ ...y, height: max ? y.hours / max * 100 : 0 })) };
}

// Hours, plays and top songs follow the selected range; peak year and last played always
// describe the whole history. Bars: hours against the top ghost, song plays within each artist.
// Photo and link: the current playlist's artist, then the old playlist's (`oldArtists`, keyed
// by Spotify id like an export's artists), then a Spotify search with no photo.
export function ghosts(summary, playlist = { artists: [] }, range = "all", oldArtists = {}) {
  if (!hasHistory(summary)) return { rows: [], headline: "" };
  const onPlaylist = new Map((playlist.artists || []).map(a => [a.name, a]));
  const old = new Map(Object.values(oldArtists || {}).map(a => [a.name, a]));
  const ranked = Object.entries(summary.artists).flatMap(([name, artist]) => {
    const detail = artist.ranges?.[range];
    if (!detail) return [];
    const all = artist.ranges?.all || {}, entry = onPlaylist.get(name);
    return [{ name, ...detail,
      peak_year: all.peak_year ?? detail.peak_year ?? null, last: all.last ?? artist.last ?? detail.last ?? null,
      songCount: entry ? entry.songs?.length ?? entry.count ?? 0 : 0,
      image: entry?.image || old.get(name)?.image || null, url: entry?.url || old.get(name)?.url || spotifySearch(name) }];
  }).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  const ghostRows = ranked.filter(a => a.hours >= 10 && a.songCount <= 1).slice(0, 10);
  const rows = ghostRows.map((a, i) => {
    const songs = a.top_songs || [], most = Math.max(0, ...songs.map(s => s.plays));
    return { ...a, rank: i + 1, width: a.hours / ghostRows[0].hours * 100,
      top_songs: songs.map(s => ({ ...s, width: most ? s.plays / most * 100 : 0 })) };
  });
  if (!rows.length) return { rows, headline: "No ghosts in this time range." };
  const top = rows[0];
  const period = range === "all" ? "all time" : range === "recent" ? "the last 12 months" : range;
  const songs = `${top.songCount} ${top.songCount === 1 ? "song" : "songs"}`;
  const headline = ranked[0].name === top.name
    ? `Your most listened-to artist ${range === "all" ? "ever" : `in ${period}`} has ${songs} on your playlist.`
    : `${top.name} has ${top.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hours in ${period}, but ${songs} on your playlist.`;
  return { rows, headline };
}
