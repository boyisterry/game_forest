import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Locomotion driven by Tripo official retarget presets
 * (preset:biped:idle / walk / run / jump), crossfaded like a Unity blend tree.
 * References:
 * - Tripo animation retarget docs (in-place presets for game controllers)
 * - Unity Mecanim blend-tree practice: idle↔walk↔run by speed, jump as one-shot
 * - Biological-motion "trot" gait: diagonal limb pairing is authored into Tripo clips
 */

const MODEL_URL = "./rabbit_animated_locomotion.glb";
const TARGET_HEIGHT = 1.35;
const WALK_SPEED = 2.35;
const RUN_SPEED = 4.8;
const TURN_SPEED = 11;
const JUMP_VELOCITY = 5.4;
const GRAVITY = 16;
const CAM_DIST = 4.2;
const CAM_HEIGHT = 1.55;
const FADE = 0.18;
// The exported Tripo mesh faces local +X. Rotate it onto controller forward (+Z).
// Do not derive this from the Hip bone: its bind rotation is not the character axis.
const MODEL_FORWARD_YAW = -Math.PI / 2;

const CLIP_IDLE = "preset:biped:idle";
const CLIP_WALK = "preset:biped:walk";
const CLIP_RUN = "preset:biped:run";
const CLIP_JUMP = "preset:biped:jump";

const canvas = document.getElementById("game");
const bootEl = document.getElementById("boot");
const startEl = document.getElementById("start");
const startBtn = document.getElementById("start-btn");
const hudEl = document.getElementById("hud");
const statusEl = document.getElementById("status");
const posEl = document.getElementById("pos");
const loadBar = document.getElementById("load-bar");
const loadPct = document.getElementById("load-pct");

const keys = new Set();
const clock = new THREE.Clock(false);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#9fc0a8");
scene.fog = new THREE.Fog("#9fc0a8", 18, 55);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.05,
  120,
);
camera.position.set(0, 2.2, -5);

const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x6b8f66, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d0, 1.55);
sun.position.set(8, 14, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 72),
  new THREE.MeshStandardMaterial({
    color: "#6f9a6a",
    roughness: 0.92,
    metalness: 0.02,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(3.2, 3.35, 64),
  new THREE.MeshBasicMaterial({ color: "#dfe9d8", side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.01;
scene.add(ring);

for (let i = 0; i < 18; i += 1) {
  const a = (i / 18) * Math.PI * 2;
  const r = 6 + (i % 3) * 2.2;
  const stump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.9 }),
  );
  stump.position.set(Math.cos(a) * r, 0.175, Math.sin(a) * r);
  stump.castShadow = true;
  stump.receiveShadow = true;
  scene.add(stump);
}

const state = {
  mode: "loading",
  ready: false,
  playing: false,
  pointerLocked: false,
  showBones: false,
  yaw: Math.PI,
  pitch: -0.18,
  moveX: 0,
  moveZ: 0,
  facing: 0,
  velY: 0,
  grounded: true,
  animState: "idle",
  baseClip: "idle",
  jumping: false,
  speed: 0,
  modelYaw: 0,
};

const player = {
  root: new THREE.Group(),
  model: null,
  helper: null,
  scale: 1,
  mixer: null,
  actions: {},
  jumpAction: null,
};

scene.add(player.root);

const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();

function fitModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 0.001);
  const scale = TARGET_HEIGHT / height;
  root.scale.setScalar(scale);
  root.position.x -= center.x * scale;
  root.position.z -= center.z * scale;
  root.position.y -= box.min.y * scale;
  player.scale = scale;
}

/** Keep the exported scene forward aligned with controller facing=0 → world +Z. */
function alignModelYaw(model) {
  state.modelYaw = MODEL_FORWARD_YAW;
  model.rotation.y = MODEL_FORWARD_YAW;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
}

function clipKey(name) {
  if (name.includes("idle")) return "idle";
  if (name.includes("walk")) return "walk";
  if (name.includes("run")) return "run";
  if (name.includes("jump")) return "jump";
  return name;
}

function setupAnimations(gltf) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  player.mixer = mixer;
  const byKey = {};
  for (const clip of gltf.animations) {
    const key = clipKey(clip.name);
    const action = mixer.clipAction(clip);
    if (key === "jump") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.setEffectiveWeight(0);
      player.jumpAction = action;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      byKey[key] = action;
    }
  }
  player.actions = byKey;
  // Start in idle
  if (byKey.idle) {
    byKey.idle.setEffectiveWeight(1);
    state.baseClip = "idle";
    state.animState = "idle";
  }
  mixer.addEventListener("finished", (e) => {
    if (e.action === player.jumpAction) {
      endJumpToLocomotion();
    }
  });
}

