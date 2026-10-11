// Listening history lookups: the popup's plays and hours, and the top artists lists.
// The plays/skips counting itself is tested in tests/test_history_summary.py.
import { describe, it, expect } from "vitest";
import { hasHistory, artistListening, songListening, topArtists, playsText, bySongPlays, byArtistPlays, deadWeight, hasDeadWeight } from "../src/listening.js";
import { fmtHours } from "../src/util.js";
import { fixture, byTitle } from "./helpers.js";

const HISTORY = {
  from: "2019-02-12T13:17:42Z", to: "2026-10-08T23:52:51Z", recent_from: "2025-10-08T23:52:51Z",
  artists: {
    "A$AP Rocky": { hours: 40, plays: 700, skips: 50, recent_hours: 2, recent_plays: 30 },
    "guardin": { hours: 600, plays: 14000, skips: 1900, recent_hours: 15, recent_plays: 300, first: "2020-05-01", last: "2026-10-08" },
    "Powfu": { hours: 90, plays: 2000, skips: 300, recent_hours: 0, recent_plays: 0 },  // not on the playlist
    "Pierce The Veil": { hours: 65, plays: 1100, skips: 250, recent_hours: 33, recent_plays: 600 },
  },
  songs: {
    smoked: { hours: 3.5, plays: 60, skips: 4 },
    "local:Y2Mate.is - guardin - fake (prod. by canis major)-hgLryZHnh-w-160k-1654285075557": { hours: 1, plays: 20, skips: 0 },
  },
};

const { playlist } = fixture();
const onPlaylist = name => playlist.artists.some(a => a.name === name);

describe("listening history lookups", () => {
  it("knows when there's no history", () => {
    expect(hasHistory({})).toBe(false);
    expect(hasHistory(HISTORY)).toBe(true);
  });

  it("gives an artist's plays and hours, zero when they were never played", () => {
    expect(artistListening(HISTORY, "guardin")).toEqual({ plays: 14000, hours: 600, skips: 1900, first: "2020-05-01", last: "2026-10-08" });
    expect(artistListening(HISTORY, "Pinegrove")).toEqual({ plays: 0, hours: 0, skips: 0, first: null, last: null });
    expect(artistListening({}, "guardin").plays).toBe(0);
  });

  it("finds a song by its Spotify ID", () => {
    const song = byTitle(playlist.songs, "I Smoked Away My Brain");
    expect(songListening(HISTORY, song)).toEqual({ plays: 60, hours: 3.5, skips: 4 });
  });

  it("finds a local file by its file title, even though the app shows a cleaned-up title", () => {
    const song = playlist.songs.find(s => s.local);
    expect(song.title).not.toMatch(/^Y2Mate/);
    expect(songListening(HISTORY, song).plays).toBe(20);
  });

  it("gives zeros for a song never played", () => {
    expect(songListening(HISTORY, byTitle(playlist.songs, "Need")).plays).toBe(0);
  });
});

describe("play counts in song lists", () => {
  it("says never played instead of 0, and counts singular and plural", () => {
    expect(playsText(0)).toBe("never played");
    expect(playsText(undefined)).toBe("never played");
    expect(playsText(1)).toBe("1 play");
    expect(playsText(1204)).toBe("1,204 plays");
  });

  it("gives no first or last played date to an artist with only skips", () => {
    const skipsOnly = { artists: { X: { hours: .01, plays: 0, skips: 3, first: "2024-01-01", last: "2024-02-01" } } };
    expect(artistListening(skipsOnly, "X")).toMatchObject({ first: null, last: null });
  });

  it("sorts songs by all-time plays, then playlist order, with never-played songs last", () => {
    const smoked = byTitle(playlist.songs, "I Smoked Away My Brain");
    const local = playlist.songs.find(s => s.local);
    const sorted = [...playlist.songs].sort(bySongPlays(HISTORY));
    expect(sorted.slice(0, 2)).toEqual([smoked, local]);
    const rest = sorted.slice(2);
    expect(rest.every(s => songListening(HISTORY, s).plays === 0)).toBe(true);
    expect(rest.map(s => s.n)).toEqual([...rest].map(s => s.n).sort((a, b) => a - b));
  });

  it("sorts artists by all-time plays, then songs on the playlist, then name", () => {
    const artists = [
      { name: "Pinegrove", count: 1 }, { name: "Aaa", count: 1 }, { name: "Zed", count: 3 },
      { name: "Pierce The Veil", count: 1 }, { name: "guardin", count: 1 },
    ];
    expect([...artists].sort(byArtistPlays(HISTORY)).map(a => a.name)).toEqual(["guardin", "Pierce The Veil", "Zed", "Aaa", "Pinegrove"]);
  });
});

