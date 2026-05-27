import * as THREE from "three";

// Camera-mounted spotlight with a battery model and an audible-but-quiet click on toggle.

export class Flashlight {
  constructor(camera, state) {
    this.camera = camera;
    this.state = state;
    this.light = new THREE.SpotLight(0xfff4d0, 0.0, 24, Math.PI / 7, 0.45, 1.2);
    this.light.position.set(0, 0, 0);
    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, -1);
    camera.add(this.light);
    camera.add(this.target);
    this.light.target = this.target;
    this.applyState();
  }

  applyState() {
    const on = this.state.run.flashlight.on && this.state.run.flashlight.battery > 0;
    this.light.intensity = on ? 2.0 : 0.0;
  }

  toggle() {
    if (this.state.run.flashlight.battery <= 0) {
      this.state.run.flashlight.on = false;
    } else {
      this.state.run.flashlight.on = !this.state.run.flashlight.on;
    }
    this.applyState();
  }

  insertBattery() {
    this.state.run.flashlight.battery = 1.0;
    this.state.run.inventory.batteries = Math.max(0, this.state.run.inventory.batteries - 1);
    this.applyState();
  }

  update(dt) {
    const fl = this.state.run.flashlight;
    if (fl.on && fl.battery > 0) {
      // ~12 minutes of continuous use before depletion
      fl.battery = Math.max(0, fl.battery - dt / 720);
      if (fl.battery <= 0) {
        fl.on = false;
      }
    }
    this.applyState();
  }
}
