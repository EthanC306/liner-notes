// The one place songs get filtered. A filter state is
//   { groups: ["emo", ...], decades: [1990, ...], months: ["2025-09", ...] }
// Several values of one type mean "any of these"; different types must all match.
// Every section computes from filterSongs(), and every chip or chart count comes from
// countFor(), which runs the same filter for that one selection. Never filter elsewhere.
export const TYPES = { groups: "groupId", decades: "decade", months: "month" };

export const emptyState = () => ({ groups: [], decades: [], months: [] });

export function filterSongs(songs, state = emptyState()) {
  const sets = Object.entries(TYPES)
    .map(([type, field]) => [field, new Set(state[type] || [])])
    .filter(([, set]) => set.size);
  return songs.filter(s => sets.every(([field, set]) => set.has(s[field])));
}

// How many songs a chip or bar stands for: the shared filter with this type's picks
// replaced by just this value. So a chart never shrinks from its own picks (the decades
// chart keeps every decade's count while 1990 is picked), but follows the other types.
export const stateFor = (state, type, value) => ({ ...emptyState(), ...state, [type]: [value] });
export const countFor = (songs, state, type, value) => filterSongs(songs, stateFor(state, type, value)).length;

// Main artists of a list of songs (the first artist on each). Features don't count.
export const mainArtistsOf = songs => new Set(songs.map(s => s.artists[0]).filter(Boolean));

// Drops picks no song in the playlist has (a saved "Other", or a decade that's since
// emptied): they'd filter everything out with no chip left to undo them.
export function activeState(songs, state) {
  const out = emptyState();
  for (const [type, field] of Object.entries(TYPES)) {
    const present = new Set(songs.map(s => s[field]));
    out[type] = (state[type] || []).filter(v => present.has(v));
  }
  return out;
}
