import { esc } from "../util.js";

// The printed label side of a blank CD-R, with a title written on it in marker.
export function labelDisc(title, note) {
  return `
  <div class="disc-wrap label-wrap" aria-hidden="true">
    <div class="disc label spin"></div>
    <svg class="disc-svg spin" viewBox="0 0 100 100">
      <g class="ruled">
        <line x1="16" y1="70" x2="84" y2="70"/>
        <line x1="20" y1="78" x2="80" y2="78"/>
        <line x1="27" y1="86" x2="73" y2="86"/>
      </g>
      <text class="printed" x="50" y="22" text-anchor="middle">CD-R  80 min  700 MB</text>
      <text class="written" x="50" y="66.5" text-anchor="middle" transform="rotate(-2 50 66.5)">${esc(title)}</text>
      ${note ? `<text class="written small" x="52" y="76" text-anchor="middle" transform="rotate(-1.5 52 76)">${esc(note)}</text>` : ""}
    </svg>
  </div>`;
}
