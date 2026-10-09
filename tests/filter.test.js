// The shared filter: one function turns the filter state into one song list.
import { describe, it, expect } from "vitest";
import { filterSongs, emptyState, activeState } from "../src/selection.js";
import { fixture } from "./helpers.js";

const { playlist } = fixture();
const titles = state => filterSongs(playlist.songs, { ...emptyState(), ...state }).map(s => s.title).sort();

describe("filterSongs", () => {
  it("returns every song with no filters", () => {
    expect(filterSongs(playlist.songs, emptyState())).toHaveLength(13);
  });

  it("filters by genre alone", () => {
    expect(titles({ groups: ["rap"] })).toEqual(["I Smoked Away My Brain (I'm God x Demons Mashup) (feat. Imogen Heap & Clams Casino)", "L$D", "See You Again (feat. Kali Uchis)"]);
  });

  it("filters by decade alone", () => {
    expect(titles({ decades: [1960] })).toEqual(["Don't Let Me Down - Remastered 2009"]);
  });

  it("filters by added month alone", () => {
    expect(titles({ months: ["2025-09"] })).toEqual(["Don't Let Me Down - Remastered 2009", "Need", "See You Again (feat. Kali Uchis)"]);
  });

  it("treats several values of one type as 'any of these'", () => {
    expect(titles({ groups: ["metal", "rock"] })).toEqual(["Can You Feel My Heart", "Don't Let Me Down - Remastered 2009"]);
  });

  it("treats different types as 'all of these'", () => {
    expect(titles({ groups: ["rap"], decades: [2010], months: ["2025-09"] })).toEqual(["See You Again (feat. Kali Uchis)"]);
  });

  it("returns nothing when no song matches every type", () => {
    expect(titles({ groups: ["metal"], decades: [1960] })).toEqual([]);
  });

  it("is back to every song once cleared", () => {
    expect(filterSongs(playlist.songs, { groups: [], decades: [], months: [] })).toHaveLength(13);
  });

  it("drops saved picks no song has, instead of filtering everything out", () => {
    const state = activeState(playlist.songs, { groups: ["other", "rap"], decades: [1880], months: ["1999-01"] });
    expect(state).toEqual({ groups: ["rap"], decades: [], months: [] });
  });
});