function fadeToBase(nextKey, fade = FADE) {
  const next = player.actions[nextKey];
  if (!next) return;
  // Already on this clip (settled or mid-fade) — never restart the blend.
  if (state.baseClip === nextKey) {
    // Recover if a prior fadeOut disabled / zeroed this action (e.g. after jump).
    if (!next.enabled || next.weight < 1e-3) {
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
    }
    if (!state.jumping) state.animState = nextKey;
    return;
  }
  const prevKey = state.baseClip;
  const prev = player.actions[prevKey];
  // Keep cycle phase when switching walk↔run; restart when leaving/entering idle.
  const keepPhase =
    (prevKey === "walk" || prevKey === "run") &&
    (nextKey === "walk" || nextKey === "run");
  if (!keepPhase) next.reset();
  // Three.js fadeIn multiplies interpolant by action.weight — weight must be 1.
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.play();
  next.fadeIn(fade);
  if (prev && prev !== next) prev.fadeOut(fade);
  for (const [key, action] of Object.entries(player.actions)) {
    if (key === nextKey) continue;
    if (action === prev) continue;
    if (action.getEffectiveWeight() > 0 || action.enabled) action.fadeOut(fade);
  }
  state.baseClip = nextKey;
  if (!state.jumping) state.animState = nextKey;
}

function jumpClipDone() {
  const jump = player.jumpAction;
  if (!jump) return true;
  const dur = jump.getClip()?.duration || 0;
  if (dur <= 0) return !jump.isRunning();
  // LoopOnce + clampWhenFinished keeps isRunning true after the end frame.
  return jump.time >= dur - 0.02;
}

function endJumpToLocomotion() {
  if (!state.jumping) return;
  state.jumping = false;
  if (player.jumpAction) {
    player.jumpAction.fadeOut(0.12);
  }
  // Force fadeToBase to re-enable the locomotion clip after jump fadeOut.
  state.baseClip = "";
  fadeToBase(intentAnimKey(), 0.12);
}

function correctFootGround() {
  if (!player.model || !state.grounded || state.jumping) return;
  const names = ["L_ToeBase", "R_ToeBase", "L_Foot", "R_Foot"];
  let minY = Infinity;
  const p = new THREE.Vector3();
  for (const name of names) {
    const bone = player.model.getObjectByName(name);
    if (!bone) continue;
    bone.getWorldPosition(p);
    if (p.y < minY) minY = p.y;
  }
  if (!Number.isFinite(minY)) return;
  if (Math.abs(minY) > 0.002 && Math.abs(minY) < 0.35) {
    player.model.position.y -= minY;
  }
}

/** Anim follows key intent, not lagged speed — ops must match clips. */
function intentAnimKey() {
  if (!state.playing) return "idle";
  const moving = state.moveX !== 0 || state.moveZ !== 0;
  if (!moving) return "idle";
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) return "run";
  return "walk";
}

function syncLocomotionAnim() {
  if (state.jumping) {
    if (jumpClipDone()) endJumpToLocomotion();
    return;
  }
  const next = intentAnimKey();
  const walk = player.actions.walk;
  const run = player.actions.run;
  // Pace clips from target gait (not lagged speed) so press→anim feels immediate.
  if (next === "walk" && walk) {
    const rate = THREE.MathUtils.clamp(
      Math.max(state.speed, WALK_SPEED * 0.65) / WALK_SPEED,
      0.9,
      1.35,
    );
    walk.setEffectiveTimeScale(rate);
  }
  if (next === "run" && run) {
    const rate = THREE.MathUtils.clamp(
      Math.max(state.speed, RUN_SPEED * 0.7) / RUN_SPEED,
      0.9,
      1.25,
    );
    run.setEffectiveTimeScale(rate);
  }
  if (next === "idle" && player.actions.idle) {
    player.actions.idle.setEffectiveTimeScale(1);
  }
  fadeToBase(next);
}

function startJumpAnim() {
  const jump = player.jumpAction;
  if (!jump) return;
  state.jumping = true;
  state.animState = "jump";
  for (const action of Object.values(player.actions)) {
    action.fadeOut(0.1);
  }
  jump.reset();
  jump.enabled = true;
  jump.setEffectiveWeight(1);
  jump.setEffectiveTimeScale(1);
  jump.fadeIn(0.06);
  jump.play();
}

async function loadRabbit() {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      resolve,
      (evt) => {
        const pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
        loadBar.style.width = `${pct}%`;
        loadPct.textContent = `${pct}%`;
      },
      reject,
    );
  });

  const model = gltf.scene;
  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        obj.material.side = THREE.FrontSide;
        obj.material.needsUpdate = true;
      }
    }
  });

  fitModel(model);
  alignModelYaw(model);
  setupAnimations(gltf);
  player.model = model;
  player.root.add(model);

  player.helper = new THREE.SkeletonHelper(model);
  player.helper.visible = false;
  scene.add(player.helper);

  state.ready = true;
  state.mode = "menu";
  bootEl.classList.add("hidden");
  startEl.classList.remove("hidden");
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function updateCamera(force = false) {
  const yaw = state.yaw;
  const pitch = state.pitch;
  const ox = Math.sin(yaw) * Math.cos(pitch) * CAM_DIST;
  const oy = Math.sin(pitch) * CAM_DIST + CAM_HEIGHT;
  const oz = Math.cos(yaw) * Math.cos(pitch) * CAM_DIST;
  _camTarget.set(
    player.root.position.x,
    player.root.position.y + 1.05,
    player.root.position.z,
  );
  _camPos.set(
    player.root.position.x + ox,
    player.root.position.y + oy,
    player.root.position.z + oz,
  );
  if (force || !state.playing) {
    camera.position.copy(_camPos);
  } else {
    const dist = camera.position.distanceTo(_camPos);
    const alpha = dist > 8 ? 1 : 0.18;
    camera.position.lerp(_camPos, alpha);
  }
  camera.lookAt(_camTarget);
}

