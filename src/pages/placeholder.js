import { esc } from "../util.js";
import { labelDisc } from "./label-disc.js";

// A page that isn't built yet: a blank disc with the page name on it.
export function placeholder(title, purpose) {
  return {
    render(root) {
      root.innerHTML = `
      <section class="blank">
        ${labelDisc(title.toLowerCase(), "blank")}
        <div class="blank-text">
          <h1 tabindex="-1">${esc(title)}</h1>
          <p class="lede">Nothing on this page yet. ${esc(purpose)}</p>
          <p><a class="button" href="#overview">Go to Overview</a></p>
        </div>
      </section>`;
    },
  };
}
