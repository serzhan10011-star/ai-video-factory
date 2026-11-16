import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, noise, fbm, clamp, lerp, smooth, fract, Glow, FlowArrow, cloudTexture, glowTexture } from './util.js';
import { makeSky } from './landscape.js';

function vc(g, c) { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count; const a = new Float32Array(n * 3); const cc = new THREE.Color(c);
  for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }

function blob(r, det, amp, seed, sy = 1) {
  const g = new THREE.IcosahedronGeometry(r, det); const p = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + amp * noise(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7); v.multiplyScalar(k); v.y *= sy; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}

function makeTrees() {
  const parts = [vc(new THREE.CylinderGeometry(0.12, 0.28, 3.2, 8).translate(0, 1.6, 0), 0x3d2c20)];
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1); const rr = lerp(2.0, 0.45, k), hh = lerp(2.4, 1.4, k);
    const cone = new THREE.ConeGeometry(rr, hh, 12, 2, true); const p = cone.attributes.position; const v = new THREE.Vector3();
    for (let j = 0; j < p.count; j++) { v.fromBufferAttribute(p, j); const d = Math.hypot(v.x, v.z); if (d > 0.01) { const f = 1 + 0.12 * Math.sin(Math.atan2(v.z, v.x) * 6 + i); v.x *= f; v.z *= f; v.y -= d * 0.12; } p.setXYZ(j, v.x, v.y, v.z); }
    cone.translate(0, 2.4 + i * 1.25 + hh / 2, 0); cone.computeVertexNormals();
    parts.push(vc(cone, new THREE.Color().setHSL(0.36, 0.38, 0.11 + k * 0.05)));
  }
  const conifer = BGU.mergeGeometries(parts);
  const dparts = [vc(new THREE.CylinderGeometry(0.16, 0.32, 4.2, 8).translate(0, 2.1, 0), 0x4a3828)];
  const br = new THREE.CylinderGeometry(0.06, 0.12, 2.2, 6).translate(0, 1.1, 0).rotateZ(0.7).translate(0, 3.2, 0); dparts.push(vc(br, 0x4a3828));
  const br2 = new THREE.CylinderGeometry(0.06, 0.12, 2.0, 6).translate(0, 1.0, 0).rotateZ(-0.6).rotateY(1.4).translate(0, 3.4, 0); dparts.push(vc(br2, 0x4a3828));
  [[0, 5.6, 0, 2.2], [1.3, 5.0, 0.4, 1.6], [-1.2, 5.2, -0.5, 1.7], [0.3, 6.6, -0.4, 1.5], [-0.4, 4.8, 1.2, 1.4]].forEach(([x, y, z, s], i) => {
    dparts.push(vc(blob(s, 2, 0.22, i * 3.1, 0.85).translate(x, y, z), new THREE.Color().setHSL(0.25 + i * 0.012, 0.42, 0.18 + i * 0.02)));
  });
  const decid = BGU.mergeGeometries(dparts);
  return { conifer, decid };
}

