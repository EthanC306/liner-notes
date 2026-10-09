// One fixed color per genre group, shared by every chart and chip. The six largest
// genres (by song count across the whole playlist) get the six palette colors in size
// order; every other genre shares one muted grey. Ranked once from all songs, so a
// filter never repaints a genre: the color follows the genre, not its rank in a view.
//
// The colors are CSS tokens (--genre-1 .. --genre-6, --genre-rest) in style.css,
// checked for colorblind and normal-vision separation in both themes.
import { playlist, artistByName } from "./data.js";
import { GROUPS, songGroup } from "./genres.js";

const counts = new Map();
playlist.songs.forEach(s => {
  const id = songGroup(s, artistByName).id;
  counts.set(id, (counts.get(id) || 0) + 1);
});

// Real genres only: "other" and "none" are never one of the six.
export const TOP_GENRES = GROUPS
  .filter(g => g.id !== "other" && counts.get(g.id))
  .sort((a, b) => counts.get(b.id) - counts.get(a.id))
  .slice(0, 6);
const slot = new Map(TOP_GENRES.map((g, i) => [g.id, i + 1]));

export const isTopGenre = id => slot.has(id);
export const genreColor = id => (slot.has(id) ? `var(--genre-${slot.get(id)})` : "var(--genre-rest)");
// Stacking order, bottom first: the six by size, then everything else as one grey segment.
export const genreRank = id => (slot.has(id) ? slot.get(id) : 7);

// A small color square that goes next to a genre's name.
export const swatch = id => `<span class="swatch" style="background:${genreColor(id)}" aria-hidden="true"></span>`;
