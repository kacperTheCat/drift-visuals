// WebGL2 renderer: depth (with scene transition and trails) + backdrop (with transition) -> layer blending -> screen.
import { SCENES, sceneSource } from './scenes.js';
import { createSim } from './sim.js';

const SCENE_BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;

// Pass 1: depth (A→B transition) + trails (feedback) — depth layer only, the backdrop stays sharp.
const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uA, uB, uPrev;
uniform float uMix, uFeedback, uZoom, uTwist;
void main(){
  // Premultiplied colour + alpha (how much the depth covers the backdrop).
  vec4 D=mix(texture(uA,vUv), texture(uB,vUv), uMix);
  float cs=cos(uTwist), sn=sin(uTwist);
  vec2 q=mat2(cs,-sn,sn,cs)*(vUv-.5)*(1.-uZoom)+.5;
  vec4 prev=texture(uPrev,q);
  fragColor=max(D, prev*uFeedback-.004);
}`;

// Pass 2: blending depth over the backdrop + vignette, grain, flash, blackout.
const PRESENT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uD, uK0, uK1;
uniform float uBackMix, uBackLevel, uBal;
uniform int uMode; // 0 normal, 1 light (screen), 2 mask, 3 difference
uniform float uTime, uFlash, uBlack, uGrain;
uniform float uGlitch, uGSeed; // glitch strength 0..1, seed changed in rhythm (every eighth note)
uniform float uShatter, uShSeed, uAspect; // shatter: progress 0..1, crack pattern, screen aspect
uniform float uFxaa; uniform vec2 uDTexel; // depth edge smoothing (FXAA), texel size
uniform vec3 uFlashCol;
float lum(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
float h1(float n){ return fract(sin(n*127.1)*43758.5453); }
vec2 h2(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }

// ---- Shatter: the image cracks into shards (Voronoi cells) that rotate, fall and fade ----
const float SH_N=5.; // how many shards across the screen height
vec2 shSeed(vec2 c){ return c+.15+.7*h2(c+uShSeed); }
// nearest cell for point q (in grid units) + distance from the cell edge
vec3 shCell(vec2 q){
  vec2 i=floor(q), best=i; float d1=9., d2=9.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 c=i+vec2(x,y);
    float d=length(shSeed(c)-q);
    if(d<d1){ d2=d1; d1=d; best=c; } else if(d<d2) d2=d;
  }
  return vec3(best,(d2-d1)*.5);
}
// state of shard c: own progress (delayed), offset, rotation, brightness
void shState(vec2 c, out float lp, out vec2 off, out float ang){
  vec2 r=h2(c*1.7+uShSeed+3.);
  float t0=.1+.45*r.x; // shards fall off one by one
  lp=clamp((uShatter-t0)/(1.-t0*.6),0.,1.);
  off=vec2((r.y-.5)*.8*lp, -2.6*lp*lp); // slightly sideways and faster and faster downwards
  ang=(r.x-.5)*1.6*lp;
}
// Background under the shards: subtle noise (grain like an old TV), changing 24 times
// a second, with slow brightness bands, in a muted accent colour.
vec3 abyss(vec2 uv){
  vec2 cell=floor(gl_FragCoord.xy/1.5)+fract(floor(uTime*24.)*.1234)*137.;
  float st=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
  float band=.55+.45*sin(uv.y*4.-uTime*.9);
  vec3 tint=mix(vec3(lum(uFlashCol)),uFlashCol,.35);
  return tint*st*.11*band*smoothstep(.04,.3,uShatter);
}

// Returns source coordinates (xy) and shard brightness (z); z<0 = gap / empty. w = proximity to a crack.
vec4 shatter(vec2 uv){
  vec2 p=vec2(uv.x*uAspect,uv.y)*SH_N;
  vec2 i=floor(p);
  float gap=.035*smoothstep(.05,.25,uShatter);
  for(int y=-1;y<=3;y++) for(int x=-1;x<=1;x++){ // shards from above can fall into this spot
    vec2 c=i+vec2(x,y);
    float lp,ang; vec2 off;
    shState(c,lp,off,ang);
    vec2 sd=shSeed(c);
    vec2 q=p-sd-off;
    float cs=cos(-ang), sn=sin(-ang);
    q=mat2(cs,-sn,sn,cs)*q+sd;
    vec3 cell=shCell(q);
    if(cell.xy==c && cell.z>gap*lp*3.+gap*.3){
      float fade=1.-smoothstep(.55,1.,lp);
      float crack=1.-smoothstep(0.,.02,cell.z);
      return vec4(q.x/SH_N/uAspect, q.y/SH_N, fade, crack);
    }
  }
  return vec4(uv,-1.,0.);
}

// FXAA (simplified): smooths jagged edges — finds the edge direction
// from neighbour luminance and averages along it. Flat areas stay untouched.
vec4 fxaaD(vec2 uv){
  vec2 px=uDTexel;
  vec4 c=texture(uD,uv);
  float lM=lum(c.rgb);
  float lNW=lum(texture(uD,uv+vec2(-1.,-1.)*px).rgb), lNE=lum(texture(uD,uv+vec2(1.,-1.)*px).rgb);
  float lSW=lum(texture(uD,uv+vec2(-1.,1.)*px).rgb), lSE=lum(texture(uD,uv+vec2(1.,1.)*px).rgb);
  float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE)));
  float lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
  if(lMax-lMin<max(.02,lMax*.1)) return c; // no edge
  vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),(lNW+lSW)-(lNE+lSE));
  float red=max((lNW+lNE+lSW+lSE)*.03125,1./128.);
  dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+red),-8.,8.)*px;
  vec4 a=.5*(texture(uD,uv+dir*(1./3.-.5))+texture(uD,uv+dir*(2./3.-.5)));
  vec4 b=a*.5+.25*(texture(uD,uv-dir*.5)+texture(uD,uv+dir*.5));
  float lB=lum(b.rgb);
  return (lB<lMin||lB>lMax)?a:b;
}

// Blending depth over the backdrop at a given point.
vec3 layers(vec2 uv){
  vec4 d=uFxaa>.5?fxaaD(uv):texture(uD,uv);
  vec3 D=d.rgb; float Da=d.a;
  vec3 K=mix(texture(uK1,uv).rgb, texture(uK0,uv).rgb, uBackMix)*uBackLevel;
  // Balance: 0 = backdrop only, 0.5 = both layers at full, 1 = depth only.
  float gd=min(1.,2.*uBal), gk=min(1.,2.*(1.-uBal));
  if(uMode==1) return 1.-(1.-D*gd)*(1.-K*gk);
  if(uMode==2){
    // Backdrop visible only inside the depth shapes, shaded by its brightness.
    float m=smoothstep(.02,.4,max(Da,lum(D)));
    vec3 masked=K*m*(.6+.8*lum(D))/max(uBackLevel,.2);
    return mix(mix(K,masked,smoothstep(0.,.5,uBal)),D,smoothstep(.5,1.,uBal));
  }
  if(uMode==3) return abs(D*gd-K*gk);
  return D*gd+K*gk*(1.-Da*gd);
}

void main(){
  vec2 uv=vUv;
  vec3 c;
  float shFade=1., shCrack=0.;
  if(uShatter>.001){
    vec4 sh=shatter(uv);
    uv=sh.xy; shFade=sh.z; shCrack=sh.w;
  }
  if(shFade<0.) c=abyss(vUv);
  else if(uGlitch>.001){
    float g=uGlitch, sd=uGSeed;
    // horizontal bands shifted sideways
    float row=floor(uv.y*(6.+30.*h1(sd)));
    float r=h1(row*1.37+sd*13.1);
    uv.x+=step(1.-.55*g,r)*(h1(row*7.3+sd)-.5)*.3*g;
    // jumping blocks
    vec2 blk=floor(vUv*vec2(12.,7.)+h1(sd*3.1)*4.);
    float b=h1(blk.x*3.7+blk.y*57.1+sd*9.3);
    if(b>1.-.3*g) uv+=(vec2(h1(b*91.),h1(b*37.))-.5)*.12*g;
    uv=clamp(uv,0.,1.);
    // RGB split
    vec2 off=vec2(.004+.018*g*h1(sd*5.7),0.);
    c=vec3(layers(uv-off).r, layers(uv).g, layers(uv+off).b);
    // line interference and a brief colour inversion
    c+=(h1(floor(gl_FragCoord.y/3.)+sd*17.)-.5)*.18*g;
    if(h1(sd*2.3)>.85) c=mix(c,1.-c,.8*g);
  } else c=layers(uv);
  if(shFade>=0.){
    // glowing cracks at the start of the break; then the shard edges glow softly,
    // and the shards fade into the abyss
    float glowCrack=shCrack*smoothstep(0.,.06,uShatter)*(1.-smoothstep(.25,.6,uShatter));
    float rim=shCrack*smoothstep(.2,.5,uShatter)*.25*shFade;
    if(uShatter>.001) c=mix(abyss(vUv),c,shFade);
    c+=uFlashCol*(glowCrack*.9+rim);
  }

  vec2 v=vUv-.5; c*=1.-dot(v,v)*.9;
  float gr=fract(sin(dot(gl_FragCoord.xy+fract(uTime)*100., vec2(12.9898,78.233)))*43758.5453);
  c+=(gr-.5)*uGrain;
  c=mix(c,uFlashCol,uFlash);
  c*=1.-uBlack;
  fragColor=vec4(max(c,0.),1.);
}`;