function makeDeer(antlers, grazing) {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.85 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xc9a77c, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.95, 8, 16), coat); body.rotation.z = Math.PI / 2; body.position.y = 1.05; body.scale.set(1, 1, 0.9); g.add(body);
  const bel = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.7, 6, 12), belly); bel.rotation.z = Math.PI / 2; bel.position.set(0, 0.92, 0); g.add(bel);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.75, 10), coat);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.28, 6, 12), coat); skull.rotation.z = Math.PI / 2 - 0.25; head.add(skull);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), dark); snout.position.set(0.27, -0.07, 0); head.add(snout);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), coat); ear.position.set(-0.08, 0.13, s * 0.11); ear.rotation.x = s * 0.6; head.add(ear); }
  if (antlers) for (const s of [-1, 1]) {
    const ag = new THREE.Group(); ag.position.set(-0.02, 0.12, s * 0.07);
    const seg = (len, rx, rz, y = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, len, 5).translate(0, len / 2, 0), belly); m.rotation.set(rx, 0, rz); m.position.y = y; return m; };
    const main = seg(0.55, s * 0.35, -0.35); ag.add(main);
    const t1 = seg(0.22, s * 0.6, 0.5); t1.position.set(-0.05, 0.22, s * 0.06); ag.add(t1);
    const t2 = seg(0.2, s * 0.2, 0.4); t2.position.set(-0.13, 0.4, s * 0.12); ag.add(t2);
    head.add(ag);
  }
  if (grazing) { neck.position.set(0.68, 0.95, 0); neck.rotation.z = -1.05; head.position.set(1.0, 0.55, 0); head.rotation.z = -1.15; }
  else { neck.position.set(0.62, 1.42, 0); neck.rotation.z = -0.55; head.position.set(0.84, 1.8, 0); head.rotation.z = -0.1; }
  g.add(neck, head);
  for (const [x, z] of [[0.5, 0.16], [0.5, -0.16], [-0.48, 0.17], [-0.48, -0.17]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.92, 8), coat); leg.position.set(x, 0.46, z); g.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.07, 8), dark); hoof.position.set(x, 0.035, z); g.add(hoof);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), belly); tail.position.set(-0.78, 1.18, 0); tail.rotation.z = 2.2; g.add(tail);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export async function buildForest(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(scene, renderer, 32, 160, { turbidity: 4 });
  scene.fog = new THREE.FogExp2(0xa8c0d4, 0.012);

  const X0 = -42, X1 = 42, Z0 = -40, Z1 = 30;
  const lake = (x, z) => smooth(-20, -30, x + 4 * noise(z * 0.1, 1));
  const h = (x, z) => 0.6 * fbm(x * 0.05, z * 0.05, 2, 4) + 0.15 * noise(x * 0.4, z * 0.4) + (z < -15 ? (-15 - z) * 0.12 : 0) - lake(x, z) * 4.5;
  const colorFn = (x, y, z, ny) => {
    const n = fbm(x * 0.3, z * 0.3, 4, 3);
    if (y < -0.25) return [0.42 + n * .05, 0.38, 0.28];
    const litter = smooth(-0.1, 0.4, n);
    return [lerp(0.16, 0.3, litter) + n * 0.04, lerp(0.24, 0.21, litter) + n*0.03, lerp(0.09, 0.11, litter)];
  };
  // reuse block builder through landscape module internals (local copy for different strata)
  const block = buildForestBlock(h, X0, X1, Z0, Z1, colorFn);
  scene.add(block);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(22, Z1 - Z0).rotateX(-Math.PI / 2).translate(X0 + 11, -0.05, (Z0 + Z1) / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x1f5e78, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.82, envMapIntensity: 1.2 }));
  scene.add(water);

  const dl = new THREE.DirectionalLight(0xfff0d8, 5.2); dl.position.copy(sun).multiplyScalar(120); scene.add(dl);
  dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
  Object.assign(dl.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); dl.shadow.bias = -0.0005; dl.shadow.normalBias = 0.05;
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x3a3020, 1.3));

  const r = rng(21);
  const { conifer, decid } = makeTrees();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const crowns = [];
  const hero = [[0, 5], [-12, 8], [12, -2], [-4, -8], [18, 6]];
  const place = (geo, n, minS, maxS, isCon) => {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.7 }), n); let k = 0, guard = 0;
    const spots = isCon ? [] : hero;
    while (k < n && guard++ < n * 50) {
      let x, z;
      if (k < spots.length) [x, z] = spots[k]; else { x = lerp(X0 + 1, X1 - 1, r()); z = lerp(Z0 + 1, Z1 - 1, r()); }
      if (lake(x, z) > 0.05) continue;
      if (k >= spots.length) { // keep a glade for camera & deer
        if (Math.hypot(x - 9, z - 15) < 7 || Math.hypot(x + 4, z - 18) < 5 || (z > 20 && Math.abs(x) < 26 && r() < 0.8)) continue;
        if (hero.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.5)) continue;
      }
      const s = lerp(minS, maxS, r()); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.3);
      const y = h(x, z);
      m4.compose(new THREE.Vector3(x, y - 0.15, z), q, new THREE.Vector3(s, s * (0.9 + r() * 0.25), s)); im.setMatrixAt(k, m4);
      c.setHSL(0.25 + r() * 0.07, 0.3 + r() * 0.2, 0.8 + r() * 0.3); im.setColorAt(k, c);
      crowns.push([x, y + (isCon ? 7 : 5.4) * s, z, s]); k++;
    }
    im.count = k; im.castShadow = im.receiveShadow = true; scene.add(im);
  };
  place(decid, 90, 1.0, 1.35, false);
  place(conifer, 160, 0.9, 1.5, true);

  // undergrowth: bushes + grass tufts
  const bushGeo = vc(blob(0.6, 1, 0.3, 7, 0.7), 0x3f6a2c);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 500); let bk = 0;
  const bushList = [];
  for (let i = 0; i < 2000 && bk < 500; i++) {
    let x = lerp(X0, X1, r()), z = lerp(Z0, Z1, r()); if (bk < 3) { x = [6.6, 5.5, 4.4][bk]; z = [13.2, 15.6, 11]; z = z[bk]; }
    if (lake(x, z) > 0.02) continue; const s = 0.5 + r() * 0.9;
    m4.compose(new THREE.Vector3(x, h(x, z), z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(s, s, s));
    bushes.setMatrixAt(bk, m4); c.setHSL(0.24 + r() * 0.06, 0.45, 0.85 + r() * 0.3); bushes.setColorAt(bk, c); bushList.push([x, h(x, z) + 0.4 * s, z]); bk++;
  }
  bushes.count = bk; bushes.castShadow = bushes.receiveShadow = true; scene.add(bushes);
  const grassGeo = vc(new THREE.ConeGeometry(0.02, 0.3, 3).translate(0, 0.15, 0), 0x4f7a2e);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 14000); let gk = 0;
  for (let i = 0; i < 30000 && gk < 14000; i++) {
    const x = lerp(-22, 34, r()), z = lerp(-10, 30, r()); if (lake(x, z) > 0.02) continue;
    const s = 0.6 + r() * 0.8; q.setFromEuler(new THREE.Euler((r() - .5) * 0.5, r() * 6, (r() - .5) * 0.5));
    m4.compose(new THREE.Vector3(x, h(x, z) - 0.03, z), q, new THREE.Vector3(s, s * (0.7 + r()), s)); grass.setMatrixAt(gk, m4);
    c.setHSL(0.2 + r() * 0.08, 0.45, 0.7 + r() * 0.5); grass.setColorAt(gk, c); gk++;
  }
  grass.count = gk; grass.receiveShadow = true; scene.add(grass);

  // fallen log with fungi (decomposition)
  const logPos = new THREE.Vector3(-5, h(-5, 17) + 0.32, 17);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 5.5, 14, 6), new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 1 }));
  log.rotation.set(0, 0.4, Math.PI / 2); log.position.copy(logPos); log.castShadow = log.receiveShadow = true; scene.add(log);
  const fungiMat = new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.7 });
  for (let i = 0; i < 14; i++) {
    const u = (r() - .5) * 4.6; const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09 + r() * 0.06, 10, 6, 0, 6.3, 0, 1.4), fungiMat);
    const dir = new THREE.Vector3(Math.cos(0.4), 0, -Math.sin(0.4));
    cap.position.copy(logPos).addScaledVector(dir, u); cap.position.y += 0.33 + r() * 0.05; cap.position.z += (r() - .5) * 0.3; scene.add(cap);
  }
  // leaf litter patch
  const litGeo = vc(new THREE.CircleGeometry(0.12, 5).rotateX(-Math.PI / 2), 0x8a5a2a);
  const litter = new THREE.InstancedMesh(litGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 1500);
  for (let i = 0; i < 1500; i++) { const x = logPos.x + (r() - .5) * 9, z = logPos.z + (r() - .5) * 6;
    m4.compose(new THREE.Vector3(x, h(x, z) + 0.02, z), q.setFromEuler(new THREE.Euler((r() - .5) * 0.4, r() * 6, 0)), new THREE.Vector3(1, 1, 1)); litter.setMatrixAt(i, m4);
    c.setHSL(0.05 + r() * 0.07, 0.6, 0.35 + r() * 0.2); litter.setColorAt(i, c); }
  litter.receiveShadow = true; scene.add(litter);

  // deer
  const deer1 = makeDeer(true, false); deer1.position.set(10.5, h(10.5, 14), 14); deer1.rotation.y = Math.PI - 0.5; scene.add(deer1);
  const deer2 = makeDeer(false, true); deer2.position.set(8.2, h(8.2, 12.6), 12.6); deer2.rotation.y = Math.PI * 0.85; scene.add(deer2);
  const deerMouth = new THREE.Vector3(); // grazing head approx world
  deer2.updateMatrixWorld(); deerMouth.set(1.25, 0.25, 0).applyMatrix4(deer2.matrixWorld);
  deer1.updateMatrixWorld(); const deer1Body = new THREE.Vector3(0.84, 1.8, 0).applyMatrix4(deer1.matrixWorld);
  const deer2Body = new THREE.Vector3(0, 1.1, 0).applyMatrix4(deer2.matrixWorld);

  // light shafts through canopy
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.6 + r(), 1.6 + r() * 1.5, 40, 12, 1, true), shaftMat);
    const base = new THREE.Vector3(lerp(-15, 25, r()), 0, lerp(-5, 22, r()));
    s.position.copy(base).addScaledVector(sun, 20); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sun); scene.add(s);
  }

  // ---------- carbon particles ----------
  const glow = new Glow(22000, { size: 1 }); glow.mat.uniforms.uSize.value = 0.45; scene.add(glow.points);
  const heroCrowns = crowns.slice(0, 5);
  const photo = Array.from({ length: 1500 }, () => { const cr = heroCrowns[Math.floor(r() * heroCrowns.length)];
    const a = r() * 6.28, d = 7 + r() * 9; return { cr, sx: cr[0] + Math.cos(a) * d, sy: cr[1] + (r() - .2) * 8, sz: cr[2] + Math.sin(a) * d, s: r(), sp: 0.12 + r() * 0.08, ex: (r() - .5) * 2.4 * cr[3], ey: (r() - .5) * 2.0, ez: (r() - .5) * 2.4 * cr[3] }; });
  const air = Array.from({ length: 1200 }, () => ({ x: lerp(-30, 38, r()), y: 1 + r() * 18, z: lerp(-15, 30, r()), ph: r() * 6.28 }));
  const food = Array.from({ length: 260 }, () => ({ b: bushList[Math.floor(r() * 3)], s: r(), sp: 0.25 + r() * 0.15, j: [(r() - .5) * .5, (r() - .5) * .3, (r() - .5) * .5] }));
  const resp = Array.from({ length: 700 }, (_, i) => ({ src: i % 3 === 0 ? deer1Body : i % 3 === 1 ? deer2Body : heroCrowns[Math.floor(r() * 5)], s: r(), sp: 0.1 + r() * 0.06, w: r() * 6.28, isTree: i % 3 === 2 }));
  const decomp = Array.from({ length: 700 }, () => ({ x: logPos.x + (r() - .5) * 7, z: logPos.z + (r() - .5) * 4, s: r(), sp: 0.1 + r() * 0.07, w: r() * 6.28 }));
  const microbes = Array.from({ length: 500 }, () => { const u = (r() - .5) * 5; return { p: new THREE.Vector3(logPos.x + Math.cos(0.4) * u + (r() - .5) * .6, logPos.y + (r() - .3) * 0.6, logPos.z - Math.sin(0.4) * u + (r() - .5) * .8), ph: r() * 6.3 }; });
  const store = Array.from({ length: 900 }, () => ({ x: lerp(-20, 40, r()), s: r(), sp: 0.05 + r() * 0.04, d: 0.4 + r() * 2.8 }));
  const lakeStore = Array.from({ length: 500 }, () => ({ x: lerp(-41, -24, r()), z: lerp(-10, 29.5, r()), s: r(), sp: 0.06 + r() * 0.05 }));
  const soilBank = Array.from({ length: 900 }, () => ({ x: lerp(-22, 42, r()), y: -0.5 - r() * 2.6, ph: r() * 6 }));

  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const hc = heroCrowns[0];
  const arrows = {
    photo: new FlowArrow([V3(hc[0] + 9, hc[1] + 6, hc[2] + 5), V3(hc[0] + 5, hc[1] + 3, hc[2] + 3), V3(hc[0] + 1.8, hc[1] + 0.5, hc[2] + 1)], 0xffa040, 0.13),
    food: new FlowArrow([V3(6.6, 1.0, 13.4), V3(7.4, 1.6, 12.9), deerMouth.clone().add(V3(0, 0.35, 0))], 0x7dff8a, 0.07),
    resp: new FlowArrow([deer1Body.clone().add(V3(0, 0.4, 0)), deer1Body.clone().add(V3(0.5, 2.5, 0.5)), deer1Body.clone().add(V3(0.2, 5.0, 1.5))], 0xffb050, 0.11),
    decomp: new FlowArrow([logPos.clone().add(V3(0, 0.5, 0)), logPos.clone().add(V3(0.5, 2.6, 0.6)), logPos.clone().add(V3(0, 5, 1.2))], 0xff8a3a, 0.11),
    store: new FlowArrow([V3(-14, 3.5, 30.3), V3(-15, 0.5, 30.4), V3(-15.5, -2.5, 30.4)], 0xffc070, 0.14),
  };
  for (const a of Object.values(arrows)) scene.add(a.group);

  function update(t, st) {
    glow.begin();
    const O = [1.0, 0.55, 0.18], G = [0.4, 1.0, 0.45];
    if (st.airA > 0) for (const a of air) glow.add(a.x + Math.sin(t * 0.3 + a.ph) * 1.2, a.y + Math.sin(t * 0.5 + a.ph * 2) * 0.6, a.z + Math.cos(t * 0.25 + a.ph), ...O, st.airA * 0.45, 0.9);
    if (st.photoA > 0) for (const p of photo) {
      const u = fract(t * p.sp + p.s); const k = u * u * (3 - 2 * u);
      const x = lerp(p.sx, p.cr[0] + p.ex, k), y = lerp(p.sy, p.cr[1] + p.ey, k), z = lerp(p.sz, p.cr[2] + p.ez, k);
      const cc = [lerp(O[0], G[0], smooth(0.6, 0.95, u)), lerp(O[1], G[1], smooth(0.6, 0.95, u)), lerp(O[2], G[2], smooth(0.6, 0.95, u))];
      glow.add(x, y, z, ...cc, st.photoA * Math.sin(Math.PI * u) * 0.95, 1.0);
    }
    if (st.foodA > 0) for (const f of food) {
      const u = fract(t * f.sp + f.s); const b = f.b;
      const x = lerp(b[0], deerMouth.x, u) + f.j[0], y = lerp(b[1], deerMouth.y + 0.1, u) + Math.sin(u * 3.14) * 0.4 + f.j[1], z = lerp(b[2], deerMouth.z, u) + f.j[2];
      glow.add(x, y, z, ...G, st.foodA * Math.sin(Math.PI * u), 0.6);
    }
    if (st.respA > 0) for (const p of resp) {
      const u = fract(t * p.sp + p.s); const sx = p.isTree ? p.src[0] : p.src.x, sy = p.isTree ? p.src[1] : p.src.y, sz = p.isTree ? p.src[2] : p.src.z;
      glow.add(sx + Math.sin(u * 5 + p.w) * (0.4 + u * 2), sy + u * 9, sz + Math.cos(u * 4 + p.w) * (0.4 + u * 2), ...O, st.respA * Math.sin(Math.PI * u) * 0.9, 0.8);
    }
    if (st.decA > 0) {
      for (const p of decomp) { const u = fract(t * p.sp + p.s);
        glow.add(p.x + Math.sin(u * 6 + p.w) * u * 1.5, h(p.x, p.z) + 0.1 + u * 8, p.z + Math.cos(u * 5 + p.w) * u, 1.0, 0.45, 0.12, st.decA * Math.sin(Math.PI * u) * 0.9, 0.8); }
      for (const m of microbes) glow.add(m.p.x, m.p.y + 0.35, m.p.z, 1.0, 0.95, 0.4, st.decA * (0.5 + 0.5 * Math.sin(t * 4 + m.ph)), 0.25);
    }
    if (st.storeA > 0) {
      for (const p of store) { const u = fract(t * p.sp + p.s); const y0 = h(p.x, 30) + 2.5;
        glow.add(p.x, lerp(y0, -p.d, u), 30.25, 1.0, 0.62, 0.22, st.storeA * smooth(0, 0.1, u) * (1 - smooth(0.85, 1, u)), 0.7); }
      for (const p of lakeStore) { const u = fract(t * p.sp + p.s); glow.add(p.x, lerp(1.5, -4.3, u), p.z, 1.0, 0.6, 0.25, st.storeA * Math.sin(Math.PI * u) * 0.8, 0.7); }
      for (const p of soilBank) glow.add(p.x, p.y, 30.22, 1.0, 0.55, 0.15, st.storeA * (0.45 + 0.25 * Math.sin(t * 2 + p.ph)), 0.55);
    }
    glow.end();
    for (const k in arrows) { const [rv, al] = (st.arrows && st.arrows[k]) || [0, 0]; arrows[k].update(t, rv, al); }
  }
  return { scene, update, h, heroCrowns, deer1Body, deerMouth, logPos };
}

