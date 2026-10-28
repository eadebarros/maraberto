import * as THREE from 'three';

const POINTS_URL = '/points.bin';
const RING_PX = 140; // loader ring diameter in CSS pixels
const FOV = 30;

const canvas = document.getElementById('scene');
const stage = canvas.parentElement;
const loaderEl = document.getElementById('loader');
const barEl = loaderEl.querySelector('.bar');
const pctEl = loaderEl.querySelector('.pct');
const CIRC = 2 * Math.PI * 48;
loaderEl.style.setProperty('--ring-size', `${RING_PX}px`);
barEl.style.strokeDasharray = CIRC;
barEl.style.strokeDashoffset = CIRC;

// Transparent so the starry sky (src/sky.js) shows behind the bust.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);
const bust = new THREE.Group();
scene.add(bust);

function fitCamera() {
  const w = Math.max(1, stage.clientWidth);
  const h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Model is normalized to ~1 unit wide, ~0.6 tall; keep it fully visible in the stage.
  const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const distH = 0.36 / halfTan;
  const distW = 0.56 / (halfTan * camera.aspect);
  camera.position.set(0, 0, Math.max(distH, distW));
  camera.updateProjectionMatrix();
  material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  material.uniforms.uViewportH.value = h;
}

function setProgress(t) {
  barEl.style.strokeDashoffset = CIRC * (1 - t);
  pctEl.textContent = `${Math.round(t * 100)}%`;
}

