// Decades for the shared filter. A song's decade comes from the year it first came out
// (MusicBrainz's date when it's earlier than Spotify's album), so a 2009 remaster of a
// 1969 single counts as the 1960s. Songs with no date (some local files) have none.
export const decadeOf = song => (song.releaseYear ? Math.floor(song.releaseYear / 10) * 10 : null);
export const decadeLabel = d => `${d}s`;
