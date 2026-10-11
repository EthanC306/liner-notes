// @vitest-environment jsdom
// The docked player: which songs can play, and what a song name does when one can't.
import { describe, it, expect, vi } from "vitest";
import { trackId, playSong, playOrOpen } from "../src/player.js";
import { openArtist } from "../src/artist-sheet.js";
import { fixture, byTitle } from "./helpers.js";

vi.mock("../src/artist-sheet.js", () => ({ openArtist: vi.fn() }));
vi.mock("../src/data.js", async () => {
  const { fixture } = await import("./helpers.js");
  return { playlist: fixture().playlist };
});

const { playlist } = fixture();

describe("the player", () => {
  it("plays Spotify songs by track ID and can't play local files", () => {
    expect(trackId({ url: "https://open.spotify.com/track/6xyiHZgrmXw7sMyYXbXjPV", historyKey: "6xyiHZgrmXw7sMyYXbXjPV" })).toBe("6xyiHZgrmXw7sMyYXbXjPV");
    expect(trackId({ url: null, historyKey: "abc123" })).toBe("abc123");
    expect(trackId(playlist.songs.find(s => s.local))).toBeNull();
    expect(trackId(undefined)).toBeNull();
  });

  it("opens the artist popup for a song that can't play", () => {
    const local = playlist.songs.find(s => s.local);
    expect(playSong(local)).toBe(false);
    playOrOpen(local.n, "guardin");
    expect(openArtist).toHaveBeenCalledWith("guardin", { song: local.n });
  });

  it("docks a player and loads Spotify's embed API once", () => {
    HTMLElement.prototype.showPopover ??= function () { this.dataset.open = ""; };
    HTMLElement.prototype.hidePopover ??= function () { delete this.dataset.open; };
    const song = byTitle(playlist.songs, "I Smoked Away My Brain");
    openArtist.mockClear();
    playOrOpen(song.n, song.artists[0]);
    playOrOpen(byTitle(playlist.songs, "Need").n, "Pinegrove");
    expect(openArtist).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".player")).toHaveLength(1);
    expect(document.querySelectorAll('script[src="https://open.spotify.com/embed/iframe-api/v1"]')).toHaveLength(1);
    expect(document.documentElement.classList.contains("player-open")).toBe(true);
  });
});
