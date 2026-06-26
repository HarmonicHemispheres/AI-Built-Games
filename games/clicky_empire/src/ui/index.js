// ============================================================================
// ui/index.js — the single UI entry point. The integrator calls initUI() once
// in main.js. It wires every UI subsystem: HUD, menus, card rendering, overlays.
//
// W3-UI owns this. See CONTRACTS §15 (ui/index.js).
// ============================================================================

import { initHud } from "./hud.js";
import { initMenu } from "./menu.js";
import { initCards } from "./cards_ui.js";
import { initOverlays } from "./overlays.js";

export function initUI() {
  initHud();
  initMenu();
  initCards();
  initOverlays();
}
