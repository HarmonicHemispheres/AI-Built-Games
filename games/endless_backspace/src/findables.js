import * as THREE from "three";
import { makeRng, hashString } from "./rng.js";

// Static catalog of lore + visual mesh factory for placed findables.
// Findable IDs are stable strings: hard-coded for plot-relevant items, hashed
// from chunk seed for procedural ones. Procedural findables fall back to a
// generic generator that uses the id-hash to pick a flavor variant.

export const DOCUMENTS = {
  doc_welcome: {
    title: "MEMORANDUM — Sec. 4 / Subsector B",
    body: [
      "<span class='stamp'>FOR INTERNAL DISTRIBUTION ONLY</span>",
      "<p>Welcome to your assignment. Your access credentials have been issued under the cubicle assignment system. " +
      "If you have arrived at this desk without prior orientation, please remain calm.</p>",
      "<p>Orientation will be conducted <span class='redacted'>at a later date</span>. " +
      "In the meantime, you are authorized to traverse Subsector B corridors and any adjoining offices " +
      "marked with the <span class='redacted'>blue placard</span>. Other sectors require additional clearance.</p>",
      "<p>Per Director's standing instruction: <strong>do not look directly into mirrored surfaces</strong> " +
      "in observation chambers. Mirrors that respond unusually should be reported to facility safety on the " +
      "intercom marked 4 / 14 / 22.</p>",
      "<p>If you feel that you have been here before but cannot account for the passage of time, this is " +
      "<span class='redacted'>normal</span>. Continue your assigned duties.</p>",
      "<p style='text-align:right;font-size:0.85em;color:#8a8270;'>— D. <span class='redacted'>██████</span>, Acting Director, " +
      "<span class='redacted'>██/██/197█</span></p>",
    ].join("\n"),
  },
};

const GENERIC_DOCUMENT_VARIANTS = [
  {
    title: "INTAKE FORM 117-C — Personnel Acquisition",
    lines: [
      "<span class='stamp'>RESTRICTED</span>",
      "<p>Subject was retrieved from <span class='redacted'>██████████</span>, Iowa, on the date in margin. " +
      "Initial cooperation acceptable. Subject is unaware of the nature of the program and is to remain so " +
      "until phase II.</p>",
      "<p>Effective dosing schedule remains under review. Previous adjustments at <span class='redacted'>██</span> mg " +
      "produced verbalization consistent with prior cohorts.</p>",
      "<p>Recommend transfer to <span class='redacted'>███████</span> Wing for continued observation.</p>",
    ],
  },
  {
    title: "BUDGET ADDENDUM — Q3 Operations",
    lines: [
      "<span class='stamp'>EYES ONLY</span>",
      "<p>Increase line-item 14.4 (<em>fluorescent ballast replacement</em>) by 312% relative to prior quarter. " +
      "Maintenance cites recurring failures in Subsectors C, F, and L despite recent replacements.</p>",
      "<p>Per Director's note, this is not to be raised at the quarterly review.</p>",
      "<p>Line-item 22.8 (<em>chalk and erasers</em>) doubled at request of Subject 14.</p>",
    ],
  },
  {
    title: "INCIDENT LOG — Stairwell 3 / 4",
    lines: [
      "<span class='stamp'>INCIDENT</span>",
      "<p>At <span class='redacted'>██:██</span> personnel reported descending the stairwell in Subsector 3/4 for " +
      "approximately eighteen minutes before reaching the next landing. Stairwell was previously calibrated at " +
      "ninety seconds per landing.</p>",
      "<p>Personnel was found unharmed but disoriented. Personnel was reassigned to administrative duties on the " +
      "upper level and has not been permitted into stairwells since.</p>",
      "<p>Recommend posting placards: <em>Do not count steps.</em></p>",
    ],
  },
  {
    title: "HANDWRITTEN NOTE",
    lines: [
      "<p>I should not have signed it. I should not have signed it. I should not have signed it.</p>",
      "<p>If you are reading this and you are me, then I have failed. If you are reading this and you are not " +
      "me, then I am sorry, and you should leave by the way you came in if the way you came in still exists.</p>",
      "<p>The mirror in 22-B is wrong. Do not look at the mirror in 22-B.</p>",
    ],
  },
  {
    title: "MEMO — Personnel Re-orientation",
    lines: [
      "<span class='stamp'>FOR INTERNAL DISTRIBUTION ONLY</span>",
      "<p>It has been brought to the Director's attention that several personnel have been observed signing " +
      "into the same workstation on consecutive days using <span class='redacted'>two different names</span>. " +
      "This is to be addressed in the next staff meeting, the date of which has not yet been determined.</p>",
      "<p>Until clarification is issued, personnel should sign in using the name they most recently <em>recall</em> " +
      "being assigned.</p>",
    ],
  },
];