describe("top artists", () => {
  it("ranks all time by hours and includes artists not on the playlist", () => {
    const top = topArtists(HISTORY, { onPlaylist });
    expect(top.map(a => a.name)).toEqual(["guardin", "Powfu", "Pierce The Veil", "A$AP Rocky"]);
    expect(top.find(a => a.name === "Powfu").onPlaylist).toBe(false);
    expect(top.find(a => a.name === "Pierce The Veil").onPlaylist).toBe(true);
  });

  it("ranks the last 12 months by their own hours and leaves out artists with none", () => {
    const top = topArtists(HISTORY, { recent: true });
    expect(top.map(a => [a.name, a.hours, a.plays])).toEqual([
      ["Pierce The Veil", 33, 600], ["guardin", 15, 300], ["A$AP Rocky", 2, 30],
    ]);
  });

  it("keeps to the limit", () => {
    expect(topArtists(HISTORY, { limit: 2 })).toHaveLength(2);
  });

  it("is empty without a history", () => {
    expect(topArtists({})).toEqual([]);
  });
});

describe("hours format", () => {
  it("shows minutes under an hour, one decimal under ten, whole hours above", () => {
    expect(fmtHours(0.25)).toBe("15 min");
    expect(fmtHours(3.24)).toBe("3.2 hr");
    expect(fmtHours(623.6)).toBe("624 hr");
  });
});

describe("dead weight", () => {
  const day = d => new Date(`${d}T12:00:00Z`);
  const song = (n, key, added) => ({ n, title: `Song ${n}`, artists: ["A"], historyKey: key, addedAt: added ? day(added) : null });
  const songs = [
    song(1, "never", "2024-01-01"),          // never played
    song(2, "before", "2024-06-01"),         // played only before it was added
    song(3, "two", "2023-01-01"),            // 2 plays since added
    song(4, "nine", "2022-01-01"),           // 9
    song(5, "ten", "2022-01-01"),            // 10: not dead weight
    song(6, "new", "2026-09-01"),            // added within 60 days of the history's end
    song(7, "edge", "2026-08-09"),           // exactly 60 days before the end: kept
    song(8, "local:Some rip.mp3", "2023-01-01"),
    song(9, "older", "2020-01-01"),          // never played, on the playlist longer than song 1
  ];
  const history = { to: "2026-10-08T12:00:00Z", artists: { A: { plays: 1 } }, songs: {
    before: { plays: 30, plays_since_added: 0, last: "2024-05-01" },
    two: { plays: 2, plays_since_added: 2, last: "2025-03-04" },
    nine: { plays: 9, plays_since_added: 9, last: "2025-01-01" },
    ten: { plays: 10, plays_since_added: 10, last: "2025-01-01" },
    new: { plays: 0, plays_since_added: 0, last: null },
  } };

  it("counts each threshold, including the lower ones", () => {
    const dw = deadWeight(history, songs);
    expect(dw.thresholds.map(t => [t.id, t.count])).toEqual([["never", 4], ["under3", 5], ["under10", 6]]);
  });

  it("lists fewest plays first, then the songs on the playlist longest", () => {
    expect(deadWeight(history, songs, "never").rows.map(r => r.song.n)).toEqual([9, 1, 2, 7]);
    expect(deadWeight(history, songs, "under10").rows.map(r => [r.song.n, r.plays])).toEqual([[9, 0], [1, 0], [2, 0], [7, 0], [3, 2], [4, 9]]);
  });

  it("uses plays since added, and keeps lifetime plays and last played for context", () => {
    const before = deadWeight(history, songs, "never").rows.find(r => r.song.n === 2);
    expect(before).toMatchObject({ plays: 0, everPlayed: true, last: "2024-05-01" });
    expect(deadWeight(history, songs, "never").rows.find(r => r.song.n === 1)).toMatchObject({ everPlayed: false, last: null });
  });

  it("leaves out songs added in the 60 days before the history ends", () => {
    const dw = deadWeight(history, songs, "under10");
    expect(dw.rows.some(r => r.song.n === 6)).toBe(false);
    expect(dw.rows.some(r => r.song.n === 7)).toBe(true);
    expect(dw.newCount).toBe(1);
    expect(dw.cutoff.toISOString()).toBe("2026-08-09T12:00:00.000Z");
  });

  it("lists songs with no Spotify ID separately as can't tell", () => {
    const dw = deadWeight(history, songs, "under10");
    expect(dw.cantTell.map(s => s.n)).toEqual([8]);
    expect(dw.rows.some(r => r.song.n === 8)).toBe(false);
  });

  it("only counts the songs it's given (the shared filter's)", () => {
    const dw = deadWeight(history, songs.filter(s => s.n <= 3));
    expect(dw.thresholds.map(t => t.count)).toEqual([2, 3, 3]);
  });

  it("hides without a history, or with a summary from before plays since added", () => {
    expect(deadWeight({}, songs)).toBeNull();
    expect(hasDeadWeight(HISTORY)).toBe(false);
    expect(hasDeadWeight(history)).toBe(true);
  });
});
