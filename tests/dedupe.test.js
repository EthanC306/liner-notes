// Duplicate songs count once. Songs match by Spotify ID first, then title plus main artist.
import { describe, it, expect } from "vitest";
import { dedupeSongs, songKeys, normalize } from "../src/build.js";
import { fixture, byTitle } from "./helpers.js";

const raw = (id, title, artist, added) => ({ id, title, artists: artist ? [{ name: artist }] : [], added_at: added });

describe("song matching", () => {
  it("matches the same Spotify ID", () => {
    const out = dedupeSongs([raw("a", "One", "X", "2024-01-02"), raw("a", "One (live)", "Y", "2024-01-03")]);
    expect(out).toHaveLength(1);
  });

  it("matches title plus main artist when the IDs differ", () => {
    const out = dedupeSongs([raw("album", "Ohio Is for Lovers", "Hawthorne Heights", "2024"), raw("single", "Ohio is for lovers", "Hawthorne Heights", "2025")]);
    expect(out).toHaveLength(1);
  });

  it("ignores case, accents and apostrophe styles in the title", () => {
    expect(normalize("Don’t Kill My Vibe")).toBe(normalize("dont kill my vibe"));
    expect(normalize("Café")).toBe(normalize("cafe"));
  });

  it("does not match the same title by a different main artist", () => {
    const out = dedupeSongs([raw("a", "Creep", "Radiohead"), raw("b", "Creep", "TLC")]);
    expect(out).toHaveLength(2);
  });

  it("keeps the first entry and takes the earliest added date of any copy", () => {
    const out = dedupeSongs([raw("a", "One", "X", "2024-05-01T00:00:00Z"), raw("a", "One", "X", "2023-01-01T00:00:00Z")]);
    expect(out[0].added_at).toBe("2023-01-01T00:00:00Z");
  });

  it("gives a song with no ID only a title key", () => {
    expect(songKeys(raw(null, "fake", ""))).toEqual(["name:fake|"]);
  });
});

describe("the fixture playlist", () => {
  const { playlist } = fixture();

  it("counts its 15 entries as 13 songs", () => {
    expect(playlist.songs).toHaveLength(13);
    expect(playlist.duplicatesRemoved).toBe(2);
  });

  it("keeps one 'Everything Is Alright' with the earlier added date of its two copies", () => {
    const copies = playlist.songs.filter(s => s.title === "Everything Is Alright");
    expect(copies).toHaveLength(1);
    expect(copies[0].addedAt.toISOString()).toBe("2022-11-05T12:00:00.000Z");
  });

  it("keeps one 'Ohio Is for Lovers' though the album and single have different IDs", () => {
    expect(playlist.songs.filter(s => /^ohio is for lovers$/i.test(s.title))).toHaveLength(1);
  });

  it("keeps the local file with no artist", () => {
    const local = byTitle(playlist.songs, "guardin - fake");
    expect(local).toBeDefined();
    expect(local.artists).toEqual([]);
  });

  it("treats 'Tyler, The Creator' as one artist", () => {
    expect(byTitle(playlist.songs, "See You Again").artists).toEqual(["Tyler, The Creator", "Kali Uchis"]);
  });
});
