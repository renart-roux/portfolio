// --- Renderer & Scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);

// Subtle spacey fog
scene.fog = new THREE.Fog(0x0b1020, 30, 180);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// --- Lights ---
const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 8, 5);
dir.castShadow = true;
scene.add(dir);

// --- Ground Grid ---
const grid = new THREE.GridHelper(200, 200, 0x5566aa, 0x223355);
grid.material.opacity = 0.5;
grid.material.transparent = true;
scene.add(grid);

// --- Drone Model (configurable multirotor frame) ---
function createDrone(config = 'quadx') { //quadx, quad+, hexx, hex+
  const group = new THREE.Group();

  // --- Body ---
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x7aa2ff, metalness: 0.2, roughness: 0.5 })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // --- Arms ---
  const armMat = new THREE.MeshStandardMaterial({ color: 0x99aacc, metalness: 0.1, roughness: 0.7 });
  const armGeom = new THREE.BoxGeometry(0.08, 0.08, 1.6);

  // Base arms array for reuse
  const arms = [];

  if (config.startsWith('quad')) {
    // Two arms, each forming an X or + configuration
    const arm1 = new THREE.Mesh(armGeom, armMat);
    const arm2 = new THREE.Mesh(armGeom, armMat);

    if (config === 'quadx') {
      // X configuration: 45° and -45°
      arm1.rotation.y =  Math.PI / 4;
      arm2.rotation.y = -Math.PI / 4;
    } else if (config === 'quad+') {
      // Plus configuration: 0° and 90°
      arm1.rotation.y = 0;
      arm2.rotation.y = Math.PI / 2;
    }

    arms.push(arm1, arm2);
  }

  else if (config.startsWith('hex')) {
    // Three arms equally spaced by 60° for +, or offset for X
    const armCount = 3;
    for (let i = 0; i < armCount; i++) {
      const arm = new THREE.Mesh(armGeom, armMat);
      const angleOffset = (config === 'hex+') ? 0 : Math.PI / 6; // 30° offset for hex-X
      arm.rotation.y = angleOffset + i * (Math.PI / 3); // 0°, 60°, 120° (+ offset)
      arms.push(arm);
    }
  }

  group.add(...arms);

  // --- Propellers ---
  const propGeom = new THREE.RingGeometry(0.18, 0.22, 24);
  const propMat = new THREE.MeshBasicMaterial({ color: 0xddddff });

  const R = 0.8;
  const propOffsets = [];

  if (config === 'quadx') {
    const s = R / Math.SQRT2;
    propOffsets.push([ s, 0.08,  s], [ s, 0.08, -s], [-s, 0.08,  s], [-s, 0.08, -s]);
  }
  else if (config === 'quad+') {
    propOffsets.push([ R, 0.08,  0], [-R, 0.08, 0], [0, 0.08,  R], [0, 0.08, -R]);
  }
  else if (config === 'hex+') {
    for (let i = 0; i < 6; i++) {
      const angle = i * (Math.PI / 3); // every 60°
      propOffsets.push([
        R * Math.sin(angle),
        0.08,
        R * Math.cos(angle)
      ]);
    }
  }
  else if (config === 'hexx') {
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * (Math.PI / 3); // start 30° offset
      propOffsets.push([
        R * Math.sin(angle),
        0.08,
        R * Math.cos(angle)
      ]);
    }
  }

  // Create propellers
  for (const [x, y, z] of propOffsets) {
    const p = new THREE.Mesh(propGeom, propMat);
    p.position.set(x, y, z);
    p.rotation.x = -Math.PI / 2;
    group.add(p);
  }

  return group;
}

const state = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  yaw: 0,
  yawRate: 0,
  upVel: 0,
  strafeVel: 0,
  forwardVel: 0,
  maxStrafe: 6,       // m/s (roll -> strafe)
  maxForward: 8,      // m/s (pitch -> forward)
  maxUp: 8,           // m/s climb rate range end
  maxYawRate: Math.PI, // rad/s
  onGround: true,
  power: 0, // Power lever (0..1). 0.5 is neutral/hover (≈ no vertical motion),
  configuration: "quadx"
};

// --- Drone State ---
let drone = createDrone();
scene.add(drone);
drone.position.copy(state.pos);

// --- Handle configuration change ---
(function(){
  const orig = window.changeDroneConfiguration;
  window.changeDroneConfiguration = function (config, buttonPressed){
    if (typeof orig === "function") orig(config, buttonPressed);

    const newDrone = createDrone(config);
    newDrone.position.copy(state.pos);
    scene.remove(drone);
    drone = newDrone;
    scene.add(newDrone);

    btns = document.getElementsByClassName("configuration-button")
    for(let i = 0; i < btns.length; i++){
      btn = btns[i];
      btn.classList.remove("configuration-button-selected");
    }

    buttonPressed.classList.add("configuration-button-selected")
    state.configuration = config
  }
})();


// --- Input ---
const keys = new Set();
let paused = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { paused = !paused; return; }
  if (e.code === 'Backspace') { reset(); return; }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function reset() {
  state.pos.set(0, 0, 0);
  state.vel.set(0, 0, 0);
  state.yaw = 0;
  state.yawRate = 0;
  state.upVel = 0;
  state.strafeVel = 0;
  state.forwardVel = 0;
  state.onGround = true;
  state.power = 0;
  drone.position.copy(state.pos);
  drone.rotation.set(0, 0, 0);
  updatePowerUI();
}

// --- Simple Kinematics ---
const tmp = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

// Power UI handles
const powerFill = document.getElementById('powerFill');
const powerPct = document.getElementById('powerPct');

