// Stateful scenes (simulations): state kept in floating-point textures, updated every frame.
//   'fluid' — fluid (stable fluids): the kick injects coloured swirls, bass keeps gently stirring.
//   'rd'    — Gray-Scott reaction-diffusion: Turing patterns grow live, the kick seeds new spots.
// Each simulation runs at a lower resolution and is smoothed when displayed.

const FLUID = {
  advect: `uniform sampler2D uVel,uSrc;uniform float uDt,uDiss;
void main(){ vec2 c=vUv-uDt*texture(uVel,vUv).xy; fragColor=uDiss*texture(uSrc,c); }`,
  divergence: `uniform sampler2D uVel;uniform vec2 uTx;
void main(){
  float L=texture(uVel,vUv-vec2(uTx.x,0.)).x,R=texture(uVel,vUv+vec2(uTx.x,0.)).x;
  float B=texture(uVel,vUv-vec2(0.,uTx.y)).y,T=texture(uVel,vUv+vec2(0.,uTx.y)).y;
  fragColor=vec4(.5*(R-L+T-B),0.,0.,1.);
}`,
  curl: `uniform sampler2D uVel;uniform vec2 uTx;
void main(){
  float L=texture(uVel,vUv-vec2(uTx.x,0.)).y,R=texture(uVel,vUv+vec2(uTx.x,0.)).y;
  float B=texture(uVel,vUv-vec2(0.,uTx.y)).x,T=texture(uVel,vUv+vec2(0.,uTx.y)).x;
  fragColor=vec4(.5*(R-L-T+B),0.,0.,1.);
}`,
  vorticity: `uniform sampler2D uVel,uCurl;uniform vec2 uTx;uniform float uDt,uStr;
void main(){
  float L=texture(uCurl,vUv-vec2(uTx.x,0.)).x,R=texture(uCurl,vUv+vec2(uTx.x,0.)).x;
  float B=texture(uCurl,vUv-vec2(0.,uTx.y)).x,T=texture(uCurl,vUv+vec2(0.,uTx.y)).x;
  float C=texture(uCurl,vUv).x;
  vec2 f=vec2(abs(T)-abs(B),abs(R)-abs(L));
  f=f/(length(f)+1e-5)*uStr*C*vec2(1.,-1.);
  fragColor=vec4(texture(uVel,vUv).xy+f*uDt,0.,1.);
}`,
  pressure: `uniform sampler2D uP,uDiv;uniform vec2 uTx;
void main(){
  float L=texture(uP,vUv-vec2(uTx.x,0.)).x,R=texture(uP,vUv+vec2(uTx.x,0.)).x;
  float B=texture(uP,vUv-vec2(0.,uTx.y)).x,T=texture(uP,vUv+vec2(0.,uTx.y)).x;
  fragColor=vec4((L+R+B+T-texture(uDiv,vUv).x)*.25,0.,0.,1.);
}`,
  gradient: `uniform sampler2D uP,uVel;uniform vec2 uTx;
void main(){
  float L=texture(uP,vUv-vec2(uTx.x,0.)).x,R=texture(uP,vUv+vec2(uTx.x,0.)).x;
  float B=texture(uP,vUv-vec2(0.,uTx.y)).x,T=texture(uP,vUv+vec2(0.,uTx.y)).x;
  fragColor=vec4(texture(uVel,vUv).xy-.5*vec2(R-L,T-B),0.,1.);
}`,
  scale: `uniform sampler2D uSrc;uniform float uK;
void main(){ fragColor=texture(uSrc,vUv)*uK; }`,
  splat: `uniform sampler2D uSrc;uniform vec2 uPt;uniform vec3 uVal;uniform float uR,uAspect;
void main(){
  vec2 d=vUv-uPt;d.x*=uAspect;
  fragColor=vec4(texture(uSrc,vUv).xyz+uVal*exp(-dot(d,d)/uR),1.);
}`,
  // Display: dye in palette colours + subtle gradient shading (a sense of thickness).
  display: `uniform sampler2D uDye;uniform vec2 uTx;uniform vec3 uBg;uniform float uInt;
void main(){
  vec3 c=texture(uDye,vUv).rgb;
  float l=dot(c,vec3(.3,.59,.11));
  float lx=dot(texture(uDye,vUv+vec2(uTx.x,0.)).rgb,vec3(.3,.59,.11))-l;
  float ly=dot(texture(uDye,vUv+vec2(0.,uTx.y)).rgb,vec3(.3,.59,.11))-l;
  vec3 n=normalize(vec3(-lx*6.,-ly*6.,1.));
  float sh=.75+.35*dot(n,normalize(vec3(-.4,.5,.75)));
  vec3 col=uBg+c*sh*(.7+.5*uInt);
  fragColor=vec4(col,1.);
}`,
};

