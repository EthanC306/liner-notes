// Recommendations: weighted seeds, overlap adds up, playlist artists left out, reasons.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { recommend, reasonLine, adventureSettings, songBase, distinctSongs, recommendAtLeast } from "../src/recommend.js";
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

describe("the mixing board", () => {
  const run = opts => recommend({ songs: all, allSongs: all, lastfm, ...opts });
  const namesOf = opts => run(opts).map(r => r.name);

  it("leaves the middle of every control as the default ranking", () => {
    expect(namesOf({ adventure: 0.5, popularity: 0, heard: null, hidden: [] })).toEqual(names);
  });

  describe("Sounds like", () => {
    it("uses only the picked artists as seeds", () => {
      expect(namesOf({ seeds: ["Pierce The Veil"] })).toEqual(["Sleeping With Sirens", "Mayday Parade"]);
    });

    it("weights picked artists equally, whatever their song counts", () => {
      // A$AP Rocky leads 2 songs but counts the same as Lil Peep when picked
      expect(run({ seeds: ["A$AP Rocky", "Lil Peep"] })[0].score).toBeCloseTo(0.8 + 0.3);
    });

    it("gives a different answer for different artists", () => {
      expect(namesOf({ seeds: ["Hawthorne Heights", "Motion City Soundtrack"] })[0]).toBe("Mayday Parade");
      expect(namesOf({ seeds: ["A$AP Rocky"] })[0]).toBe("Playboi Carti");
    });
  });

  describe("Safe <-> Adventurous", () => {
    it("Safe only counts close matches", () => {
      // Lil Peep -> Playboi Carti is 0.3: too loose for Safe (0.5 and up)
      expect(run({ adventure: 0 }).find(r => r.name === "Playboi Carti").because).toEqual(["A$AP Rocky"]);
    });

    it("Adventurous reaches matches the middle setting leaves out", () => {
      expect(namesOf({})).not.toContain("Emery");                          // 0.1, under the middle's 0.2
      expect(namesOf({ adventure: 1 })).toContain("Emery");
    });

    it("moves the settings the right way", () => {
      const safe = adventureSettings(0), mid = adventureSettings(0.5), wild = adventureSettings(1);
      expect([safe.depth, mid.depth, wild.depth]).toEqual([6, 15, 30]);
      expect([safe.minMatch, mid.minMatch, wild.minMatch].map(x => +x.toFixed(2))).toEqual([0.5, 0.2, 0.05]);
      expect([safe.curve, mid.curve, wild.curve]).toEqual([2, 1, 0.5]);
    });
  });

  describe("Popular <-> Underground", () => {
    it("Underground lifts small artists, Popular lifts big ones", () => {
      const under = namesOf({ popularity: 1 }), pop = namesOf({ popularity: -1 });
      expect(under.indexOf("Wicca Phase Springs Eternal")).toBeLessThan(under.indexOf("Kendrick Lamar"));
      expect(pop.indexOf("Kendrick Lamar")).toBeLessThan(pop.indexOf("Wicca Phase Springs Eternal"));
    });

    it("doesn't change the match strength, only the order", () => {
      const plain = run({}).find(r => r.name === "Kendrick Lamar");
      const under = run({ popularity: 1 }).find(r => r.name === "Kendrick Lamar");
      expect(under.match).toBeCloseTo(plain.match);
      expect(under.score).toBeLessThan(plain.score);
      expect(under.listeners).toBe(6000000);
    });
  });

  it("Never heard only leaves out anyone in the listening history", () => {
    expect(namesOf({ heard: ["mayday parade", "Sadeyes"] })).not.toContain("Mayday Parade");
    expect(namesOf({ heard: ["mayday parade", "Sadeyes"] })).not.toContain("Sadeyes");
    expect(namesOf({ heard: null })).toContain("Mayday Parade");
  });

  it("Not for me hides an artist", () => {
    expect(namesOf({ hidden: ["Playboi Carti"] })).not.toContain("Playboi Carti");
  });
});

describe("three different songs per artist", () => {
  it("treats versions of one song as the same song", () => {
    const same = ["October", "october (feat. lil peep)", "October Ft. Lil Peep"].map(songBase);
    expect(new Set(same).size).toBe(1);
    expect(songBase("Black Cat - 2009 Remaster")).toBe(songBase("Black Cat"));
    expect(songBase('Dial "M" for Murder')).toBe(songBase("Dial M For Murder"));
    expect(songBase("Sir, This is a Cutthroat Fashion")).toBe(songBase("Sir This is a Cutthroat fashion"));
    expect(songBase("Crown on the Ground")).not.toBe(songBase("Crown"));
  });

  it("keeps the first spelling of each song", () => {
    expect(distinctSongs([{ name: "Us" }, { name: "Us Ft. Lil Peep & Lil Tracy" }, { name: "More" }]).map(t => t.name)).toEqual(["Us", "More"]);
  });

  it("shows three different songs, skipping a live version of one", () => {
    expect(rec("Mayday Parade").tracks.map(t => t.name)).toEqual(["Jamie All Over", "Miserable at Best", "Black Cat"]);
  });

  it("with minSongs, skips artists without that many different songs", () => {
    const names3 = recommend({ songs: all, allSongs: all, lastfm, minSongs: 3 }).map(r => r.name);
    expect(names3).toEqual(["Mayday Parade"]);                      // Playboi Carti has only 2
    expect(recommend({ songs: all, allSongs: all, lastfm, minSongs: 3 }).every(r => r.tracks.length === 3)).toBe(true);
  });
});

