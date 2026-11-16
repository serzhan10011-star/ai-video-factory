import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, noise, fbm, ridged, clamp, lerp, smooth, fract, Glow, FlowArrow, cloudTexture, glowTexture } from './util.js';

// ---------- shared helpers ----------
export function makeSky(scene, renderer, elevDeg, azDeg, { turbidity = 6, rayleigh = 1.6 } = {}) {
  const sky = new Sky(); sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = turbidity; u.rayleigh.value = rayleigh; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevDeg), THREE.MathUtils.degToRad(azDeg));
  u.sunPosition.value.copy(sun);
  scene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sk2 = new Sky(); sk2.scale.setScalar(4000);
  for (const k in u) sk2.material.uniforms[k].value = u[k].value;
  envScene.add(sk2);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  return { sky, sun };
}

function treeGeometries() {
  const col = (g, c) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3); const cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const trunk = col(new THREE.CylinderGeometry(0.06, 0.1, 1, 6).translate(0, 0.5, 0), 0x4a3424);
  const c1 = col(new THREE.ConeGeometry(0.55, 1.5, 9).translate(0, 1.25, 0), 0x2f6b34);
  const c2 = col(new THREE.ConeGeometry(0.42, 1.2, 9).translate(0, 1.85, 0), 0x357a3a);
  const c3 = col(new THREE.ConeGeometry(0.28, 0.9, 9).translate(0, 2.35, 0), 0x3b8640);
  const conifer = BGU.mergeGeometries([trunk.clone(), c1, c2, c3].map(g => g.toNonIndexed ? g.toNonIndexed() : g));
  const crown = new THREE.IcosahedronGeometry(0.75, 1);
  const p = crown.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.18 * noise(v.x * 3, v.y * 3, v.z * 3); v.multiplyScalar(k); v.y *= 0.85; p.setXYZ(i, v.x, v.y + 1.55, v.z); }
  crown.computeVertexNormals();
  const trunk2 = col(new THREE.CylinderGeometry(0.07, 0.11, 1.2, 6).translate(0, 0.6, 0), 0x4d3a2a);
  const decid = BGU.mergeGeometries([trunk2.toNonIndexed(), col(crown, 0x4c8a3c).toNonIndexed()]);
  conifer.computeVertexNormals(); decid.computeVertexNormals();
  return { conifer, decid };
}

// strata colour for cut walls by depth below surface
function strata(d, y, x, z, under) {
  const n = noise(x * 0.08, y * 0.25, z * 0.08) * 0.06;
  if (under) { // sea floor sediments
    if (d < 1.2) return [0.62 + n, 0.55 + n, 0.42 + n];
    if (d < 5) return [0.48 + n, 0.43 + n, 0.36 + n];
  } else {
    if (d < 0.9) return [0.17 + n, 0.12 + n, 0.07];         // humus
    if (d < 3.5) return [0.36 + n, 0.25 + n, 0.15 + n];       // soil
    if (d < 7.5) return [0.52 + n, 0.40 + n, 0.27 + n];       // subsoil / clay
  }
  if (y > -22 && y < -15) return [0.36 + n, 0.44 + n, 0.52 + n]; // aquifer (water-bearing sands)
  const band = 0.5 + 0.5 * Math.sin(y * 0.9 + noise(x * 0.05, z * 0.05) * 3);
  return [0.36 + band * 0.07 + n, 0.34 + band * 0.06 + n, 0.33 + band * 0.05 + n];
}

