// Listening history lookups: the popup's plays and hours, and the top artists lists.
// The plays/skips counting itself is tested in tests/test_history_summary.py.
import { describe, it, expect } from "vitest";
import { hasHistory, artistListening, songListening, topArtists } from "../src/listening.js";
import { fmtHours } from "../src/util.js";
import { fixture, byTitle } from "./helpers.js";

const HISTORY = {
  from: "2019-02-12T13:17:42Z", to: "2026-10-08T23:52:51Z", recent_from: "2025-10-08T23:52:51Z",
  artists: {
    "A$AP Rocky": { hours: 40, plays: 700, skips: 50, recent_hours: 2, recent_plays: 30 },
    "guardin": { hours: 600, plays: 14000, skips: 1900, recent_hours: 15, recent_plays: 300 },
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
    expect(artistListening(HISTORY, "guardin")).toEqual({ plays: 14000, hours: 600, skips: 1900 });
    expect(artistListening(HISTORY, "Pinegrove")).toEqual({ plays: 0, hours: 0, skips: 0 });
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
