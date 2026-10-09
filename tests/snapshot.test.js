// Totals on the real playlist in the repo, which are known to be right. Skipped when
// the repo has no playlist_songs.json (someone else's checkout with no data yet).
import { describe, it, expect } from "vitest";
import { filterSongs, emptyState } from "../src/selection.js";
import { realPlaylist } from "./helpers.js";

const real = realPlaylist();

describe.skipIf(!real)("real playlist snapshot", () => {
  it("has 389 songs", () => {
    expect(real.playlist.songs).toHaveLength(389);
    expect(filterSongs(real.playlist.songs, emptyState())).toHaveLength(389);
  });

  it("has genre totals that add up to 389", () => {
    const totals = new Map();
    real.playlist.songs.forEach(s => totals.set(s.groupId, (totals.get(s.groupId) || 0) + 1));
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(389);
  });
});