/** Builds a cut-away terrain block. hFn(x,z) -> height. */
function buildBlock({ hFn, X0, X1, Z0, Z1, res, bottom, colorFn, waterLevel = 0 }) {
  const group = new THREE.Group();
  const W = X1 - X0, D = Z1 - Z0;
  const nx = Math.round(W * res), nz = Math.round(D * res);
  const g = new THREE.PlaneGeometry(W, D, nx, nz); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (X0 + X1) / 2, z = p.getZ(i) + (Z0 + Z1) / 2;
    const h = hFn(x, z); p.setXYZ(i, x, h, z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const c = colorFn(p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i)); colors.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.6 }));
  terrain.receiveShadow = true; terrain.castShadow = true;
  group.add(terrain);

  // walls
  const wallPos = [], wallCol = [], wallIdx = []; const waterPos = [], waterIdx = [];
  const rows = 48;
  const edge = (pts) => {
    const base = wallPos.length / 3;
    pts.forEach(([x, z]) => {
      const h = hFn(x, z);
      for (let r = 0; r <= rows; r++) {
        const y = lerp(h, bottom, Math.pow(r / rows, 1.6));
        wallPos.push(x, y, z); wallCol.push(...strata(h - y, y, x, z, h < waterLevel));
      }
    });
    for (let i = 0; i < pts.length - 1; i++) for (let r = 0; r < rows; r++) {
      const a = base + i * (rows + 1) + r, b = a + rows + 1;
      wallIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const wb = waterPos.length / 3;
    pts.forEach(([x, z]) => { const h = Math.min(hFn(x, z), waterLevel); waterPos.push(x, waterLevel, z, x, h, z); });
    for (let i = 0; i < pts.length - 1; i++) { const a = wb + i * 2; waterIdx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  };
  const seg = (ax, az, bx, bz, n) => Array.from({ length: n + 1 }, (_, i) => [lerp(ax, bx, i / n), lerp(az, bz, i / n)]);
  edge(seg(X0, Z1, X1, Z1, nx)); edge(seg(X1, Z1, X1, Z0, nz)); edge(seg(X1, Z0, X0, Z0, nx)); edge(seg(X0, Z0, X0, Z1, nz));
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
  wg.setIndex(wallIdx); wg.computeVertexNormals();
  const walls = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
  group.add(walls);
  const bot = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate((X0 + X1) / 2, bottom, (Z0 + Z1) / 2), new THREE.MeshStandardMaterial({ color: 0x2a2826 }));
  group.add(bot);
  const wwg = new THREE.BufferGeometry(); wwg.setAttribute('position', new THREE.Float32BufferAttribute(waterPos, 3)); wwg.setIndex(waterIdx);
  const waterWalls = new THREE.Mesh(wwg, new THREE.MeshBasicMaterial({ color: 0x1d6fa8, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
  waterWalls.renderOrder = 2;
  group.add(waterWalls);
  return { group, terrain, walls };
}

function waterMaterial(sunDir, { deep = 0x0b3d66, shallow = 0x1f7fa6 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, sun: { value: sunDir }, deep: { value: new THREE.Color(deep) }, shallow: { value: new THREE.Color(shallow) }, sky: { value: new THREE.Color(0x9cc8ee) }, flow: { value: new THREE.Vector2(0, 0) }, opacity: { value: 0.9 } },
    vertexShader: `varying vec3 vP; varying vec2 vUv; void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uT,opacity; uniform vec3 sun,deep,shallow,sky; uniform vec2 flow; varying vec3 vP; varying vec2 vUv;
      float w(vec2 p){ vec2 a=mat2(0.8,0.6,-0.6,0.8)*p; return 0.5*sin(a.x+sin(a.y*0.7))*cos(a.y*1.3+sin(a.x*0.5)) + 0.35*sin(dot(p,vec2(0.31,0.95))*1.7 + cos(p.x*0.4)); }
      void main(){
        vec2 q=vP.xz*0.35+flow*uT;
        float e=0.05;
        float h0=w(q)+0.5*w(q*2.3+vec2(uT*0.7,uT*0.4))+0.25*w(q*5.1-vec2(uT*1.3,-uT));
        float hx=w(q+vec2(e,0.))+0.5*w((q+vec2(e,0.))*2.3+vec2(uT*0.7,uT*0.4))+0.25*w((q+vec2(e,0.))*5.1-vec2(uT*1.3,-uT));
        float hz=w(q+vec2(0.,e))+0.5*w((q+vec2(0.,e))*2.3+vec2(uT*0.7,uT*0.4))+0.25*w((q+vec2(0.,e))*5.1-vec2(uT*1.3,-uT));
        vec3 n=normalize(vec3(-(hx-h0)/e*0.06,1.,-(hz-h0)/e*0.06));
        vec3 V=normalize(cameraPosition-vP);
        float fr=0.04+0.96*pow(1.-max(dot(n,V),0.),5.);
        vec3 base=mix(shallow,deep,0.6);
        vec3 col=mix(base*(0.55+0.45*max(dot(n,sun),0.)),sky,fr*0.8);
        vec3 H=normalize(sun+V); col+=vec3(1.,.95,.85)*pow(max(dot(n,H),0.),220.)*1.4;
        gl_FragColor=vec4(col,opacity);

      }`,
    transparent: true, depthWrite: true,
  });
}

// ===================================================================
//                         LANDSCAPE DIORAMA
// ===================================================================
export async function buildLandscape(renderer) {
  const scene = new THREE.Scene();
  const { sun } = makeSky(scene, renderer, 24, 210);
  scene.fog = new THREE.FogExp2(0xa9c4dc, 0.0011);

  const X0 = -100, X1 = 100, Z0 = -60, Z1 = 60;
  const riverZ = (x) => 12 * Math.sin(x * 0.035 + 0.5) + 6 * Math.sin(x * 0.09 + 1.0);
  const riverBed = (x) => Math.max(-1.5, (x + 28) * 0.17);
  const h = (x, z) => {
    const shore = x + 9 * noise(z * 0.03, 0.5) + 4 * noise(z * 0.08, 2.2);
    const land = smooth(-42, -24, shore);
    let y = lerp(-14 + 3 * fbm(x * 0.02, z * 0.02, 1), 1.2 + 2.5 * fbm(x * 0.03, z * 0.03, 2), land);
    const m = smooth(18, 70, x + 10 * noise(z * 0.04, 4));
    y += m * (6 + 44 * ridged(x * 0.018, z * 0.022, 5)) + 2.5 * land * fbm(x * 0.06, z * 0.06, 6, 3);
    if (x > -40) { // river valley + channel
      const d = Math.abs(z - riverZ(x)); const rb = riverBed(x);
      const valley = rb + 0.9 + Math.pow(d, 1.25) * 0.45;
      const k = smooth(-40, -28, x);
      y = lerp(y, Math.min(y, valley), k * (1 - smooth(10, 34, d)) );
      const w = 2.2 + Math.max(0, (60 - x)) * 0.02;
      if (d < w * 1.6) y = lerp(y, Math.min(y, rb - 1.3 * (1 - Math.pow(Math.min(1, d / (w * 1.6)), 2)) + 0.3), k);
    }
    return y;
  };
  const colorFn = (x, y, z, ny) => {
    const n = fbm(x * 0.09, z * 0.09, 8, 3) * 0.08;
    const slope = 1 - ny;
    let c;
    if (y < -0.4) c = [0.55 + n, 0.5 + n, 0.38 + n];
    else if (y < 1.0 && x < -18) c = [0.74 + n, 0.68 + n, 0.52 + n];
    else { c = [0.24 + n, 0.42 + n, 0.16 + n * .5];
      if (y > 14) c = c.map((v, i) => lerp(v, [0.38, 0.36, 0.3][i] + n, smooth(14, 24, y)));
      if (y > 33) c = c.map((v, i) => lerp(v, [0.92, 0.94, 0.97][i], smooth(33, 38, y + n * 30)));
    }
    if (slope > 0.35 && y > 2) c = c.map((v, i) => lerp(v, [0.42, 0.39, 0.35][i] + n, smooth(0.35, 0.6, slope)));
    return c;
  };
  const block = buildBlock({ hFn: h, X0, X1, Z0, Z1, res: 1.6, bottom: -40, colorFn });
  scene.add(block.group);

  // ocean surface
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 1, 1).rotateX(-Math.PI / 2), waterMaterial(sun)); sea.material.uniforms.opacity.value = 0.97;
  sea.position.set(0, 0, 0); sea.renderOrder = 1; scene.add(sea);

  // river ribbon
  const rp = [], ri = []; const N = 260;
  for (let i = 0; i <= N; i++) {
    const x = lerp(-36, 96, i / N); const zc = riverZ(x); const w = 1.6 + Math.max(0, (60 - x)) * 0.017; const y = riverBed(x) - 0.25 + 0.02;
    rp.push(x, Math.max(y, 0.05), zc - w, x, Math.max(y, 0.05), zc + w);
    if (i < N) { const a = i * 2; ri.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri);
  const riverMat = waterMaterial(sun, { deep: 0x1a5b80, shallow: 0x3a9ac0 }); riverMat.uniforms.flow.value.set(-1.6, 0);
  const river = new THREE.Mesh(rg, riverMat); scene.add(river);

  // lights
  const dl = new THREE.DirectionalLight(0xfff0dc, 4.6); dl.position.copy(sun).multiplyScalar(300); scene.add(dl);
  dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
  Object.assign(dl.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 700 }); dl.shadow.bias = -0.002; dl.shadow.normalBias = 0.8;
  scene.add(new THREE.HemisphereLight(0xbfdcff, 0x4a4030, 1.1));

  // trees
  const { conifer, decid } = treeGeometries();
  const r = rng(3); const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const tc = new THREE.Color();
  const trees = []; // for transpiration sources
  const placeTrees = (geo, count, filt) => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, envMapIntensity: 0.6 });
    const im = new THREE.InstancedMesh(geo, mat, count); let k = 0, guard = 0;
    while (k < count && guard++ < count * 40) {
      const x = lerp(X0 + 2, X1 - 2, r()), z = lerp(Z0 + 2, Z1 - 2, r());
      const y = h(x, z); if (!filt(x, y, z)) continue;
      const dens = fbm(x * 0.03, z * 0.03, 9, 3); if (dens < -0.08) continue;
      const s = (1.6 + r() * 1.3) * (y > 14 ? 0.8 : 1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m4.compose(new THREE.Vector3(x, y - 0.1, z), q, new THREE.Vector3(s, s * (0.9 + r() * 0.3), s));
      im.setMatrixAt(k, m4); tc.setHSL(0.27 + r() * 0.08, 0.35 + r() * 0.2, 0.75 + r() * 0.3); im.setColorAt(k, tc);
      trees.push([x, y + s * 2.4, z]); k++;
    }
    im.count = k; im.castShadow = true; im.receiveShadow = true; scene.add(im);
  };
  const notRiver = (x, z) => Math.abs(z - riverZ(x)) > 4.5;
  placeTrees(conifer, 2600, (x, y, z) => y > 4 && y < 26 && notRiver(x, z));
  placeTrees(decid, 1800, (x, y, z) => y > 1.8 && y < 12 && notRiver(x, z));

  // ---------- clouds ----------
  const ctex = [cloudTexture(1), cloudTexture(2), cloudTexture(3)];
  const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
  const cloudSprites = [];
  const addCloud = (cx, cy, cz, spread, n, big, kind) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: ctex[i % 3], transparent: true, depthWrite: false, fog: true, color: 0xffffff });
      const s = new THREE.Sprite(m);
      const ox = (r() - .5) * spread * 2, oz = (r() - .5) * spread, oy = (r() - .3) * spread * 0.35;
      s.position.set(cx + ox, cy + oy, cz + oz);
      const sc = big * (0.7 + r() * 0.6); s.userData = { base: s.position.clone(), sc, kind, ph: r() * 6.28, dark: oy < 0 };
      s.scale.setScalar(sc); cloudGroup.add(s); cloudSprites.push(s);
    }
  };
  addCloud(52, 44, -4, 22, 34, 22, 'rain');   // condensation cloud over mountains
  addCloud(20, 50, 18, 18, 16, 18, 'mid');
  addCloud(-60, 58, -30, 26, 14, 24, 'bg');
  addCloud(-20, 62, 40, 24, 12, 20, 'bg');

  // sun glow (in sky direction)
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff3d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  sunSpr.position.copy(sun).multiplyScalar(1500); sunSpr.scale.setScalar(260); scene.add(sunSpr);

  // ---------- rain streaks ----------
  const RN = 2400; const rainGeo = new THREE.BufferGeometry(); const rainPos = new Float32Array(RN * 6);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xa9d3ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);
  const rainSeeds = Array.from({ length: RN }, () => { const x = 52 + (r() - .5) * 46, z = -4 + (r() - .5) * 30; return [x, z, r(), h(x, z)]; });

  // ---------- atmosphere layer slab (scene 2) ----------
  const slabMat = new THREE.ShaderMaterial({
    uniforms: { a: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float a; varying vec3 vP; void main(){ float k=1.-smoothstep(0.,80.,vP.y); vec3 c=mix(vec3(0.75,0.88,1.),vec3(0.35,0.6,1.),vP.y/80.);
      gl_FragColor=vec4(c, a*(0.05+0.13*k)); }`, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 80, Z1 - Z0).translate(0, 40, 0), slabMat); slab.renderOrder = 5; scene.add(slab);
  const slabEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(X1 - X0, 80, Z1 - Z0).translate(0, 40, 0)), new THREE.LineBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0 }));
  scene.add(slabEdges);
  const blockEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(X1 - X0, 40, Z1 - Z0).translate(0, -20, 0)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  scene.add(blockEdges);

  // ---------- particles ----------
  const glow = new Glow(26000, { size: 2.4 }); scene.add(glow.points);
  // seeds
  const evap = Array.from({ length: 1400 }, () => ({ x: lerp(-96, -42, r()), z: lerp(-56, 56, r()), s: r(), sp: 0.10 + r() * 0.08, w: r() * 6.28 }));
  const cloudTarget = new THREE.Vector3(48, 42, -4);
  const runoff = Array.from({ length: 900 }, () => ({ s: r(), off: (r() - .5) * 2, sp: 0.06 + r() * 0.03 }));
  const ground = Array.from({ length: 500 }, () => ({ x0: lerp(-10, 80, r()), s: r(), sp: 0.05 + r() * 0.03, d: lerp(-21, -16, r()) }));
  const transp = Array.from({ length: 900 }, () => { const t = trees[Math.floor(r() * trees.length)]; return { t, s: r(), sp: 0.09 + r() * 0.06, w: r() * 6.28 }; })
    .filter(o => o.t[0] > -25 && o.t[0] < 45);
  const bio = Array.from({ length: 1400 }, () => { const x = lerp(-98, 98, r()), z = lerp(-58, 58, r()); return { x, z, y: Math.max(h(x, z), 0) + r() * 6, ph: r() * 6.28 }; });
  const microbes = Array.from({ length: 600 }, () => { const x = lerp(-28, 98, r()); return { x, y: h(x, 60) - 0.2 - r() * 2.8, ph: r() * 6.28 }; });

  // arrows (water cycle)
  const arrows = {
    evap: new FlowArrow([new THREE.Vector3(-70, 2, 20), new THREE.Vector3(-62, 22, 14), new THREE.Vector3(-40, 36, 6), new THREE.Vector3(-8, 42, 0)], 0x8fd4ff, 0.7),
    cond: new FlowArrow([new THREE.Vector3(2, 44, 2), new THREE.Vector3(22, 47, 0), new THREE.Vector3(36, 46, -2)], 0xcfeaff, 0.6),
    rain: new FlowArrow([new THREE.Vector3(64, 34, 10), new THREE.Vector3(66, 24, 12), new THREE.Vector3(67, 16, 13)], 0x7cc0ff, 0.7),
    transp: new FlowArrow([new THREE.Vector3(5, 10, 26), new THREE.Vector3(10, 24, 24), new THREE.Vector3(22, 36, 16)], 0x9cffd4, 0.6),
    runoff: new FlowArrow(Array.from({ length: 12 }, (_, i) => { const x = lerp(78, -40, i / 11); return new THREE.Vector3(x, Math.max(riverBed(x), 0) + 2.5, riverZ(x)); }), 0x6fb8ff, 0.7),
    ground: new FlowArrow([new THREE.Vector3(40, -6, 60.6), new THREE.Vector3(30, -17, 60.6), new THREE.Vector3(0, -19, 60.6), new THREE.Vector3(-30, -17, 60.6), new THREE.Vector3(-45, -10, 60.6)], 0x5fa8ff, 0.7),
  };
  for (const a of Object.values(arrows)) scene.add(a.group);

  const v = new THREE.Vector3();
  function update(t, st) {
    // st: {waterAmt, evapA, condA, rainA, runA, transA, bioA, microA, slabA, arrowsT{key:[reveal,alpha]}, cloudGrow}
    sea.material.uniforms.uT.value = t; riverMat.uniforms.uT.value = t;
    slabMat.uniforms.a.value = st.slabA; slabEdges.material.opacity = st.slabA * 0.5; blockEdges.material.opacity = st.slabA * 0.35;
    slab.visible = slabEdges.visible = st.slabA > 0.001;
    // clouds
    for (const s of cloudSprites) {
      const u = s.userData; let a = 0.95, sc = u.sc;
      if (u.kind === 'rain') { a = 0.25 + 0.75 * st.cloudGrow; sc = u.sc * (0.55 + 0.45 * st.cloudGrow); }
      s.position.copy(u.base); s.position.x += Math.sin(t * 0.1 + u.ph) * 1.5 + t * 0.15;
      s.scale.setScalar(sc);
      const dark = u.kind === 'rain' ? (u.dark ? 0.55 + 0.25 * (1 - st.rainA) : 0.85) : (u.dark ? 0.8 : 1);
      s.material.color.setRGB(dark, dark, dark * 1.03);
      s.material.opacity = a * (u.kind === 'bg' ? 0.8 : 1);
    }
    // rain
    rainMat.opacity = st.rainA * 0.55; rain.visible = st.rainA > 0.01;
    for (let i = 0; i < RN; i++) {
      const [x, z, sd, gh] = rainSeeds[i]; const top = 36, bot = gh; const u = fract(t * 0.9 + sd);
      const y = lerp(top, bot, u); const len = 1.6;
      rainPos.set([x - u * 1.5, y, z, x - u * 1.5 + 0.25, y + len, z], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;

    glow.begin();
    // evaporation: ocean -> clouds
    if (st.evapA > 0) for (const e of evap) {
      const u = fract(t * e.sp + e.s); const a = st.evapA * Math.sin(Math.PI * u) * 0.75;
      const p0x = e.x, p0z = e.z; const k = u * u;
      const x = lerp(p0x, cloudTarget.x - 20 + e.s * 30, k) + Math.sin(u * 8 + e.w) * 1.5;
      const y = 0.5 + u * 40 + Math.sin(u * 5 + e.w) * 0.6; const z = lerp(p0z, cloudTarget.z + (e.s - .5) * 30, k);
      glow.add(x, y, z, 0.55, 0.82, 1.0, a, 0.9 + e.s * 0.6);
    }
    // transpiration: trees -> up
    if (st.transA > 0) for (const o of transp) {
      const u = fract(t * o.sp + o.s); const a = st.transA * Math.sin(Math.PI * u) * 0.8;
      glow.add(o.t[0] + u * 14 + Math.sin(u * 6 + o.w), o.t[1] + u * 30, o.t[2] - u * 8, 0.55, 1.0, 0.85, a, 0.8);
    }
    // runoff along river
    if (st.runA > 0) for (const o of runoff) {
      const u = fract(t * o.sp + o.s); const x = lerp(88, -42, u); const z = riverZ(x) + o.off * (1.2 + Math.max(0, 60 - x) * 0.012);
      const y = Math.max(riverBed(x) - 0.1, 0.25) + 0.25;
      glow.add(x, y, z, 0.35, 0.7, 1.0, st.runA * 0.9 * smooth(0, 0.06, u) * (1 - smooth(0.9, 1, u)), 0.6);
    }
    // groundwater on the front cut
    if (st.runA > 0) for (const o of ground) {
      const u = fract(t * o.sp + o.s);
      let x, y;
      if (u < 0.25) { const k = u / 0.25; x = o.x0; y = lerp(h(o.x0, 60) - 0.5, o.d, k); }
      else { const k = (u - 0.25) / 0.75; x = lerp(o.x0, -60, k); y = o.d + Math.sin(k * 9 + o.s * 6) * 0.4 + smooth(0.75, 1, k) * (o.d * -0.6); }
      glow.add(x, y, 60.5, 0.4, 0.72, 1.0, st.runA * 0.85 * smooth(0, 0.05, u) * (1 - smooth(0.92, 1, u)), 0.5);
    }
    // biosphere shimmer
    if (st.bioA > 0) for (const b of bio) {
      const a = st.bioA * (0.35 + 0.35 * Math.sin(t * 2 + b.ph));
      glow.add(b.x, b.y + Math.sin(t * 0.7 + b.ph) * 0.8, b.z, 0.45, 1.0, 0.55, a, 1.1);
    }
    if (st.microA > 0) for (const m of microbes) {
      glow.add(m.x + Math.sin(t + m.ph) * 0.3, m.y, 60.4, 1.0, 0.8, 0.35, st.microA * (0.5 + 0.5 * Math.sin(t * 3 + m.ph)), 0.35);
    }
    glow.end();

    for (const k in arrows) { const [rv, al] = (st.arrows && st.arrows[k]) || [0, 0]; arrows[k].update(t, rv, al); }
  }

  return { scene, update, h, riverZ, sun };
}
