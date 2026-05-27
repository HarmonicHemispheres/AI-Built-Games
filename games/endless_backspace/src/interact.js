// Pulls together: player aim → world raycast → HUD prompt → E-key consumption.

export class InteractSystem {
  constructor(player, world, state, hud, journal, flashlight) {
    this.player = player;
    this.world = world;
    this.state = state;
    this.hud = hud;
    this.journal = journal;
    this.flashlight = flashlight;
    this.current = null;
    this._handler = (e) => {
      if (e.code === "KeyE") this.tryUse();
      else if (e.code === "KeyF") this.flashlight.toggle();
    };
    document.addEventListener("keydown", this._handler);
  }

  dispose() {
    document.removeEventListener("keydown", this._handler);
  }

  update() {
    if (!this.player.locked) {
      this.hud.hidePrompt();
      this.current = null;
      return;
    }
    const dir = this.player.forwardDir();
    const hit = this.world.raycastInteractable(
      this.player.position.x, this.player.position.z, dir.x, dir.z, 2.2,
    );
    if (hit !== this.current) {
      this.current = hit;
      if (hit) {
        this.hud.showPrompt(verbFor(hit.type));
      } else {
        this.hud.hidePrompt();
      }
    }
  }

  tryUse() {
    const it = this.current;
    if (!it) return;
    if (it.type === "battery") {
      // Pickup adds to inventory; auto-install if battery is empty.
      this.state.run.inventory.batteries += 1;
      this.world.collectInteractable(it);
      this.world.registerFound(it.id);
      this.hud.toast("Battery acquired");
      if (this.state.run.flashlight.battery <= 0.05 && this.state.run.inventory.batteries > 0) {
        this.flashlight.insertBattery();
        this.hud.toast("Battery installed");
      }
      this.current = null;
      this.hud.hidePrompt();
      return;
    }
    // Lore items
    if (it.type === "document" || it.type === "tape" || it.type === "polaroid") {
      this.journal.add(it.type, it.id);
      this.world.collectInteractable(it);
      this.world.registerFound(it.id);
      // Release pointer lock so the reader's close button is clickable; player
      // can re-enter pointer lock by clicking the canvas afterward.
      this.player.releaseLock();
      this.journal.openReader(it.type, it.id);
      this.hud.toast(`Journal updated`);
      this.current = null;
      this.hud.hidePrompt();
      return;
    }
  }
}

function verbFor(type) {
  switch (type) {
    case "battery": return "pick up";
    case "document": return "read";
    case "tape": return "play";
    case "polaroid": return "examine";
    default: return "interact";
  }
}
