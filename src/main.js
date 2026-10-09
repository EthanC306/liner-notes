import "./style.css";
import { playlist } from "./data.js";
import * as home from "./pages/home.js";
import * as overview from "./pages/overview.js";
import * as breakdown from "./pages/breakdown.js";
import * as artistsPage from "./pages/artists.js";
import { placeholder } from "./pages/placeholder.js";
import { openArtist, closeArtist } from "./artist-sheet.js";

const pages = {
  home: { name: "Home", page: home },
  overview: { name: "Overview", page: overview },
  breakdown: { name: "Breakdown", page: breakdown },
  artists: { name: "Artists", page: artistsPage },
  filter: { name: "Filter", page: placeholder("Filter", "It will let you narrow the playlist down to just the songs you want.") },
  recommend: { name: "Recommend", page: placeholder("Recommend", "It will suggest songs that fit what’s already on the playlist.") },
};

const app = document.getElementById("app");

// The top bar's height, for anything that sticks just below it (like the Breakdown legend).
// It changes with the window: on phones the page links wrap onto their own line.
const topbar = document.querySelector(".topbar");
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--topbar-h", topbar.offsetHeight + "px");
}).observe(topbar);
const mixName = `The ${playlist.songs.length} Mix`;
document.getElementById("wordmark").textContent = mixName;

let shown = null;

function route() {
  // #overview or #overview/Artist%20Name
  if (location.hash.startsWith("#stats")) {
    // The Overview page used to be called Stats; keep old links working.
    history.replaceState(null, "", "#overview" + location.hash.slice("#stats".length));
  }
  if (location.hash.startsWith("#tiers")) {
    // The tier list now lives on the Artists page.
    history.replaceState(null, "", "#artists");
    requestAnimationFrame(() => document.getElementById("tierListHere")?.scrollIntoView());
  }
  const [key, artist] = location.hash.slice(1).split("/");
  const current = pages[key] ? key : "home";
  if (current !== shown) {
    // A fresh element per visit, so the click handlers a page adds go away with it
    // instead of piling up on #app each time the page is opened.
    const pageRoot = document.createElement("div");
    pageRoot.className = "page";
    app.replaceChildren(pageRoot);
    pages[current].page.render(pageRoot, playlist);
    shown = current;
    window.scrollTo(0, 0);
    app.querySelector("h1")?.focus({ preventScroll: true });
  }
  if (artist) openArtist(decodeURIComponent(artist));
  else closeArtist();
  document.title = current === "home" ? mixName : `${pages[current].name} – ${mixName}`;
  document.querySelectorAll(".nav a").forEach(a => {
    if (a.getAttribute("href") === "#" + current) {
      a.setAttribute("aria-current", "page");
      a.scrollIntoView({ block: "nearest", inline: "nearest" });  // keep it visible when the links scroll on phones
    }
    else a.removeAttribute("aria-current");
  });
  return current;
}

route();
window.addEventListener("hashchange", route);
