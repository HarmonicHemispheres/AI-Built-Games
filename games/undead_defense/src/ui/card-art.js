// Hearthstone-style card renderer. Produces a portrait-oriented decorated
// card element. Used by deck-select, draft, hand, and collection views.
//
// renderCard(opts) -> HTMLElement
//   opts.kind:   "unit" | "upgrade" | "locked"
//   opts.unit?:  UNITS[id]   (for unit cards)
//   opts.upgrade?: UPGRADES[id]
//   opts.size:   "lg" | "sm"  (lg = draft/deck, sm = hand)
//   opts.onClick: optional click handler
//   opts.selected: bool (highlight)
//   opts.depleted: bool (faded)

const UNIT_PORTRAITS = {
  sentry:     drawSentry,
  bulwark:    drawBulwark,
  scrapper:   drawScrapper,
  lancer:     drawLancer,
  bolter:     drawBolter,
  hornet:     drawHornet,
  wall:       drawWall,
  spike_trap: drawSpikeTrap,
};

export function renderCard(opts) {
  const el = document.createElement("div");
  el.className = `hs-card hs-${opts.size || "lg"} rarity-${opts.unit?.rarity || opts.upgrade?.rarity || "common"} kind-${opts.kind}`;
  if (opts.selected) el.classList.add("selected");
  if (opts.depleted) el.classList.add("depleted");
  if (opts.locked)   el.classList.add("locked");

  if (opts.kind === "unit" && opts.unit) {
    const u = opts.unit;
    el.innerHTML = `
      <div class="hs-art-frame"><svg class="hs-art" viewBox="-30 -30 60 60" preserveAspectRatio="xMidYMid meet"></svg></div>
      <div class="hs-gem"></div>
      <div class="hs-name-banner"><div class="hs-name">${opts.locked ? "???" : u.name}</div></div>
      <div class="hs-tags">${u.tags.join(" · ")}</div>
      <div class="hs-desc">${opts.locked ? "Locked card. Draft to unlock." : u.desc}</div>
      <div class="hs-stats">
        <div class="hs-stat hs-stat-hp"  title="Health">${Math.round(u.hp)}</div>
        <div class="hs-stat hs-stat-dmg" title="Damage">${Math.round(u.dmg)}</div>
        <div class="hs-stat hs-stat-rng" title="Range">${u.range > 0 ? u.range.toFixed(1) : "—"}</div>
      </div>
    `;
    // Draw portrait via inline SVG painter.
    if (!opts.locked) {
      const svg = el.querySelector(".hs-art");
      drawUnitPortrait(svg, u.id);
    }
  } else if (opts.kind === "upgrade" && opts.upgrade) {
    const up = opts.upgrade;
    el.innerHTML = `
      <div class="hs-art-frame upgrade"><svg class="hs-art" viewBox="-30 -30 60 60" preserveAspectRatio="xMidYMid meet">
        <defs><radialGradient id="ug-${up.id}" cx="0" cy="0" r="0.7"><stop offset="0%" stop-color="#ffd76b"/><stop offset="100%" stop-color="#7b5a1a"/></radialGradient></defs>
        <circle cx="0" cy="0" r="22" fill="url(#ug-${up.id})"/>
        <path d="M-12 0 L0 -18 L12 0 L0 18 Z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
      </svg></div>
      <div class="hs-gem"></div>
      <div class="hs-name-banner"><div class="hs-name">${up.name}</div></div>
      <div class="hs-tags">UPGRADE${up.tag ? " · " + up.tag : ""}</div>
      <div class="hs-desc">${up.desc}</div>
    `;
  }

  if (opts.onClick && !opts.locked && !opts.depleted) {
    el.addEventListener("click", opts.onClick);
    el.style.cursor = "pointer";
  }
  return el;
}

function drawUnitPortrait(svgEl, unitId) {
  const ns = "http://www.w3.org/2000/svg";
  const paint = UNIT_PORTRAITS[unitId];
  if (!paint) return;
  paint(svgEl, ns);
}

// --- portrait painters (use SVG so they scale crisply at any card size) ---

