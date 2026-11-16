import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pn = new ImprovedNoise();
export const noise = (x, y, z = 0) => pn.noise(x, y, z); // ~[-1,1]
export function fbm(x, y, z = 0.37, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f, z * f + i * 7.1); f *= 2.03; a *= 0.5; }
  return s;
}
export function ridged(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x * f, y * f, 3.3 + i)); s += a * n * n; f *= 2.1; a *= 0.5; }
  return s;
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const fract = (x) => x - Math.floor(x);
// fade in at a over d, out at b over d
export const window_ = (t, a, b, d = 0.6) => smooth(a, a + d, t) * (1 - smooth(b - d, b, t));

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.75)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); return glowTex;
}

/** Additive glowing particle cloud whose state is written each frame. */
export class Glow {
  constructor(n, { size = 1, depthTest = true } = {}) {
    this.n = n; this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.sz = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.sz, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1080 * 0.5 }, uSize: { value: size }, map: { value: glowTexture() } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale, uSize;
        void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize = clamp(size*uSize*uScale/-mv.z, 0., 90.); }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ float a=texture2D(map,gl_PointCoord).r; gl_FragColor=vec4(vC*a,1.); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest, transparent: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  begin() { this.count = 0; }
  add(x, y, z, r, g, b, a, s) {
    if (this.count >= this.n || a <= 0.002) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r * a; this.col[i * 3 + 1] = g * a; this.col[i * 3 + 2] = b * a; this.sz[i] = s;
  }
  end() {
    this.geo.setDrawRange(0, this.count);
    for (const k of ['position', 'color', 'size']) this.geo.attributes[k].needsUpdate = true;
  }
}

/** Glowing animated flow arrow along a curve. */
export class FlowArrow {
  constructor(points, color, radius = 0.6, { closed = false } = {}) {
    this.curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    const geo = new THREE.TubeGeometry(this.curve, 160, radius, 10, closed);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uReveal: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.);
        vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float uT,uReveal,uAlpha; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float x=vUv.x; if(x>uReveal) discard;
          float edge = 1.-smoothstep(uReveal-0.06,uReveal,x);
          float dash = 0.35+0.65*pow(0.5+0.5*sin((x*14.-uT*2.2)*6.2831),3.);
          float rim = pow(1.-abs(dot(vN,vV)),1.5)*0.7+0.3;
          float tail = smoothstep(0.,0.08,x);
          gl_FragColor=vec4(uColor*(dash*rim+edge*0.8)*uAlpha*tail,1.); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    const head = new THREE.ConeGeometry(radius * 3.2, radius * 8, 16); head.translate(0, radius * 4, 0);
    this.headMat = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.head = new THREE.Mesh(head, this.headMat);
    this.group = new THREE.Group(); this.group.add(this.mesh, this.head);
    this.closed = closed;
  }
  update(t, reveal, alpha) {
    this.mat.uniforms.uT.value = t; this.mat.uniforms.uReveal.value = reveal; this.mat.uniforms.uAlpha.value = alpha;
    this.group.visible = alpha > 0.003 && reveal > 0.001;
    const u = Math.min(0.999, Math.max(0.001, reveal));
    const p = this.curve.getPointAt(u), tg = this.curve.getTangentAt(u);
    this.head.position.copy(p);
    this.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg);
    this.headMat.opacity = alpha * (this.closed ? 0 : 1);
  }
}

export function cloudTexture(seed = 1) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const img = g.createImageData(S, S); const r = rng(seed);
  const ox = r() * 100, oy = r() * 100;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S - .5, v = y / S - .5; const d = Math.sqrt(u * u + v * v) * 2;
    const n = fbm(u * 4 + ox, v * 4 + oy, seed, 5) * 0.9 + 0.5;
    const a = clamp((n - 0.15) * 1.6) * clamp(1 - Math.pow(d, 2.2));
    const shade = 0.78 + 0.22 * clamp(0.6 - v * 1.4); // lighter top
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = 255 * shade; img.data[i + 2] = 255 * Math.min(1, shade * 1.03); img.data[i + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Piecewise camera path: keys [{t, p:[x,y,z], l:[x,y,z], fov?}] with smooth Catmull interpolation over time */
export class CamPath {
  constructor(keys) {
    this.keys = keys;
    this.pc = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k.p)), false, 'centripetal');
    this.lc = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k.l)), false, 'centripetal');
  }
  apply(cam, t) {
    const k = this.keys; const n = k.length;
    let i = 0; while (i < n - 2 && t > k[i + 1].t) i++;
    const s = clamp((t - k[i].t) / (k[i + 1].t - k[i].t));
    const se = s * s * (3 - 2 * s) * 0.5 + s * 0.5; // gentle ease, continuous velocity-ish
    const u = (i + se) / (n - 1);
    cam.position.copy(this.pc.getPoint(u));
    cam.lookAt(this.lc.getPoint(u));
    const f0 = k[i].fov || 45, f1 = k[i + 1].fov || 45;
    cam.fov = lerp(f0, f1, se); cam.updateProjectionMatrix();
  }
}
