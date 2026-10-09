// Tier list: every artist starts in the unranked pile and gets dragged into a tier.
// Mouse drags right away; touch drags after a short press so swiping still scrolls.
// Without dragging: tap an artist, then tap a tier, or focus one and press S/A/B/C/D/F.
import { esc } from "../util.js";

const TIERS = ["S", "A", "B", "C", "D", "F"];
const STORE_KEY = "playlist-stat:tiers";

function load(names) {
  const tiers = Object.fromEntries(TIERS.map(t => [t, []]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    const seen = new Set();
    for (const t of TIERS) {
      for (const n of saved[t] || []) if (names.has(n) && !seen.has(n)) { tiers[t].push(n); seen.add(n); }
    }
  } catch { /* storage blocked or bad data: start empty */ }
  return tiers;
}
function save(tiers) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(tiers)); } catch { /* storage blocked */ }
}

const initials = name => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

// Drawn inside the Artists page, below the artist grid.
export function render(root, { artists }) {
  const byName = new Map(artists.map(a => [a.name, a]));
  const tiers = load(new Set(byName.keys()));
  let selected = null;   // name picked by tap or keyboard, waiting for a tier
  let query = "";
  let confirmingReset = false;

  root.innerHTML = `
  <section class="tier-page" aria-labelledby="tierH">
    <header class="tier-head">
      <div>
        <h2 id="tierH">Tier list</h2>
        <p class="muted">Drag artists from the pile into a tier, or tap an artist and then a tier. With a keyboard, select one and press S, A, B, C, D or F. Saved in this browser.</p>
      </div>
      <button type="button" class="ghost-btn" id="resetTiers">Move everyone back</button>
    </header>

    <div class="tier-board" id="board">
      ${TIERS.map((t, i) => `
        <div class="tier-row" data-tier="${t}" style="--step:${i}">
          <button type="button" class="tier-label" data-place="${t}" aria-label="Put the selected artist in tier ${t}">${t}</button>
          <ol class="tier-drop" data-zone="${t}" aria-label="Tier ${t}"></ol>
        </div>`).join("")}
    </div>

    <section class="pool" aria-labelledby="poolH">
      <div class="pool-head">
        <h2 id="poolH">Unranked <span class="muted" id="poolCount"></span></h2>
        <input id="poolSearch" class="search" type="search" placeholder="Find an artist" aria-label="Find an artist in the unranked pile" autocomplete="off">
      </div>
      <ol class="tier-drop pool-drop" data-zone="pool" aria-label="Unranked artists"></ol>
      <p class="empty" id="poolEmpty" hidden></p>
    </section>
    <p class="sr-only" aria-live="polite" id="tierStatus"></p>
  </section>`;

  const $ = s => root.querySelector(s);
  const status = msg => { $("#tierStatus").textContent = msg; };

  const tierOf = name => TIERS.find(t => tiers[t].includes(name)) || null;

  function tile(name) {
    const a = byName.get(name);
    return `<li class="tile${selected === name ? " picked" : ""}" data-name="${esc(name)}">
      <button type="button" class="tile-btn" aria-pressed="${selected === name}"
        aria-label="${esc(name)}, ${a.count} songs${tierOf(name) ? `, tier ${tierOf(name)}` : ", unranked"}">
        ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" draggable="false">` : `<span class="tile-initials" aria-hidden="true">${esc(initials(name))}</span>`}
        <span class="tile-name">${esc(name)}</span>
      </button>
    </li>`;
  }

  function draw() {
    for (const t of TIERS) {
      $(`[data-zone="${t}"]`).innerHTML = tiers[t].map(tile).join("") ||
        `<li class="drop-hint" aria-hidden="true">Drop artists here</li>`;
    }
    const ranked = new Set(TIERS.flatMap(t => tiers[t]));
    const unranked = artists.filter(a => !ranked.has(a.name));
    const q = query.toLowerCase();
    const shown = q ? unranked.filter(a => a.name.toLowerCase().includes(q)) : unranked;
    $(".pool-drop").innerHTML = shown.map(a => tile(a.name)).join("");
    $("#poolCount").textContent = `${unranked.length} of ${artists.length}`;
    const empty = $("#poolEmpty");
    empty.hidden = shown.length > 0;
    empty.textContent = unranked.length ? `No unranked artist matches “${query}”.` : "Every artist has a tier.";
    root.querySelector(".tier-board").classList.toggle("placing", !!selected);
    $("#resetTiers").textContent = confirmingReset ? "Yes, move everyone back" : "Move everyone back";
  }

  // Moves an artist into a tier at an index (or the end), or back to the pile with tier "pool".
  function place(name, zone, index = null) {
    for (const t of TIERS) tiers[t] = tiers[t].filter(n => n !== name);
    if (zone !== "pool") {
      const list = tiers[zone];
      list.splice(index == null ? list.length : Math.min(index, list.length), 0, name);
    }
    save(tiers);
    selected = null;
    draw();
    status(zone === "pool" ? `${name} moved back to unranked.` : `${name} placed in tier ${zone}.`);
  }

  function focusTile(name) {
    root.querySelector(`.tile[data-name="${CSS.escape(name)}"] .tile-btn`)?.focus();
  }

  // ---------- tap / click and keyboard ----------
  root.addEventListener("click", e => {
    if (dragJustEnded) return;
    const label = e.target.closest("[data-place]");
    if (label && selected) { const n = selected; place(n, label.dataset.place); focusTile(n); return; }
    const t = e.target.closest(".tile");
    if (t) {
      selected = selected === t.dataset.name ? null : t.dataset.name;
      draw();
      if (selected) { status(`${selected} selected. Tap a tier or press S, A, B, C, D or F.`); focusTile(selected); }
      return;
    }
    const zone = e.target.closest(".tier-row");
    if (zone && selected) { const n = selected; place(n, zone.dataset.tier); focusTile(n); }
  });

  root.addEventListener("keydown", e => {
    const t = e.target.closest(".tile");
    if (!t || e.ctrlKey || e.metaKey || e.altKey) return;
    const name = t.dataset.name;
    const key = e.key.toUpperCase();
    if (TIERS.includes(key)) { e.preventDefault(); place(name, key); focusTile(name); return; }
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { e.preventDefault(); place(name, "pool"); return; }
    const tier = tierOf(name);
    if (tier && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const i = tiers[tier].indexOf(name) + (e.key === "ArrowLeft" ? -1 : 1);
      if (i >= 0 && i < tiers[tier].length) { place(name, tier, i); focusTile(name); }
    }
    if (e.key === "Escape" && selected) { selected = null; draw(); focusTile(name); }
  });

  $("#poolSearch").addEventListener("input", e => { query = e.target.value.trim(); draw(); });
  $("#resetTiers").addEventListener("click", () => {
    if (!confirmingReset) { confirmingReset = true; draw(); return; }
    for (const t of TIERS) tiers[t] = [];
    confirmingReset = false; selected = null;
    save(tiers); draw();
    status("Every artist moved back to unranked.");
  });
  $("#resetTiers").addEventListener("blur", () => { if (confirmingReset) { confirmingReset = false; draw(); } });

  // ---------- dragging ----------
  let drag = null;          // { name, el, ghost, marker, dx, dy }
  let pending = null;       // pointer down, not dragging yet
  let dragJustEnded = false;
  const stopScroll = e => e.preventDefault();

  // A long press would otherwise open the phone's image menu instead of dragging.
  root.addEventListener("contextmenu", e => { if (e.target.closest(".tile")) e.preventDefault(); });

  root.addEventListener("pointerdown", e => {
    const t = e.target.closest(".tile");
    if (!t || e.button !== 0) return;
    const r = t.getBoundingClientRect();
    pending = { name: t.dataset.name, el: t, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, timer: null };
    if (e.pointerType !== "mouse") {
      pending.timer = setTimeout(() => pending && startDrag(e.clientX, e.clientY), 220);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  });

  function startDrag(x, y) {
    const { name, el, dx, dy } = pending;
    clearTimeout(pending.timer);
    pending = null;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add("tile-ghost");
    ghost.style.width = r.width + "px";
    document.body.appendChild(ghost);
    const marker = document.createElement("li");
    marker.className = "drop-marker";
    marker.setAttribute("aria-hidden", "true");
    el.classList.add("dragging");
    drag = { name, el, ghost, marker, dx, dy, x, y };
    requestAnimationFrame(autoScroll);
    document.addEventListener("touchmove", stopScroll, { passive: false });
    document.documentElement.classList.add("is-dragging");
    moveGhost(x, y);
  }

  // Scroll the page while an artist is held near the top or bottom edge,
  // so the pile and the tiers don't have to fit on one screen.
  function autoScroll() {
    if (!drag) return;
    const edge = 80, h = window.innerHeight;
    const speed = drag.y < edge ? -(edge - drag.y) / 4 : drag.y > h - edge ? (drag.y - (h - edge)) / 4 : 0;
    if (speed) { window.scrollBy(0, speed); moveGhost(drag.x, drag.y); }
    requestAnimationFrame(autoScroll);
  }

  function moveGhost(x, y) {
    drag.x = x; drag.y = y;
    drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(-3deg)`;
    const under = document.elementFromPoint(x, y);
    const zone = under?.closest(".tier-row")?.querySelector(".tier-drop") || under?.closest(".pool")?.querySelector(".pool-drop");
    root.querySelectorAll(".drop-over").forEach(z => z.classList.remove("drop-over"));
    if (!zone) { drag.marker.remove(); drag.zone = null; return; }
    zone.classList.add("drop-over");
    drag.zone = zone.dataset.zone;
    if (drag.zone === "pool") { drag.marker.remove(); drag.index = null; return; }
    // Find where in the tier the pointer is: before the first tile it's left of, on its line.
    const tiles = [...zone.querySelectorAll(".tile:not(.dragging)")];
    let index = tiles.length;
    for (let i = 0; i < tiles.length; i++) {
      const r = tiles[i].getBoundingClientRect();
      if (y < r.top) { index = i; break; }
      if (y <= r.bottom && x < r.left + r.width / 2) { index = i; break; }
    }
    drag.index = index;
    const before = tiles[index] || null;
    if (drag.marker.parentNode !== zone || drag.marker.nextSibling !== before) zone.insertBefore(drag.marker, before);
    zone.querySelector(".drop-hint")?.remove();
  }

  function onMove(e) {
    if (pending && e.pointerId === pending.id) {
      const far = Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 6;
      if (pending.timer && far) { cancelPending(); return; }  // touch moved before the press: it's a scroll
      if (!pending.timer && far) startDrag(e.clientX, e.clientY);
    }
    if (drag) moveGhost(e.clientX, e.clientY);
  }

  function onUp() {
    if (drag) {
      const { name, zone, index } = drag;
      endDrag();
      dragJustEnded = true;
      setTimeout(() => { dragJustEnded = false; }, 0);
      // index counts tiles without the dragged one, which is how place() inserts.
      if (zone) place(name, zone, index);
      else draw();
      return;
    }
    cancelPending();
  }
  function onCancel() { if (drag) { endDrag(); draw(); } cancelPending(); }

  function cancelPending() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
    if (!drag) removeWindowListeners();
  }
  function endDrag() {
    drag.ghost.remove();
    drag.marker.remove();
    drag.el.classList.remove("dragging");
    root.querySelectorAll(".drop-over").forEach(z => z.classList.remove("drop-over"));
    document.removeEventListener("touchmove", stopScroll);
    document.documentElement.classList.remove("is-dragging");
    drag = null;
    removeWindowListeners();
  }
  function removeWindowListeners() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  draw();
}
