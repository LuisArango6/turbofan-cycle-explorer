// Procedural 3D model of a three-spool, high-bypass turbofan (stylised, technical).
// Built from revolved profiles (Three.js LatheGeometry) and instanced blade rows, with the
// internal mechanical parts a cutaway shows: rotor discs and drums, blade platforms, stator
// shrouds, casings with flanges, bearing housings, the combustor with its outer case, fuel
// injectors and external pipework. Our own geometry, sized to a 2.85 m fan; it does not
// reproduce any manufacturer's model.
//
// Axis: +x points downstream; the fan face (station 2) is at x ≈ 0.9 m. Lengths in metres.

import * as THREE from '../vendor/three/three.module.min.js';

export const REF_FAN_DIAMETER = 2.85;

// ---------------------------------------------------------------- core gas path [x, hub radius, outer radius]
export const CORE_PATH = [
  [1.45, 0.46, 0.76], [1.65, 0.44, 0.70], [2.40, 0.43, 0.56], [2.50, 0.40, 0.53], [3.00, 0.38, 0.45],
  [3.10, 0.38, 0.47], [3.25, 0.35, 0.57], [3.45, 0.35, 0.57], [3.55, 0.40, 0.50], [3.72, 0.40, 0.53],
  [3.92, 0.40, 0.58], [4.00, 0.40, 0.60], [4.47, 0.38, 0.72], [4.60, 0.36, 0.68], [4.80, 0.30, 0.60],
];
/** Bypass duct [x, inner radius, outer radius]. */
export const BYPASS_PATH = [[1.42, 0.82, 1.43], [2.00, 0.93, 1.43], [2.60, 0.93, 1.40], [3.20, 0.86, 1.26]];

function interpPath(path, x) {
  if (x <= path[0][0]) return [path[0][1], path[0][2]];
  for (let i = 1; i < path.length; i++) {
    if (x <= path[i][0]) {
      const [x0, a0, b0] = path[i - 1], [x1, a1, b1] = path[i];
      const t = (x - x0) / (x1 - x0);
      return [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t];
    }
  }
  const last = path[path.length - 1];
  return [last[1], last[2]];
}
export const coreAt = (x) => interpPath(CORE_PATH, x);

/** Component that occupies an axial position in the core (for clicks on casings, drums and discs). */
export function componentAtX(x) {
  const spans = [[0.9, 'inlet'], [1.45, 'fan'], [2.45, 'ipc'], [3.05, 'hpc'], [3.55, 'combustor'], [3.73, 'hpt'], [3.95, 'ipt'], [4.47, 'lpt'], [4.6, 'jetPipe']];
  for (const [end, id] of spans) if (x < end) return id;
  return 'coreNozzle';
}

/** Station positions [x, radius] used for markers (radius = mid of the flow annulus). */
export const STATION_POS = {
  0: [-0.6, 1.0], 2: [0.88, 0.95], 13: [1.42, 1.15], 19: [3.22, 1.06], 21: [1.47, 0.61], 23: [2.45, 0.49], 3: [3.03, 0.42],
  4: [3.53, 0.46], 41: [3.72, 0.47], 43: [3.93, 0.49], 5: [4.47, 0.55], 7: [4.62, 0.52], 9: [4.82, 0.45],
};

/** Spool colours for the optional "colour by spool" view. */
export const SPOOL_COLORS = { LP: 0x3b7dd8, IP: 0x2fa37a, HP: 0xd0473d };

