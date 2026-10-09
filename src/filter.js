// The app-wide filter. Every tab can read it, change it and listen for changes,
// so a filter picked on one tab is still set on the next. It's saved in this
// browser, and other open tabs of the app pick up changes too.
//
// Right now it holds genre groups (ids from GROUPS in genres.js, plus "none").
// Hooked up so far: the genre chips on the Artists tab.
const STORE_KEY = "playlist-stat:filter";
const listeners = new Set();

let groups = new Set();
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    groups = new Set(Array.isArray(saved.groups) ? saved.groups : []);
  } catch { groups = new Set(); /* storage blocked or bad data */ }
}
load();

function changed() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ groups: [...groups] })); } catch { /* storage blocked */ }
  listeners.forEach(fn => fn());
}

window.addEventListener("storage", e => {
  if (e.key === STORE_KEY) { load(); listeners.forEach(fn => fn()); }
});

export const filter = {
  groups: () => new Set(groups),
  hasGroup: id => groups.has(id),
  active: () => groups.size > 0,
  toggleGroup(id) { groups.has(id) ? groups.delete(id) : groups.add(id); changed(); },
  clear() { groups.clear(); changed(); },
  // Calls fn whenever the filter changes. Returns a function that stops it.
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