function buildForestBlock(h, X0, X1, Z0, Z1, colorFn) {
  const group = new THREE.Group(); const bottom = -6; const res = 2.2;
  const W = X1 - X0, D = Z1 - Z0; const nx = Math.round(W * res), nz = Math.round(D * res);
  const g = new THREE.PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (X0 + X1) / 2, z = p.getZ(i) + (Z0 + Z1) / 2; p.setXYZ(i, x, h(x, z), z); }
  g.computeVertexNormals(); const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) cols.set(colorFn(p.getX(i), p.getY(i), p.getZ(i), g.attributes.normal.getY(i)), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const t = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.5 })); t.receiveShadow = true; group.add(t);
  // front cut face only (z = Z1) + left (lake) face
  const wallPos = [], wallCol = [], idx = []; const rows = 40;
  const face = (pts) => { const base = wallPos.length / 3;
    pts.forEach(([x, z]) => { const hh = h(x, z); for (let rr = 0; rr <= rows; rr++) { const y = lerp(hh, bottom, rr / rows); const d = hh - y; const n = noise(x * 0.6, y * 1.5, z * 0.3) * 0.05;
      let c; if (hh < -0.3) c = d < 0.8 ? [0.2 + n, 0.16 + n, 0.12] : [0.35 + n, 0.31 + n, 0.26 + n];
      else if (d < 0.35) c = [0.12 + n, 0.09 + n, 0.05];
      else if (d < 2.6) c = [0.2 + n, 0.13 + n, 0.07 + n * .5];
      else if (d < 4.2) c = [0.45 + n, 0.33 + n, 0.2 + n]; else c = [0.4 + n, 0.38 + n, 0.35 + n];
      wallPos.push(x, y, z); wallCol.push(...c); } });
    for (let i = 0; i < pts.length - 1; i++) for (let rr = 0; rr < rows; rr++) { const a = base + i * (rows + 1) + rr, b = a + rows + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); } };
  const seg = (ax, az, bx, bz, n) => Array.from({ length: n + 1 }, (_, i) => [lerp(ax, bx, i / n), lerp(az, bz, i / n)]);
  face(seg(X0, Z1, X1, Z1, nx)); face(seg(X1, Z1, X1, Z0, nz)); face(seg(X0, Z0, X0, Z1, nz));
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3)); wg.setIndex(idx); wg.computeVertexNormals();
  group.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
  // lake water cut face
  const wp = [], wi = []; const pts = seg(X0, Z1, X0 + 22, Z1, 40);
  pts.forEach(([x, z]) => { wp.push(x, -0.05, z + 0.02, x, Math.min(h(x, z), -0.05), z + 0.02); });
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; wi.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); lg.setIndex(wi);
  const lm = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0x2a7fa8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); lm.renderOrder = 3; group.add(lm);
  return group;
}