function updatePowerUI(){
  const pct = Math.round(state.power * 100);
  powerPct.textContent = pct + '%';
  powerFill.style.height = pct + '%';
  powerFill.style.top = (100-pct) + '%';
}
updatePowerUI();

function updateControls(dt) {
  // WASD: W/S act as POWER LEVER (sticky). A/D yaw left/right
  const inc = (keys.has('KeyW') ? 1 : 0) + (keys.has('KeyS') ? -1 : 0);
  const powerRate = 0.6; // units per second (0..1 range). Higher = faster lever movement
  if (inc !== 0) {
    state.power = Math.min(1, Math.max(0, state.power + inc * powerRate * dt));
    updatePowerUI();
  }

  // Map power (0..1) to vertical target: 0.5 = neutral (hover/no climb)
  const targetUp = ((state.power - 0.5) * 2); // -1..+1

  const targetYaw  = (keys.has('KeyA') ? 1 : 0) + (keys.has('KeyD') ? -1 : 0);
  // Arrows: roll (←/→) -> strafe, pitch (↑/↓) -> forward/back
  const targetStrafe  = (keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0);
  const targetForward = (keys.has('ArrowUp') ? 1 : 0) + (keys.has('ArrowDown') ? -1 : 0);

  // Smooth towards target speeds (first-order response)
  const strafeAccel = 8, upAccel = 6, yawAccel = 6;
  state.strafeVel += (targetStrafe * state.maxStrafe - state.strafeVel) * Math.min(1, strafeAccel * dt);
  state.forwardVel += (targetForward * state.maxForward - state.forwardVel) * Math.min(1, strafeAccel * dt);
  state.upVel     += (targetUp     * state.maxUp     - state.upVel)     * Math.min(1, upAccel * dt);
  state.yawRate   += (targetYaw    * state.maxYawRate - state.yawRate)  * Math.min(1, yawAccel * dt);

  // On ground: no lateral movement, no yaw, only up/down
  if (state.onGround){
    if (state.strafeVel !== 0 || state.forwardVel !== 0 || state.yawRate !== 0) {
      // Make appear a toast message
      const toast = document.getElementById('toast');
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2000);
    }

    state.strafeVel = 0;
    state.forwardVel = 0;
    state.yawRate = 0;
  }
}

function integrate(dt) {
  // Update yaw
  state.yaw += state.yawRate * dt;

  // Local axes based on yaw (no pitch/roll in this simple model)
  const left = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));

  // Velocity = strafe along right + forward + vertical (from power)
  tmp.set(0, 0, 0)
    .addScaledVector(left, state.strafeVel)
    .addScaledVector(forward, state.forwardVel)
    .addScaledVector(up, state.upVel);

  // Apply simple drag to horizontal motion
  const drag = 4;
  state.vel.lerp(tmp, Math.min(1, drag * dt));

  // Integrate position
  state.pos.addScaledVector(state.vel, dt);

  // Keep above ground (y >= 0)
  if (state.pos.y <= 0.06) {
    state.pos.y = 0.06; state.vel.y = Math.max(0, state.vel.y);
    state.onGround = true;
  } else {
    state.onGround = false;
  }

  // Write to scene object
  drone.position.copy(state.pos);
  const roll  = - (state.strafeVel  / (state.maxStrafe  || 1)) * 0.2;  // strafe right → roll right
  const pitch =   (state.forwardVel / (state.maxForward || 1)) * 0.2;  // forward → nose down
  // 1) Start from yaw around world up
  const qYaw = new THREE.Quaternion().setFromAxisAngle(up, state.yaw);
  drone.quaternion.copy(qYaw);
  // 2) Apply pitch around local right (X after yaw) and roll around local forward (Z after yaw)
  drone.rotateX(pitch);
  drone.rotateZ(roll);

  // Update position info
  const posDiv = document.getElementById('positions');
  posDiv.innerHTML = `Coordinates: (${state.pos.x.toFixed(2)}, ${state.pos.z.toFixed(2)})<br>` +
                     `Altitude: ${(state.pos.y-0.06).toFixed(2)}<br>` +
                     `Yaw: ${(state.yaw * 180 / Math.PI).toFixed(1)}°`;
}

function updateRotorPanel() {
  powerOutputs = window.computeMotorPowers(state);
  window.reportMotorPowers(powerOutputs);
}

// --- Camera follow (rigid chase) ---
const camState = {
  pos: new THREE.Vector3(0, 3, -6),
  worldPos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  stiffness: 100,
  damping: 10
};

function updateCamera(dt) {
  // Rigid chase camera: exact drone-relative, no lag, no spring.
  const localOffset = new THREE.Vector3(0, 3, -6); // behind & above (no lateral component)
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), state.yaw);
  const worldOffset = localOffset.clone().applyQuaternion(rot);
  const desired = new THREE.Vector3().copy(state.pos).add(worldOffset);

  camera.position.copy(desired);
  camera.lookAt(drone.position.x, drone.position.y + 0.5, drone.position.z);
}

// --- Animate ---
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000); // clamp to ~30 FPS max step
  last = now;

  if (!paused) {
    updateControls(dt);
    integrate(dt);
    updateRotorPanel();
    updateCamera(dt);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Initial placement
camState.worldPos.copy(state.pos).add(new THREE.Vector3(-6, 3, 0));
camera.position.copy(camState.worldPos);
camera.lookAt(drone.position);

const bgColor = 0x1b8036;

// Basic environment props
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshStandardMaterial({ color: bgColor, metalness: 0.0, roughness: 1.0 })
);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);

// Resize handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(tick);
