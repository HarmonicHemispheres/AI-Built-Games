import { state } from "../state.js";
import { getSelectedUnits } from "./selection.js";
import { STANCE, setStance } from "../units/behavior.js";

export function commandMove(tx, ty) {
  for (const u of getSelectedUnits()) {
    if (u.immobile) continue;
    u.command = { type: "move", tx, ty };
    u.target = null;
  }
}

export function commandAttack(target) {
  if (!target) return;
  for (const u of getSelectedUnits()) {
    u.command = { type: "attack", target };
    u.target = target;
  }
}

export function commandAttackMove(tx, ty) {
  for (const u of getSelectedUnits()) {
    if (u.immobile) continue;
    u.command = { type: "attack-move", tx, ty };
    u.target = null;
  }
}

export function commandStop() {
  for (const u of getSelectedUnits()) {
    u.command = null;
    u.target = null;
    u.anchor = { x: u.x, y: u.y };
  }
}

export function cycleStance() {
  const order = [STANCE.DEFEND, STANCE.SEEK, STANCE.SENTRY];
  for (const u of getSelectedUnits()) {
    const i = order.indexOf(u.stance);
    setStance(u, order[(i + 1) % order.length]);
  }
}

export function setStanceForSelection(stance) {
  for (const u of getSelectedUnits()) setStance(u, stance);
}
