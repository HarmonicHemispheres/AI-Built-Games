import { state, SCENE, setScene } from "../state.js";
import { playSfx } from "../audio/sfx.js";

const $ = (sel) => document.querySelector(sel);

export function showResult(win, onMenu) {
  $("#result-scene").classList.remove("hidden");
  const title = $("#result-title");
  title.textContent = win ? "CONTAINED" : "BREACHED";
  title.classList.toggle("lose", !win);
  $("#result-body").textContent = win
    ? "The breach holds. The outbreak is contained — for now."
    : "Containment lost. The horde has overwhelmed your defenses.";
  $("#result-round").textContent = state.run.round;
  $("#result-kills").textContent = state.meta.totalKills;
  $("#btn-result-menu").onclick = () => {
    playSfx("click");
    $("#result-scene").classList.add("hidden");
    onMenu();
  };
  playSfx(win ? "win" : "lose");
}
