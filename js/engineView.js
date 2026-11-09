// Interactive 3D view of the engine: orbit, half-section cutaway, exploded modules,
// clickable parts linked to the calculation panel, station markers and an animated airflow
// coloured by the calculated total temperature or pressure.

import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { buildEngine, CORE_PATH, BYPASS_PATH, STATION_POS, REF_FAN_DIAMETER, componentAtX, SPOOL_COLORS } from './engineModel.js';
import { COMPONENTS } from './engine.js';
import { convert, formatNumber } from './units.js';

// ---------------------------------------------------------------- spool speeds
// Trent 1000 rotor speeds (N1, N2, N3) in rpm. The view keeps their ratio and slows them down
// SPIN_SLOWDOWN times so the blades can be followed by eye (LP ≈ 3.6 rpm on screen).
export const SPOOL_RPM = { LP: 2683, IP: 8937, HP: 13391 };
export const SPIN_SLOWDOWN = 750;

// ---------------------------------------------------------------- colour scale (sequential, cold → hot)
const RAMP = [[0.0, [0.17, 0.31, 0.64]], [0.25, [0.25, 0.65, 0.79]], [0.5, [0.95, 0.83, 0.36]], [0.75, [0.94, 0.54, 0.17]], [1.0, [0.78, 0.19, 0.16]]];
function ramp(t, out) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
      const k = (t - t0) / (t1 - t0);
      out[0] = c0[0] + (c1[0] - c0[0]) * k; out[1] = c0[1] + (c1[1] - c0[1]) * k; out[2] = c0[2] + (c1[2] - c0[2]) * k;
      return out;
    }
  }
  return out;
}
export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.map(([t, c]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')}) ${t * 100}%`).join(', ')})`;

// ---------------------------------------------------------------- flow paths
// Each node: x, inner radius, outer radius, station whose state colours it, illustrative speed factor.
// Speeds are only for the animation (relative to the fan-face velocity); colours are calculated values.
const BYPASS_NODES = [
  { x: -1.4, ri: 0.0, ro: 1.38, st: '0', v: 'C0' }, { x: 0.88, ri: 0.46, ro: 1.38, st: '2', v: 'C2' },
  ...BYPASS_PATH.map(([x, ri, ro], i) => ({ x, ri: ri + 0.02, ro: ro - 0.02, st: i < 3 ? '13' : '19', v: i < 3 ? 'C2' : 'C19' })),
  { x: 4.6, ri: 0.80, ro: 1.30, st: '19', v: 'C19' }, { x: 6.2, ri: 0.78, ro: 1.40, st: '19', v: 'C19' },
];
const CORE_STATIONS = { 1.45: '21', 2.40: '23', 3.00: '3', 3.25: '3', 3.45: '4', 3.55: '4', 3.72: '41', 3.92: '43', 4.47: '5', 4.60: '7', 4.80: '9' };
const CORE_NODES = [
  { x: -1.4, ri: 0.0, ro: 0.62, st: '0', v: 'C0' }, { x: 0.88, ri: 0.46, ro: 0.62, st: '2', v: 'C2' },
  ...CORE_PATH.filter(([x]) => x in CORE_STATIONS || x === 1.65 || x === 2.5 || x === 3.1 || x === 4.0)
    .map(([x, ri, ro]) => {
      let st = CORE_STATIONS[x];
      if (!st) st = x < 2.45 ? '21' : x < 3.05 ? '23' : x < 3.5 ? '3' : '43';
      const v = x < 3.1 ? 'Cc' : x < 3.5 ? 'Cb' : x < 4.5 ? 'Ct' : 'C9';
      return { x, ri: ri + 0.015, ro: ro - 0.015, st, v };
    }),
  { x: 5.4, ri: 0.0, ro: 0.55, st: '9', v: 'C9' }, { x: 6.2, ri: 0.0, ro: 0.62, st: '9', v: 'C9' },
];

function nodeAt(nodes, x) {
  if (x <= nodes[0].x) return [nodes[0], nodes[0], 0];
  for (let i = 1; i < nodes.length; i++) {
    if (x <= nodes[i].x) return [nodes[i - 1], nodes[i], (x - nodes[i - 1].x) / (nodes[i].x - nodes[i - 1].x)];
  }
  const l = nodes[nodes.length - 1];
  return [l, l, 0];
}

// ---------------------------------------------------------------- view
export class EngineView {
  /**
   * @param {HTMLElement} container element that receives the canvas and overlays
   * @param {{onSelect:(id:string)=>void, onHoverStation?:(id:string|null)=>void}} hooks
   */
  constructor(container, hooks = {}) {
    this.el = container;
    this.hooks = hooks;
    this.state = { cutaway: true, exploded: false, flow: !matchMedia('(prefers-reduced-motion: reduce)').matches, colorBy: 'T', stations: true, spools: false, spin: !matchMedia('(prefers-reduced-motion: reduce)').matches };
    this.spinAngle = { LP: 0, IP: 0, HP: 0 };
    this.explode = 0;          // 0 assembled … 1 exploded
    this.selected = null;
    this.cycle = null;
    this.units = 'si';
    this.visible = true;

    const canvas = document.createElement('canvas');
    canvas.className = 'engine-canvas';
    canvas.setAttribute('aria-label', 'Interactive 3D model of the turbofan. Drag to rotate, scroll or pinch to zoom, select a part to see its calculation.');
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    this.canvas = canvas;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      container.innerHTML = '<p class="engine-fallback">3D view unavailable: this browser has WebGL turned off.</p>';
      this.failed = true;
      return;
    }
    // touch devices start at a lower resolution; adaptQuality() lowers it further if frames are slow
    this.maxPixelRatio = Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    renderer.setPixelRatio(this.maxPixelRatio);
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4250, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8d8ff, 0.7);
    rim.position.set(6, -2, 3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe8d0, 0.35);
    fill.position.set(2, 1, -6);
    scene.add(fill);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('start', () => { this.anim = null; });
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 22;

    // section plane: keeps z ≤ 0, so the camera (on +z) looks into the engine
    this.clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

    const { root, components } = buildEngine();
    this.root = root;
    this.components = components;
    scene.add(root);
    // Cutaway convention of exhibition engines: static structure (nacelle, casings, stators, combustor)
    // is sectioned; rotating assemblies (fan, compressor and turbine rotors, shafts) stay whole.
    root.traverse((o) => {
      if (o.isMesh && !o.userData.spool) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.clippingPlanes = [this.clip]; m.clipShadows = true; });
      }
    });
    // flat cut faces of the sectioned shells: only meaningful while the section is on
    this.caps = [];
    root.traverse((o) => { if (o.userData.cap) this.caps.push(o); });

    this.rotors = [];
    root.traverse((o) => { if (o.userData.spool) this.rotors.push(o); });

    this.buildFlow();
    this.buildOverlay();
    this.resetView();
    this.bindEvents();
    this.applyCutaway();

    this.clock = new THREE.Clock();
    this.quality = { level: 0, frames: 0, time: 0, warmup: 1.5 };
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.visible) { this.clock.getDelta(); return; }
      const dt = this.clock.getDelta();
      this.adaptQuality(dt);
      this.tick(Math.min(dt, 0.05));
    };
    loop();
  }

  /**
   * Keep the view fluid on modest hardware: measure the frame rate over 2 s windows and, while it
   * stays under 30 fps, step the quality down (lower resolution, then half the airflow particles).
   * Quality only goes down, so the view never flickers between levels.
   */
  adaptQuality(dt) {
    const q = this.quality;
    if (q.level >= 3 || dt > 0.25) return;              // long gaps are tab switches, not slow frames
    if (q.warmup > 0) { q.warmup -= dt; return; }       // shaders compile during the first frames
    q.frames++; q.time += dt;
    if (q.time < 2) return;
    const fps = q.frames / q.time;
    q.frames = 0; q.time = 0;
    if (fps >= 30) return;
    q.level++;
    if (q.level === 1) this.renderer.setPixelRatio(Math.min(this.maxPixelRatio, 1.25));
    if (q.level === 2) this.renderer.setPixelRatio(1);
    if (q.level === 3) { this.renderer.setPixelRatio(0.8); this.points.geometry.setDrawRange(0, Math.floor(this.flowN / 2)); }
    this.resize();
    q.warmup = 0.5;
  }

  // ---------------------------------------------------------------- airflow particles
  buildFlow() {
    const small = window.innerWidth < 700;
    const n = small ? 1400 : 2600;
    this.flowN = n;
    this.flow = { x: new Float32Array(n), u: new Float32Array(n), th: new Float32Array(n), core: new Uint8Array(n), jitter: new Float32Array(n) };
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const ctx = dot.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, alphaTest: 0.05 });
    mat.clippingPlanes = [this.clip];
    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    this.root.add(this.points);
    this.seedFlow(true);
  }

  seedFlow(all) {
    const f = this.flow;
    // The real mass split is BPR : 1 (about 10 : 1). At that ratio the core would hold too few particles
    // to read its temperature, so the core is over-sampled; the note under the view says so.
    const pCore = 0.35;
    for (let i = 0; i < this.flowN; i++) {
      if (!all) continue;
      f.core[i] = Math.random() < pCore ? 1 : 0;
      f.u[i] = Math.random();
      // Core particles travel in a thin slice just behind the section plane, so the cutaway shows them
      // in front of the blade rows; bypass particles fill the whole annulus.
      f.th[i] = f.core[i]
        ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.12) * (Math.random() < 0.5 ? 1 : 1)
        : Math.random() * Math.PI * 2;
      if (f.core[i]) f.th[i] = Math.atan2(-Math.abs(Math.sin(f.th[i])), Math.cos(f.th[i])); // keep z < 0
      f.jitter[i] = 0.85 + Math.random() * 0.3;
      f.x[i] = -1.4 + Math.random() * 7.6;
    }
  }

  /** Values used to colour the flow and set its speed, per station. */
  flowValues() {
    const c = this.cycle;
    if (!c || !c.ambient) return null;
    const S = c.stations, A = c.ambient;
    const val = {};
    const T = (id) => (id === '0' ? A.T : id === '19' ? S['19']?.T : id === '9' ? S['9']?.T : S[id]?.T0);
    const P = (id) => (id === '0' ? A.P : id === '19' ? S['19']?.P : id === '9' ? S['9']?.P : S[id]?.P0);
    for (const id of ['0', '2', '13', '19', '21', '23', '3', '4', '41', '43', '5', '7', '9']) val[id] = { T: T(id), P: P(id) };
    const C2 = S['2']?.C ?? 200;
    const speed = {
      C0: Math.max(S['0']?.C ?? 0, 0.6 * C2), C2, C19: S['19']?.C ?? C2,
      Cc: 0.75 * C2, Cb: 0.35 * C2, Ct: 0.9 * C2, C9: S['9']?.C ?? C2,
    };
    // last core station the cycle reached (the core flow stops there when the cycle does not close)
    const order = ['21', '23', '3', '4', '41', '43', '5', '7', '9'];
    let lastCore = '9';
    if (!c.feasible) lastCore = order.filter((id) => S[id]).pop() ?? '21';
    const all = Object.values(val).flatMap((v) => [this.state.colorBy === 'T' ? v.T : v.P]).filter(Number.isFinite);
    return { val, speed, lastCore, min: Math.min(...all), max: Math.max(...all) };
  }

  stepFlow(dt) {
    const fv = this.flowValues();
    if (!fv) return;
    const f = this.flow;
    const pos = this.points.geometry.attributes.position.array;
    const col = this.points.geometry.attributes.color.array;
    const key = this.state.colorBy;
    const coreEnd = { 21: 1.5, 23: 2.42, 3: 3.02, 4: 3.55, 41: 3.72, 43: 3.92, 5: 4.47, 7: 4.6, 9: 6.2 }[fv.lastCore];
    const k = 0.006 * (this.state.flow ? 1 : 0); // m of screen travel per (m/s of flow · s)
    const rgb = [0, 0, 0];
    const span = fv.max - fv.min || 1;
    const scale = key === 'P' ? (v) => (Math.log(v) - Math.log(fv.min)) / (Math.log(fv.max) - Math.log(fv.min) || 1) : (v) => (v - fv.min) / span;
    for (let i = 0; i < this.flowN; i++) {
      const nodes = f.core[i] ? CORE_NODES : BYPASS_NODES;
      let [a, b, t] = nodeAt(nodes, f.x[i]);
      const v = (fv.speed[a.v] * (1 - t) + fv.speed[b.v] * t) * f.jitter[i];
      f.x[i] += v * k * dt;
      const end = f.core[i] ? coreEnd : 6.2;
      if (f.x[i] > end) { f.x[i] = -1.4 + Math.random() * 0.2; f.u[i] = Math.random(); }
      [a, b, t] = nodeAt(nodes, f.x[i]);
      const ri = a.ri + (b.ri - a.ri) * t, ro = a.ro + (b.ro - a.ro) * t;
      const r = Math.sqrt(ri * ri + f.u[i] * (ro * ro - ri * ri)); // area-weighted
      pos[i * 3] = f.x[i];
      pos[i * 3 + 1] = r * Math.cos(f.th[i]);
      pos[i * 3 + 2] = r * Math.sin(f.th[i]);
      const va = fv.val[a.st]?.[key], vb = fv.val[b.st]?.[key];
      const vv = Number.isFinite(va) && Number.isFinite(vb) ? va + (vb - va) * t : va ?? vb;
      ramp(scale(vv), rgb);
      col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.legend(fv);
  }

  // ---------------------------------------------------------------- overlay: station badges, tooltip, legend
  buildOverlay() {
    const o = document.createElement('div');
    o.className = 'engine-overlay';
    o.innerHTML = Object.keys(STATION_POS).map((id) => `<span class="engine-station" data-station="${id}">${id}</span>`).join('')
      + '<div class="engine-tip" hidden></div>'
      + '<div class="engine-selected" hidden><div class="engine-selected-head"><span class="engine-selected-name"></span></div>'
      + '<div class="engine-selected-values"></div><button type="button" class="engine-selected-go">Open the calculation →</button></div>';
    this.el.appendChild(o);
    this.overlay = o;
    this.tip = o.querySelector('.engine-tip');
    this.badges = [...o.querySelectorAll('.engine-station')];
    this.selectedEl = o.querySelector('.engine-selected');
    o.querySelector('.engine-selected-go').addEventListener('click', () => this.hooks.onOpenPanel?.());
    const lg = document.createElement('div');
    lg.className = 'engine-legend';
    lg.innerHTML = `<span class="engine-legend-label"></span><span class="engine-legend-bar" style="background:${RAMP_CSS}"></span><span class="engine-legend-range"><span class="lo"></span><span class="hi"></span></span>`;
    this.el.appendChild(lg);
    this.legendEl = lg;
  }

  legend(fv) {
    const lg = this.legendEl;
    if (!lg) return;
    const q = this.state.colorBy === 'T' ? 'temperature' : 'pressure';
    const lo = convert(q, fv.min, this.units), hi = convert(q, fv.max, this.units);
    const txt = `${this.state.colorBy === 'T' ? 'Temperature (total; static at 0, 9, 19)' : 'Pressure, log scale (total; static at 0, 9, 19)'} [${lo.unit}]`;
    if (lg.dataset.txt !== txt + lo.value + hi.value) {
      lg.dataset.txt = txt + lo.value + hi.value;
      lg.querySelector('.engine-legend-label').textContent = txt;
      lg.querySelector('.lo').textContent = formatNumber(lo.value, this.state.colorBy === 'T' ? 0 : 1);
      lg.querySelector('.hi').textContent = formatNumber(hi.value, this.state.colorBy === 'T' ? 0 : 1);
    }
    lg.hidden = !this.state.flow || this.state.exploded;
  }

  placeBadges() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    const show = this.state.stations && this.explode < 0.05;
    for (const b of this.badges) {
      const [x, r] = STATION_POS[b.dataset.station];
      v.set(x, r, 0).applyMatrix4(this.root.matrixWorld).project(this.camera);
      const off = v.z > 1 || !show;
      b.hidden = off;
      if (!off) b.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  // ---------------------------------------------------------------- interaction
  bindEvents() {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt = null;
    const pick = (e) => {
      const r = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects(this.root.children, true);
      for (const h of hits) {
        if (h.object === this.points) continue;
        // with the cutaway on, ignore hits in the removed half
        if (this.state.cutaway && this.explode < 0.5 && h.point.z > 0.001 && !h.object.userData.spool) continue; // removed half of a sectioned part
        const shellFaded = this.shellOpacity < 0.3;
        const inShell = h.object.parent?.userData.shell;
        if (inShell && shellFaded) continue;                 // faded shells do not block clicks
        if (h.object.userData.byX) return componentAtX(h.point.x / this.root.scale.x);
        let o = h.object;
        while (o && !o.userData.component) o = o.parent;
        if (o) return o.userData.component;
        return null;                                          // an untagged solid part (e.g. a shaft) blocks the click
      }
      return null;
    };
    this.canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
      const id = pick(e);
      if (id) this.hooks.onSelect?.(id);
    });
    let last = 0;
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons || performance.now() - last < 50) return;
      last = performance.now();
      const id = pick(e);
      this.hover(id, e);
    });
    this.canvas.addEventListener('pointerleave', () => this.hover(null));
    this.overlay.addEventListener('pointerover', (e) => {
      const b = e.target.closest('.engine-station');
      this.hooks.onHoverStation?.(b ? b.dataset.station : null);
    });
    this.overlay.addEventListener('pointerout', () => this.hooks.onHoverStation?.(null));
    this.overlay.addEventListener('click', (e) => {
      const b = e.target.closest('.engine-station');
      if (b) this.hooks.onSelectStation?.(b.dataset.station);
    });
    new ResizeObserver(() => this.resize()).observe(this.el);
    new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; }).observe(this.el);
    document.addEventListener('visibilitychange', () => { this.visible = !document.hidden; });
  }

  hover(id, e) {
    this.canvas.style.cursor = id ? 'pointer' : '';
    if (this.hoverId !== id) {
      this.hoverId = id;
      this.paintHighlights();
    }
    if (!id || !e) { this.tip.hidden = true; return; }
    const c = COMPONENTS.find((k) => k.id === id);
    const r = this.el.getBoundingClientRect();
    this.tip.textContent = `${c.name}${c.stations ? ` · ${c.stations}` : ''}`;
    this.tip.hidden = false;
    this.tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  }

  /**
   * Repaint every part from its base finish: spool colour if that view is on, then
   * selection (strong blue tint), hover (light tint), and — in focus mode — the rest dimmed.
   */
  paintHighlights() {
    if (!this.meshes) {
      this.meshes = [];
      this.root.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o !== this.points && o.material) this.meshes.push(o); });
    }
    const SEL = new THREE.Color(0x1f6bff), tmp = new THREE.Color();
    const done = new Set();
    for (const o of this.meshes) {
      const m = o.material;
      if (done.has(m)) continue;
      done.add(m);
      const u = m.userData;
      if (!u.base) u.base = { c: m.color.clone(), e: m.emissive.clone(), ei: m.emissiveIntensity, env: m.envMapIntensity ?? 1 };
      const id = o.userData.component;
      const base = this.state.spools && o.userData.spool ? tmp.setHex(SPOOL_COLORS[o.userData.spool]) : tmp.copy(u.base.c);
      m.envMapIntensity = u.base.env;
      if (id && id === this.selected) {
        m.color.copy(base).lerp(SEL, 0.65);
        m.emissive.copy(SEL); m.emissiveIntensity = 0.32;
      } else if (id && id === this.hoverId) {
        m.color.copy(base).lerp(SEL, 0.3);
        m.emissive.copy(SEL); m.emissiveIntensity = 0.12;
      } else {
        m.color.copy(base);
        m.emissive.copy(u.base.e); m.emissiveIntensity = u.base.ei;
        if (this.focus && this.selected) { m.color.multiplyScalar(0.42); m.envMapIntensity = u.base.env * 0.35; m.emissiveIntensity = u.base.ei * 0.3; }
      }
    }
  }

  /** Focus mode (used by the guided tour): everything except the selected part is dimmed. */
  setFocus(on) {
    this.focus = on;
    this.paintHighlights();
  }

  /** Highlight the part that matches the component open in the calculation panel. */
  select(id) {
    this.selected = id;
    this.paintHighlights();
    const c = COMPONENTS.find((k) => k.id === id);
    if (this.selectedEl && c) {
      this.selectedEl.querySelector('.engine-selected-name').textContent = `${c.name}${c.stations ? ` · ${c.stations}` : ''}`;
      this.selectedEl.hidden = false;
    }
  }

  highlightStation(id) {
    for (const b of this.badges ?? []) b.classList.toggle('is-hl', b.dataset.station === id || (id === '13' && b.dataset.station === '21'));
  }

  // ---------------------------------------------------------------- state
  setCycle(cycle, units) {
    const bprChanged = this.cycle?.inputs.BPR !== cycle.inputs.BPR;
    this.cycle = cycle;
    this.units = units;
    if (this.failed) return;
    this.root.scale.setScalar((cycle.inputs.fanDiameter ?? REF_FAN_DIAMETER) / REF_FAN_DIAMETER);
    if (bprChanged) this.seedFlow(true);
    if (!this.state.flow) this.stepFlow(0);
  }

  set(option, value) {
    this.state[option] = value;
    if (option === 'cutaway') this.applyCutaway();
    if (option === 'spools') this.applySpools();
    if (option === 'colorBy' || option === 'flow') this.stepFlow(0);
  }

  /** Colour the rotating parts by spool (LP, IP, HP) or restore their metal finish. */
  applySpools() {
    this.paintHighlights();
  }

  /**
   * Move the camera smoothly to a position and target given in engine coordinates (m, before scaling).
   * Passing null for both returns to the whole-engine view. Instant when reduced motion is preferred.
   */
  flyTo(cam, target, seconds = 1.2) {
    const k = this.root.scale.x;
    let toPos, toTgt;
    if (!cam) {
      const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
      this.resetView();
      toPos = this.camera.position.clone(); toTgt = this.controls.target.clone();
      this.camera.position.copy(p0); this.controls.target.copy(t0);
    } else {
      toPos = new THREE.Vector3(...cam).multiplyScalar(k);
      toTgt = new THREE.Vector3(...target).multiplyScalar(k);
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || seconds <= 0) {
      this.camera.position.copy(toPos); this.controls.target.copy(toTgt); this.controls.update(); this.anim = null;
      return;
    }
    this.anim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: toPos, t1: toTgt, t: 0, dur: seconds };
  }

  /** Camera close to the core, looking into the section between the compressors and the turbines. */
  focusCore() {
    const k = this.root.scale.x;
    this.camera.position.set(2.45 * k, 1.25 * k, 2.35 * k);
    this.controls.target.set(3.1 * k, 0.42 * k, -0.1 * k);
    this.controls.update();
  }

  applyCutaway() {
    this.clip.constant = this.state.cutaway ? 0 : 100; // far plane = no cut
    for (const c of this.caps) c.visible = this.state.cutaway;
  }

  resetView() {
    // narrow (portrait) views need the camera further back to fit the engine's length
    const aspect = this.el.clientWidth / Math.max(1, this.el.clientHeight) || 1.6;
    const k = Math.max(1, 1.45 / aspect) * this.root.scale.x;
    const target = new THREE.Vector3(2.3 * this.root.scale.x, 0, 0);
    this.camera.position.copy(target).add(new THREE.Vector3(-3.5, 2.0, 8.4).multiplyScalar(k));
    this.controls.target.copy(target);
    this.controls.update();
  }

  resize() {
    if (this.failed) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.fitted) { this.fitted = true; this.resetView(); }
  }

  tick(dt) {
    // exploded view: ease module offsets and fade the shells
    const target = this.state.exploded ? 1 : 0;
    this.explode += (target - this.explode) * Math.min(1, dt * 5);
    if (Math.abs(target - this.explode) < 1e-3) this.explode = target;
    this.shellOpacity = 1 - 0.9 * this.explode;
    for (const g of this.root.children) {
      if (g.userData.explodeX !== undefined) g.position.x = g.userData.explodeX * this.explode;
      if (g.userData.shell) {
        g.traverse((o) => {
          if (!o.isMesh) return;
          o.material.transparent = this.explode > 0.001;
          o.material.opacity = this.shellOpacity;
          o.material.depthWrite = this.explode < 0.5;
        });
      }
    }
    this.points.visible = this.explode < 0.3;
    if (this.state.spin) {
      for (const sp of ['LP', 'IP', 'HP']) this.spinAngle[sp] = (this.spinAngle[sp] + ((SPOOL_RPM[sp] / SPIN_SLOWDOWN) / 60) * 2 * Math.PI * dt) % (2 * Math.PI);
      for (const o of this.rotors) o.rotation.x = this.spinAngle[o.userData.spool];
    }
    if (this.state.flow) this.stepFlow(dt);
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2; // ease in-out
      this.camera.position.lerpVectors(a.p0, a.p1, e);
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (a.t >= 1) this.anim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.placeBadges();
  }
}
