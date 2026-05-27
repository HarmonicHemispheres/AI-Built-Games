import * as THREE from "three";

// First-person controller with pointer-lock + WASD movement + collision against world walls.

export class Player {
  constructor(camera, domElement, world, state) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.state = state;

    this.position = new THREE.Vector3(
      state.run.player.pos.x,
      state.run.player.pos.y,
      state.run.player.pos.z,
    );
    this.yaw = state.run.player.yaw;
    this.pitch = state.run.player.pitch;
    this.radius = 0.3;
    this.eyeHeight = 1.6;
    this.crouchHeight = 1.0;
    this.crouching = false;
    this.bobPhase = 0;
    this.locked = false;

    this.keys = Object.create(null);

    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.domElement;
      if (this._onLockChange) this._onLockChange(this.locked);
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      const sens = 0.002 * (this.state.settings.mouseSensitivity ?? 1.0);
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      const limit = Math.PI / 2 - 0.02;
      if (this.pitch > limit) this.pitch = limit;
      if (this.pitch < -limit) this.pitch = -limit;
    };
    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };

    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);

    this.applyTransform();
  }

  dispose() {
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
  }

  requestLock() {
    this.domElement.requestPointerLock?.();
  }

  releaseLock() {
    document.exitPointerLock?.();
  }

  setOnLockChange(fn) { this._onLockChange = fn; }

  applyTransform() {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  update(dt) {
    if (!this.locked) {
      this.applyTransform();
      return;
    }

    // Crouch
    const wantCrouch = !!this.keys["ControlLeft"] || !!this.keys["ControlRight"];
    this.crouching = wantCrouch;
    const targetY = wantCrouch ? this.crouchHeight : this.eyeHeight;
    this.position.y += (targetY - this.position.y) * Math.min(1, dt * 12);

    // Movement vectors
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forward = new THREE.Vector3(-sin, 0, -cos);
    const right = new THREE.Vector3(cos, 0, -sin);
    const move = new THREE.Vector3();
    if (this.keys["KeyW"]) move.add(forward);
    if (this.keys["KeyS"]) move.sub(forward);
    if (this.keys["KeyD"]) move.add(right);
    if (this.keys["KeyA"]) move.sub(right);

    const running = !!this.keys["ShiftLeft"] || !!this.keys["ShiftRight"];
    let speed = wantCrouch ? 1.6 : running ? 4.6 : 2.8;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      this.bobPhase += (running ? 12 : 8) * dt;
    } else {
      this.bobPhase *= 0.92;
    }

    // Apply X then Z separately so the player slides along walls instead of getting stuck.
    const newX = this.position.x + move.x;
    if (!this.world.isBlocked(newX, this.position.z, this.radius)) {
      this.position.x = newX;
    }
    const newZ = this.position.z + move.z;
    if (!this.world.isBlocked(this.position.x, newZ, this.radius)) {
      this.position.z = newZ;
    }

    // Head bob — small vertical wobble while walking
    if (this.state.settings.headBob) {
      const bob = Math.sin(this.bobPhase) * 0.025 * Math.min(1, move.length() / (speed * dt + 1e-4));
      this.camera.position.set(this.position.x, this.position.y + bob, this.position.z);
    } else {
      this.camera.position.copy(this.position);
    }

    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;

    // Persist back into state so saves capture latest pose
    this.state.run.player.pos.x = this.position.x;
    this.state.run.player.pos.y = this.position.y;
    this.state.run.player.pos.z = this.position.z;
    this.state.run.player.yaw = this.yaw;
    this.state.run.player.pitch = this.pitch;
  }

  forwardDir() {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    return { x: -sin, z: -cos };
  }
}
