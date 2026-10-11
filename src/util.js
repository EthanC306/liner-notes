export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const fmtLength = ms => {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const fmtTotal = ms => {
  const min = Math.round(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr ${min % 60} min`;
};
// Hours listened: "45 min", "3.2 hr", "624 hr".
export const fmtHours = h => {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString()} hr`;
};
export const fmtDate = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export const fmtTime = d => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export function fmtRelease(album) {
  const d = album.release_date;
  if (!d) return "Unknown";
  const [y, m, day] = d.split("-").map(Number);
  if (album.release_date_precision === "year" || !m) return String(y);
  const date = new Date(y, m - 1, day || 1);
  return album.release_date_precision === "month"
    ? date.toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : fmtDate(date);
}
