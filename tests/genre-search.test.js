// @vitest-environment jsdom
// Breakdown's Narrow down: search every specific genre, with a few popular ones below.
import { describe, it, expect } from "vitest";
import { searchGenres } from "../src/genres.js";
import { render } from "../src/pages/breakdown.js";
import { filter } from "../src/filter.js";
import { fixture } from "./helpers.js";

describe("searchGenres", () => {
  const counts = new Map([["emo", 5], ["midwest emo", 9], ["emo rap", 2], ["pop punk", 7], ["Emotional hardcore", 1]]);

  it("matches anywhere in the name, ignoring case, names starting with the search first", () => {
    expect(searchGenres(counts, "EMO").map(([g]) => g)).toEqual(["emo", "emo rap", "Emotional hardcore", "midwest emo"]);
  });

  it("leaves out picked genres, empty searches, and stops at the limit", () => {
    expect(searchGenres(counts, "emo", new Set(["emo"])).map(([g]) => g)).not.toContain("emo");
    expect(searchGenres(counts, "  ")).toEqual([]);
    expect(searchGenres(counts, "e", new Set(), 2)).toHaveLength(2);
  });
});

describe("the genre search on Breakdown", () => {
  const { playlist } = fixture();
  const mount = () => { filter.clear(); const root = document.createElement("div"); document.body.append(root); render(root, playlist, {}); return root; };
  const allGenres = new Set(playlist.songs.flatMap(s => s.genres));

  it("searches every genre, not just the popular ones", () => {
    const root = mount();
    expect(root.querySelector("#genreQ").placeholder).toBe(`Search all ${allGenres.size} genres`);
    expect(root.querySelectorAll("#narrowChips button").length).toBeLessThanOrEqual(8);
    const rare = [...allGenres].find(g => ![...root.querySelectorAll("#narrowChips [data-genre]")].some(b => b.dataset.genre === g));
    const q = root.querySelector("#genreQ");
    q.value = rare; q.dispatchEvent(new Event("input"));
    expect([...root.querySelectorAll("#genreSuggest [data-genre]")].map(b => b.dataset.genre)).toContain(rare);
    root.remove();
  });

  it("picks the top match with Enter, narrows the songs, and removes it from the picked chips", () => {
    const root = mount();
    const q = root.querySelector("#genreQ");
    const genre = [...allGenres][0];
    q.value = genre; q.dispatchEvent(new Event("input"));
    const top = root.querySelector("#genreSuggest [data-genre]").dataset.genre;
    q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(q.value).toBe("");
    expect(root.querySelector("#genreSuggest").hidden).toBe(true);
    const picked = root.querySelector(`#narrowPicked [data-genre="${top}"]`);
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    const shown = root.querySelectorAll("#genreSongs li").length;
    expect(shown).toBe(playlist.songs.filter(s => s.genres.includes(top)).length);
    picked.click();
    expect(root.querySelector("#narrowPicked [data-genre]")).toBeNull();
    expect(root.querySelectorAll("#genreSongs li")).toHaveLength(playlist.songs.length);
    root.remove();
  });
});