describe("at least five artists per burn", () => {
  const opts = { songs: all, allSongs: all, lastfm, seeds: ["Hawthorne Heights"] };

  it("keeps the board's setting when it already finds enough", () => {
    const { recs, adventure, widened } = recommendAtLeast({ ...opts, adventure: 0.5 }, 2);
    expect(recs.map(r => r.name)).toEqual(["Mayday Parade", "Taking Back Sunday"]);
    expect([adventure, widened]).toEqual([0.5, false]);
  });

  it("widens toward Adventurous until it finds enough", () => {
    // Emery (a 0.1 match) only counts once the search is wide enough
    const { recs, adventure, widened } = recommendAtLeast({ ...opts, adventure: 0.5 }, 3);
    expect(recs.map(r => r.name)).toContain("Emery");
    expect(widened).toBe(true);
    expect(adventure).toBeGreaterThan(0.5);
    expect(recommend({ ...opts, adventure: adventure - 0.1 })).toHaveLength(2);  // one step less wasn't enough
  });

  it("stops at all the way open, and returns what there is", () => {
    const { recs, adventure } = recommendAtLeast({ ...opts, adventure: 0.5 }, 50);
    expect(adventure).toBe(1);
    expect(recs.length).toBeLessThan(50);
  });
});

describe("reaching through your own artists", () => {
  // Lil Peep's similar artists: Lil Tracy (on the playlist), Wicca Phase, Playboi Carti, Sadeyes.
  // Leave those out with the history, and Lil Peep alone finds nothing new...
  const heard = ["Wicca Phase Springs Eternal", "Playboi Carti", "Sadeyes"];
  const lilPeepAlone = { songs: all, allSongs: all, lastfm, seeds: ["Lil Peep"], heard };

  it("finds nothing from Lil Peep alone once everything similar is heard", () => {
    expect(recommend({ ...lilPeepAlone, adventure: 1 })).toEqual([]);
  });

  it("then borrows from the playlist artists similar to the seed, and says who they're like", () => {
    // ...so it reaches through playlist artists similar to Lil Peep. In the fixture none
    // has a list of its own, so add one: make Lil Peep similar to A$AP Rocky.
    const bridged = { ...lastfm, similar: { ...lastfm.similar, "Lil Peep": [...lastfm.similar["Lil Peep"], { name: "A$AP Rocky", match: 0.6 }] } };
    const { recs, bridged: used } = recommendAtLeast({ ...lilPeepAlone, lastfm: bridged }, 1);
    expect(used).toBe(true);
    expect(recs.map(r => r.name)).toContain("Kendrick Lamar");          // A$AP Rocky's, not Lil Peep's
    const kendrick = recs.find(r => r.name === "Kendrick Lamar");
    expect(kendrick.because).toEqual(["A$AP Rocky"]);
    expect(kendrick.via).toBe("Lil Peep");
    expect(kendrick.viaKind).toBe("similar");
    expect(kendrick.score).toBeCloseTo(0.5 * 0.6 * 0.5 ** 0.5);          // half strength x 0.6 x match^curve at Adventurous
  });

  it("then through the seed's genre-mates on the playlist", () => {
    // Lil Peep is Emo & cloud rap; with nothing similar left and no similar playlist artist
    // to borrow from, the fixture has no genre-mate either, so it stays empty...
    expect(recommendAtLeast({ ...lilPeepAlone }, 1).recs).toEqual([]);
    // ...until another Emo & cloud rap artist with a similar list is on the playlist.
    const mate = all.find(s => s.title === "white tee");
    const withMate = [...all, { ...mate, title: "beamer boy", artists: ["Lil Darkie"], groupId: "emorap" }];
    const lf = { ...lastfm, similar: { ...lastfm.similar, "Lil Darkie": [{ name: "Ghostemane", match: 0.9 }] }, top_tracks: lastfm.top_tracks };
    const { recs, bridged } = recommendAtLeast({ ...lilPeepAlone, allSongs: withMate, lastfm: lf }, 1);
    expect(bridged).toBe(true);
    expect(recs[0]).toMatchObject({ name: "Ghostemane", because: ["Lil Darkie"], via: "Lil Peep", viaKind: "genre" });
  });

  it("doesn't reach through anyone when the seeds find enough", () => {
    const { bridged } = recommendAtLeast({ songs: all, allSongs: all, lastfm }, 3);
    expect(bridged).toBe(false);
  });
});
