// Genre lookup order, and a song's genre coming from its main artist only.
import { describe, it, expect } from "vitest";
import { resolveGenres } from "../src/build.js";
import { groupOf } from "../src/genres.js";
import { mainArtistsOf } from "../src/selection.js";
import { fixture, byTitle } from "./helpers.js";

describe("genre lookup order", () => {
  const mb = { genres: ["post-hardcore"], tags: ["emo"] };
  const lastfm = { genres: ["rock"] };

  it("uses the override file first, over every database", () => {
    expect(resolveGenres("X", { override: "midwest emo", mb, lastfm })).toEqual({ genres: ["midwest emo"], genreSource: "your genre file" });
  });

  it("accepts the override as a list or a comma string, cleaned up", () => {
    expect(resolveGenres("X", { override: ["Emo", " Math Rock "] }).genres).toEqual(["emo", "math rock"]);
    expect(resolveGenres("X", { override: "Emo, indie rock " }).genres).toEqual(["emo", "indie rock"]);
  });

  it("then MusicBrainz genres", () => {
    expect(resolveGenres("X", { override: "", mb, lastfm }).genreSource).toBe("MusicBrainz");
  });

  it("then MusicBrainz tags that name a genre", () => {
    expect(resolveGenres("X", { mb: { genres: [], tags: ["seen live", "emo"] }, lastfm }).genres).toEqual(["emo"]);
  });

  it("then Last.fm", () => {
    expect(resolveGenres("X", { mb: { genres: [], tags: ["american"] }, lastfm }).genreSource).toBe("Last.fm");
  });

  it("then nothing, which is 'No genre found'", () => {
    expect(resolveGenres("X", {})).toEqual({ genres: [], genreSource: null });
  });
});

describe("genre grouping on the fixture", () => {
  const { playlist, artistByName } = fixture();
  const group = start => byTitle(playlist.songs, start).groupId;

  it("lets the override file beat MusicBrainz (Pierce The Veil: post-hardcore -> emo)", () => {
    expect(artistByName("Pierce The Veil").genreSource).toBe("your genre file");
    expect(group("Bulls In The Bronx")).toBe("emo");
  });

  it("uses Last.fm when MusicBrainz has nothing (doan)", () => {
    expect(artistByName("doan").genreSource).toBe("Last.fm");
    expect(group("Preaching to the choir")).toBe("punk");
  });

  it("files a song with no genre anywhere under No genre found", () => {
    expect(group("High")).toBe("none");
    expect(group("guardin - fake")).toBe("none");  // the local file, shown by its cleaned-up name
  });

  it("gives 'I Smoked Away My Brain' its main artist's genre only: rap", () => {
    const smoked = byTitle(playlist.songs, "I Smoked Away My Brain");
    expect(smoked.artists).toEqual(["A$AP Rocky", "Imogen Heap", "Clams Casino"]);
    // its three artists are in three different groups...
    expect(smoked.artists.map(n => groupOf(artistByName(n).genres[0]).id)).toEqual(["rap", "indie", "rnb"]);
    // ...but the song is only rap
    expect(smoked.groupId).toBe("rap");
  });

  it("does not count features toward a genre's artists", () => {
    const indieSongs = playlist.songs.filter(s => s.groupId === "indie");
    expect(mainArtistsOf(indieSongs)).toEqual(new Set(["Pinegrove"]));  // not Imogen Heap
    const rnbSongs = playlist.songs.filter(s => s.groupId === "rnb");
    expect(rnbSongs).toHaveLength(0);  // Clams Casino and Kali Uchis are only features
  });

  it("knows the feature-only artists", () => {
    const mains = mainArtistsOf(playlist.songs);
    const featureOnly = playlist.artists.map(a => a.name).filter(n => !mains.has(n)).sort();
    expect(featureOnly).toEqual(["Clams Casino", "Imogen Heap", "Kali Uchis", "Lil Tracy"]);
  });
});
