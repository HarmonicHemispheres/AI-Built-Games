// Thin DOM-driven HUD: interact prompt, indicators, toasts. Reads state for per-frame refresh.

export class Hud {
  constructor(els, state) {
    this.els = els;
    this.state = state;
    this._toastTimer = 0;
    this._lastBatteryPct = -1;
  }

  show() { this.els.hud.classList.remove("hidden"); }
  hide() { this.els.hud.classList.add("hidden"); }

  showPrompt(verb) {
    this.els.interactVerb.textContent = verb;
    this.els.interactPrompt.classList.remove("hidden");
  }
  hidePrompt() {
    this.els.interactPrompt.classList.add("hidden");
  }

  toast(message, ms = 2200) {
    this.els.toast.textContent = message;
    this.els.toast.classList.remove("hidden");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.els.toast.classList.add("hidden");
    }, ms);
  }

  update() {
    // Flashlight indicator visible whenever the player has used / picked up a flashlight (battery > 0
    // OR has ever toggled it). To keep things simple in V1: show indicator if battery < 1 OR on.
    const fl = this.state.run.flashlight;
    const showInd = fl.on || fl.battery < 1.0;
    if (showInd) {
      this.els.flashlightIndicator.classList.remove("hidden");
      const pct = Math.round(fl.battery * 100);
      if (pct !== this._lastBatteryPct) {
        this.els.flashlightBar.style.width = `${pct}%`;
        if (pct < 15) {
          this.els.flashlightBar.style.background = "var(--danger)";
        } else {
          this.els.flashlightBar.style.background = "var(--accent)";
        }
        this._lastBatteryPct = pct;
      }
    } else {
      this.els.flashlightIndicator.classList.add("hidden");
    }
  }

  setGrain(enabled) {
    this.els.grain.style.display = enabled ? "block" : "none";
  }
}
