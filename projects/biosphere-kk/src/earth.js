import * as THREE from 'three';
import { Glow, rng, smooth, clamp, fract } from './util.js';

export async function buildEarth(loader) {
  const load = (f, srgb = true) => new Promise(res => loader.load('assets/' + f, t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t);
  }));
  const [day, night, water, topo, sky, clouds] = await Promise.all([
    load('earth-blue-marble.jpg'), load('earth-night.jpg'), load('earth-water.png', false),
    load('earth-topology.png', false), load('night-sky.png'), load('clouds.png', false)]);

  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(1.0, 0.2, 0.32).normalize();

  const stars = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 32),
    new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, color: 0x8a8a9a }));
  scene.add(stars);
  // extra crisp stars
  const sg = new Glow(2500, { size: 1 }); const r = rng(11); sg.begin();
  for (let i = 0; i < 2500; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 300;
    const b = Math.pow(r(), 6) * 0.9 + 0.08; const warm = r();
    sg.add(R * s * Math.cos(th), R * u, R * s * Math.sin(th), b * (0.85 + warm * .15), b * .92, b * (1.1 - warm * .2), 1, 0.9 + r() * 1.6);
  }
  sg.end(); scene.add(sg.points);

  const tilt = new THREE.Group(); tilt.rotation.z = THREE.MathUtils.degToRad(23.4); scene.add(tilt);
  const spin = new THREE.Group(); tilt.add(spin);

  const earthMat = new THREE.ShaderMaterial({
    uniforms: { day: { value: day }, night: { value: night }, water: { value: water }, topo: { value: topo }, sun: { value: sunDir } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform sampler2D day,night,water,topo; uniform vec3 sun; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      vec3 toLin(vec3 c){return c;}
      void main(){
        vec3 n=normalize(vN); vec3 V=normalize(cameraPosition-vP);
        vec3 T=normalize(cross(vec3(0.,1.,0.),n)+1e-5); vec3 B=cross(n,T);
        float e=1./2048.;
        float du=texture2D(topo,vUv+vec2(e,0.)).r-texture2D(topo,vUv-vec2(e,0.)).r;
        float dv=texture2D(topo,vUv+vec2(0.,e)).r-texture2D(topo,vUv-vec2(0.,e)).r;
        vec3 nb=normalize(n-(T*du+B*dv)*3.0);
        float ndl=dot(nb,sun); float ndl0=dot(n,sun);
        vec3 d=texture2D(day,vUv).rgb; vec3 nt=texture2D(night,vUv).rgb;
        float w=texture2D(water,vUv).r;
        float lit=smoothstep(-0.12,0.35,ndl0);
        vec3 col=d*(0.02+1.15*max(ndl,0.)*lit+0.06*lit);
        col += nt*vec3(1.0,0.75,0.45)*1.3*smoothstep(0.1,-0.25,ndl0);
        vec3 H=normalize(sun+V); float sp=pow(max(dot(n,H),0.),70.)*w*1.1*lit;
        col += vec3(1.,.92,.8)*sp;
        float fr=pow(1.-max(dot(n,V),0.),3.0);
        col = mix(col, vec3(0.32,0.6,1.0), fr*0.65*smoothstep(-0.25,0.4,ndl0));
        gl_FragColor=vec4(col,1.);

      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), earthMat); spin.add(earth);

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: clouds }, sun: { value: sunDir }, alpha: { value: 0.95 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; uniform float alpha; varying vec2 vUv; varying vec3 vN;
      void main(){ float c=texture2D(map,vUv).a; float l=smoothstep(-0.15,0.45,dot(normalize(vN),sun));
        gl_FragColor=vec4(vec3(0.03)+vec3(1.0,0.98,0.96)*l, c*alpha*(0.25+0.75*l)); }`,
    transparent: true, depthWrite: false,
  });
  const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 160, 80), cloudMat); spin.add(cloudMesh);

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sun: { value: sunDir }, boost: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.); vP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 sun; uniform float boost; varying vec3 vN; varying vec3 vP;
      void main(){ vec3 V=normalize(cameraPosition-vP); float f=dot(normalize(vN),V);
        float i=pow(clamp(0.62+f,0.,1.),5.0)*1.6; float l=smoothstep(-0.5,0.6,dot(normalize(vN),sun));
        vec3 c=mix(vec3(0.25,0.5,1.0),vec3(0.55,0.8,1.0),l)*i*(0.15+0.95*l)*boost; gl_FragColor=vec4(c,1.); }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.07, 128, 64), atmoMat); tilt.add(atmo);

  // sun glow far away
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: (await import('./util.js')).glowTexture(), color: 0xfff1d6, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunSprite.position.copy(sunDir.clone().multiplyScalar(200)); sunSprite.scale.setScalar(26); scene.add(sunSprite);

  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

  // ---- interconnection network (scene 5)
  const net = new Glow(9000, { size: 1 });
  spin.add(net.points);
  const nr = rng(5);
  const toV = (lat, lon, rr = 1.0) => { // match three sphere UV mapping
    const phi = (lon + 180) / 360 * Math.PI * 2, th = (90 - lat) / 180 * Math.PI;
    return new THREE.Vector3(-rr * Math.cos(phi) * Math.sin(th), rr * Math.cos(th), rr * Math.sin(phi) * Math.sin(th));
  };
  // nodes: forests (green), oceans (blue), atmosphere (cyan high)
  const nodes = [
    [-3, -60, 'g'], [5, 20, 'g'], [60, 90, 'g'], [55, -100, 'g'], [62, 30, 'g'], [-25, 135, 'g'], [48, 68, 'g'], [35, 105, 'g'], [-15, -50, 'g'], [10, 100, 'g'], [45, 10, 'g'], [52, 80, 'g'],
    [0, -150, 'b'], [-30, -20, 'b'], [20, -40, 'b'], [-20, 70, 'b'], [35, 160, 'b'], [-45, 100, 'b'], [10, 60, 'b'], [40, -60, 'b'], [-50, -100, 'b'], [5, 150, 'b'], [42, 50, 'b'], [-35, 10, 'b']];
  const nodePos = nodes.map(n => ({ v: toV(n[0], n[1], 1.004), c: n[2] }));
  const arcs = [];
  for (let i = 0; i < 70; i++) {
    const a = nodePos[Math.floor(nr() * nodePos.length)];
    let b = nodePos[Math.floor(nr() * nodePos.length)]; if (a === b) continue;
    const ang = a.v.angleTo(b.v); if (ang > 2.0 || ang < 0.25) continue;
    const mid = a.v.clone().add(b.v).normalize().multiplyScalar(1.0 + 0.12 + ang * 0.16);
    arcs.push({ a: a.v, b: b.v, m: mid, c: nr() < 0.5 ? a.c : b.c, start: nr(), speed: 0.15 + nr() * 0.2, len: ang });
  }
  const tmp = new THREE.Vector3();
  function bez(o, a, m, b, u) { const k = 1 - u; return o.set(0, 0, 0).addScaledVector(a, k * k).addScaledVector(m, 2 * k * u).addScaledVector(b, u * u); }

  function updateNet(t, amount, cam) {
    net.begin();
    if (amount > 0.001) {
      const sizeK = 1; // perspective handles scaling
      arcs.forEach((arc, j) => {
        const grow = clamp((amount * 1.6) - arc.start * 0.6);
        if (grow <= 0) return;
        const col = arc.c === 'g' ? [0.35, 1.0, 0.55] : [0.35, 0.7, 1.0];
        const steps = 46;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps; if (u > grow) break;
          bez(tmp, arc.a, arc.m, arc.b, u);
          net.add(tmp.x, tmp.y, tmp.z, col[0], col[1], col[2], 0.3 * amount, 0.016 * sizeK);
        }
        for (let q = 0; q < 3; q++) {
          const u = fract(t * arc.speed + arc.start + q / 3); if (u > grow) continue;
          bez(tmp, arc.a, arc.m, arc.b, u);
          net.add(tmp.x, tmp.y, tmp.z, col[0] * 1.2, col[1] * 1.2, col[2] * 1.2, 1.0 * amount, 0.05);
        }
      });
      nodePos.forEach((n, i) => {
        const col = n.c === 'g' ? [0.4, 1.0, 0.6] : [0.4, 0.75, 1.0];
        const pulse = 0.6 + 0.4 * Math.sin(t * 3 + i);
        net.add(n.v.x, n.v.y, n.v.z, col[0], col[1], col[2], amount * pulse, 0.06);
      });
    }
    net.end();
  }

  return { scene, spin, tilt, earth, cloudMesh, atmo, atmoMat, cloudMat, updateNet, sunDir, toV };
}
