// @vitest-environment jsdom
// The shared filter store (filter.js): picking, saving, notifying, and clearing.
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("shared filter store", () => {
  let filter;
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    ({ filter } = await import("../src/filter.js"));
  });

  it("starts empty", () => {
    expect(filter.state()).toEqual({ groups: [], decades: [], months: [] });
    expect(filter.active()).toBe(false);
  });

  it("toggles each type on and off", () => {
    filter.toggleGroup("rap");
    filter.toggleDecade(2010);
    filter.toggleMonth("2025-09");
    expect(filter.state()).toEqual({ groups: ["rap"], decades: [2010], months: ["2025-09"] });
    filter.toggleGroup("rap");
    expect(filter.state().groups).toEqual([]);
  });

  it("clears every type at once", () => {
    filter.toggleGroup("rap");
    filter.toggleDecade(1990);
    filter.toggleMonth("2023-06");
    filter.clear();
    expect(filter.state()).toEqual({ groups: [], decades: [], months: [] });
    expect(filter.active()).toBe(false);
  });

  it("tells subscribers about every change, until they stop", () => {
    const seen = vi.fn();
    const stop = filter.subscribe(seen);
    filter.toggleGroup("emo");
    filter.clear();
    stop();
    filter.toggleGroup("emo");
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("saves picks and reads them back on the next load", async () => {
    filter.toggleGroup("metal");
    filter.toggleMonth("2025-10");
    vi.resetModules();
    const { filter: reloaded } = await import("../src/filter.js");
    expect(reloaded.state()).toEqual({ groups: ["metal"], decades: [], months: ["2025-10"] });
  });

  it("drops saved values it doesn't know, including 'features' (an Artists tab view, not a filter)", async () => {
    localStorage.setItem("playlist-stat:filter", JSON.stringify({ groups: ["features", "bogus", "rap"], decades: [1995, 2010], months: ["2025-9", "2025-09"] }));
    vi.resetModules();
    const { filter: reloaded } = await import("../src/filter.js");
    expect(reloaded.state()).toEqual({ groups: ["rap"], decades: [2010], months: ["2025-09"] });
  });
});