// ---------------------------------------------------------------- materials
function makeMaterials() {
  const m = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.38, side: THREE.DoubleSide, ...opts });
  return {
    nacelle: m(0xe2e5ea, { metalness: 0.1, roughness: 0.55 }),
    cowl: m(0xd2d7de, { metalness: 0.15, roughness: 0.5 }),
    casing: m(0x7f8791, { metalness: 0.75, roughness: 0.42 }),
    flange: m(0x666d76, { metalness: 0.8, roughness: 0.4 }),
    pipe: m(0xa9aeb5, { metalness: 0.9, roughness: 0.25 }),
    bracket: m(0x4d535b, { metalness: 0.6, roughness: 0.5 }),
    spinner: m(0x2b2f36, { metalness: 0.4, roughness: 0.35 }),
    fan: m(0x9aa6b4, { metalness: 0.9, roughness: 0.26 }),
    ogv: m(0x7d8691, { metalness: 0.6, roughness: 0.45 }),
    compressor: m(0xc9ced5, { metalness: 0.95, roughness: 0.24 }),       // titanium / steel blades
    stator: m(0x9aa1ab, { metalness: 0.85, roughness: 0.32 }),
    disc: m(0xaeb4bc, { metalness: 0.95, roughness: 0.3 }),
    combustorCase: m(0x8c939c, { metalness: 0.8, roughness: 0.38 }),
    liner: m(0xb98a62, { metalness: 0.7, roughness: 0.42, emissive: 0xff6a2a, emissiveIntensity: 0.28 }),
    hpt: m(0x7d6a5a, { metalness: 0.85, roughness: 0.34 }),               // heat-tinted nickel alloy
    ipt: m(0x8a7766, { metalness: 0.85, roughness: 0.34 }),
    lpt: m(0x9b8b7b, { metalness: 0.85, roughness: 0.34 }),
    turbineDisc: m(0x8f949b, { metalness: 0.9, roughness: 0.33 }),
    shaft: m(0x5c626b, { metalness: 0.9, roughness: 0.3 }),
    bearing: m(0xb7a07a, { metalness: 0.9, roughness: 0.28 }),
    plug: m(0x6c737d, { metalness: 0.7, roughness: 0.4 }),
  };
}

// ---------------------------------------------------------------- geometry helpers
/** Surface of revolution about the x axis from [radius, x] points. */
function lathe(points, segments = 128) {
  const g = new THREE.LatheGeometry(points.map(([r, x]) => new THREE.Vector2(Math.max(r, 0), x)), segments);
  g.rotateZ(-Math.PI / 2); // lathe axis y → engine axis x
  return g;
}

/** Closed rectangular ring (radial band) from r0 to r1 and x0 to x1. */
const ring = (r0, r1, x0, x1) => lathe([[r0, x0], [r1, x0], [r1, x1], [r0, x1], [r0, x0]]);

/**
 * Flat cut face for a closed lathe profile, lying in the section plane (z = 0) above and below the axis.
 * Without it the sectioned shell shows its hollow inside, as in a drawing whose cut faces are left open.
 */
function capGeometry(points) {
  const half = (sign) => {
    const shape = new THREE.Shape(points.map(([r, x]) => new THREE.Vector2(x, sign * r)));
    return new THREE.ShapeGeometry(shape);
  };
  const g = mergeTwo(half(1), half(-1));
  g.translate(0, 0, -0.002); // just inside the kept side of the section plane
  return g;
}

