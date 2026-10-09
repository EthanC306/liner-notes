// Months for the shared filter: the month each song was added to the playlist,
// as "2025-09", in local time. Songs with no added date have none.
export const monthOf = song => (song.addedAt
  ? `${song.addedAt.getFullYear()}-${String(song.addedAt.getMonth() + 1).padStart(2, "0")}`
  : null);

// "September 2025", or "Sep 2025" with style "short".
export function monthLabel(key, style = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: style, year: "numeric" });
}
