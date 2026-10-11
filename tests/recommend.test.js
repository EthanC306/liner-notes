// Recommendations: weighted seeds, overlap adds up, playlist artists left out, reasons.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { recommend, reasonLine } from "../src/recommend.js";
import { filterSongs, emptyState } from "../src/selection.js";
import { fixture } from "./helpers.js";

const { playlist } = fixture();
const lastfm = JSON.parse(readFileSync(new URL("./fixtures/lastfm_similar.json", import.meta.url), "utf8"));
const all = playlist.songs;
const recs = recommend({ songs: all, allSongs: all, lastfm });
const names = recs.map(r => r.name);
const rec = name => recs.find(r => r.name === name);

describe("recommend", () => {
  it("ranks the artist similar to several of yours first (overlap adds up)", () => {
    // Mayday Parade: Hawthorne Heights 0.8 + Pierce The Veil 0.7 + Motion City Soundtrack 0.5
    expect(names[0]).toBe("Mayday Parade");
    expect(rec("Mayday Parade").score).toBeCloseTo(2.0);
    expect(rec("Mayday Parade").seeds).toBe(3);
  });

  it("weights seeds by the square root of how many songs they lead", () => {
    // A$AP Rocky leads 2 songs (weight sqrt 2), the others 1
    expect(rec("Playboi Carti").score).toBeCloseTo(Math.SQRT2 * 0.8 + 0.3);
    expect(rec("Kendrick Lamar").score).toBeCloseTo(Math.SQRT2 * 0.5);
    // ...so a bigger artist counts more, but not in proportion: Kendrick (0.71) still trails
    // Sleeping With Sirens (0.9 from one-song Pierce The Veil)
    expect(rec("Kendrick Lamar").score).toBeGreaterThan(0.5);
    expect(names.indexOf("Kendrick Lamar")).toBeGreaterThan(names.indexOf("Sleeping With Sirens"));
  });

  it("still ranks overlap above one heavy artist's sound-alikes", () => {
    // Mayday Parade (3 one-song seeds, 2.0) beats Playboi Carti (led by 2-song A$AP Rocky, 1.43)
    expect(names.indexOf("Mayday Parade")).toBeLessThan(names.indexOf("Playboi Carti"));
  });

  it("gives the full order, ties broken by name", () => {
    expect(names).toEqual(["Mayday Parade", "Playboi Carti", "Sleeping With Sirens", "The Starting Line",
      "Kendrick Lamar", "Taking Back Sunday", "Wicca Phase Springs Eternal", "Sadeyes"]);
  });

  it("leaves out anyone already on the playlist, features and spelling differences included", () => {
    expect(names).not.toContain("Tyler, The Creator");  // main artist
    expect(names).not.toContain("Lil Tracy");            // only a feature
    expect(names.map(n => n.toLowerCase())).not.toContain("pierce the veil");
  });

  it("leaves out Last.fm collaboration entries that include someone on the playlist", () => {
    expect(names).not.toContain("lil peep, lil tracy");
  });

  it("counts a candidate once per seed, at its best match, when Last.fm lists it twice", () => {
    expect(rec("Sadeyes").score).toBeCloseTo(0.5);
    expect(rec("Sadeyes").because).toEqual(["Lil Peep"]);
  });

  it("uses only main artists as seeds (features don't count)", () => {
    // Kali Uchis is only featured, so her similar artist never shows up
    expect(names).not.toContain("Steve Lacy");
  });

  it("explains each one with the seeds that contributed most", () => {
    expect(rec("Mayday Parade").because).toEqual(["Hawthorne Heights", "Pierce The Veil", "Motion City Soundtrack"]);
    expect(rec("Playboi Carti").because).toEqual(["A$AP Rocky", "Lil Peep"]);
    expect(reasonLine(rec("Mayday Parade").because)).toBe("Hawthorne Heights, Pierce The Veil and Motion City Soundtrack");
    expect(reasonLine(["Modern Baseball", "Free Throw"])).toBe("Modern Baseball and Free Throw");
    expect(reasonLine(["Modern Baseball"])).toBe("Modern Baseball");
  });

  it("comes with up to three top songs", () => {
    expect(rec("Mayday Parade").tracks.map(t => t.name)).toEqual(["Jamie All Over", "Miserable at Best", "Black Cat"]);
    expect(rec("Kendrick Lamar").tracks).toEqual([]);
  });

  it("follows the shared filter: rap songs only seed from rap artists", () => {
    const rap = filterSongs(all, { ...emptyState(), groups: ["rap"] });
    const rapNames = recommend({ songs: rap, allSongs: all, lastfm }).map(r => r.name);
    expect(rapNames).toEqual(["Playboi Carti", "Kendrick Lamar"]);
  });

  it("returns nothing without Last.fm data, or with no songs", () => {
    expect(recommend({ songs: all, allSongs: all, lastfm: {} })).toEqual([]);
    expect(recommend({ songs: [], allSongs: all, lastfm })).toEqual([]);
  });

  it("respects the limit", () => {
    expect(recommend({ songs: all, allSongs: all, lastfm, limit: 2 })).toHaveLength(2);
  });
});