/** Two non-indexed position/normal geometries joined into one. */
function mergeTwo(a, b) {
  const ga = a.toNonIndexed(), gb = b.toNonIndexed();
  const pos = new Float32Array([...ga.attributes.position.array, ...gb.attributes.position.array]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A twisted, cambered aerofoil blade in its local frame: span along +y, axial along +x, tangential
 * along z (the rotors spin towards +z at the top). Each section is a NACA-style aerofoil: rounded
 * leading edge, thin trailing edge and a parabolic camber line with its peak at `maxAt` of the chord.
 * `camber` is the peak camber as a fraction of chord, `thick` the maximum thickness as a fraction of
 * chord, `stagger` the chord angle from the axis. `hand` = -1 mirrors the camber, so the leading edge
 * is turned less than the trailing edge (turbine nozzle vanes, rotors spinning towards +z).
 * Thickness and camber taper towards the tip, as on real blades.
 */
function bladeGeometry({ rHub, rTip, chordHub, chordTip, staggerHub, staggerTip, sweep = 0, camber = 0.08, thick = 0.08,
  sections = 6, maxAt = 0.45, hand = 1, tipThin = 0.4, tipCamber = 0.25 }) {
  const n = 9;                                    // points per surface, cosine-spaced (dense at the edges)
  const loop = 2 * n - 2;                         // leading and trailing edge points shared by both surfaces
  const pos = [], idx = [];
  const p = Math.min(0.8, Math.max(0.2, maxAt));
  for (let j = 0; j <= sections; j++) {
    const t = j / sections;
    const r = rHub + (rTip - rHub) * t;
    const c = chordHub + (chordTip - chordHub) * t;
    const b = staggerHub + (staggerTip - staggerHub) * t;
    const m = camber * (1 - tipCamber * t) * hand;
    const tk = thick * (1 - tipThin * t);
    const xc = sweep * t * t;
    const upper = [], lower = [];
    for (let k = 0; k < n; k++) {
      const x = (1 - Math.cos((Math.PI * k) / (n - 1))) / 2;
      const yt = 5 * tk * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
      const yc = x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x);
      const dy = x < p ? ((2 * m) / (p * p)) * (p - x) : ((2 * m) / ((1 - p) ** 2)) * (p - x);
      const th = Math.atan(dy);
      upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
      lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
    }
    const ring = [...upper, ...lower.slice(1, n - 1).reverse()];
    for (const [ux, uy] of ring) {
      const ax = (ux - 0.5) * c, tg = uy * c;
      pos.push(xc + ax * Math.cos(b) - tg * Math.sin(b), r, ax * Math.sin(b) + tg * Math.cos(b));
    }
  }
  for (let j = 0; j < sections; j++) {
    for (let k = 0; k < loop; k++) {
      const a = j * loop + k, a2 = j * loop + ((k + 1) % loop);
      idx.push(a, a + loop, a2, a2, a + loop, a2 + loop);
    }
  }
  // root and tip caps: strips across the section, upper point k to lower point k
  const low = (k) => (k === 0 ? 0 : k === n - 1 ? n - 1 : loop - k);
  for (const j of [0, sections]) {
    const o = j * loop, flip = j === 0;
    for (let k = 0; k < n - 1; k++) {
      const u0 = o + k, u1 = o + k + 1, l0 = o + low(k), l1 = o + low(k + 1);
      if (flip) idx.push(u0, l1, u1, u0, l0, l1); else idx.push(u0, u1, l1, u0, l1, l0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** N copies of one part around the axis at axial position x. */
function around(geom, material, count, x, phase = 0) {
  const mesh = new THREE.InstancedMesh(geom, material, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < count; i++) {
    q.setFromAxisAngle(axis, phase + (2 * Math.PI * i) / count);
    m.compose(new THREE.Vector3(x, 0, 0), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

/** Rotor disc with an I-section: bore, thin web and rim. */
function disc(x, rBore, rRim, width, { boreW = width * 0.9, webW = width * 0.25, boreH = 0.035, rimH = 0.025 } = {}) {
  const pts = [
    [rBore, x - boreW / 2], [rBore + boreH, x - boreW / 2], [rBore + boreH, x - webW / 2], [rRim - rimH, x - webW / 2],
    [rRim - rimH, x - width / 2], [rRim, x - width / 2], [rRim, x + width / 2], [rRim - rimH, x + width / 2],
    [rRim - rimH, x + webW / 2], [rBore + boreH, x + webW / 2], [rBore + boreH, x + boreW / 2], [rBore, x + boreW / 2], [rBore, x - boreW / 2],
  ];
  return lathe(pts);
}

/** Bent pipe along points [x, y, z]. */
function pipe(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, 48, radius, 10, false);
}

// ---------------------------------------------------------------- the engine
/**
 * Build the engine. Returns { root, components }.
 * - root children are module groups; userData.explodeX is their offset in the exploded view,
 *   userData.shell marks the group that fades out in that view.
 * - every selectable mesh has userData.component (a calculation component id) or userData.byX
 *   (select by axial position); rotating parts have userData.spool = 'LP' | 'IP' | 'HP'.
 */
export function buildEngine() {
  const mat = makeMaterials();
  const root = new THREE.Group();
  root.name = 'engine';
  const components = {};
  // every mesh gets its own material instance per component, so highlighting one part never lights another
  const matCache = new Map();
  const own = (m, component, spool) => {
    const key = `${m.uuid}|${component}|${spool ?? ''}`;
    if (!matCache.has(key)) matCache.set(key, m.clone());
    return matCache.get(key);
  };
  const add = (group, geom, material, { component = null, spool = null, byX = false, x = 0, instances = null, cap = false } = {}) => {
    const mm = own(material, component ?? 'none', spool);
    const mesh = instances ? around(geom, mm, instances, x) : new THREE.Mesh(geom, mm);
    if (!instances && x) mesh.position.x = x;
    if (component) { mesh.userData.component = component; (components[component] ??= []).push(mesh); }
    if (byX) mesh.userData.byX = true;
    if (cap) mesh.userData.cap = true;
    if (spool) mesh.userData.spool = spool;
    group.add(mesh);
    return mesh;
  };
  const mod = (name, explodeX) => {
    const g = new THREE.Group();
    g.name = name;
    g.userData.explodeX = explodeX;
    root.add(g);
    return g;
  };

  // ================================================================ shells (fade in the exploded view)
  const shells = mod('shells', 0);
  shells.userData.shell = true;

  // nacelle: inlet (station 0 → 2) and rear part with the bypass nozzle
  // The inlet narrows to its throat behind the lip, then diffuses smoothly to the fan-case radius.
  // The fan containment case is the inner wall of the nacelle around the fan (no step, no overlap).
  const closedShell = (pts, material, opts) => { add(shells, lathe(pts), material, opts); add(shells, capGeometry(pts), material, { ...opts, cap: true }); };
  closedShell([[1.43, 0.80], [1.41, 0.45], [1.38, 0.12], [1.40, -0.02], [1.48, -0.04], [1.56, 0.06], [1.62, 0.45], [1.64, 0.80], [1.43, 0.80]], mat.nacelle, { component: 'inlet' });
  closedShell([[1.50, 0.80], [1.50, 1.45], [1.43, 1.45], [1.43, 1.60], [1.42, 2.40], [1.30, 3.05], [1.26, 3.20], [1.37, 3.20], [1.55, 2.40], [1.64, 1.40], [1.64, 0.80], [1.50, 0.80]], mat.nacelle, { component: 'fanNozzle' });
  closedShell([[1.43, 0.80], [1.50, 0.80], [1.50, 1.45], [1.43, 1.45], [1.43, 0.80]], mat.casing, { component: 'fan' });

  // core cowl: inner wall of the bypass duct (front) and core nozzle (rear)
  add(shells, lathe([[0.77, 1.42], [0.84, 1.50], [0.93, 2.00], [0.93, 2.60], [0.86, 3.20], [0.80, 3.80], [0.78, 4.10]]), mat.cowl, { component: 'fanNozzle' });
  add(shells, lathe([[0.78, 4.10], [0.70, 4.50], [0.62, 4.80], [0.60, 4.80], [0.68, 4.60], [0.72, 4.47]]), mat.cowl, { component: 'coreNozzle' });

  // outlet guide vanes in the bypass duct and the engine section stators at the core inlet
  add(shells, bladeGeometry({ rHub: 0.92, rTip: 1.43, chordHub: 0.22, chordTip: 0.24, staggerHub: 0.3, staggerTip: 0.25, camber: 0.07, thick: 0.08, sections: 4, maxAt: 0.4, tipThin: 0, tipCamber: 0 }), mat.ogv, { component: 'fanNozzle', instances: 48, x: 2.02 });
  add(shells, bladeGeometry({ rHub: 0.45, rTip: 0.74, chordHub: 0.10, chordTip: 0.10, staggerHub: 0.2, staggerTip: 0.2, camber: 0.04, thick: 0.10, sections: 3, tipThin: 0, tipCamber: 0 }), mat.stator, { component: 'ipc', instances: 40, x: 1.56 });

  // core casing: a shell just outside the gas path, with flanges at module joints
  const casePts = CORE_PATH.map(([x, , ro]) => [ro + 0.012, x]);
  closedShell([...casePts, ...casePts.slice().reverse().map(([r, x]) => [r + 0.018, x]), casePts[0]], mat.casing, { byX: true });
  for (const x of [1.62, 2.02, 2.46, 2.76, 3.06, 3.52, 3.74, 3.96, 4.22, 4.48]) {
    const [, ro] = coreAt(x);
    closedShell([[ro + 0.03, x - 0.012], [ro + 0.065, x - 0.012], [ro + 0.065, x + 0.012], [ro + 0.03, x + 0.012], [ro + 0.03, x - 0.012]], mat.flange, { byX: true });
  }
  // combustor outer case (diffuser case) bulging around the liner
  closedShell([[0.50, 3.02], [0.62, 3.12], [0.66, 3.30], [0.64, 3.50], [0.56, 3.58], [0.58, 3.58], [0.66, 3.50], [0.68, 3.30], [0.64, 3.10], [0.52, 3.02]], mat.combustorCase, { component: 'combustor' });

  // external pipework: fuel manifold ring, feed pipes to the injectors, a few service lines
  const fuelRing = new THREE.TorusGeometry(0.72, 0.012, 10, 128);
  fuelRing.rotateY(Math.PI / 2);
  add(shells, fuelRing, mat.pipe, { component: 'combustor', x: 3.18 });
  const feeds = new THREE.Group();
  for (let i = 0; i < 20; i++) {
    const a = (2 * Math.PI * i) / 20, c = Math.cos(a), s = Math.sin(a);
    const g = pipe([[3.18, 0.72 * c, 0.72 * s], [3.15, 0.69 * c, 0.69 * s], [3.12, 0.64 * c, 0.64 * s]], 0.006);
    add(feeds, g, mat.pipe, { component: 'combustor' });
  }
  shells.add(feeds);
  const lines = [
    [[2.1, 0.62, 0.20], [2.4, 0.64, 0.22], [2.8, 0.60, 0.25], [3.15, 0.72, 0.18]],
    [[2.2, -0.60, 0.25], [2.6, -0.58, 0.28], [3.0, -0.52, 0.32], [3.45, -0.70, 0.22]],
    [[3.8, 0.60, -0.25], [4.1, 0.66, -0.25], [4.4, 0.78, -0.20]],
    [[1.9, 0.20, -0.62], [2.5, 0.22, -0.58], [3.0, 0.26, -0.50], [3.3, 0.30, -0.66]],
  ];
  lines.forEach((p) => add(shells, pipe(p, 0.011), mat.pipe));
  for (const [x, a] of [[2.3, 0.3], [2.9, 2.2], [4.0, 4.0], [2.6, 5.0]]) {
    const box = new THREE.BoxGeometry(0.08, 0.035, 0.06);
    const [, ro] = coreAt(x);
    box.translate(0, ro + 0.05, 0);
    box.rotateX(a);
    add(shells, box, mat.bracket, { x });
  }

  // shafts: plain metal tubes (LP innermost and longest, HP outermost and shortest)
  const tube = (r0, r1, xa, xb, spool) => add(shells, ring(r0, r1, xa, xb), mat.shaft, { spool });
  tube(0.075, 0.10, 1.05, 4.62, 'LP');
  tube(0.13, 0.155, 1.62, 3.96, 'IP');
  tube(0.19, 0.215, 2.47, 3.76, 'HP');

  // bearing housings with rollers, at the main shaft supports
  const rollers = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10);
  rollers.rotateZ(Math.PI / 2);
  for (const [x, r] of [[1.30, 0.11], [1.60, 0.165], [2.44, 0.225], [3.80, 0.225], [4.52, 0.11]]) {
    add(shells, lathe([[r + 0.015, x - 0.05], [r + 0.11, x - 0.07], [r + 0.13, x], [r + 0.11, x + 0.07], [r + 0.015, x + 0.05]]), mat.casing, { byX: true });
    add(shells, ring(r, r + 0.008, x - 0.025, x + 0.025), mat.bearing);
    const rr = new THREE.InstancedMesh(rollers, own(mat.bearing, 'none'), 24);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const a = (2 * Math.PI * i) / 24;
      m4.makeTranslation(x, (r + 0.02) * Math.cos(a), (r + 0.02) * Math.sin(a));
      rr.setMatrixAt(i, m4);
    }
    shells.add(rr);
  }

  // ================================================================ fan (LP)
  const fan = mod('fan', -1.3);
  add(fan, lathe([[0.0, 0.42], [0.10, 0.48], [0.26, 0.66], [0.38, 0.86], [0.45, 1.05], [0.45, 1.25]]), mat.spinner, { component: 'fan', spool: 'LP' });
  add(fan, bladeGeometry({ rHub: 0.44, rTip: 1.415, chordHub: 0.36, chordTip: 0.52, staggerHub: -0.35, staggerTip: -1.05, sweep: 0.12, camber: 0.07, thick: 0.08, sections: 14, hand: -1, maxAt: 0.5, tipThin: 0.6, tipCamber: 0.6 }), mat.fan, { component: 'fan', spool: 'LP', instances: 20, x: 1.03 });
  add(fan, disc(1.06, 0.14, 0.44, 0.30, { boreH: 0.05, rimH: 0.05 }), mat.disc, { component: 'fan', spool: 'LP' });
  add(fan, lathe([[0.10, 1.10], [0.30, 1.22], [0.44, 1.26]]), mat.disc, { component: 'fan', spool: 'LP' }); // fan disc cone to the shaft

  // ================================================================ compressors and turbines, stage by stage
  /**
   * Rotor + stator stages between x0 and x1 following the core gas path.
   * Rotor: blades + platform band + disc (+ drum spacer to the next disc). Stator: vanes + inner shroud ring.
   */
  /** A spool turning the other way has mirror-image blades: flip the stagger and the camber. */
  function mirror(b, dir = 1) {
    if (dir === -1) { b.staggerHub = -b.staggerHub; b.staggerTip = -b.staggerTip; b.hand = -b.hand; }
    return b;
  }
  function stages(group, o) {
    const pitch = (o.x1 - o.x0) / o.n;
    const discXs = [];
    for (let s = 0; s < o.n; s++) {
      const xr = o.x0 + pitch * (s + (o.turbine ? 0.66 : 0.3));
      const xs = o.x0 + pitch * (s + (o.turbine ? 0.24 : 0.74));
      const chord = pitch * 0.34;
      // rotor
      let [rh, ro] = coreAt(xr);
      // rotor blades. Compressor: thin, lightly cambered, twisted towards the tip. Turbine: thick,
      // highly cambered (about 100° of turning), little twist.
      const rot = o.turbine
        ? { staggerHub: -0.22, staggerTip: -0.42, camber: 0.24, thick: 0.24, maxAt: 0.35, hand: 1, tipThin: 0.35, tipCamber: 0.2 }
        : { staggerHub: -o.stagger * 0.7, staggerTip: -o.stagger * 1.15, camber: 0.09, thick: 0.09, maxAt: 0.45, hand: -1, tipThin: 0.45, tipCamber: 0.35 };
      mirror(rot, o.dir);
      const tip = o.turbine && o.shroud ? ro - 0.009 : ro - 0.006;
      add(group, bladeGeometry({ rHub: rh, rTip: tip, chordHub: chord, chordTip: chord * (o.turbine ? 0.95 : 0.85), sections: o.turbine ? 4 : 5, ...rot }),
        o.rotorMat, { component: o.component, spool: o.spool, instances: o.rotorCount + s * (o.countStep ?? 0), x: xr });
      add(group, ring(rh - 0.012, rh, xr - chord * 0.6, xr + chord * 0.6), o.discMat, { component: o.component, spool: o.spool });     // platform
      if (o.turbine && o.shroud) {
        // tip shroud: the blade tips' platforms lock together into a thin band, with two seal fins
        // running against the casing liner
        add(group, ring(tip, tip + 0.004, xr - chord * 0.5, xr + chord * 0.5), o.rotorMat, { component: o.component, spool: o.spool });
        for (const f of [-0.28, 0.22]) add(group, ring(tip + 0.004, ro + 0.006, xr + chord * f - 0.002, xr + chord * f + 0.002), o.rotorMat, { component: o.component, spool: o.spool });
      }
      add(group, disc(xr, o.bore, rh - 0.012, chord * 1.1, { boreW: chord * (o.turbine ? 1.3 : 0.9), webW: chord * 0.3, boreH: o.turbine ? 0.05 : 0.03 }), o.discMat, { component: o.component, spool: o.spool });
      discXs.push([xr, rh - 0.012]);
      // stator
      [rh, ro] = coreAt(xs);
      // stator vanes. Compressor: take the swirl out (lean opposite to the rotor). Turbine nozzle
      // guide vanes: thick, turn the axial flow towards the direction of rotation.
      const sta = o.turbine
        ? { staggerHub: 0.8, staggerTip: 0.85, camber: 0.2, thick: 0.22, maxAt: 0.6, hand: -1, tipThin: 0, tipCamber: 0, ...o.ngv }
        : { staggerHub: 0.42, staggerTip: 0.48, camber: 0.1, thick: 0.09, maxAt: 0.45, hand: 1, tipThin: 0.15, tipCamber: 0 };
      mirror(sta, o.dir);
      add(group, bladeGeometry({ rHub: rh + 0.01, rTip: ro, chordHub: chord * 0.9, chordTip: chord * 0.95, sections: 3, ...sta }),
        o.statorMat, { component: o.component, instances: o.statorCount, x: xs });
      add(group, ring(rh - 0.004, rh + 0.012, xs - chord * 0.55, xs + chord * 0.55), o.statorMat, { component: o.component }); // inner shroud
    }
    // drum: spacer cones joining the disc rims, so the rotor reads as one assembly
    if (!o.turbine || o.drum) {
      const pts = [];
      discXs.forEach(([x, r], i) => { pts.push([r - 0.01, x - 0.02], [r - 0.01, x + 0.02]); if (i < discXs.length - 1) pts.push([r - 0.025, (x + discXs[i + 1][0]) / 2]); });
      add(group, lathe(pts), o.discMat, { component: o.component, spool: o.spool });
    }
  }

  const ipc = mod('ipc', -0.65);
  stages(ipc, { component: 'ipc', spool: 'IP', x0: 1.66, x1: 2.40, n: 8, rotorCount: 38, countStep: 3, statorCount: 52, rotorMat: mat.compressor, statorMat: mat.stator, discMat: mat.disc, bore: 0.17, stagger: 0.8 });
  add(ipc, lathe([[0.155, 1.62], [0.30, 1.66], [0.40, 1.70]]), mat.disc, { component: 'ipc', spool: 'IP' }); // drive cone to the IP shaft

  const hpc = mod('hpc', -0.15);
  stages(hpc, { component: 'hpc', spool: 'HP', dir: -1, x0: 2.51, x1: 3.00, n: 6, rotorCount: 56, countStep: 4, statorCount: 74, rotorMat: mat.compressor, statorMat: mat.stator, discMat: mat.disc, bore: 0.23, stagger: 0.85 });
  add(hpc, lathe([[0.215, 2.48], [0.30, 2.52], [0.37, 2.55]]), mat.disc, { component: 'hpc', spool: 'HP' });

  // ---- combustor: annular liner with cooling bands, dome, fuel injectors
  const comb = mod('combustor', 0.35);
  add(comb, lathe([[0.40, 3.10], [0.37, 3.20], [0.37, 3.48], [0.41, 3.54], [0.49, 3.54], [0.55, 3.46], [0.55, 3.18], [0.47, 3.10], [0.40, 3.10]]), mat.liner, { component: 'combustor' });
  for (const x of [3.22, 3.30, 3.38, 3.46]) {
    add(comb, ring(0.553, 0.565, x - 0.006, x + 0.006), mat.combustorCase, { component: 'combustor' });
    add(comb, ring(0.358, 0.370, x - 0.006, x + 0.006), mat.combustorCase, { component: 'combustor' });
  }
  const inj = new THREE.CylinderGeometry(0.014, 0.010, 0.10, 12);
  inj.rotateZ(-Math.PI / 2);
  const injectors = new THREE.InstancedMesh(inj, own(mat.combustorCase, 'combustor'), 20);
  const stem = new THREE.CylinderGeometry(0.007, 0.007, 0.18, 8);
  const stems = new THREE.InstancedMesh(stem, own(mat.pipe, 'combustor'), 20);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < 20; i++) {
    const a = (2 * Math.PI * i) / 20;
    m4.makeTranslation(3.11, 0.46 * Math.cos(a), 0.46 * Math.sin(a));
    injectors.setMatrixAt(i, m4);
    q.setFromAxisAngle(ax, a);
    m4.compose(new THREE.Vector3(3.12, 0.55 * Math.cos(a), 0.55 * Math.sin(a)), q, new THREE.Vector3(1, 1, 1));
    stems.setMatrixAt(i, m4);
  }
  for (const im of [injectors, stems]) { im.userData.component = 'combustor'; components.combustor.push(im); comb.add(im); }
  // inner combustor case (between the liner and the HP shaft)
  add(comb, lathe([[0.30, 3.04], [0.33, 3.20], [0.33, 3.50], [0.37, 3.56]]), mat.combustorCase, { component: 'combustor' });

  // ---- turbines
  const hpt = mod('hpt', 0.75);
  stages(hpt, { component: 'hpt', spool: 'HP', dir: -1, x0: 3.55, x1: 3.73, n: 1, rotorCount: 68, statorCount: 36, rotorMat: mat.hpt, statorMat: mat.hpt, discMat: mat.turbineDisc, bore: 0.23, stagger: 1.0, turbine: true });
  add(hpt, lathe([[0.215, 3.76], [0.27, 3.70], [0.33, 3.67]]), mat.turbineDisc, { component: 'hpt', spool: 'HP' });
  const ipt = mod('ipt', 1.1);
  stages(ipt, { component: 'ipt', spool: 'IP', ngv: { camber: 0.12, staggerHub: 0.75, staggerTip: 0.8 }, x0: 3.74, x1: 3.94, n: 1, rotorCount: 72, statorCount: 40, rotorMat: mat.ipt, statorMat: mat.ipt, discMat: mat.turbineDisc, bore: 0.17, stagger: 1.0, turbine: true, shroud: true });
  add(ipt, lathe([[0.155, 3.97], [0.25, 3.90], [0.33, 3.87]]), mat.turbineDisc, { component: 'ipt', spool: 'IP' });
  const lpt = mod('lpt', 1.55);
  stages(lpt, { component: 'lpt', spool: 'LP', x0: 3.97, x1: 4.46, n: 6, rotorCount: 96, countStep: 4, statorCount: 104, rotorMat: mat.lpt, statorMat: mat.lpt, discMat: mat.turbineDisc, bore: 0.12, stagger: 1.05, turbine: true, shroud: true, drum: true });
  add(lpt, lathe([[0.10, 4.58], [0.20, 4.50], [0.30, 4.42]]), mat.turbineDisc, { component: 'lpt', spool: 'LP' });
  // tail bearing housing struts
  add(lpt, bladeGeometry({ rHub: 0.37, rTip: 0.69, chordHub: 0.09, chordTip: 0.09, staggerHub: 0, staggerTip: 0, camber: 0, thick: 0.22, sections: 2, tipThin: 0 }), mat.casing, { component: 'jetPipe', instances: 14, x: 4.54 });

  // ---- core nozzle: tail plug
  const noz = mod('nozzle', 2.1);
  add(noz, lathe([[0.36, 4.50], [0.33, 4.80], [0.22, 5.10], [0.05, 5.40], [0.0, 5.45]]), mat.plug, { component: 'coreNozzle' });

  return { root, components };
}