function readMoveInput() {
  let x = 0;
  let z = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (x !== 0 || z !== 0) {
    const len = Math.hypot(x, z);
    x /= len;
    z /= len;
  }
  state.moveX = x;
  state.moveZ = z;
}

function update(dt) {
  if (!state.ready) return;
  readMoveInput();

  const wantMove = state.playing && (state.moveX !== 0 || state.moveZ !== 0);
  const targetSpeed = !wantMove
    ? 0
    : keys.has("ShiftLeft") || keys.has("ShiftRight")
      ? RUN_SPEED
      : WALK_SPEED;
  state.speed = THREE.MathUtils.damp(state.speed, targetSpeed, 9, dt);

  if (wantMove) {
    const camYaw = state.yaw;
    const forwardX = -Math.sin(camYaw);
    const forwardZ = -Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    const dirX = forwardX * -state.moveZ + rightX * state.moveX;
    const dirZ = forwardZ * -state.moveZ + rightZ * state.moveX;
    const desiredFacing = Math.atan2(dirX, dirZ);
    let delta = desiredFacing - state.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    state.facing += delta * Math.min(1, TURN_SPEED * dt);
    player.root.position.x += Math.sin(state.facing) * state.speed * dt;
    player.root.position.z += Math.cos(state.facing) * state.speed * dt;
  }

  player.root.rotation.y = state.facing;

  if (state.playing && state.grounded && !state.jumping && keys.has("Space")) {
    state.velY = JUMP_VELOCITY;
    state.grounded = false;
    keys.delete("Space");
    startJumpAnim();
  }

  state.velY -= GRAVITY * dt;
  player.root.position.y += state.velY * dt;
  if (player.root.position.y <= 0) {
    player.root.position.y = 0;
    if (!state.grounded) {
      state.grounded = true;
      state.velY = 0;
      // Land immediately — do not wait for the long jump clip (~2.25s).
      if (state.jumping) endJumpToLocomotion();
    } else {
      state.velY = 0;
      state.grounded = true;
    }
  }

  syncLocomotionAnim();
  if (player.mixer) player.mixer.update(dt);
  correctFootGround();
  if (player.helper) player.helper.visible = state.showBones;
  updateCamera();

  statusEl.textContent = state.animState;
  posEl.textContent = `${player.root.position.x.toFixed(1)}, ${player.root.position.z.toFixed(1)}`;
}

function render() {
  renderer.render(scene, camera);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function requestGamePointerLock() {
  try {
    const request = canvas.requestPointerLock?.();
    request?.catch?.(() => {});
  } catch {
    // Pointer lock is optional (and unavailable in some embedded/headless browsers).
  }
}

function beginPlay() {
  if (!state.ready) return;
  state.playing = true;
  state.mode = "playing";
  startEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  requestGamePointerLock();
  clock.start();
  updateCamera(true);
}

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) update(1 / 60);
  render();
};

window.render_game_to_text = () =>
  JSON.stringify({
    coordinate_system:
      "origin at ground center; +X right, +Y up, +Z forward; facing 0 looks/+moves +Z",
    mode: state.mode,
    anim: state.animState,
    baseClip: state.baseClip,
    jumping: state.jumping,
    grounded: state.grounded,
    speed: Number(state.speed.toFixed(2)),
    clips: Object.keys(player.actions),
    modelYaw: Number(state.modelYaw.toFixed(3)),
    player: {
      x: Number(player.root.position.x.toFixed(3)),
      y: Number(player.root.position.y.toFixed(3)),
      z: Number(player.root.position.z.toFixed(3)),
      facing: Number(state.facing.toFixed(3)),
      faceX: Number(Math.sin(state.facing).toFixed(3)),
      faceZ: Number(Math.cos(state.facing).toFixed(3)),
    },
    camera: {
      yaw: Number(state.yaw.toFixed(3)),
      pitch: Number(state.pitch.toFixed(3)),
    },
    showBones: state.showBones,
  });

window.__rabbit = { state, player, keys };

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyF") {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  if (e.code === "KeyH" && state.ready) {
    state.showBones = !state.showBones;
  }
  if (e.code === "Escape" && document.pointerLockElement) {
    document.exitPointerLock();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener("mousemove", (e) => {
  if (!state.playing || !state.pointerLocked) return;
  state.yaw -= e.movementX * 0.0022;
  state.pitch -= e.movementY * 0.0016;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.9, 0.45);
});
canvas.addEventListener("click", () => {
  if (state.playing) requestGamePointerLock();
});
startBtn.addEventListener("click", beginPlay);

resize();
frame();
loadRabbit().catch((err) => {
  loadPct.textContent = `加载失败：${err?.message || err}`;
  console.error(err);
});
