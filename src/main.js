import "./style.css";
import { playlist } from "./data.js";
import * as home from "./pages/home.js";
import * as overview from "./pages/overview.js";
import * as tiers from "./pages/tiers.js";
import * as breakdown from "./pages/breakdown.js";
import { placeholder } from "./pages/placeholder.js";
import { openArtist, closeArtist } from "./artist-sheet.js";

const pages = {
  home: { name: "Home", page: home },
  overview: { name: "Overview", page: overview },
  breakdown: { name: "Breakdown", page: breakdown },
  tiers: { name: "Tier list", page: tiers },
  filter: { name: "Filter", page: placeholder("Filter", "It will let you narrow the playlist down to just the songs you want.") },
  recommend: { name: "Recommend", page: placeholder("Recommend", "It will suggest songs that fit what’s already on the playlist.") },
};

const app = document.getElementById("app");
const mixName = `The ${playlist.songs.length} Mix`;
document.getElementById("wordmark").textContent = mixName;

let shown = null;

function route() {
  // #overview or #overview/Artist%20Name
  if (location.hash.startsWith("#stats")) {
    // The Overview page used to be called Stats; keep old links working.
    history.replaceState(null, "", "#overview" + location.hash.slice("#stats".length));
  }
  const [key, artist] = location.hash.slice(1).split("/");
  const current = pages[key] ? key : "home";
  if (current !== shown) {
    pages[current].page.render(app, playlist);
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