const RD = {
  // Gray-Scott: A (r), B (g). 3×3 Laplacian, several steps per frame.
  step: `uniform sampler2D uS;uniform vec2 uTx;uniform float uF,uK;
void main(){
  vec2 s=texture(uS,vUv).rg;
  vec2 lap=-s
    +.2*(texture(uS,vUv+vec2(uTx.x,0.)).rg+texture(uS,vUv-vec2(uTx.x,0.)).rg+texture(uS,vUv+vec2(0.,uTx.y)).rg+texture(uS,vUv-vec2(0.,uTx.y)).rg)
    +.05*(texture(uS,vUv+uTx).rg+texture(uS,vUv-uTx).rg+texture(uS,vUv+vec2(uTx.x,-uTx.y)).rg+texture(uS,vUv+vec2(-uTx.x,uTx.y)).rg);
  float a=s.r,b=s.g,abb=a*b*b;
  a+=(1.*lap.r-abb+uF*(1.-a));
  b+=(.5*lap.g+abb-(uK+uF)*b);
  fragColor=vec4(clamp(a,0.,1.),clamp(b,0.,1.),0.,1.);
}`,
  seed: `uniform sampler2D uS;uniform vec2 uPt;uniform float uR,uAspect,uInit;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 s=uInit>.5?vec2(1.,0.):texture(uS,vUv).rg;
  if(uInit>.5&&h(floor(vUv*vec2(40.*uAspect,40.)))>.93) s.g=1.;   // initial seeds (square)
  vec2 d=vUv-uPt;d.x*=uAspect;
  if(dot(d,d)<uR) s.g=1.;
  fragColor=vec4(s,0.,1.);
}`,
  // Coverage probe: a 32×32 grid of points (1 = pattern present), read every half second.
  probe: `uniform sampler2D uS;
void main(){ fragColor=vec4(step(.2,texture(uS,vUv).g),0.,0.,1.); }`,
  display: `uniform sampler2D uS;uniform vec2 uTx;uniform vec3 uBg,uC1,uC2;uniform float uInt,uKick;
void main(){
  float b=texture(uS,vUv).g;
  float bx=texture(uS,vUv+vec2(uTx.x,0.)).g-b,by=texture(uS,vUv+vec2(0.,uTx.y)).g-b;
  vec3 n=normalize(vec3(-bx*8.,-by*8.,1.));
  vec3 l=normalize(vec3(-.4,.5,.75));
  float dif=max(dot(n,l),0.);
  float spec=pow(max(dot(reflect(-l,n),vec3(0.,0.,1.)),0.),24.);
  float m=smoothstep(.12,.35,b);
  vec3 col=mix(uBg,uC2*(.4+.6*dif),m)+uC1*(spec*.6+m*.15*(1.+uKick));
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
};

export function createSim(kind, engine) {
  return kind === 'fluid' ? new FluidSim(engine) : new RDSim(engine);
}

class SimBase {
  constructor(engine) {
    this.e = engine;
    this.gl = engine.gl;
    const gl = this.gl;
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Floating-point textures are not supported (EXT_color_buffer_float).');
    this.lastT = -1;
    this.lastKick = 0;
  }

  prog(src, name) {
    return this.e.program(`#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
${src}`, name);
  }

  // State texture (half float or — when precision is needed and the GPU allows — float32), filtered.
  tex(w, h, f32 = false) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (f32) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: t, fbo, w, h };
  }

  // A pair of textures for alternating read/write.
  pair(w, h, f32 = false) {
    const p = { a: this.tex(w, h, f32), b: this.tex(w, h, f32), w, h };
    p.swap = () => ([p.a, p.b] = [p.b, p.a]);
    return p;
  }

  // One pass: program, inputs {name: texture}, uniforms, target.
  pass(pr, inputs, uni, target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(pr.p);
    let unit = 0;
    for (const [name, t] of Object.entries(inputs)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      if (pr.u[name]) gl.uniform1i(pr.u[name], unit);
      unit++;
    }
    for (const [name, v] of Object.entries(uni)) {
      const loc = pr.u[name];
      if (!loc) continue;
      if (Array.isArray(v)) gl[`uniform${v.length}f`](loc, ...v);
      else gl.uniform1f(loc, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Called from the engine: a simulation step (once per frame) and display into the scene target.
  render(f, slot, L, target) {
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(Math.max(f.t - this.lastT, 0), 1 / 30);
    const kickHit = f.kick > 0.9 && this.lastKick <= 0.9;
    if (f.t !== this.lastT) this.step(dt, f, slot, L, kickHit);
    this.lastT = f.t;
    this.lastKick = f.kick;
    this.display(f, slot, L, target);
    this.gl.viewport(0, 0, this.e.w, this.e.h);
  }
}

class FluidSim extends SimBase {
  constructor(engine) {
    super(engine);
    this.p = {};
    for (const [k, src] of Object.entries(FLUID)) this.p[k] = this.prog(src, `fluid-${k}`);
    this.size = null;
    this.t = 0;
  }

  alloc(aspect) {
    const sh = 128;
    const dh = 512;
    const sw = Math.round(sh * aspect);
    const dw = Math.round(dh * aspect);
    this.vel = this.pair(sw, sh);
    this.prs = this.pair(sw, sh);
    this.div = this.tex(sw, sh);
    this.curl = this.tex(sw, sh);
    this.dye = this.pair(dw, dh);
    this.aspect = aspect;
    this.size = `${sw}x${sh}`;
  }

  splat(x, y, dx, dy, color, r) {
    const { p } = this;
    this.pass(p.splat, { uSrc: this.vel.a }, { uPt: [x, y], uVal: [dx, dy, 0], uR: r, uAspect: this.aspect }, this.vel.b);
    this.vel.swap();
    this.pass(p.splat, { uSrc: this.dye.a }, { uPt: [x, y], uVal: color, uR: r * 1.3, uAspect: this.aspect }, this.dye.b);
    this.dye.swap();
  }

  step(dt, f, slot, L, kickHit) {
    const aspect = this.e.w / this.e.h;
    if (!this.vel || Math.abs(aspect - this.aspect) > 0.01) this.alloc(aspect);
    const { p, vel, prs } = this;
    const tx = [1 / vel.w, 1 / vel.h];
    this.t += dt;
    const c1 = L.col.c1;
    const c2 = L.col.c2;
    const v = slot.v;
    // Kick: 1–2 dye swirls at random spots and directions.
    if (kickHit) {
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const force = (0.9 + 0.8 * Math.random()) * (0.6 + v[1]);
        const col = (Math.random() < 0.5 ? c1 : c2).map((c) => c * (0.8 + 0.6 * f.kick));
        this.splat(0.15 + 0.7 * Math.random(), 0.15 + 0.7 * Math.random(), Math.cos(a) * force, Math.sin(a) * force, col, 0.006 + 0.01 * v[0]);
      }
    }
    // Bass: constant, gentle stirring at a point circling the screen.
    if (f.bass > 0.15) {
      const t = this.t * 0.3;
      const x = 0.5 + 0.32 * Math.sin(t * 1.3);
      const y = 0.5 + 0.3 * Math.sin(t * 1.7 + 1.1);
      const k = f.bass * 0.25 * L.react;
      this.splat(x, y, Math.cos(t * 2.1) * k, Math.sin(t * 2.1) * k, c2.map((c) => c * 0.06 * f.bass), 0.004);
    }
    // Vorticity, incompressibility (pressure), advection.
    this.pass(p.curl, { uVel: vel.a }, { uTx: tx }, this.curl);
    this.pass(p.vorticity, { uVel: vel.a, uCurl: this.curl }, { uTx: tx, uDt: dt, uStr: 10 + 15 * v[2] }, vel.b);
    vel.swap();
    this.pass(p.divergence, { uVel: vel.a }, { uTx: tx }, this.div);
    this.pass(p.scale, { uSrc: prs.a }, { uK: 0.8 }, prs.b);
    prs.swap();
    for (let i = 0; i < 20; i++) {
      this.pass(p.pressure, { uP: prs.a, uDiv: this.div }, { uTx: tx }, prs.b);
      prs.swap();
    }
    this.pass(p.gradient, { uP: prs.a, uVel: vel.a }, { uTx: tx }, vel.b);
    vel.swap();
    this.pass(p.advect, { uVel: vel.a, uSrc: vel.a }, { uDt: dt, uDiss: 1 / (1 + dt * 0.25) }, vel.b);
    vel.swap();
    this.pass(p.advect, { uVel: vel.a, uSrc: this.dye.a }, { uDt: dt, uDiss: 1 / (1 + dt * (0.05 + 0.25 * v[3])) }, this.dye.b);
    this.dye.swap();
  }

  display(f, slot, L, target) {
    this.pass(this.p.display, { uDye: this.dye.a }, { uTx: [1 / this.dye.w, 1 / this.dye.h], uBg: L.col.bg, uInt: L.int }, { fbo: target.fbo, w: this.e.w, h: this.e.h });
  }
}

class RDSim extends SimBase {
  constructor(engine) {
    super(engine);
    this.p = {};
    for (const [k, src] of Object.entries(RD)) this.p[k] = this.prog(src, `rd-${k}`);
    this.st = null;
    // Cycle: the pattern grows until it stops spreading, then recedes (higher "kill"), and once gone grows again.
    this.phase = 'grow';
    this.cov = 0;
    this.covHist = [];
    this.phaseT = 0;
    this.probeT = 0;
    this.kd = 0; // extra kill during the receding phase
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 32, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    this.probeTgt = { tex: t, fbo, w: 32, h: 32 };
    this.probeBuf = new Uint8Array(32 * 32 * 4);
  }

  measure() {
    const gl = this.gl;
    this.pass(this.p.probe, { uS: this.st.a }, {}, this.probeTgt);
    gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, this.probeBuf);
    let n = 0;
    for (let i = 0; i < this.probeBuf.length; i += 4) if (this.probeBuf[i] > 127) n++;
    return n / 1024;
  }

  seedDots(n) {
    const aspect = this.aspect;
    for (let i = 0; i < n; i++) {
      this.pass(this.p.seed, { uS: this.st.a }, { uPt: [0.15 + 0.7 * Math.random(), 0.15 + 0.7 * Math.random()], uR: 0.0008, uAspect: aspect, uInit: 0 }, this.st.b);
      this.st.swap();
    }
  }

  cycle(dt) {
    this.phaseT += dt;
    this.probeT += dt;
    if (this.probeT < 0.5) return;
    this.probeT = 0;
    this.cov = this.measure();
    const h = this.covHist;
    h.push(this.cov);
    if (h.length > 8) h.shift();
    if (this.phase === 'grow') {
      // The pattern filled the screen or has barely grown for ~4 s → start receding.
      const stalled = h.length === 8 && this.cov - h[0] < 0.01 && this.phaseT > 8;
      if (this.cov > 0.92 || (stalled && this.cov > 0.15) || this.phaseT > 90) {
        this.phase = 'decay';
        this.phaseT = 0;
        this.kd = 0;
        h.length = 0;
      }
    } else if (this.cov < 0.01 || this.phaseT > 60) {
      // Almost nothing left → new seeds and grow again.
      this.phase = 'grow';
      this.phaseT = 0;
      h.length = 0;
      this.seedDots(3 + Math.floor(Math.random() * 4));
    }
  }

  // Pattern types (feed, kill): coral, spots, worms, cells.
  params(v) {
    const presets = [
      [0.0545, 0.062],
      [0.03, 0.062],
      [0.078, 0.061],
      [0.0367, 0.0649],
    ];
    return presets[Math.min(3, Math.floor(v * 4))];
  }

  step(dt, f, slot, L, kickHit) {
    const aspect = this.e.w / this.e.h;
    const p = this.p;
    if (!this.st || Math.abs(aspect - this.aspect) > 0.01) {
      const h = 320;
      // Gray-Scott needs precision: float32 if the GPU can filter it; otherwise half float.
      const f32 = !!this.gl.getExtension('OES_texture_float_linear');
      this.st = this.pair(Math.round(h * aspect), h, f32);
      this.aspect = aspect;
      this.pass(p.seed, { uS: this.st.a }, { uPt: [-9, -9], uR: 0, uAspect: aspect, uInit: 1 }, this.st.b);
      this.st.swap();
      this.phase = 'grow';
      this.phaseT = 0;
      this.covHist.length = 0;
    }
    const st = this.st;
    this.cycle(dt);
    // Receding: kill rises gradually, so the pattern melts from the edges instead of vanishing at once.
    this.kd = this.phase === 'decay' ? Math.min(0.025, this.kd + dt * 0.0004) : 0;
    if (kickHit && this.phase === 'grow') {
      this.pass(p.seed, { uS: st.a }, { uPt: [Math.random(), Math.random()], uR: 0.0004 + 0.0006 * f.kick, uAspect: aspect, uInit: 0 }, st.b);
      st.swap();
    }
    const [F, K] = this.params(slot.v[0]);
    const iters = Math.round(6 + 10 * slot.v[1] * (0.5 + L.react));
    const tx = [1 / st.w, 1 / st.h];
    for (let i = 0; i < iters; i++) {
      this.pass(p.step, { uS: st.a }, { uTx: tx, uF: F, uK: K + this.kd }, st.b);
      st.swap();
    }
  }

  display(f, slot, L, target) {
    this.pass(
      this.p.display,
      { uS: this.st.a },
      { uTx: [1 / this.st.w, 1 / this.st.h], uBg: L.col.bg, uC1: L.col.c1, uC2: L.col.c2, uInt: L.int, uKick: f.kick },
      { fbo: target.fbo, w: this.e.w, h: this.e.h },
    );
  }
}
