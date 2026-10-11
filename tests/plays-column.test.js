// @vitest-environment jsdom
// The play count column and "Most played" sort in a song list (Breakdown), with and
// without a listening history.
import { describe, it, expect } from "vitest";
import { render } from "../src/pages/breakdown.js";
import { filter } from "../src/filter.js";
import { fixture, byTitle } from "./helpers.js";

const { playlist } = fixture();
const smoked = byTitle(playlist.songs, "I Smoked Away My Brain");
const history = { artists: { guardin: { plays: 1, hours: 1 } }, songs: { [smoked.historyKey]: { plays: 60, hours: 3.5 } } };

describe("play counts in the Breakdown song list", () => {
  it("adds a plays column, says never played, and sorts by plays", () => {
    const root = document.createElement("div");
    document.body.append(root);
    render(root, playlist, history);
    const rows = () => [...root.querySelectorAll("#genreSongs li")];
    expect(rows()).toHaveLength(playlist.songs.length);
    expect(rows().every(li => li.querySelector(".plays"))).toBe(true);
    const smokedRow = rows().find(li => li.textContent.includes("I Smoked Away My Brain"));
    expect(smokedRow.querySelector(".plays").textContent).toBe("60 plays");
    expect(rows().filter(li => li.querySelector(".plays").textContent === "never played")).toHaveLength(playlist.songs.length - 1);
    expect(root.textContent).not.toMatch(/\b0 plays\b/);
    root.querySelector('[data-song-sort="plays"]').click();
    expect(rows()[0].textContent).toContain("I Smoked Away My Brain");
    expect(root.querySelector('[data-song-sort="plays"]').getAttribute("aria-pressed")).toBe("true");
    root.querySelector('[data-song-sort="playlist"]').click();
    root.remove();
  });

  it("shows no column or sort without a history", () => {
    const root = document.createElement("div");
    document.body.append(root);
    render(root, playlist, {});
    expect(root.querySelector(".plays")).toBeNull();
    expect(root.querySelector("[data-song-sort]")).toBeNull();
    root.remove();
  });
});

describe("Dead weight on Breakdown", () => {
  // The history ends 2026-10-08: the two songs added in September 2026 are too new.
  const dwHistory = { to: "2026-10-08T12:00:00Z", artists: { guardin: { plays: 1 } }, songs: {
    [smoked.historyKey]: { plays: 60, plays_since_added: 2, last: "2025-01-02" },
  } };
  const mount = h => { const root = document.createElement("div"); document.body.append(root); render(root, playlist, h); return root; };
  const titles = root => [...root.querySelectorAll(".dead-table tbody tr")].map(tr => tr.querySelector(".gs-title").textContent);

  it("switches threshold, shows counts, lists can't tell, and leaves out new songs", () => {
    filter.clear();
    const root = mount(dwHistory);
    const counts = [...root.querySelectorAll("[data-dead] .dead-count")].map(n => Number(n.textContent));
    expect(counts[1]).toBe(counts[0] + 1);  // the mashup has 2 plays since added
    expect(titles(root)).not.toContain("High");
    expect(titles(root)).not.toContain("I Smoked Away My Brain");
    root.querySelector('[data-dead="under3"]').click();
    const row = [...root.querySelectorAll(".dead-table tbody tr")].find(tr => tr.textContent.includes("I Smoked Away My Brain"));
    expect(row.textContent).toContain("2 plays");
    expect(root.querySelector(".dead-cant").textContent).toContain("Can't tell");
    expect(root.querySelector(".dead-cant").textContent).toContain("fake");
    root.querySelector('[data-dead="never"]').click();
    root.remove();
  });

  it("follows the shared genre filter", () => {
    filter.clear();
    const all = mount(dwHistory);
    const allTitles = titles(all);
    all.remove();
    const id = smoked.groupId;
    filter.toggleGroup(id);
    const root = mount(dwHistory);
    const shown = titles(root);
    expect(shown.length).toBeLessThan(allTitles.length);
    shown.forEach(t => expect(playlist.songs.find(s => s.title === t).groupId).toBe(id));
    filter.clear();
    root.remove();
  });

  it("hides with an older summary that has no plays since added", () => {
    const root = mount(history);
    expect(root.querySelector("#deadWeight")).toBeNull();
    root.remove();
  });
});