const TAPE_VARIANTS = [
  {
    title: "TAPE — interview 04 / partial",
    lines: [
      "<p><em>[the tape begins mid-sentence. tape hiss. occasional clicks from a metal table.]</em></p>",
      "<p>— and then you said you'd been here for nine days.</p>",
      "<p>I said it felt like nine days. I never said I'd been here for nine days.</p>",
      "<p>How long do you think you've been here?</p>",
      "<p><em>[long pause]</em></p>",
      "<p>I think I have always been here. I think I keep starting again at the same desk. I think one of you " +
      "is also me.</p>",
      "<p><em>[the tape ends.]</em></p>",
    ],
  },
  {
    title: "TAPE — recording, unattributed",
    lines: [
      "<p><em>[tape hiss. a desk lamp's transformer hum. someone breathing.]</em></p>",
      "<p><em>[forty-one seconds of silence.]</em></p>",
      "<p><em>[the breathing stops.]</em></p>",
      "<p><em>[the tape continues for two minutes and twelve seconds.]</em></p>",
    ],
  },
];

const POLAROID_VARIANTS = [
  {
    title: "POLAROID — undated",
    lines: [
      "<p><em>A polaroid of this room, taken from a higher angle than is possible inside this room.</em></p>",
      "<p>In the photograph, the chair is occupied. The figure in the chair is facing the wall.</p>",
      "<p>You do not recognize the figure.</p>",
      "<p>The figure is wearing your shoes.</p>",
    ],
  },
  {
    title: "POLAROID — Subsector B foyer",
    lines: [
      "<p><em>A polaroid of an empty foyer. The government seal on the floor is clearly visible.</em></p>",
      "<p>In the corner of the photograph, near the edge of the frame, a hand is visible.</p>",
      "<p>The hand is reaching out from inside the seal.</p>",
    ],
  },
];

// Look up lore content for a given id+type. For generic ids we hash to a stable variant.
export function findableContent(type, id) {
  if (type === "document") {
    if (DOCUMENTS[id]) return DOCUMENTS[id];
    const v = GENERIC_DOCUMENT_VARIANTS[hashString(id) % GENERIC_DOCUMENT_VARIANTS.length];
    return { title: v.title, body: v.lines.join("\n") };
  }
  if (type === "tape") {
    const v = TAPE_VARIANTS[hashString(id) % TAPE_VARIANTS.length];
    return { title: v.title, body: v.lines.join("\n") };
  }
  if (type === "polaroid") {
    const v = POLAROID_VARIANTS[hashString(id) % POLAROID_VARIANTS.length];
    return { title: v.title, body: v.lines.join("\n") };
  }
  return { title: "Unknown", body: "<p>—</p>" };
}

// ---------- meshes ----------

const sharedMats = {
  paper:    new THREE.MeshStandardMaterial({ color: 0xf5f0e0, emissive: 0x201a08, emissiveIntensity: 0.25 }),
  battery:  new THREE.MeshStandardMaterial({ color: 0xcc8a30, metalness: 0.5, roughness: 0.4, emissive: 0x6b3a08, emissiveIntensity: 0.5 }),
  tape:     new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.5, emissive: 0x080606, emissiveIntensity: 0.3 }),
  polaroid: new THREE.MeshStandardMaterial({ color: 0xe6dfc8, emissive: 0x1a1408, emissiveIntensity: 0.2 }),
};

