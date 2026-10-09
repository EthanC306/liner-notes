// Every chip and chart count must equal what the shared filter returns for that
// selection. Pages get every count from countFor() / stateFor() in selection.js; these
// tests pin down what those numbers mean, under several filter states.
import { describe, it, expect } from "vitest";
import { filterSongs, countFor, stateFor, emptyState, mainArtistsOf, TYPES } from "../src/selection.js";
import { fixture, byTitle } from "./helpers.js";

const { playlist } = fixture();
const songs = playlist.songs;
const valuesOf = field => [...new Set(songs.map(s => s[field]).filter(v => v != null))];

// Filter states to check every count under: none, one type, two types, all three, and
// one that matches nothing.
const STATES = {
  "no filters": emptyState(),
  "rap": { ...emptyState(), groups: ["rap"] },
  "the 2010s": { ...emptyState(), decades: [2010] },
  "rap + Sep 2025": { ...emptyState(), groups: ["rap"], months: ["2025-09"] },
  "indie or rap, 2010s, Jun 2023": { groups: ["indie", "rap"], decades: [2010], months: ["2023-06"] },
  "nothing matches": { ...emptyState(), groups: ["metal"], decades: [1960] },
};

describe.each(Object.entries(STATES))("counts with %s", (_, state) => {
  for (const [type, field] of Object.entries(TYPES)) {
    it(`every ${type} chip/bar equals the shared filter run for that ${type}`, () => {
      for (const value of valuesOf(field)) {
        const expected = filterSongs(songs, stateFor(state, type, value));
        expect(countFor(songs, state, type, value)).toBe(expected.length);
        // and it's exactly the songs of that value among the other types' results
        const others = filterSongs(songs, { ...state, [type]: [] });
        expect(expected).toEqual(others.filter(s => s[field] === value));
      }
    });

    it(`${type} bars add up to the songs the other filters leave`, () => {
      const others = filterSongs(songs, { ...state, [type]: [] });
      const total = valuesOf(field).reduce((t, v) => t + countFor(songs, state, type, v), 0);
      const undated = others.filter(s => s[field] == null).length;  // e.g. the local file has no decade
      expect(total + undated).toBe(others.length);
    });
  }

  it("a chart never shrinks from its own picks", () => {
    for (const [type, field] of Object.entries(TYPES)) {
      const picked = { ...state, [type]: valuesOf(field).slice(0, 1) };
      for (const value of valuesOf(field)) {
        expect(countFor(songs, picked, type, value)).toBe(countFor(songs, { ...state, [type]: [] }, type, value));
      }
    }
  });

  it("artist chip counts are the main artists of the shared filter's songs", () => {
    for (const g of valuesOf("groupId")) {
      const filtered = filterSongs(songs, stateFor(state, "groups", g));
      const mains = mainArtistsOf(filtered);
      // no featured artist sneaks in
      filtered.forEach(s => s.artists.slice(1).forEach(f => {
        if (!songs.some(o => o.artists[0] === f && filtered.includes(o))) expect(mains.has(f)).toBe(false);
      }));
    }
  });
});

describe("'I Smoked Away My Brain' (three artists, three genres)", () => {
  const smoked = byTitle(songs, "I Smoked Away My Brain");

  it("is counted once, in rap only", () => {
    const appearances = valuesOf("groupId").filter(g => filterSongs(songs, stateFor(emptyState(), "groups", g)).includes(smoked));
    expect(appearances).toEqual(["rap"]);
  });

  it("brings only A$AP Rocky into a genre's artists, not its features", () => {
    expect(mainArtistsOf(filterSongs(songs, stateFor(emptyState(), "groups", "rap"))).has("Imogen Heap")).toBe(false);
    expect(mainArtistsOf(filterSongs(songs, stateFor(emptyState(), "groups", "indie"))).has("Imogen Heap")).toBe(false);
  });

  it("shows up for its decade and month like any other song", () => {
    expect(filterSongs(songs, { groups: ["rap"], decades: [2010], months: ["2023-06"] })).toEqual([smoked]);
  });
});
