// ============================================================================
// ui/index.js — the single UI entry point. The integrator calls initUI() once
// in main.js. It wires every UI subsystem: HUD, menus, card rendering, overlays.
//
// W3-UI owns this. See CONTRACTS §15 (ui/index.js).
// ============================================================================

import { initHud } from "./hud.js";
import { initMenu } from "./menu.js";
import { initCards } from "./cards_ui.js";
import { initBuildMenu } from "./build_menu.js";
import { initBuildingPanel } from "./building_panel.js";
import { initTileTooltip } from "./tile_tooltip.js";
import { initOverlays } from "./overlays.js";
import { initPauseMenu } from "./pause_menu.js";

export function initUI() {
  initHud();
  initMenu();
  initCards();
  initBuildMenu();
  initBuildingPanel();
  initTileTooltip();
  initOverlays();
  initPauseMenu();
}