function drawSentry(svg, ns) {
  add(svg, ns, "circle", { cx: 0, cy: 0, r: 16, fill: "#9dd0e0", stroke: "#0c1115", "stroke-width": 1.5 });
  add(svg, ns, "rect", { x: 0, y: -4, width: 22, height: 8, fill: "#0c1115" });
  add(svg, ns, "rect", { x: 18, y: -5, width: 6, height: 10, fill: "#7ad6b3" });
  add(svg, ns, "circle", { cx: 0, cy: 0, r: 6, fill: "#0c1115" });
}
function drawBulwark(svg, ns) {
  add(svg, ns, "rect", { x: -18, y: -18, width: 36, height: 36, rx: 5, fill: "#7e9aa8", stroke: "#0c1115", "stroke-width": 1.5 });
  add(svg, ns, "rect", { x: -10, y: -10, width: 20, height: 20, rx: 3, fill: "#0c1115" });
  add(svg, ns, "rect", { x: -5, y: -5, width: 10, height: 10, fill: "#9dd0e0" });
}
function drawScrapper(svg, ns) {
  add(svg, ns, "polygon", { points: "-14,-16 16,0 -14,16", fill: "#b9d9c5", stroke: "#0c1115", "stroke-width": 1.5 });
  add(svg, ns, "circle", { cx: 0, cy: 0, r: 5, fill: "#0c1115" });
}
function drawLancer(svg, ns) {
  add(svg, ns, "rect", { x: -16, y: -10, width: 26, height: 20, rx: 4, fill: "#dceaff", stroke: "#0c1115", "stroke-width": 1.5 });
  add(svg, ns, "rect", { x: 8, y: -2, width: 22, height: 4, fill: "#0c1115" });
  add(svg, ns, "rect", { x: 24, y: -4, width: 6, height: 8, fill: "#7ad6b3" });
}
function drawBolter(svg, ns) {
  add(svg, ns, "ellipse", { cx: 0, cy: 14, rx: 14, ry: 4, fill: "rgba(0,0,0,0.35)" });
  add(svg, ns, "polygon", { points: "0,-18 14,10 -14,10", fill: "#c3a9e6", stroke: "#0c1115", "stroke-width": 1.5 });
  add(svg, ns, "circle", { cx: 0, cy: -2, r: 4, fill: "#0c1115" });
}
function drawHornet(svg, ns) {
  add(svg, ns, "ellipse", { cx: 0, cy: 14, rx: 16, ry: 4, fill: "rgba(0,0,0,0.35)" });
  add(svg, ns, "ellipse", { cx: 0, cy: 0, rx: 18, ry: 12, fill: "#f0a04b", stroke: "#0c1115", "stroke-width": 1.5 });
  add(svg, ns, "rect", { x: -18, y: -2, width: 6, height: 4, fill: "#0c1115" });
  add(svg, ns, "rect", { x: 12, y: -2, width: 6, height: 4, fill: "#0c1115" });
  add(svg, ns, "circle", { cx: 0, cy: 0, r: 4, fill: "#0c1115" });
}
function drawWall(svg, ns) {
  add(svg, ns, "rect", { x: -20, y: -20, width: 40, height: 40, rx: 4, fill: "#b4a484", stroke: "#0c1115", "stroke-width": 1.5 });
  for (const [x, y] of [[-10,-10],[10,-10],[-10,10],[10,10]]) {
    add(svg, ns, "rect", { x: x - 6, y: y - 6, width: 12, height: 12, fill: "rgba(0,0,0,0.35)" });
  }
}
function drawSpikeTrap(svg, ns) {
  add(svg, ns, "circle", { cx: 0, cy: 0, r: 18, fill: "rgba(0,0,0,0.4)" });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x1 = Math.cos(a) * 6, y1 = Math.sin(a) * 6;
    const x2 = Math.cos(a) * 18, y2 = Math.sin(a) * 18;
    add(svg, ns, "line", { x1, y1, x2, y2, stroke: "#e26b5c", "stroke-width": 2.5, "stroke-linecap": "round" });
  }
}

function add(svg, ns, tag, attrs) {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  svg.appendChild(el);
}
