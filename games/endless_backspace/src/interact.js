// Pulls together: player aim → world raycast → HUD prompt → E-key consumption.

export class InteractSystem {
  constructor(player, world, state, hud, journal, flashlight, opts = {}) {
    this.player = player;
    this.world = world;
    this.state = state;
    this.hud = hud;
    this.journal = journal;
    this.flashlight = flashlight;
    this.onLevelTransition = opts.onLevelTransition ?? (() => {});
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
      this.player.position.x, this.player.position.z, dir.x, dir.z, 2.4,
    );
    if (hit !== this.current) {
      this.current = hit;
      if (hit) {
        this.hud.showPrompt(verbFor(hit.type, this.world.currentLevel));
      } else {
        this.hud.hidePrompt();
      }
    }
  }

  tryUse() {
    const it = this.current;
    if (!it) return;

    if (it.type === "battery") {
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

    if (it.type === "document" || it.type === "tape" || it.type === "polaroid") {
      this.journal.add(it.type, it.id);
      this.world.collectInteractable(it);
      this.world.registerFound(it.id);
      this.player.releaseLock();
      this.journal.openReader(it.type, it.id);
      this.hud.toast("Journal updated");
      this.current = null;
      this.hud.hidePrompt();
      return;
    }

    if (it.type === "door_up") {
      // Stairwell sealed door — transition between facility levels. The door is persistent
      // (doesn't get collected). We hand off to the host (main.js) which knows how to
      // re-position the player on the destination level.
      this.onLevelTransition();
      this.current = null;
      this.hud.hidePrompt();
      return;
    }
  }
}

function verbFor(type, currentLevel) {
  switch (type) {
    case "battery": return "pick up";
    case "document": return "read";
    case "tape": return "play";
    case "polaroid": return "examine";
    case "door_up":
      // Going UP if on level 0, DOWN if returning from level 1+. The world tracks the
      // current level and decides direction in the main.js callback.
      return currentLevel === 0 ? "ascend" : "descend";
    default: return "interact";
  }
}
