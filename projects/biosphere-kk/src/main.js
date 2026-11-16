import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildEarth } from './earth.js';
import { buildLandscape } from './landscape.js';
import { buildForest } from './forest.js';
import { clamp, lerp, smooth, ease, window_, CamPath } from './util.js';

const W = 1920, H = 1080;
export const T = { s2: 13.0, s3: 26.5, s4: 43.5, s5: 59.0, end: 74.5 };

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 8000);
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(null, camera); composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.55, 0.8); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uT*17.)*43758.5453); }
    void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;
      float l=dot(c,vec3(0.299,0.587,0.114)); c=mix(vec3(l),c,1.08);
      c=c*vec3(1.0,1.0,1.02)+vec3(0.0,0.004,0.012)*(1.-l);
      c+= (h(vUv*1000.)-0.5)*0.018;
      gl_FragColor=vec4(c,1.); }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------- overlays
const $ = (id) => document.getElementById(id);
const svg = $('svg'), labelsDiv = $('labels');
const NS = 'http://www.w3.org/2000/svg';
const labels = [];
function addLabel(text, color, sceneKey, anchor, off, tIn, tOut) {
  const el = document.createElement('div'); el.className = 'label'; el.style.color = color;
  el.innerHTML = `<span>${text}</span><i></i>`; labelsDiv.appendChild(el);
  const line = document.createElementNS(NS, 'line'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2'); svg.appendChild(line);
  const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', '7'); dot.setAttribute('fill', 'none'); dot.setAttribute('stroke', color); dot.setAttribute('stroke-width', '2.5'); svg.appendChild(dot);
  const dot2 = document.createElementNS(NS, 'circle'); dot2.setAttribute('r', '3'); dot2.setAttribute('fill', color); svg.appendChild(dot2);
  labels.push({ el, line, dot, dot2, sceneKey, anchor, off, tIn, tOut });
}

const subs = [
  [1.0, 4.0, 'Жер — тіршіліктің біртұтас мекені.'],
  [4.1, 13.0, 'Оның атмосферасы, гидросферасы, литосферасы және тірі ағзалар әлемі өзара тығыз байланысқан.'],
  [14.0, 18.5, 'Биосфера — тірі ағзалар мекендейтін Жер қабығы.'],
  [18.6, 26.0, 'Мұнда тірі және өлі табиғат арасында үздіксіз зат пен энергия алмасуы жүреді.'],
  [27.3, 33.5, 'Су Күн энергиясының әсерінен буланып, атмосферада конденсацияланады.'],
  [33.6, 43.1, 'Жауын-шашын түрінде Жерге түсіп, өзендер мен жер асты сулары арқылы қайтадан су айдындарына оралады.'],
  [44.2, 51.7, 'Көміртек фотосинтез арқылы өсімдіктерге өтеді, қоректік тізбекпен жануарларға беріледі.'],
  [51.8, 58.6, 'Тыныс алу мен ыдырау нәтижесінде қайтадан қоршаған ортаға оралады.'],
  [60.5, 65.6, 'Табиғаттағы зат айналымы — биосфера тұрақтылығының негізі.'],
  [65.7, 71.4, 'Әрбір тірі ағза осы ғаламдық үдерістің маңызды бөлігі.'],
];
const subEl = $('sub').firstElementChild;

let E, L, F, camL, camF;
const tmpV = new THREE.Vector3();

async function setup() {
  await document.fonts.load('600 30px M', 'ӘҒҚҢӨҰҮІ'); await document.fonts.load('300 30px M', 'Б'); await document.fonts.load('500 30px M', 'ӘҒ'); await document.fonts.load('700 30px M', 'Б');
  const loader = new THREE.TextureLoader();
  E = await buildEarth(loader);
  L = await buildLandscape(renderer);
  F = await buildForest(renderer);
  camL = new CamPath([
    { t: 13.0, p: [-30, 300, 250], l: [0, 0, 0], fov: 42 },
    { t: 16.5, p: [-165, 110, 215], l: [0, 2, 0], fov: 40 },
    { t: 21.5, p: [-40, 95, 245], l: [5, 0, 0], fov: 40 },
    { t: 26.5, p: [45, 92, 235], l: [5, 2, 0], fov: 40 },
    { t: 30.0, p: [-20, 58, 175], l: [-45, 14, 0], fov: 42 },
    { t: 33.5, p: [12, 62, 168], l: [32, 30, -5], fov: 42 },
    { t: 36.5, p: [62, 46, 150], l: [58, 20, 2], fov: 42 },
    { t: 39.5, p: [26, 22, 128], l: [8, 0, 28], fov: 44 },
    { t: 43.5, p: [-35, 68, 225], l: [10, 0, 10], fov: 42 },
  ]);
  camF = new CamPath([
    { t: 43.5, p: [30, 19, 56], l: [2, 6, 8], fov: 45 },
    { t: 47.0, p: [15, 9.5, 33], l: [1, 8.5, 5], fov: 45 },
    { t: 50.5, p: [15.5, 3.0, 21], l: [8.5, 1.3, 12.5], fov: 45 },
    { t: 53.5, p: [2, 2.6, 25], l: [-5, 0.8, 16.5], fov: 45 },
    { t: 56.5, p: [-4, 6.5, 50], l: [-9, -1.6, 28], fov: 45 },
    { t: 59.0, p: [-6, 70, 85], l: [0, 0, 0], fov: 50 },
  ]);

  const lr = L.riverZ;
  addLabel('Атмосфера', '#9fd8ff', 'L', new THREE.Vector3(55, 68, -20), [150, -40], 15.0, 26.2);
  addLabel('Гидросфера', '#5cb8ff', 'L', new THREE.Vector3(-75, 0, 30), [-60, -150], 17.0, 26.2);
  addLabel('Литосфера', '#e2b984', 'L', new THREE.Vector3(30, -26, 60), [160, 60], 19.0, 26.2);
  addLabel('Биосфера', '#86ffa6', 'L', new THREE.Vector3(-8, 9, 18), [-40, -170], 21.0, 26.2);
  addLabel('Булану', '#9ad8ff', 'L', new THREE.Vector3(-62, 18, 14), [-170, -60], 28.6, 43.2);
  addLabel('Конденсация', '#e2f2ff', 'L', new THREE.Vector3(40, 50, -4), [40, -120], 31.6, 43.2);
  addLabel('Жауын-шашын', '#84c6ff', 'L', new THREE.Vector3(66, 24, 12), [210, -10], 34.2, 43.2);
  addLabel('Транспирация', '#a6ffd9', 'L', new THREE.Vector3(9, 20, 24), [-230, -40], 36.4, 43.2);
  addLabel('Судың қайта оралуы', '#6fbcff', 'L', new THREE.Vector3(-10, -18, 60.6), [-80, 120], 38.6, 43.2);
  const hc = F.heroCrowns[0];
  addLabel('Фотосинтез', '#ffb85a', 'F', new THREE.Vector3(hc[0] + 2, hc[1] + 1, hc[2] + 1), [230, -80], 45.6, 58.6);
  addLabel('Қоректік тізбек', '#8dff98', 'F', F.deerMouth.clone().add(new THREE.Vector3(0, 0.3, 0)), [-120, -190], 48.8, 58.6);
  addLabel('Тыныс алу', '#ffbd66', 'F', F.deer1Body.clone().add(new THREE.Vector3(0.3, 3, 0.8)), [190, -60], 51.6, 58.6);
  addLabel('Ыдырау', '#ff9a4d', 'F', F.logPos.clone().add(new THREE.Vector3(0, 2.2, 0.6)), [-190, -70], 53.6, 58.6);
  addLabel('Көміртектің жинақталуы', '#ffcc80', 'F', new THREE.Vector3(-15.2, -1.8, 30.4), [260, 70], 55.6, 58.6);
  window.__ready = true;
}

function updateLabels(t, key) {
  for (const lb of labels) {
    let a = key === lb.sceneKey ? window_(t, lb.tIn, lb.tOut, 0.55) : 0;
    let show = a > 0.002;
    if (show) {
      tmpV.copy(lb.anchor).project(camera);
      if (tmpV.z > 1) show = false;
      const x = (tmpV.x * 0.5 + 0.5) * W, y = (-tmpV.y * 0.5 + 0.5) * H;
      const edge = Math.min(x, W - x, y, H - y); a *= smooth(-40, 80, edge);
      let lx = clamp(x + lb.off[0], 170, W - 170), ly = clamp(y + lb.off[1], 150, H - 250);
      const k = ease(clamp((t - lb.tIn) / 0.7));
      lb.el.style.left = lx + 'px'; lb.el.style.top = ly + 'px'; lb.el.style.opacity = a;
      lb.el.style.transform = `translate(-50%,-50%) scale(${0.92 + 0.08 * k})`;
      const ex = lerp(x, lx, k), ey = lerp(y, ly, k);
      lb.line.setAttribute('x1', x); lb.line.setAttribute('y1', y); lb.line.setAttribute('x2', ex); lb.line.setAttribute('y2', ey);
      for (const d of [lb.dot, lb.dot2]) { d.setAttribute('cx', x); d.setAttribute('cy', y); }
      lb.line.setAttribute('opacity', a * 0.85); lb.dot.setAttribute('opacity', a); lb.dot2.setAttribute('opacity', a);
      lb.dot.setAttribute('r', 7 + 3 * Math.sin(t * 4));
    }
    if (!show) { lb.el.style.opacity = 0; lb.line.setAttribute('opacity', 0); lb.dot.setAttribute('opacity', 0); lb.dot2.setAttribute('opacity', 0); }
  }
}

function updateOverlays(t) {
  const flash = Math.max(smooth(11.9, 13.0, t) * (1 - smooth(13.0, 14.3, t)), smooth(58.1, 59.0, t) * (1 - smooth(59.0, 60.2, t)));
  $('flash').style.opacity = flash * 0.95;
  const fade = Math.max(1 - smooth(0, 1.4, t), smooth(42.8, 43.5, t) * (1 - smooth(43.5, 44.3, t)), smooth(73.4, 74.5, t));
  $('fade').style.opacity = fade;
  const ti = window_(t, 2.4, 11.4, 1.2);
  $('title').style.opacity = ti; $('title').style.transform = `translateY(${(1 - ease(clamp((t - 2.4) / 2))) * 18}px)`;
  $('title').querySelector('.rule').style.width = 520 * ease(clamp((t - 3) / 2)) + 'px';
  const fi = window_(t, 62.8, 75.5, 1.4);
  $('final').style.opacity = fi; $('final').style.transform = `translateY(${(1 - ease(clamp((t - 62.8) / 2))) * 18}px)`;
  $('final').querySelector('.rule').style.width = 620 * ease(clamp((t - 63.4) / 2)) + 'px';
  let cap = '', ca = 0;
  if (t > 26 && t < 43.4) { cap = 'СУ АЙНАЛЫМЫ'; ca = window_(t, 27.0, 42.6, 0.8); }
  if (t > 43.4 && t < 59) { cap = 'КӨМІРТЕК АЙНАЛЫМЫ'; ca = window_(t, 44.3, 58.0, 0.8); }
  if (t > 13 && t < 26.4) { cap = 'ЖЕР ҚАБЫҚТАРЫ'; ca = window_(t, 14.4, 25.8, 0.8); }
  const sc = $('scenecap'); sc.querySelector('span').textContent = cap; sc.style.opacity = ca;
  sc.querySelector('b').style.background = t > 43.4 && t < 59 ? '#ffb347' : t > 13 && t < 26.4 ? '#86ffa6' : '#7fd0ff';
  let s = null, sa = 0;
  for (const [a, b, txt] of subs) if (t >= a - 0.3 && t <= b + 0.3) { s = txt; sa = smooth(a - 0.3, a + 0.05, t) * (1 - smooth(b - 0.05, b + 0.3, t)); }
  if (s && subEl.textContent !== s) subEl.textContent = s;
  subEl.style.opacity = s ? sa : 0;
}

function renderAt(t) {
  let key;
  grade.uniforms.uT.value = t;
  if (t < T.s2 || t >= T.s5) {
    key = 'E'; renderPass.scene = E.scene;
    const lon0 = t < T.s2 ? 15 : 62;
    E.spin.rotation.y = 0;
    const v = E.toV(0, lon0); const base = -Math.atan2(v.x, v.z);
    E.spin.rotation.y = base + (t < T.s2 ? t * 0.022 : (t - T.s5) * 0.02);
    E.cloudMesh.rotation.y = t * 0.004;
    if (t < T.s2) {
      const k = ease(clamp(t / 11.2));
      let dist = lerp(9.5, 3.15, k);
      const dive = smooth(10.9, 13.0, t); dist = lerp(dist, 1.08, dive * dive);
      const dir = new THREE.Vector3(-0.35 + 0.15 * k, 0.12 - 0.05 * k, 1).normalize();
      camera.position.copy(dir.multiplyScalar(dist)); camera.fov = 34 + dive * 10;
      camera.lookAt(new THREE.Vector3(0, lerp(0.42, 0.0, smooth(9, 12.5, t)), 0));
      E.updateNet(t, 0);
    } else {
      const u = t - T.s5;
      const k = ease(clamp(u / 9.5));
      E.tilt.updateMatrixWorld(true);
      const target = E.toV(48, 68).applyMatrix4(E.spin.matrixWorld).normalize();
      const far = new THREE.Vector3(-0.15, 0.25, 1).normalize();
      const dir = target.clone().lerp(far, k).normalize();
      const dist = lerp(1.32, 3.35, k) + u * 0.012;
      camera.position.copy(dir.multiplyScalar(dist)); camera.fov = lerp(48, 34, k);
      camera.lookAt(new THREE.Vector3(0, lerp(0, 0.5, smooth(2.5, 7.5, u)), 0));
      E.updateNet(t, smooth(1.0, 7.0, u));
      E.atmoMat.uniforms.boost.value = 1 + 0.25 * smooth(2, 8, u);
    }
    camera.updateProjectionMatrix();
  } else if (t < T.s4) {
    key = 'L'; renderPass.scene = L.scene; camL.apply(camera, t);
    const W_ = (a, b, d = 0.8) => window_(t, a, b, d);
    const st = {
      slabA: W_(14.8, 27.5, 1.2), bioA: W_(20.8, 27.0, 1.0) * 0.9, microA: W_(18.8, 28.0, 1.0),
      evapA: Math.max(W_(15.5, 26.5, 1.5) * 0.35, smooth(27.6, 29.0, t)),
      transA: Math.max(W_(20.5, 26.5, 1.5) * 0.3, smooth(35.6, 37.0, t)),
      runA: Math.max(W_(16, 26.5, 1.5) * 0.3, smooth(37.6, 39.2, t)),
      cloudGrow: 0.35 + 0.65 * smooth(30.4, 33.8, t), rainA: smooth(33.4, 35.0, t),
      arrows: {
        evap: [smooth(28.2, 30.0, t), smooth(28.2, 28.8, t) * (1 - smooth(42.5, 43.4, t))],
        cond: [smooth(31.2, 32.8, t), smooth(31.2, 31.8, t) * (1 - smooth(42.5, 43.4, t))],
        rain: [smooth(33.9, 35.0, t), smooth(33.9, 34.4, t) * (1 - smooth(42.5, 43.4, t))],
        transp: [smooth(36.0, 37.4, t), smooth(36.0, 36.5, t) * (1 - smooth(42.5, 43.4, t))],
        runoff: [smooth(38.0, 40.2, t), smooth(38.0, 38.6, t) * (1 - smooth(42.5, 43.4, t))],
        ground: [smooth(38.4, 40.6, t), smooth(38.4, 39.0, t) * (1 - smooth(42.5, 43.4, t))],
      },
    };
    L.update(t, st);
  } else {
    key = 'F'; renderPass.scene = F.scene; camF.apply(camera, t);
    const out = 1 - smooth(58.0, 59.0, t);
    const st = {
      airA: smooth(43.6, 45.0, t) * out, photoA: smooth(45.0, 46.4, t) * out, foodA: smooth(48.3, 49.4, t) * out,
      respA: smooth(51.1, 52.2, t) * out, decA: smooth(53.1, 54.2, t) * out, storeA: smooth(55.1, 56.2, t) * out,
      arrows: {
        photo: [smooth(45.2, 46.6, t), smooth(45.2, 45.7, t) * out],
        food: [smooth(48.4, 49.6, t), smooth(48.4, 48.9, t) * out],
        resp: [smooth(51.2, 52.4, t), smooth(51.2, 51.7, t) * out],
        decomp: [smooth(53.2, 54.4, t), smooth(53.2, 53.7, t) * out],
        store: [smooth(55.2, 56.4, t), smooth(55.2, 55.7, t) * out],
      },
    };
    F.update(t, st);
  }
  renderPass.camera = camera;
  if (key === 'E') { renderer.toneMappingExposure = 0.95; bloom.strength = 0.5; bloom.threshold = 0.8; bloom.radius = 0.55; }
  else { renderer.toneMappingExposure = 0.5; bloom.strength = 0.18; bloom.threshold = 1.6; bloom.radius = 0.3; }
  camera.updateMatrixWorld(true);
  updateLabels(t, key);
  updateOverlays(t);
  composer.render();
}

window.renderAt = renderAt;
window.T = T;
setup().catch(e => { window.__error = String(e && e.stack || e); console.error(e); });