export class Engine {
  constructor(canvas, { scale = 1, maxDpr = 1.5 } = {}) {
    this.canvas = canvas;
    this.scale = scale;
    this.ss = 1; // render resolution multiplier ("High resolution" option)
    this.maxDpr = maxDpr;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('This browser does not support WebGL2.');
    this.gl = gl;
    this.errors = {};

    gl.bindVertexArray(gl.createVertexArray());
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.vs = this.shader(gl.VERTEX_SHADER, VERT, 'vertex');
    this.scenes = {};
    this.sims = {}; // simulations (stateful scenes) — created on first use
    for (const sc of SCENES) {
      if (sc.sim) continue;
      try {
        this.scenes[sc.id] = this.program(sceneSource(sc), sc.id);
      } catch (e) {
        this.errors[sc.id] = e.message;
        console.error(e.message);
      }
    }
    this.comp = this.program(COMPOSITE, 'composite');
    this.pres = this.program(PRESENT, 'present');
    this.w = 0;
    this.h = 0;
    this.ping = 0;
    this.fb = null;
  }

  shader(type, src, name) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`Shader "${name}": ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  }

  program(frag, name) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this.vs);
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, frag, name));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program "${name}": ${gl.getProgramInfoLog(p)}`);
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  }

  resize() {
    const gl = this.gl;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const w = Math.max(2, Math.round(c.clientWidth * dpr));
    const h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    // High resolution (ss > 1): scenes rendered denser than the screen, but no denser than 2 render
    // pixels per CSS pixel — Retina screens are dense enough already.
    const factor = Math.min(this.scale * this.ss, Math.max(this.scale, 2 / dpr));
    const rw = Math.max(2, Math.round(w * factor));
    const rh = Math.max(2, Math.round(h * factor));
    if (rw === this.w && rh === this.h) return;
    if (this.fb) {
      for (const t of [this.fb.a, this.fb.b, this.fb.k0, this.fb.k1, ...this.fb.f]) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
    }
    this.w = rw;
    this.h = rh;
    this.fb = {
      a: this.target(rw, rh),
      b: this.target(rw, rh),
      k0: this.target(rw, rh),
      k1: this.target(rw, rh),
      f: [this.target(rw, rh), this.target(rw, rh)],
    };
  }

  // L = layer parameters: { int, react, flow, col: { bg, c1, c2 } }.
  drawScene(slot, f, L, tgt) {
    const gl = this.gl;
    const sc = SCENE_BY_ID[slot.id];
    if (sc?.sim) return this.drawSim(sc, slot, f, L, tgt);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
    const pr = this.scenes[slot.id];
    if (!pr) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.useProgram(pr.p);
    const u = pr.u;
    const f1 = (n, v) => u[n] && gl.uniform1f(u[n], v);
    const f3 = (n, v) => u[n] && gl.uniform3f(u[n], v[0], v[1], v[2]);
    if (u.uRes) gl.uniform2f(u.uRes, this.w, this.h);
    f1('uTime', L.flow);
    f1('uBeats', f.beats);
    f1('uKick', f.kick);
    f1('uBass', f.bass);
    f1('uMid', f.mid);
    f1('uHigh', f.high);
    f1('uEnergy', f.energy);
    f1('uReact', L.react);
    f1('uInt', L.int);
    f3('uBg', L.col.bg);
    f3('uC1', L.col.c1);
    f3('uC2', L.col.c2);
    if (u.uVar) gl.uniform4f(u.uVar, slot.v[0], slot.v[1], slot.v[2], slot.v[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Simulation scene: state lives between frames; on error (e.g. no float support) — a black image.
  drawSim(sc, slot, f, L, tgt) {
    const gl = this.gl;
    let sim = this.sims[sc.id];
    if (sim === undefined) {
      try {
        sim = this.sims[sc.id] = createSim(sc.sim, this);
      } catch (e) {
        console.error(`Symulacja "${sc.id}": ${e.message}`);
        this.errors[sc.id] = e.message;
        sim = this.sims[sc.id] = null;
      }
    }
    if (!sim) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    sim.render(f, slot, L, tgt);
  }

  render(f) {
    const gl = this.gl;
    this.ss = f.hiRes ? 1.5 : 1;
    this.resize();
    gl.viewport(0, 0, this.w, this.h);

    // A layer is drawn only when it is at least slightly visible.
    if (f.bal > 0.001) {
      if (f.mix < 0.999) this.drawScene(f.a, f, f.depthL, this.fb.a);
      if (f.mix > 0.001) this.drawScene(f.b, f, f.depthL, this.fb.b);
    }
    const backMix = f.back2 ? f.backMix : 1;
    if (f.backLevel > 0.001 && (f.bal < 0.999 || f.mode === 2)) {
      this.drawScene(f.back, f, f.backL, this.fb.k0);
      if (backMix < 0.999) this.drawScene(f.back2, f, f.backL, this.fb.k1);
    }

    const src = this.fb.f[this.ping];
    const dst = this.fb.f[1 - this.ping];
    this.ping = 1 - this.ping;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    const c = this.comp;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fb.a.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fb.b.tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(c.u.uA, 0);
    gl.uniform1i(c.u.uB, 1);
    gl.uniform1i(c.u.uPrev, 2);
    gl.uniform1f(c.u.uMix, f.mix);
    gl.uniform1f(c.u.uFeedback, f.feedback);
    gl.uniform1f(c.u.uZoom, f.zoom);
    gl.uniform1f(c.u.uTwist, f.twist);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const p = this.pres;
    gl.useProgram(p.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fb.k0.tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.fb.k1.tex);
    gl.uniform1i(p.u.uD, 0);
    gl.uniform1f(p.u.uFxaa, f.fxaa ? 1 : 0);
    gl.uniform2f(p.u.uDTexel, 1 / this.w, 1 / this.h);
    gl.uniform1i(p.u.uK0, 1);
    gl.uniform1i(p.u.uK1, 2);
    gl.uniform1f(p.u.uBackMix, backMix);
    gl.uniform1f(p.u.uBackLevel, f.backLevel);
    gl.uniform1f(p.u.uBal, f.bal);
    gl.uniform1i(p.u.uMode, f.mode);
    gl.uniform1f(p.u.uTime, f.t);
    gl.uniform1f(p.u.uFlash, f.flash);
    gl.uniform1f(p.u.uBlack, f.black);
    gl.uniform1f(p.u.uGrain, f.grain);
    gl.uniform1f(p.u.uGlitch, f.glitch || 0);
    gl.uniform1f(p.u.uGSeed, f.glitchSeed || 0);
    gl.uniform1f(p.u.uShatter, f.shatter || 0);
    gl.uniform1f(p.u.uShSeed, f.shatterSeed || 0);
    gl.uniform1f(p.u.uAspect, this.canvas.width / this.canvas.height);
    gl.uniform3f(p.u.uFlashCol, f.flashCol[0], f.flashCol[1], f.flashCol[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