export function findableMesh(type) {
  switch (type) {
    case "document": {
      const g = new THREE.BoxGeometry(0.22, 0.01, 0.30);
      const m = new THREE.Mesh(g, sharedMats.paper);
      m.rotation.y = (Math.random() - 0.5) * 0.4;
      return m;
    }
    case "battery": {
      const g = new THREE.CylinderGeometry(0.04, 0.04, 0.16, 12);
      const m = new THREE.Mesh(g, sharedMats.battery);
      m.rotation.z = Math.PI / 2;
      return m;
    }
    case "tape": {
      const g = new THREE.BoxGeometry(0.16, 0.03, 0.10);
      return new THREE.Mesh(g, sharedMats.tape);
    }
    case "polaroid": {
      const g = new THREE.BoxGeometry(0.12, 0.005, 0.14);
      const m = new THREE.Mesh(g, sharedMats.polaroid);
      m.rotation.y = (Math.random() - 0.5) * 0.6;
      return m;
    }
    case "door_up":
    case "door_down": {
      // Invisible volume — the visible door is rendered by the chunk builder; this is just a
      // raycast target with no geometry of its own. Three.js still needs an Object3D for the
      // group hierarchy + userData, so return a tiny empty Object3D.
      return new THREE.Object3D();
    }
    default: {
      const g = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      return new THREE.Mesh(g, sharedMats.paper);
    }
  }
}

// ---------- journal panel ----------

export class Journal {
  constructor(state, listEl, readerEl, tabEls, panelEl, readerOverlay, readerTitleEl, readerBodyEl) {
    this.state = state;
    this.listEl = listEl;
    this.readerEl = readerEl;
    this.tabEls = tabEls; // NodeList of tab buttons
    this.panelEl = panelEl;
    this.readerOverlay = readerOverlay;
    this.readerTitleEl = readerTitleEl;
    this.readerBodyEl = readerBodyEl;
    this.activeTab = "documents";

    for (const btn of this.tabEls) {
      btn.addEventListener("click", () => this.setTab(btn.dataset.tab));
    }
  }

  add(type, id) {
    const bucket = type === "document" ? "documents" : type === "tape" ? "tapes" : "polaroids";
    if (!this.state.run.journal[bucket].includes(id)) {
      this.state.run.journal[bucket].push(id);
    }
    if (!this.state.foundFindables.includes(id)) {
      this.state.foundFindables.push(id);
    }
  }

  setTab(tabName) {
    this.activeTab = tabName;
    for (const btn of this.tabEls) {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    }
    this.render();
  }

  render() {
    if (!this.listEl) return;
    const bucket = this.activeTab; // "documents" | "tapes" | "polaroids"
    const ids = this.state.run?.journal?.[bucket] ?? [];
    if (ids.length === 0) {
      this.listEl.innerHTML = `<li class="journal-empty" style="padding:0.6rem 0.8rem;list-style:none;cursor:default;">Nothing yet.</li>`;
      this.readerEl.innerHTML = `<p class="journal-empty">Select an entry on the left.</p>`;
      return;
    }
    const type = bucket === "documents" ? "document" : bucket === "tapes" ? "tape" : "polaroid";
    this.listEl.innerHTML = ids.map((id) => {
      const c = findableContent(type, id);
      return `<li data-id="${id}">${escapeHtml(c.title)}</li>`;
    }).join("");
    for (const li of this.listEl.querySelectorAll("li[data-id]")) {
      li.addEventListener("click", () => {
        for (const other of this.listEl.querySelectorAll("li")) other.classList.remove("active");
        li.classList.add("active");
        const c = findableContent(type, li.dataset.id);
        this.readerEl.innerHTML = `<h3 style="margin-top:0;font-family:Georgia,serif;color:#b8a070;">${escapeHtml(c.title)}</h3>${c.body}`;
      });
    }
    // Select the first by default
    const first = this.listEl.querySelector("li[data-id]");
    if (first) first.click();
  }

  openReader(type, id) {
    const c = findableContent(type, id);
    this.readerTitleEl.textContent = c.title;
    this.readerBodyEl.innerHTML = c.body;
    this.readerOverlay.classList.remove("hidden");
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
