/* ══════════════════════════════════════════════════════════════════════
   HOLLOW ÆTHER — runtime
   ────────────────────────────────────────────────────────────────────
   Sections inside this file:
     1. Global state & utilities (noise, rnd)
     2. Custom cursor
     3. Scroll system (GSAP snap)
     4. Chrome updates (counter, status, accent)
     5. Progress spine builder
     6-10. Panel classes  (Threshold · Bloom · Hollow · Corrupt
                          Fracture · Shard · Veil · Echo · Shadow)
     11. Wiring & lifecycle
     12. Main loop
   Depends on: gsap (global), THREE (global) — loaded via CDN in HTML.
   ══════════════════════════════════════════════════════════════════════ */

(function(){
'use strict';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rnd = (a=1,b) => b===undefined ? Math.random()*a : a + Math.random()*(b-a);
const TAU = Math.PI * 2;
function vh(){ return window.visualViewport ? window.visualViewport.height : innerHeight; }

/* ── Lightweight 2D simplex-ish noise (Stefan Gustavson derivative) ──── */
const Noise = (function(){
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for(let i=0;i<256;i++) perm[i]=i;
  for(let i=255;i>0;i--){
    const j = (Math.random()*(i+1))|0;
    const t = perm[i]; perm[i]=perm[j]; perm[j]=t;
  }
  for(let i=0;i<512;i++) p[i]=perm[i&255];
  const grad3 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  function n2(x,y){
    const F2 = 0.3660254037844386, G2 = 0.21132486540518713;
    const s = (x+y)*F2;
    const i = Math.floor(x+s), j = Math.floor(y+s);
    const t = (i+j)*G2;
    const X0 = i-t, Y0 = j-t;
    const x0 = x-X0, y0 = y-Y0;
    let i1,j1;
    if(x0>y0){i1=1;j1=0}else{i1=0;j1=1}
    const x1=x0-i1+G2, y1=y0-j1+G2;
    const x2=x0-1+2*G2, y2=y0-1+2*G2;
    const ii=i&255, jj=j&255;
    const g0 = grad3[p[ii+p[jj]]&7];
    const g1 = grad3[p[ii+i1+p[jj+j1]]&7];
    const g2 = grad3[p[ii+1+p[jj+1]]&7];
    let n0=0,n1=0,n2=0;
    let t0 = 0.5-x0*x0-y0*y0;
    if(t0>=0){t0*=t0;n0=t0*t0*(g0[0]*x0+g0[1]*y0)}
    let t1 = 0.5-x1*x1-y1*y1;
    if(t1>=0){t1*=t1;n1=t1*t1*(g1[0]*x1+g1[1]*y1)}
    let t2 = 0.5-x2*x2-y2*y2;
    if(t2>=0){t2*=t2;n2=t2*t2*(g2[0]*x2+g2[1]*y2)}
    return 70*(n0+n1+n2);
  }
  return { n2 };
})();

/* ══════════════════════════════════════════════════════════════════════
   1 · GLOBAL STATE
   ══════════════════════════════════════════════════════════════════════ */
const State = {
  panels: $$('.panel'),
  current: 0,
  target: 0,
  isAnimating: false,
  mouseX: 0.5,
  mouseY: 0.5,
  rawMX: 0,
  rawMY: 0,
  time: 0,
  panelChangeTime: 0
};

/* ══════════════════════════════════════════════════════════════════════
   2 · CUSTOM CURSOR
   ══════════════════════════════════════════════════════════════════════ */
const cur = $('#cur'), dot = $('#dot');
let cx = -100, cy = -100;

addEventListener('mousemove', e => {
  State.rawMX = e.clientX;
  State.rawMY = e.clientY;
  State.mouseX = e.clientX / innerWidth;
  State.mouseY = e.clientY / innerHeight;
  dot.style.left = e.clientX + 'px';
  dot.style.top  = e.clientY + 'px';
});

addEventListener('click', e => {
  const r = document.createElement('div');
  r.className = 'rip';
  r.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:22px;height:22px`;
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 1300);
});

(function cursorLoop(){
  cx += (State.rawMX - cx) * 0.11;
  cy += (State.rawMY - cy) * 0.11;
  cur.style.left = cx + 'px';
  cur.style.top  = cy + 'px';
  requestAnimationFrame(cursorLoop);
})();

/* ══════════════════════════════════════════════════════════════════════
   3 · SCROLL SYSTEM (GSAP-tweened snap)
   ══════════════════════════════════════════════════════════════════════ */
const scroller = $('#scroller');
const N_PANELS = State.panels.length;

function goTo(i){
  i = Math.max(0, Math.min(N_PANELS - 1, i));
  if(i === State.current || State.isAnimating) return;

  const prev = State.current;
  State.current = i;
  State.target = i;
  State.isAnimating = true;
  State.panelChangeTime = State.time;

  cur.classList.add('scrolling');

  /* scale duration by distance — big jumps feel weightier */
  const dist = Math.abs(i - prev);
  const dur = Math.min(1.15 + (dist - 1) * 0.22, 2.0);

  gsap.to(scroller, {
     y: -i * vh(),
    duration: dur,
    ease: 'expo.inOut',
    onComplete: () => {
      State.isAnimating = false;
      cur.classList.remove('scrolling');
    }
  });

  updateChrome(i);
  onPanelChange(prev, i);
}

/* wheel — one panel per gesture with lock */
let wheelLock = false;
addEventListener('wheel', e => {
  e.preventDefault();
  if(wheelLock || State.isAnimating) return;
  if(Math.abs(e.deltaY) < 4) return;  // ignore micro-events
  wheelLock = true;
  setTimeout(() => wheelLock = false, 950);
  goTo(State.current + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });

/* keyboard */
addEventListener('keydown', e => {
  switch(e.key){
    case 'ArrowDown': case 'PageDown': case ' ':
      e.preventDefault(); goTo(State.current + 1); break;
    case 'ArrowUp': case 'PageUp':
      e.preventDefault(); goTo(State.current - 1); break;
    case 'Home': goTo(0); break;
    case 'End':  goTo(N_PANELS - 1); break;
  }
});

/* touch */
let tStartY = 0, tStartT = 0;
addEventListener('touchstart', e => {
  tStartY = e.touches[0].clientY;
  tStartT = performance.now();
}, { passive: true });
addEventListener('touchend', e => {
  const dy = tStartY - e.changedTouches[0].clientY;
  const dt = performance.now() - tStartT;
  if(Math.abs(dy) > 60 && dt < 800){
    goTo(State.current + (dy > 0 ? 1 : -1));
  }
});

/* resize — keep current panel aligned */
addEventListener('resize', () => {
  gsap.set(scroller, { y: -State.current * vh() });
  panels.forEach(p => p.resize && p.resize());
});

/* ══════════════════════════════════════════════════════════════════════
   4 · CHROME UPDATES (counter, title, status, tint, spine)
   ══════════════════════════════════════════════════════════════════════ */
const secIdx = $('#sec-idx'), secTitle = $('#sec-title'), statusEl = $('#status');
const tint = $('#tint'), hint = $('#hint');

function updateChrome(i){
  const p = State.panels[i];
  const title = p.dataset.title;
  const status = p.dataset.status;
  const num = String(i+1).padStart(2,'0');

  /* animate counter swap */
  gsap.to(secIdx, { opacity: 0, y: -8, duration: 0.25, ease: 'power2.in', onComplete: () => {
    secIdx.textContent = `${num} / ${String(N_PANELS).padStart(2,'0')}`;
    gsap.fromTo(secIdx, {opacity:0,y:8}, {opacity:1,y:0,duration:0.45,ease:'power2.out'});
  }});
  gsap.to(secTitle, { opacity: 0, y: -8, duration: 0.25, ease: 'power2.in', onComplete: () => {
    secTitle.textContent = title;
    gsap.fromTo(secTitle, {opacity:0,y:8}, {opacity:1,y:0,duration:0.5,ease:'power2.out'});
  }});
  gsap.to(statusEl, { opacity: 0, duration: 0.3, onComplete: () => {
    statusEl.innerHTML = status;
    gsap.to(statusEl, { opacity: 1, duration: 0.6 });
  }});

  /* pull accent from panel's computed styles */
  const cs = getComputedStyle(p);
  const accent = cs.getPropertyValue('--accent').trim();
  const rgb = cs.getPropertyValue('--accent-rgb').trim();
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-rgb', rgb);

  /* update spine */
  $$('.spine-node').forEach((n, k) => n.classList.toggle('active', k === i));

  /* scroll hint only on panel 0 */
  hint.classList.toggle('on', i === 0);

  /* contextual contact link: hide when ON Contact (panel 4); point up when
     below it (panels after 4), down when above it */
  const cLink = $('#skip-contact');
  if(cLink){
    const CONTACT = 4;
    if(i === CONTACT){
      cLink.classList.add('is-hidden');
    } else {
      cLink.classList.remove('is-hidden');
      cLink.innerHTML = (i > CONTACT) ? 'Contact &uarr;' : 'Contact &darr;';
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   5 · BUILD PROGRESS SPINE
   ══════════════════════════════════════════════════════════════════════ */
(function buildSpine(){
  const spine = $('#spine');
  State.panels.forEach((p, i) => {
    const n = document.createElement('div');
    n.className = 'spine-node';
    n.dataset.i = i;
    n.innerHTML = `<span class="spine-label">${String(i+1).padStart(2,'0')} · ${p.dataset.title}</span>`;
    n.addEventListener('click', () => goTo(i));
    spine.appendChild(n);
  });
})();

/* ══════════════════════════════════════════════════════════════════════
   6 · PANEL 1 — THRESHOLD (portal + drifters)
   ══════════════════════════════════════════════════════════════════════ */
/* ── HERO CONFIG — tune the cube field here ─────────────────────────── */
const HERO_CONFIG = {
  /* SIZE — CUBE_SIZE is world units. Cubes further from camera LOOK
     smaller (perspective); every cube is geometrically identical.
     Shrink DEPTH_SPREAD to make them more uniform on screen. */
  CUBE_SIZE:      0.9,
  BEVEL:          0.14,
  COUNT:          120,

  /* COLOUR — dark body + low core + high ambient reads best.
     METALNESS high in a dark scene = black. */
  BODY_COLOR:     0x3a2438,
  METALNESS:      0.75,
  ROUGHNESS:      0.3,
  CLEARCOAT:      1.0,
  EXPOSURE:       0.5,

  /* CORE LIGHT */
  CORE_INTENSITY: 1,
  CORE_DISTANCE:  55,
  CORE_COLOR:     0xffffff,
  AMBIENT:        0x0a0a10,
  AMBIENT_LEVEL:  4.0,

  /* FIELD LAYOUT */
  RING_INNER:     3.5,
  RING_OUTER:     18.5,
  VERTICAL_SPREAD:18,
  DEPTH_SPREAD:   25,
  DEPTH_START:    -14,

  /* ── CORE EXCLUSION — keep-out so nothing covers the light ────────
     This is a CYLINDER along the camera's view axis, not a sphere.
     A sphere lets cubes float in FRONT of the light (far away in 3D,
     but dead-centre on screen). The cylinder blocks that column. */
  CORE_KEEPOUT:   5.5,   // radius of the clear column. Raise = bigger gap.
  CORE_PUSH:      0.16,  // how firmly they're shoved out (0.05 soft → 0.3 firm)

  /* MOTION */
  HOVER_AMP_MIN:  0.5,
  HOVER_AMP_MAX:  1.4,
  HOVER_SPD_MIN:  0.2,
  HOVER_SPD_MAX:  0.55,
  REPEL_RADIUS:   26,
  REPEL_FORCE:    0.55
};

class PThreshold {
  constructor(el){
    this.el = el;
    this.canvas = el.querySelector('canvas.portal');
    this.nameA = el.querySelector('.hero-name-a');
    this.nameB = el.querySelector('.hero-name-b');
    this.eyebrow = el.querySelector('.eyebrow');
    this.sub = el.querySelector('.sub');
    this.hud = el.querySelectorAll('.hero-hud');
    this.active = false;
    this.revealed = false;
    this.cwx = 0; this.cwy = 0;
    this.tt = 0;
    this.init();
    this.onMove = this.onMove.bind(this);
    addEventListener('mousemove', this.onMove);
  }

  init(){
    const C = HERO_CONFIG;
    const r = this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true
    });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = C.EXPOSURE;
    r.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020203, 0.03);
    this.cam = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.1, 100);
    this.cam.position.z = 18;

    this.ambient = new THREE.AmbientLight(C.AMBIENT, C.AMBIENT_LEVEL);
    this.scene.add(this.ambient);

    /* the core light — creates the bright bevel rims */
    this.core = new THREE.PointLight(C.CORE_COLOR, C.CORE_INTENSITY, C.CORE_DISTANCE, 1.6);
    this.core.position.set(0, 0, 2);
    this.scene.add(this.core);

    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.orb.position.copy(this.core.position);
    this.scene.add(this.orb);
    this.halos = [ this.makeHalo(9, 0.55), this.makeHalo(20, 0.24), this.makeHalo(38, 0.10) ];

    const rim = new THREE.DirectionalLight(0x8090b0, 0.35);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);

    const geo = this.roundedBox(C.CUBE_SIZE, C.CUBE_SIZE * C.BEVEL, 10);
    const mat = new THREE.MeshPhysicalMaterial({
      color: C.BODY_COLOR, metalness: C.METALNESS, roughness: C.ROUGHNESS,
      clearcoat: C.CLEARCOAT, clearcoatRoughness: 0.1
    });

    this.inst = new THREE.InstancedMesh(geo, mat, C.COUNT);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.inst);
    this.dummy = new THREE.Object3D();

    this.data = [];
    for(let i = 0; i < C.COUNT; i++){
      const a = Math.random() * TAU;
      /* seed OUTSIDE the clear column. RING_INNER is an X/Y radius here,
         matching the cylinder keep-out, so nothing spawns over the light. */
      const rad = C.RING_INNER + Math.random() * (C.RING_OUTER - C.RING_INNER);
      this.data.push({
        hx: Math.cos(a) * rad,
        hy: Math.sin(a) * rad * (C.VERTICAL_SPREAD / C.RING_OUTER),
        hz: C.DEPTH_START + Math.random() * C.DEPTH_SPREAD,
        rx: rnd(6), ry: rnd(6), rz: rnd(6),
        drx: rnd(-0.003, 0.003), dry: rnd(-0.003, 0.003), drz: rnd(-0.002, 0.002),
        nseed: rnd(100),
        amp: rnd(C.HOVER_AMP_MIN, C.HOVER_AMP_MAX),
        spd: rnd(C.HOVER_SPD_MIN, C.HOVER_SPD_MAX),
        ox: 0, oy: 0
      });
    }
  }

  makeHalo(size, alpha){
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128,128,0,128,128,128);
    gr.addColorStop(0,    'rgba(255,255,255,' + alpha + ')');
    gr.addColorStop(0.22, 'rgba(220,228,255,' + (alpha*0.4) + ')');
    gr.addColorStop(1,    'rgba(180,200,255,0)');
    g.fillStyle = gr; g.fillRect(0,0,256,256);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.scale.set(size, size, 1);
    s.position.copy(this.core.position);
    s.userData.base = size;
    this.scene.add(s);
    return s;
  }

  /* rounded box with smooth normals — no faceting */
  roundedBox(size, radius, seg){
    const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
    const pos = g.attributes.position;
    const half = size/2, r = radius, inner = half - r;
    const v = new THREE.Vector3();
    for(let i = 0; i < pos.count; i++){
      v.fromBufferAttribute(pos, i);
      const cx = Math.max(-inner, Math.min(inner, v.x));
      const cy = Math.max(-inner, Math.min(inner, v.y));
      const cz = Math.max(-inner, Math.min(inner, v.z));
      const dx = v.x-cx, dy = v.y-cy, dz = v.z-cz;
      const len = Math.hypot(dx,dy,dz) || 1;
      v.set(cx + dx/len*r, cy + dy/len*r, cz + dz/len*r);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  hnoise(x){
    return Math.sin(x)*0.5 + Math.sin(x*2.3+1.7)*0.3 + Math.sin(x*0.7+4.2)*0.2;
  }

  toWorld(px, py){
    const nx = (px/innerWidth)*2 - 1, ny = -(py/innerHeight)*2 + 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.cam);
    const dir = v.sub(this.cam.position).normalize();
    const dist = -this.cam.position.z / dir.z;
    return this.cam.position.clone().add(dir.multiplyScalar(dist));
  }

  onMove(e){
    if(!this.active) return;
    const p = this.toWorld(e.clientX, e.clientY);
    this.cwx = p.x; this.cwy = p.y;
  }

  resize(){
    this.renderer.setSize(innerWidth, innerHeight);
    this.cam.aspect = innerWidth / innerHeight;
    this.cam.updateProjectionMatrix();
  }

  activate(){
    this.active = true;
    if(!this.revealed){ this.reveal(); this.revealed = true; }
  }
  deactivate(){ this.active = false; }

  reveal(){
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo(this.hud, { opacity: 0 }, { opacity: 1, duration: 1, stagger: 0.1 }, 0.2)
      .fromTo(this.nameA, { opacity: 0, y: 24, filter: 'blur(14px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3 }, 0.4)
      .fromTo(this.eyebrow, { opacity: 0 }, { opacity: 1, duration: 1 }, 0.8)
      .fromTo(this.nameB, { opacity: 0, y: 24, filter: 'blur(14px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.3 }, 0.7)
      .fromTo(this.sub, { opacity: 0 }, { opacity: 1, duration: 1.2 }, 1.2);
  }

  tick(t){
    if(!this.active) return;
    const C = HERO_CONFIG;
    this.tt += 0.016;
    const tt = this.tt;

    const pulse = 1 + Math.sin(tt*1.6)*0.06;
    this.orb.scale.setScalar(pulse);
    this.halos.forEach(h => {
      const b = h.userData.base;
      h.scale.set(b*pulse, b*pulse, 1);
    });

    for(let i = 0; i < C.COUNT; i++){
      const d = this.data[i];
      const hx = this.hnoise(tt*d.spd + d.nseed) * d.amp;
      const hy = this.hnoise(tt*d.spd*0.85 + d.nseed*1.7) * d.amp;
      const hz = this.hnoise(tt*d.spd*0.6 + d.nseed*2.3) * d.amp * 0.6;

      d.rx += d.drx; d.ry += d.dry; d.rz += d.drz;

      let px = d.hx + hx, py = d.hy + hy, pz = d.hz + hz;

      /* CORE KEEP-OUT — a CYLINDER along the camera's view axis.
         We only test X/Y distance from the light and ignore Z, because a
         cube can be metres away in depth yet still sit dead-centre over
         the glow on screen. Scale the radius with depth so the clear
         column matches what the camera actually sees (perspective). */
      const kx = px - this.core.position.x;
      const ky = py - this.core.position.y;
      const kdist = Math.sqrt(kx*kx + ky*ky) || 0.0001;
      /* cubes nearer the camera need a WIDER berth to clear the same
         on-screen area; those behind the light need less */
      const depthScale = Math.max(0.35, (this.cam.position.z - pz) / this.cam.position.z);
      const keepR = C.CORE_KEEPOUT * depthScale;
      if(kdist < keepR){
        const need = keepR - kdist;
        const nx = kx/kdist, ny = ky/kdist;
        /* push the HOME point out too so it settles clear instead of
           fighting the barrier every frame */
        d.hx += nx * need * C.CORE_PUSH;
        d.hy += ny * need * C.CORE_PUSH;
        px = this.core.position.x + nx * keepR;
        py = this.core.position.y + ny * keepR;
      }

      const dx = px - this.cwx, dy = py - this.cwy;
      const dd = dx*dx + dy*dy;
      if(dd < C.REPEL_RADIUS){
        const f = (1 - dd/C.REPEL_RADIUS) * C.REPEL_FORCE;
        d.ox += (dx*f - d.ox) * 0.09;
        d.oy += (dy*f - d.oy) * 0.09;
      } else {
        d.ox += (0 - d.ox) * 0.045;
        d.oy += (0 - d.oy) * 0.045;
      }

      this.dummy.position.set(px + d.ox*0.5, py + d.oy*0.5, pz);
      this.dummy.rotation.set(d.rx, d.ry, d.rz);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(i, this.dummy.matrix);
    }
    this.inst.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.cam);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   7 · PANEL 3 — WORK (flow-field + selectable project gallery)
   ══════════════════════════════════════════════════════════════════════ */
/* ── PROJECT DATA ──────────────────────────────────────────────────────
   `video`: path to each project's screen-recording. Drop your files in a
   /videos folder next to index.html and rename to match, OR change these
   paths. Use .mp4 (H.264) or .webm. Muted + looping in the preview.
   `poster`: optional still shown before the video texture is ready.
   `url`: live project link — clicking the stage opens it in a new tab.
   Missing/broken video → the stage shows a gradient fallback, nothing breaks.
   ────────────────────────────────────────────────────────────────────── */
const WORK_DATA = [
  { name: 'Daud Khan',                 idx: '01 / 06', url: '#',
    video: 'videos/daud-khan.mp4',    grad: ['#1a1a1a','#E8FF00'],
    desc: 'Scroll-animated video editor portfolio — timeline services section, horizontal video carousel, and integrated booking calendar.' },
  { name: 'Nayab Khattak',            idx: '02 / 06', url: '#',
    video: 'videos/nayab-khattak.mp4', grad: ['#1a1410','#B8935A'],
    desc: 'Chemistry tutor portfolio with a periodic-table class grid, molecule SVG hero, scroll animations, and enrollment form.' },
  { name: 'Éthéreal',                 idx: '03 / 06', url: '#',
    video: 'videos/éthéreal.mp4',  grad: ['#FAF7F2','#C9937A'],
    desc: 'Haute parfumerie storefront — CSS-crafted bottle, collection grid, tiered pricing, and an ivory-rose editorial palette.' },
  { name: 'Jakwan International',      idx: '04 / 06', url: '#',
    video: 'videos/jakwan.mp4',    grad: ['#1a2b4a','#4a7bc8'],
    desc: 'Corporate presence built on a GSAP + Lenis + Three.js stack — smooth-scrolled, animation-first, calm under motion.' },
  { name: 'The Forgotten Manuscript', idx: '05 / 06', url: '#',
    video: 'videos/forgotten-manuscript.mp4', grad: ['#2a2416','#c8b060'],
    desc: 'Narrative scroll experience — procedural SVG cartography and slow, deliberate reveal pacing.' },
  { name: 'Elysian Pour',             idx: '06 / 06', url: '#',
    video: 'videos/elysian-pour.mp4', grad: ['#1a0a2a','#9b6ac8'],
    desc: 'Cinematic Three.js storefront with a product slideshow and ScrollTrigger-choreographed camera work.' }
];

class PWork {
  constructor(el){
    this.el = el;
    this.c = el.querySelector('canvas');
    this.ctx = this.c.getContext('2d');
    this.side = el.querySelector('.side-title');
    this.content = el.querySelector('.work-layout');
    this.items = [...el.querySelectorAll('.work-item')];
    this.stage = el.querySelector('#work-stage');
    this.pixiMount = el.querySelector('#work-pixi');
    this.detail = {
      idx:  el.querySelector('#wd-idx'),
      name: el.querySelector('#wd-name'),
      desc: el.querySelector('#wd-desc'),
      cta:  el.querySelector('#wd-cta')
    };
    this.selected = 0;
    this.active = false;
    this.revealed = false;
    this.agents = [];
    this.pulses = [];
    this.pixiReady = false;
    this.resize();
    this.initAgents();
    this.wireItems();
    this.initPixi();
  }
  /* ── Native video stage (replaces PixiJS) ────────────────────────── */
  initPixi(){
    this.videos = [...this.pixiMount.querySelectorAll('.work-vid')];
    this.shownIdx = 0;
    this.pixiReady = true;
    WORK_DATA.forEach((d, i) => {
      if(this.videos[i]){
        this.videos[i].style.background = `linear-gradient(135deg, ${d.grad[0]}, ${d.grad[1]})`;
        this.videos[i].addEventListener('error', () => {
          this.videos[i].removeAttribute('src');
          this.videos[i].style.background = `linear-gradient(135deg, ${d.grad[0]}, ${d.grad[1]})`;
        });
      }
    });
  }
  playVideo(i){
    const v = this.videos[i];
    if(!v || !v.src) return;
    try{ v.currentTime = 0; }catch(e){}
    const p = v.play();
    if(p && p.catch) p.catch(() => {
      if(PWork._unlockBound) return;
      PWork._unlockBound = true;
      const unlock = () => {
        const cur = this.videos[this.selected];
        if(cur && cur.src){ cur.play().catch(()=>{}); }
      };
      addEventListener('pointerdown', unlock, { once:true });
      addEventListener('wheel',       unlock, { once:true });
      addEventListener('keydown',     unlock, { once:true });
    });
  }
  pauseVideo(i){
    const v = this.videos[i];
    if(v){ try{ v.pause(); }catch(e){} }
  }
  switchVideo(to){
    if(to === this.shownIdx) return;
    const prev = this.shownIdx;
    this.videos.forEach((v, i) => v.classList.toggle('is-active', i === to));
    this.pauseVideo(prev);
    this.playVideo(to);
    this.shownIdx = to;
  }
  pixiFallback(){}
  wireItems(){
    this.items.forEach(item => {
      const i = +item.dataset.idx;
      item.addEventListener('mouseenter', () => this.select(i, item));
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if(url && url !== '#') window.open(url, '_blank');
      });
    });
    this.detail.cta.addEventListener('click', () => {
      const url = WORK_DATA[this.selected].url;
      if(url && url !== '#') window.open(url, '_blank');
    });
    /* clicking the video stage opens the live project */
    if(this.stage){
      this.stage.addEventListener('click', e => {
        if(e.target.closest('.work-detail-cta')) return; // handled above
        const url = WORK_DATA[this.selected].url;
        if(url && url !== '#') window.open(url, '_blank');
      });
    }
  }
  select(i, item){
    if(i === this.selected) return;
    this.selected = i;
    this.items.forEach(el => el.classList.toggle('is-active', +el.dataset.idx === i));
    const d = WORK_DATA[i];

    /* native video crossfade */
    this.switchVideo(i);

    /* caption swap */
    gsap.to([this.detail.idx, this.detail.name, this.detail.desc], {
      opacity: 0, y: -6, duration: 0.18, ease: 'power2.in',
      onComplete: () => {
        this.detail.idx.textContent  = d.idx;
        this.detail.name.textContent = d.name;
        this.detail.desc.textContent = d.desc;
        gsap.fromTo([this.detail.idx, this.detail.name, this.detail.desc],
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out' });
      }
    });

    /* pulse the flow-field from the hovered row */
    if(item){
      const r = item.getBoundingClientRect();
      this.pulse(r.left + 20, r.top + r.height/2);
    }
  }
  resizePixi(){}
  resize(){
    const d = devicePixelRatio || 1;
    this.w = this.c.width = innerWidth * d;
    this.h = this.c.height = innerHeight * d;
    this.c.style.width = innerWidth + 'px';
    this.c.style.height = innerHeight + 'px';
    this.ctx.scale(d, d);
    this.ctx.fillStyle = '#0a0a0e';
    this.ctx.fillRect(0,0,innerWidth,innerHeight);
    /* keep the Pixi stage matched to the real card box */
    this.resizePixi();
  }
  initAgents(){
    this.agents = [];
    const W = innerWidth, H = innerHeight;
    for(let i=0;i<820;i++){
      this.agents.push({
        x: rnd(W), y: rnd(H),
        px: 0, py: 0,
        life: rnd(50, 260),
        age: 0,
        hue: rnd(38, 58)  // gold band
      });
      this.agents[i].px = this.agents[i].x;
      this.agents[i].py = this.agents[i].y;
    }
  }
  activate(){
    this.active = true;
    if(!this.revealed){ this.reveal(); this.revealed = true; }
    /* clear background on activation for a fresh bloom */
    this.ctx.fillStyle = 'rgba(10,10,14,1)';
    this.ctx.fillRect(0,0,innerWidth,innerHeight);
    /* resume the current project's video */
    this.playVideo(this.selected);
  }
  deactivate(){
    this.active = false;
    this._firstFramePainted = false;
    /* pause every video when panel is off-screen */
    if(this.videos){
      this.videos.forEach(v => { try{ v.pause(); }catch(e){} });
    }
  }
  reveal(){
    const tl = gsap.timeline();
    tl.fromTo(this.side, { y: 100, opacity: 0, filter: 'blur(20px)' },
      { y: 0, opacity: 1, filter: 'blur(0)', duration: 1.4, ease: 'power3.out' })
    .fromTo(this.items, { x: -30, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.7, stagger: 0.09, ease: 'power3.out' }, 0.2)
    .fromTo(this.stage, { x: 30, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, 0.4);
  }
  pulse(x, y){
    this.pulses.push({ x, y, r: 0, life: 1 });
  }
  tick(t){
    if(!this.active) return;

    /* ensure the active video is playing when panel is visible */
    if(!this._firstFramePainted && this.videos){
      const v = this.videos[this.selected];
      if(v && v.src && v.paused){
        const p = v.play(); if(p && p.catch) p.catch(()=>{});
      }
      if(v && v.readyState >= 2) this._firstFramePainted = true;
    }

    const ctx = this.ctx;
    const W = innerWidth, H = innerHeight;

    /* trail fade */
    ctx.fillStyle = 'rgba(10,10,14,0.046)';
    ctx.fillRect(0, 0, W, H);

    /* mouse field influence */
    const cursorActive = State.rawMX > 0;

    for(const a of this.agents){
      const scale = 0.0022;
      let n = Noise.n2(a.x*scale, a.y*scale + t*0.12);
      n = n * TAU * 2;

      /* cursor adds directional push */
      let dx = Math.cos(n), dy = Math.sin(n);
      if(cursorActive){
        const mdx = State.rawMX - a.x, mdy = State.rawMY - a.y;
        const md = Math.hypot(mdx, mdy);
        if(md < 240){
          const f = (240 - md) / 240 * 0.6;
          dx += mdx/md * f;
          dy += mdy/md * f;
        }
      }

      /* pulse waves push outward */
      for(const pu of this.pulses){
        const pdx = a.x - pu.x, pdy = a.y - pu.y;
        const pd = Math.hypot(pdx, pdy);
        const dr = Math.abs(pd - pu.r);
        if(dr < 30){
          const f = (1 - dr/30) * pu.life * 1.2;
          dx += pdx/pd * f;
          dy += pdy/pd * f;
        }
      }

      a.px = a.x; a.py = a.y;
      a.x += dx * 1.15;
      a.y += dy * 1.15;
      a.age++;

      /* respawn */
      if(a.age > a.life || a.x<0 || a.x>W || a.y<0 || a.y>H){
        a.x = rnd(W); a.y = rnd(H);
        a.px = a.x; a.py = a.y;
        a.age = 0; a.life = rnd(60, 280);
      }

      /* draw segment */
      const lightness = 50 + 20*Math.sin(a.age*0.03 + t*0.2);
      ctx.strokeStyle = `hsla(${a.hue},78%,${lightness}%,0.28)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
    }

    /* update pulses */
    for(let i = this.pulses.length - 1; i >= 0; i--){
      const pu = this.pulses[i];
      pu.r += 6;
      pu.life *= 0.97;
      if(pu.life < 0.02) this.pulses.splice(i, 1);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   8 · PANEL 3 — HOLLOW BODIES (Three.js) → About
   ══════════════════════════════════════════════════════════════════════ */
class PHollow {
  constructor(el){
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.active = false;
    this.revealed = false;
    this.init();
  }
  init(){
    const r = this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true
    });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    r.setSize(innerWidth, innerHeight);
    r.setClearColor(0, 0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0a14, 0.055);

    /* narrower FOV + camera pulled back = less off-axis distortion,
       so the sphere reads round even when parked off to the right */
    this.cam = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 200);
    this.cam.position.set(0, 0, 11);

    /* Wireframe icosahedron */
    const icoGeo = new THREE.IcosahedronGeometry(2.2, 1);
    const icoEdges = new THREE.EdgesGeometry(icoGeo);
    this.ico = new THREE.LineSegments(
      icoEdges,
      new THREE.LineBasicMaterial({ color: 0x8fb5ff, transparent: true, opacity: 0.85 })
    );
    this.scene.add(this.ico);

    /* Inner solid faint */
    this.icoInner = new THREE.Mesh(
      icoGeo,
      new THREE.MeshBasicMaterial({ color: 0x141428, transparent: true, opacity: 0.4 })
    );
    this.scene.add(this.icoInner);

    /* Vertex markers */
    const vertGeo = new THREE.BufferGeometry();
    const vp = icoGeo.attributes.position;
    const unique = [];
    const seen = new Set();
    for(let i=0;i<vp.count;i++){
      const key = vp.getX(i).toFixed(3)+','+vp.getY(i).toFixed(3)+','+vp.getZ(i).toFixed(3);
      if(!seen.has(key)){
        seen.add(key);
        unique.push(vp.getX(i), vp.getY(i), vp.getZ(i));
      }
    }
    vertGeo.setAttribute('position', new THREE.Float32BufferAttribute(unique, 3));
    this.verts = new THREE.Points(vertGeo, new THREE.PointsMaterial({
      color: 0xf5b880, size: 0.13, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.scene.add(this.verts);

    /* Starfield */
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    const sc = [];
    for(let i=0;i<2400;i++){
      /* spherical distribution */
      const r = rnd(6, 48);
      const th = Math.acos(rnd(-1, 1));
      const ph = rnd(0, TAU);
      sp.push(r*Math.sin(th)*Math.cos(ph), r*Math.sin(th)*Math.sin(ph), r*Math.cos(th));
      const lot = Math.random();
      if(lot < 0.5){ sc.push(0.56, 0.71, 1.0); }          // periwinkle
      else if(lot < 0.8){ sc.push(0.96, 0.85, 0.65); }    // warm
      else { sc.push(0.85, 0.85, 0.95); }                 // white
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    starGeo.setAttribute('color',    new THREE.Float32BufferAttribute(sc, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 0.04, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.scene.add(this.stars);

    /* soft luminous glow behind the sphere (additive sprite) */
    const gc = document.createElement('canvas'); gc.width = gc.height = 256;
    const gg = gc.getContext('2d');
    const grad = gg.createRadialGradient(128,128,0,128,128,128);
    grad.addColorStop(0,   'rgba(143,181,255,0.55)');
    grad.addColorStop(0.4, 'rgba(143,181,255,0.15)');
    grad.addColorStop(1,   'rgba(143,181,255,0)');
    gg.fillStyle = grad; gg.fillRect(0,0,256,256);
    const glowTex = new THREE.CanvasTexture(gc);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.glow.scale.set(9, 9, 1);
    this.scene.add(this.glow);

    /* push the sphere cluster off-center to the right — it's a backdrop now,
       content owns the left. Stars stay centered (they fill the whole field).
       ── To move the sphere: change OFFSET_X. Bigger = further right. ── */
    const OFFSET_X = 4.7, OFFSET_Y = 0.3;
    [this.ico, this.icoInner, this.verts, this.glow].forEach(o => {
      o.position.x = OFFSET_X;
      o.position.y = OFFSET_Y;
    });
    this.baseX = OFFSET_X;
    this.baseY = OFFSET_Y;
  }
  resize(){
    this.renderer.setSize(innerWidth, innerHeight);
    this.cam.aspect = innerWidth / innerHeight;
    this.cam.updateProjectionMatrix();
  }
  activate(){
    this.active = true;
    if(!this.revealed){ this.reveal(); this.revealed = true; }
  }
  deactivate(){ this.active = false; }
  reveal(){
    const content = this.el.querySelector('.content');
    const bio = this.el.querySelector('.about-bio');
    const facts = this.el.querySelectorAll('.about-facts .fact');
    gsap.fromTo(content.children, { y: 40, opacity: 0, filter:'blur(10px)' },
      { y: 0, opacity: 1, filter:'blur(0)', duration: 1.1, stagger: 0.15, ease: 'power3.out', delay: 0.2 });
    if(bio){
      gsap.fromTo(bio, { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.4 });
    }
    if(facts.length){
      gsap.fromTo(facts, { x: 20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7, stagger: 0.09, ease: 'power2.out', delay: 0.55 });
    }
    gsap.fromTo(this.ico.scale, { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1, duration: 1.8, ease: 'expo.out' });
  }
  tick(t){
    if(!this.active) return;

    /* floating eased drift — three-axis wobble instead of mechanical spin */
    const targetY = t * 0.12 + Math.sin(t * 0.3) * 0.15;
    const targetX = Math.sin(t * 0.18) * 0.3;
    const targetZ = Math.cos(t * 0.13) * 0.08;

    /* cursor reactivity — sphere tilts toward the pointer */
    const mx = (State.mouseX - 0.5);
    const my = (State.mouseY - 0.5);
    const tiltX = my * 0.4;
    const tiltY = mx * 0.4;

    this.ico.rotation.y = targetY + tiltY;
    this.ico.rotation.x = targetX + tiltX;
    this.ico.rotation.z = targetZ;
    this.icoInner.rotation.copy(this.ico.rotation);
    this.verts.rotation.copy(this.ico.rotation);

    /* gentle vertical bob */
    const bob = Math.sin(t * 0.5) * 0.12;
    this.ico.position.y = this.baseY + bob;
    this.icoInner.position.y = this.baseY + bob;
    this.verts.position.y = this.baseY + bob;
    this.glow.position.y = this.baseY + bob;

    /* vertex points breathe */
    this.verts.material.size = 0.13 + Math.sin(t * 1.4) * 0.03;

    /* edges brighten as cursor nears the sphere's screen side (right) */
    const nearness = Math.max(0, State.mouseX - 0.4) / 0.6; // 0→1 as cursor moves right
    this.ico.material.opacity = 0.72 + nearness * 0.22;
    this.glow.material.opacity = 0.85 + nearness * 0.3;

    this.stars.rotation.y = t * 0.008;
    this.stars.rotation.x = Math.sin(t * 0.012) * 0.08;

    /* subtle camera parallax — kept aimed at ORIGIN so the sphere stays
       parked on the right instead of being dragged to center */
    const px = (State.mouseX - 0.5) * 1.0;
    const py = (State.mouseY - 0.5) * 0.7;
    this.cam.position.x += (px - this.cam.position.x) * 0.04;
    this.cam.position.y += (-py - this.cam.position.y) * 0.04;
    this.cam.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.cam);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   9 · PANEL 4 — CORRUPTION (CRT glitch) → Stack
   ══════════════════════════════════════════════════════════════════════ */
class PCorrupt {
  constructor(el){
    this.el = el;
    this.c = el.querySelector('canvas');
    this.ctx = this.c.getContext('2d');
    this.base = el.querySelector('#gx-base');
    this.r = el.querySelector('#gx-r');
    this.g = el.querySelector('#gx-g');
    this.b = el.querySelector('#gx-b');
    this.eyebrow = el.querySelector('.eyebrow');
    this.sub = el.querySelector('.sub');
    this.active = false;
    this.revealed = false;
    this.words = ['GSAP','REACT','THREE.JS','PixiJs','WEBGL','CANVAS','TYPESCRIPT'];
    this.wordIdx = 0;
    this.resize();
  }
  resize(){
    const d = devicePixelRatio || 1;
    this.c.width = innerWidth * d;
    this.c.height = innerHeight * d;
    this.c.style.width = innerWidth + 'px';
    this.c.style.height = innerHeight + 'px';
    this.ctx.scale(d, d);
  }
  activate(){
    this.active = true;
    if(!this.revealed){ this.reveal(); this.revealed = true; }
    this.startMorph();
  }
  deactivate(){
    this.active = false;
    clearInterval(this.morphIv);
  }
  reveal(){
    gsap.fromTo([this.r, this.g, this.b, this.base],
      { opacity: 0, scale: 1.1, filter:'blur(30px)' },
      { opacity: 1, scale: 1, filter:'blur(0px)',
        duration: 1.4, stagger: 0.08, ease: 'power3.out', delay: 0.1 });
    gsap.fromTo([this.eyebrow, this.sub], { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.9, stagger: 0.15, ease:'power2.out', delay: 0.8 });
  }
  morph(){
    this.wordIdx = (this.wordIdx + 1) % this.words.length;
    const w = this.words[this.wordIdx];
    [this.base, this.r, this.g, this.b].forEach(el => el.textContent = w);
  }
  startMorph(){
    clearInterval(this.morphIv);
    this.morphIv = setInterval(() => this.morph(), 2400);
  }
  tick(t){
    if(!this.active) return;

    /* RGB channel drift */
    const n1 = Noise.n2(t*1.2, 0) * 14;
    const n2 = Noise.n2(t*1.5, 10) * 14;
    const n3 = Noise.n2(t*0.9, 20) * 10;
    const n4 = Noise.n2(t*1.1, 30) * 10;
    /* occasional big jolt */
    const jolt = Math.random() < 0.015 ? rnd(-30, 30) : 0;

    this.r.style.transform = `translate(${n1 + jolt}px, ${n3}px)`;
    this.g.style.transform = `translate(${n2}px, ${-n3}px)`;
    this.b.style.transform = `translate(${-n1 + jolt*0.6}px, ${n4}px)`;
    this.base.style.transform = `translate(${jolt*0.2}px, 0)`;

    /* canvas glitch bands */
    const ctx = this.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    /* scan bands */
    for(let i=0;i<5;i++){
      const y = rnd(innerHeight);
      const h = rnd(1, 4);
      const hue = Math.random() < 0.5 ? 340 : 180;
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${rnd(0.08, 0.18)})`;
      ctx.fillRect(0, y, innerWidth, h);
    }

    /* occasional horizontal displacement band */
    if(Math.random() < 0.04){
      const y = rnd(innerHeight);
      const h = rnd(10, 50);
      ctx.fillStyle = 'rgba(255, 50, 100, 0.12)';
      ctx.fillRect(rnd(-40, 40), y, innerWidth + 80, h);
    }

    /* noise speckles */
    const count = 90;
    for(let i=0;i<count;i++){
      const alpha = rnd(0.1, 0.35);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(rnd(innerWidth), rnd(innerHeight), 1, 1);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   10 · PANEL 6 — ECHO (closing) → Sign-off
   ══════════════════════════════════════════════════════════════════════ */
class PEcho {
  constructor(el){
    this.el = el;
    this.c = el.querySelector('canvas');
    this.ctx = this.c.getContext('2d');
    this.eyebrow = el.querySelector('.eyebrow');
    this.display = el.querySelector('.display');
    this.mark = el.querySelector('.mark');
    this.sig = el.querySelector('.sig');
    this.active = false;
    this.revealed = false;
    this.drifters = [];
    this.resize();
    this.initDrifters();
  }
  resize(){
    const d = devicePixelRatio || 1;
    this.c.width = innerWidth * d;
    this.c.height = innerHeight * d;
    this.c.style.width = innerWidth + 'px';
    this.c.style.height = innerHeight + 'px';
    this.ctx.scale(d, d);
  }
  initDrifters(){
    this.drifters = [];
    for(let i=0;i<60;i++){
      this.drifters.push({
        x: rnd(innerWidth), y: rnd(innerHeight),
        vx: rnd(-0.06, 0.06), vy: rnd(-0.06, 0.06),
        r: rnd(0.3, 1.4),
        phase: rnd(TAU)
      });
    }
  }
  activate(){
    this.active = true;
    if(!this.revealed){ this.reveal(); this.revealed = true; }
  }
  deactivate(){ this.active = false; }
  reveal(){
    const tl = gsap.timeline();
    tl.fromTo(this.eyebrow, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1 })
      .fromTo(this.display, { opacity: 0, y: 30, filter: 'blur(10px)' },
        { opacity: 1, y: 0, filter: 'blur(0)', duration: 1.8, ease: 'power3.out' }, 0.3)
      .fromTo(this.mark, { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 1.2, ease: 'power3.out' }, 1.2)
      .fromTo(this.sig, { opacity: 0 }, { opacity: 1, duration: 1.2 }, 1.6);
  }
  tick(t){
    if(!this.active) return;
    const ctx = this.ctx;
    const W = innerWidth, H = innerHeight;

    /* gentle fade */
    ctx.fillStyle = 'rgba(10,10,14,0.12)';
    ctx.fillRect(0, 0, W, H);

    /* breathing ring — parked on the left third; copy lives on the right */
    const cx = W * 0.28, cy = H/2;
    const breath = 0.85 + 0.15 * Math.sin(t * 0.6);
    const baseR = Math.min(W, H) * 0.28;
    for(let k=0;k<3;k++){
      const r = baseR * (0.7 + k * 0.12) * breath;
      ctx.strokeStyle = `rgba(185,240,208,${0.18 - k*0.05})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }

    /* radar sweep — a fading line rotating around the ring center */
    const sweep = (t * 0.9) % TAU;
    const sweepR = baseR * breath;
    const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep)*sweepR, cy + Math.sin(sweep)*sweepR);
    grad.addColorStop(0, 'rgba(185,240,208,0.32)');
    grad.addColorStop(1, 'rgba(185,240,208,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep)*sweepR, cy + Math.sin(sweep)*sweepR);
    ctx.stroke();

    /* brand-mark crosshair — static & sharp at the ring center */
    const mr = baseR * 0.30;
    ctx.strokeStyle = 'rgba(200,192,216,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, mr, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, mr * 0.4, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - mr); ctx.lineTo(cx, cy + mr);
    ctx.moveTo(cx - mr, cy); ctx.lineTo(cx + mr, cy);
    ctx.stroke();

    /* drifters */
    for(const d of this.drifters){
      d.x += d.vx; d.y += d.vy;
      if(d.x < 0) d.x = W; else if(d.x > W) d.x = 0;
      if(d.y < 0) d.y = H; else if(d.y > H) d.y = 0;
      const a = 0.35 + 0.3 * Math.sin(t * 0.8 + d.phase);
      ctx.fillStyle = `rgba(220,240,228,${a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }

    /* breathing mark on the DOM element */
    const scale = 0.98 + 0.04 * Math.sin(t * 1.2);
    this.mark.style.transform = `scale(${scale})`;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   11 · PANEL 5 — VEIL (silk ribbons + dust) → Contact
   ══════════════════════════════════════════════════════════════════════ */
class PVeil {
  constructor(el){
    this.el = el;
    this.c = el.querySelector('canvas');
    this.ctx = this.c.getContext('2d');
    this.content = el.querySelector('.content');
    this.active = false;
    this.revealed = false;
    this.ribbons = [];
    this.dust = [];
    this.resize();
    this.init();
  }
  resize(){
    const d = devicePixelRatio || 1;
    this.c.width = innerWidth * d;
    this.c.height = innerHeight * d;
    this.c.style.width = innerWidth + 'px';
    this.c.style.height = innerHeight + 'px';
    this.ctx.scale(d, d);
  }
  init(){
    this.ribbons = [];
    const N = 9;
    for(let i = 0; i < N; i++){
      this.ribbons.push({
        baseY: innerHeight * (0.12 + (i / N) * 0.76),
        amplitude: rnd(20, 85),
        freq: rnd(0.0025, 0.007),
        speed: rnd(0.25, 0.75),
        phase: rnd(TAU),
        /* hue centered on rose-champagne accent */
        hue: rnd(330, 355),
        sat: rnd(45, 70),
        light: rnd(70, 85),
        alpha: rnd(0.10, 0.32),
        thickness: rnd(0.5, 1.5)
      });
    }
    this.dust = [];
    for(let i = 0; i < 90; i++){
      this.dust.push({
        x: rnd(innerWidth), y: rnd(innerHeight),
        vx: rnd(-0.18, 0.18), vy: rnd(-0.06, 0.06),
        r: rnd(0.3, 1.3),
        phase: rnd(TAU)
      });
    }
  }
  activate(){
    this.active = true;
    if(!this.revealed){ this.reveal(); this.revealed = true; }
  }
  deactivate(){ this.active = false; }
  reveal(){
    gsap.fromTo(this.content.children,
      { y: 30, opacity: 0, filter: 'blur(14px)' },
      { y: 0, opacity: 1, filter: 'blur(0)', duration: 1.4,
        stagger: 0.18, ease: 'power3.out', delay: 0.4 });
  }
  tick(t){
    if(!this.active) return;
    const ctx = this.ctx;
    const W = innerWidth, H = innerHeight;

    /* very soft trail fade */
    ctx.fillStyle = 'rgba(10,7,13,0.09)';
    ctx.fillRect(0, 0, W, H);

    /* ribbons */
    for(const rb of this.ribbons){
      ctx.strokeStyle = `hsla(${rb.hue}, ${rb.sat}%, ${rb.light}%, ${rb.alpha})`;
      ctx.lineWidth = rb.thickness;
      ctx.beginPath();
      for(let x = -10; x <= W + 10; x += 5){
        const y = rb.baseY +
          Math.sin(x * rb.freq + t * rb.speed + rb.phase) * rb.amplitude +
          Math.sin(x * rb.freq * 2.3 + t * rb.speed * 1.5 + rb.phase * 0.7) * (rb.amplitude * 0.28) +
          Math.sin(x * rb.freq * 5.1 + t * rb.speed * 0.8) * (rb.amplitude * 0.08);
        if(x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    /* dust motes */
    for(const d of this.dust){
      d.x += d.vx + Math.sin(t * 0.5 + d.phase) * 0.12;
      d.y += d.vy + Math.cos(t * 0.3 + d.phase * 1.2) * 0.05;
      if(d.x < 0) d.x = W; else if(d.x > W) d.x = 0;
      if(d.y < 0) d.y = H; else if(d.y > H) d.y = 0;
      const a = 0.35 + 0.25 * Math.sin(t * 0.8 + d.phase);
      ctx.fillStyle = `rgba(240, 220, 230, ${a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
  }
}


/* ══════════════════════════════════════════════════════════════════════
   12 · WIRING & LIFECYCLE
   ══════════════════════════════════════════════════════════════════════ */
const panels = [
  new PThreshold(State.panels[0]),  // Hero
  new PHollow(State.panels[1]),     // About
  new PWork(State.panels[2]),       // Work (flow-field + gallery)
  new PCorrupt(State.panels[3]),    // Stack
  new PVeil(State.panels[4]),       // Contact
  new PEcho(State.panels[5])        // Sign-off
];

function onPanelChange(prev, next){
  if(panels[prev] && panels[prev].deactivate) panels[prev].deactivate();
  if(panels[next] && panels[next].activate)   panels[next].activate();
}

/* click → flow-field pulse when on Work panel */
addEventListener('click', e => {
  if(State.current === 2 && panels[2].pulse){
    panels[2].pulse(e.clientX, e.clientY);
  }
});

/* skip-to-contact chrome link → jump to Contact panel (index 4) */
const skipBtn = $('#skip-contact');
if(skipBtn){
  skipBtn.style.pointerEvents = 'auto';
  skipBtn.addEventListener('click', () => goTo(4));
}

/* copy email to clipboard — dedicated button; the email link itself
   opens the mail client natively (plain mailto href, no JS needed) */
const copyBtn = $('#veil-copy');
const copyLabel = $('#veil-copy-label');
if(copyBtn){
  copyBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const mail = copyBtn.dataset.mail;
    const flash = ok => {
      if(!copyLabel) return;
      copyLabel.textContent = ok ? 'copied' : 'press ⌘C';
      copyBtn.classList.add('is-copied');
      gsap.fromTo(copyBtn, { scale: 0.94 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
      clearTimeout(copyBtn._t);
      copyBtn._t = setTimeout(() => {
        copyLabel.textContent = 'copy';
        copyBtn.classList.remove('is-copied');
      }, 1800);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(mail).then(() => flash(true)).catch(() => flash(false));
    } else {
      /* legacy fallback */
      const ta = document.createElement('textarea');
      ta.value = mail; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try{ ok = document.execCommand('copy'); }catch(err){}
      ta.remove();
      flash(ok);
    }
  });
}

/* initial */
updateChrome(0);
panels[0].activate();

/* ══════════════════════════════════════════════════════════════════════
   13 · MAIN LOOP
   ══════════════════════════════════════════════════════════════════════ */
let lastFrame = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = (now - lastFrame) * 0.001;
  lastFrame = now;
  State.time += dt;

  for(const p of panels) p.tick(State.time);
}
requestAnimationFrame(loop);

})();
