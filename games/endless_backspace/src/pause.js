// Pause overlay + panel switching + settings binding.
// Owns no game logic — only DOM wiring and small helpers the main module hooks into.

export class PauseUi {
  constructor(els, state, handlers) {
    this.els = els;
    this.state = state;
    this.handlers = handlers; // { onResume, onSaveQuit }

    this.els.btnResume.addEventListener("click", () => this.handlers.onResume?.());
    this.els.btnJournal.addEventListener("click", () => this.openPanel("journal"));
    this.els.btnMap.addEventListener("click", () => this.openPanel("map-panel"));
    this.els.btnSettings.addEventListener("click", () => this.openPanel("settings-panel"));
    this.els.btnSaveQuit.addEventListener("click", () => this.handlers.onSaveQuit?.());

    for (const btn of document.querySelectorAll(".panel-close")) {
      btn.addEventListener("click", () => {
        const id = btn.dataset.close;
        document.getElementById(id)?.classList.add("hidden");
      });
    }

    // Settings bindings
    const s = this.state.settings;
    bindRange(this.els.setSens, s, "mouseSensitivity", parseFloat);
    bindRange(this.els.setFov, s, "fov", (v) => parseInt(v, 10), () => this.handlers.onFovChange?.());
    bindRange(this.els.setBrightness, s, "brightness", parseFloat, () => this.handlers.onBrightnessChange?.());
    bindRange(this.els.setMaster, s, "masterVolume", parseFloat);
    bindCheckbox(this.els.setHeadbob, s, "headBob");
    bindCheckbox(this.els.setGrain, s, "filmGrain", () => this.handlers.onGrainChange?.(s.filmGrain));

    // Apply current values to inputs
    this.els.setSens.value = String(s.mouseSensitivity);
    this.els.setFov.value = String(s.fov);
    this.els.setBrightness.value = String(s.brightness);
    this.els.setMaster.value = String(s.masterVolume);
    this.els.setHeadbob.checked = !!s.headBob;
    this.els.setGrain.checked = !!s.filmGrain;
  }

  show() {
    this.els.pause.classList.remove("hidden");
    this.els.seedDisplay.textContent = `seed: ${this.state.run?.seed ?? "—"}`;
  }
  hide() {
    this.els.pause.classList.add("hidden");
    this.closeAllPanels();
  }

  openPanel(id) {
    this.closeAllPanels();
    document.getElementById(id)?.classList.remove("hidden");
  }

  closeAllPanels() {
    for (const id of ["journal", "map-panel", "settings-panel", "reader", "credits"]) {
      document.getElementById(id)?.classList.add("hidden");
    }
  }
}

function bindRange(input, target, key, parse, after) {
  input.addEventListener("input", () => {
    target[key] = parse(input.value);
    if (after) after();
  });
}
function bindCheckbox(input, target, key, after) {
  input.addEventListener("change", () => {
    target[key] = input.checked;
    if (after) after();
  });
}
