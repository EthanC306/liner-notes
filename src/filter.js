// The app-wide filter. Every tab can read it, change it and listen for changes,
// so a filter picked on one tab is still set on the next. It's saved in this
// browser, and other open tabs of the app pick up changes too.
//
// It holds three things, and a song has to match all of them:
//   genre groups: ids from GROUPS in genres.js, plus "none"
//   decades: 1960, 1990, 2010 ... from the year each song first came out (decades.js)
//   months: "2025-09" ... the month each song was added to the playlist (months.js)
// Picking several in one of them means any of those.
// Pages read it as one state with filter.state() and pass that to filterSongs() in
// selection.js; they never filter on their own. "Features only" is an Artists tab view,
// not part of this filter.
import { GROUPS, NO_GENRE } from "./genres.js";

const STORE_KEY = "playlist-stat:filter";
const KNOWN = new Set([...GROUPS, NO_GENRE].map(g => g.id));  // a saved group that no longer exists is dropped
const listeners = new Set();

let groups = new Set();
let decades = new Set();
let months = new Set();
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    groups = new Set((Array.isArray(saved.groups) ? saved.groups : []).filter(id => KNOWN.has(id)));
    decades = new Set((Array.isArray(saved.decades) ? saved.decades : []).filter(d => Number.isInteger(d) && d % 10 === 0));
    months = new Set((Array.isArray(saved.months) ? saved.months : []).filter(m => /^\d{4}-\d{2}$/.test(m)));
  } catch { groups = new Set(); decades = new Set(); months = new Set(); /* storage blocked or bad data */ }
}
load();

function changed() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ groups: [...groups], decades: [...decades], months: [...months] })); } catch { /* storage blocked */ }
  listeners.forEach(fn => fn());
}

window.addEventListener("storage", e => {
  if (e.key === STORE_KEY) { load(); listeners.forEach(fn => fn()); }
});

export const filter = {
  // The whole filter, in the shape filterSongs() takes.
  state: () => ({ groups: [...groups], decades: [...decades], months: [...months] }),
  groups: () => new Set(groups),
  hasGroup: id => groups.has(id),
  decades: () => new Set(decades),
  months: () => new Set(months),
  active: () => groups.size > 0 || decades.size > 0 || months.size > 0,
  toggleGroup(id) { groups.has(id) ? groups.delete(id) : groups.add(id); changed(); },
  toggleDecade(d) { decades.has(d) ? decades.delete(d) : decades.add(d); changed(); },
  toggleMonth(m) { months.has(m) ? months.delete(m) : months.add(m); changed(); },
  clear() { groups.clear(); decades.clear(); months.clear(); changed(); },
  // Calls fn whenever the filter changes. Returns a function that stops it.
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
