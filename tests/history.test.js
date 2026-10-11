// @vitest-environment jsdom
// The History page's calculations (src/history.js).
import { describe, it, expect, vi } from "vitest";
import { hasHistory, rangeOptions, validRange, thenVsNow, ghosts } from "../src/history.js";
import { render } from "../src/pages/history.js";
import { openArtist } from "../src/artist-sheet.js";

vi.mock("../src/artist-sheet.js", () => ({ openArtist: vi.fn() }));

const summary = {
  timezone: "America/New_York",
  years: { "2019": { hours: 1, plays: 2 }, "2024": { hours: 3, plays: 4 }, "2026": { hours: 5, plays: 6 } },
  artists: { guardin: { hours: 9, plays: 10 } },
};

describe("hasHistory", () => {
  it("is false without a summary, so every History feature hides itself", () => {
    expect(hasHistory(undefined)).toBe(false);
    expect(hasHistory({})).toBe(false);
    expect(hasHistory({ artists: {} })).toBe(false);
  });

  it("is true once the summary has artists", () => {
    expect(hasHistory(summary)).toBe(true);
  });

  it("leaves no page UI behind when rendered without a summary", () => {
    const root = document.createElement("div");
    root.innerHTML = "stale content";
    render(root, undefined, {});
    expect(root.innerHTML).toBe("");
  });
});

describe("Then vs now", () => {
  const history = { artists: {
    A: { hours: 100, plays: 50, recent_hours: 10, recent_plays: 3 },
    B: { hours: 50, plays: 20, recent_hours: 40, recent_plays: 9 },
    C: { hours: 20, plays: 10, recent_hours: 0, recent_plays: 0 },
  } };
  const playlist = { artists: [{ name: "A" }] };

  it("ranks each range by its own hours and uses the corresponding plays and scale", () => {
    const result = thenVsNow(history, playlist);
    expect(result.all.map(a => [a.name, a.rank, a.hours, a.plays, a.width, a.onPlaylist])).toEqual([
      ["A", 1, 100, 50, 100, true], ["B", 2, 50, 20, 50, false], ["C", 3, 20, 10, 20, false],
    ]);
    expect(result.recent.map(a => [a.name, a.rank, a.hours, a.plays, a.width])).toEqual([
      ["B", 1, 40, 9, 100], ["A", 2, 10, 3, 25],
    ]);
    expect(result.connections).toEqual([{ name: "A", from: 1, to: 2 }, { name: "B", from: 2, to: 1 }]);
  });

  it("limits each ranking to ten artists and connects only shared top-ten entries", () => {
    const artists = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i), {
      hours: 12 - i, plays: 1, recent_hours: i + 1, recent_plays: 1,
    }]));
    const result = thenVsNow({ artists });
    expect(result.all).toHaveLength(10);
    expect(result.recent).toHaveLength(10);
    expect(result.connections).toHaveLength(8);
  });

  it("returns empty rankings without history", () => {
    expect(thenVsNow(undefined)).toEqual({ all: [], recent: [], connections: [] });
  });

  it("opens playlist artists, tags other artists, and ignores the time range switch", () => {
    const root = document.createElement("div");
    render(root, playlist, history);
    const section = root.querySelector(".history-comparison");
    const original = section.innerHTML;
    expect(section.querySelectorAll(".history-tag")).toHaveLength(3);
    expect(section.querySelectorAll("svg path")).toHaveLength(2);
    expect(section.querySelector('[data-artist="B"]')).toBeNull();
    section.querySelector('[data-artist="A"]').click();
    expect(openArtist).toHaveBeenCalledWith("A");
    root.querySelector('[data-range="recent"]').click();
    expect(section.innerHTML).toBe(original);
    expect(root.querySelector('[data-range="recent"]').getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the time range switch", () => {
  it("offers All time, Last 12 months, then each year, newest first", () => {
    expect(rangeOptions(summary).map(o => o.label)).toEqual(["All time", "Last 12 months", "2026", "2024", "2019"]);
  });

  it("offers nothing without a history", () => {
    expect(rangeOptions({})).toEqual([]);
  });

  it("keeps a saved range that still exists, and falls back to All time otherwise", () => {
    expect(validRange(summary, "2024")).toBe("2024");
    expect(validRange(summary, "recent")).toBe("recent");
    expect(validRange(summary, "2018")).toBe("all");
    expect(validRange(summary, undefined)).toBe("all");
  });
});

describe("Ghosts", () => {
  const detail = (hours, plays = 20) => ({ hours, plays, peak_year: "2024", last: "2024-12-31", top_songs: [{ title: "Old favorite", plays: 12 }] });
  const history = { years: { "2024": {} }, artists: {
    A: { ranges: { all: detail(100), recent: detail(5), "2024": detail(11) } },
    B: { ranges: { all: detail(50), recent: detail(20, 7) } },
    C: { ranges: { all: detail(10), recent: detail(10) } },
    D: { ranges: { all: detail(9.99) } },
    E: { ranges: { all: detail(200) } },
  } };
  const playlist = { artists: [{ name: "A", count: 1 }, { name: "B", count: 0 }, { name: "E", count: 2 }] };

  it("includes exactly ten hours and at most one playlist song, ranks by hours", () => {
    expect(ghosts(history, playlist).rows.map(a => [a.name, a.songCount])).toEqual([["A", 1], ["B", 0], ["C", 0]]);
  });

  it("uses the selected range for totals and details", () => {
    expect(ghosts(history, playlist, "recent").rows.map(a => [a.name, a.hours, a.plays])).toEqual([["B", 20, 7], ["C", 10, 20]]);
    expect(ghosts(history, playlist, "2024").rows[0]).toMatchObject({ name: "A", peak_year: "2024", last: "2024-12-31", top_songs: [{ title: "Old favorite", plays: 12 }] });
  });

  it("limits to ten and produces an accurate headline even when the top artist is not a ghost", () => {
    expect(ghosts(history, playlist).headline).toBe("A has 100 hours in all time, but 1 song on your playlist.");
    const artists = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i), { ranges: { all: detail(100 - i) } }]));
    expect(ghosts({ artists }).rows).toHaveLength(10);
    expect(ghosts({ artists }).headline).toBe("Your most listened-to artist ever has 0 songs on your playlist.");
  });

  it("handles missing history, older summaries and no matches", () => {
    expect(ghosts(undefined)).toEqual({ rows: [], headline: "" });
    expect(ghosts(summary).rows).toEqual([]);
    expect(ghosts(history, playlist, "1999").headline).toBe("No ghosts in this time range.");
  });

  it("updates Ghosts when the range changes without changing Then vs now", () => {
    localStorage.clear();
    const root = document.createElement("div");
    render(root, playlist, history);
    const comparison = root.querySelector(".history-comparison").innerHTML;
    expect(root.querySelector(".ghost-list").textContent).toContain("Old favorite");
    expect(root.querySelector(".ghost-list [data-artist]").dataset.artist).toBe("A");
    root.querySelector('[data-range="recent"]').click();
    expect(root.querySelector(".ghost-list [data-artist]")).toBeNull();
    expect(root.querySelector(".ghost-list").textContent).not.toContain("100");
    expect(root.querySelector(".history-comparison").innerHTML).toBe(comparison);
  });
});