async function loadPoints() {
  const res = await fetch(POINTS_URL);
  if (!res.ok) throw new Error(`Failed to load ${POINTS_URL}: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) setProgress(got / total);
  }
  setProgress(1);
  const bytes = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { bytes.set(c, o); o += c.length; }
  return bytes.buffer;
}

function decode(buffer) {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== 'DOTS') throw new Error('Bad points file');
  const count = dv.getUint32(4, true);
  const min = [0, 1, 2].map((c) => dv.getFloat32(8 + c * 4, true));
  const max = [0, 1, 2].map((c) => dv.getFloat32(20 + c * 4, true));
  const center = min.map((m, c) => (m + max[c]) / 2);
  const size = Math.max(...max.map((m, c) => m - min[c]));

  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const HEADER = 32;
  for (let i = 0; i < count; i++) {
    const at = HEADER + i * 10;
    for (let c = 0; c < 3; c++) {
      const q = (dv.getInt16(at + c * 2, true) + 32768) / 65535;
      position[i * 3 + c] = (min[c] + q * (max[c] - min[c]) - center[c]) / size;
      normal[i * 3 + c] = dv.getInt8(at + 6 + c) / 127;
    }
  }
  return { count, position, normal };
}

const vertexShader = /* glsl */ `
  attribute vec3 aStart;
  attribute vec2 aRand;     // x: size/brightness seed, y: timing seed
  uniform float uTime;
  uniform float uAssemble;  // 0 → dots on the ring, 1 → dots on the bust
  uniform float uShine;     // diagonal band position
  uniform vec3 uCursor;     // cursor light, model space
  uniform float uCursorOn;
  uniform float uPixelRatio;
  uniform float uViewportH;
  varying float vLight;
  varying float vAlpha;

  void main() {
    float delay = aRand.y * 0.45;
    float t = clamp((uAssemble - delay) / 0.55, 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);

    // swirl a little on the way in
    vec3 from = aStart;
    vec3 p = mix(from, position, t);
    p += vec3(0.0, 0.0, sin(t * 3.14159) * (aRand.x - 0.5) * 0.25);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vec3 v = normalize(-mv.xyz);

    float key = pow(max(dot(n, normalize(vec3(-0.5, 0.6, 0.8))), 0.0), 1.5);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float facing = smoothstep(-0.2, 0.35, dot(n, v));

    float cursor = uCursorOn * smoothstep(0.32, 0.0, distance(position, uCursor));

    float diag = position.y * 1.2 - position.x * 0.6;
    float shine = exp(-pow((diag - uShine) * 7.0, 2.0));

    float rnd = 0.75 + aRand.x * 0.5;
    vLight = (0.3 + key * 0.55 + rim * 0.25 + cursor * 0.55 + shine * 0.6) * rnd;
    vLight *= mix(0.08, 1.0, facing);
    vLight = mix(0.5, vLight, t);
    vAlpha = mix(0.6, 1.0, t);

    float size = 1.0 + 2.0 * pow(aRand.x, 4.0);
    size *= 1.0 + shine * 0.6 + cursor * 0.4;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * (uViewportH / 900.0) * (2.6 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vLight;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c);
    if (r2 > 0.25) discard;
    float a = exp(-r2 * 14.0) * vAlpha;
    gl_FragColor = vec4(vec3(vLight), a);
  }
`;

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uAssemble: { value: 0 },
    uShine: { value: -2 },
    uCursor: { value: new THREE.Vector3(0, 0, 10) },
    uCursorOn: { value: 0 },
    uPixelRatio: { value: 1 },
    uViewportH: { value: 900 },
  },
});

// Faint dust drifting through the scene.
function makeDust(n = 500) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = (Math.random() - 0.5) * 3;
    p[i * 3 + 1] = (Math.random() - 0.5) * 2;
    p[i * 3 + 2] = (Math.random() - 0.5) * 2;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.006, transparent: true, opacity: 0.18,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, m);
}
const dust = makeDust();
scene.add(dust);

// Start positions: on the loader ring, in the bust's local space at its depth.
function ringStarts(count, rand) {
  const worldPerPx = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / stage.clientHeight;
  const radius = (RING_PX / 2) * worldPerPx;
  const starts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rand[i * 2 + 1] * Math.PI * 2 + rand[i * 2] * 0.3;
    const jitter = 1 + (rand[i * 2] - 0.5) * 0.04;
    starts[i * 3] = Math.cos(a) * radius * jitter;
    starts[i * 3 + 1] = Math.sin(a) * radius * jitter;
    starts[i * 3 + 2] = 0;
  }
  return starts;
}

const pointer = new THREE.Vector2(0, 0);
const pointerTarget = new THREE.Vector2(0, 0);
const idle = new THREE.Vector2(0, 0);
let pointerActive = false;
// Pointer in the stage's NDC; values outside [-1, 1] still steer the head, clamped.
function trackPointer(e) {
  const r = stage.getBoundingClientRect();
  pointerTarget.set(
    THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5),
    THREE.MathUtils.clamp(-((e.clientY - r.top) / r.height) * 2 + 1, -1.5, 1.5),
  );
  pointerActive = true;
}
window.addEventListener('pointermove', trackPointer, { passive: true });
window.addEventListener('pointerdown', trackPointer, { passive: true });
document.addEventListener('pointerleave', () => { pointerActive = false; });
window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointerActive = false; });
window.addEventListener('pointercancel', () => { pointerActive = false; });

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.1);
const hit = new THREE.Vector3();
const inv = new THREE.Matrix4();

async function main() {
  fitCamera();
  new ResizeObserver(fitCamera).observe(stage);

  const { count, position, normal } = decode(await loadPoints());
  const rand = new Float32Array(count * 2);
  for (let i = 0; i < rand.length; i++) rand[i] = Math.random();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 2));
  geo.setAttribute('aStart', new THREE.BufferAttribute(ringStarts(count, rand), 3));
  bust.add(new THREE.Points(geo, material));

  loaderEl.classList.add('done');
  document.body.classList.add('ready');
  const t0 = performance.now();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  renderer.setAnimationLoop(() => {
    const now = (performance.now() - t0) / 1000;
    const u = material.uniforms;
    u.uTime.value = now;
    u.uAssemble.value = reduceMotion ? 1 : Math.min(now / 2.2, 1);
    u.uShine.value = reduceMotion ? -2 : 1.2 - Math.max(0, now - 1.6) * 1.4;

    // Head turns toward the cursor.
    // With no pointer (e.g. touch devices at rest), drift gently side to side.
    if (!pointerActive) idle.set(Math.sin(now * 0.35) * 0.35, Math.sin(now * 0.23) * 0.15);
    pointer.lerp(pointerActive ? pointerTarget : idle, 0.05);
    bust.rotation.y = pointer.x * 0.4 + Math.sin(now * 0.3) * 0.03;
    bust.rotation.x = -pointer.y * 0.12;

    // Cursor acts as a light: project onto a plane in front of the bust, into model space.
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      bust.updateMatrixWorld();
      inv.copy(bust.matrixWorld).invert();
      u.uCursor.value.copy(hit).applyMatrix4(inv);
    }
    u.uCursorOn.value += ((pointerActive ? 1 : 0) - u.uCursorOn.value) * 0.08;

    dust.rotation.y = now * 0.01;
    dust.position.y = Math.sin(now * 0.1) * 0.03;

    renderer.render(scene, camera);
  });
}

main().catch((err) => {
  console.error(err);
  pctEl.textContent = 'erro';
  document.body.classList.add('ready');
});
