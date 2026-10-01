// Sceny = fragment shadery GLSL. Każda dostaje te same uniformy (patrz COMMON).
//
// Dwie warstwy:
//   layer: 'depth' — pierwszy plan z głębią (klawisze 1–9). Zwraca kolor
//                    "premultiplied" + alfę = ile zasłania tło (0 = puste, prześwituje tło).
//   layer: 'back'  — tło (backdrop): płaskie, wolne tekstury. Alfa ignorowana.
//
// Scena 3D (raymarching): podaj `map` (funkcja odległości `float map(vec3 p)`) i `frag` z main().
// W main() są dostępne: camera(ro,ta,roll), march(ro,rd,maxd,glow), shade(ro,rd,t,maxd,glow,emit).
//
// mood: 'drive' (groove, stopa gra), 'calm' (breakdown), 'both'.
// uVar.xyzw to 4 losowe parametry 0..1 — autopilot powoli je zmienia ("wariacje").

export const COMMON = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;    // czas "przepływu" — przyspiesza z basem i stopą
uniform float uBeats;   // licznik beatów (ciągły, zsynchronizowany z BPM)
uniform float uKick;    // obwiednia stopy 0..1
uniform float uBass, uMid, uHigh, uEnergy;
uniform float uReact;   // reaktywność 0..1
uniform float uInt;     // intensywność 0..1
uniform vec3 uBg, uC1, uC2;
uniform vec4 uVar;
#define PI 3.14159265359
#define TAU 6.28318530718
#define KICK (uKick*uReact)
#define BASS (uBass*uReact)
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=rot(.5)*p*2.03+11.7;a*=.5;}return v;}
vec2 cuv(){return (gl_FragCoord.xy-.5*uRes)/uRes.y;}
float px(){return 1.5/uRes.y;}
// antyaliasowana linia: 1 gdy d < w
float band(float d,float w){float aa=fwidth(d)+1e-5;return 1.-smoothstep(w-aa,w+aa,d);}
// alfa dla płaskich scen pierwszego planu: jasne = zasłania tło
float cover(vec3 c){return clamp(max(max(c.r,c.g),c.b)*3.,0.,1.);}
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float sdTorus(vec3 p,vec2 t){return length(vec2(length(p.xz)-t.x,p.y))-t.y;}
float sdOct(vec3 p,float s){p=abs(p);return (p.x+p.y+p.z-s)*.57735;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float sdEll(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/max(k1,1e-5);}
float sdSeg(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
`;

// Wstawiane między `map` a `frag` scen 3D.
export const RAYMARCH = /* glsl */ `
vec3 calcNormal(vec3 p){
  const vec2 e=vec2(.0015,-.0015);
  return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));
}
// Zwraca odległość trafienia albo -1; glow = poświata z przelotów blisko powierzchni.
float march(vec3 ro,vec3 rd,float maxd,out float glow){
  float t=0.;glow=0.;
  for(int i=0;i<80;i++){
    float d=map(ro+rd*t);
    glow+=exp(-max(d,0.)*10.)*.015;
    if(d<.0015*t+.0005) return t;
    t+=d*.85;
    if(t>maxd) break;
  }
  return -1.;
}
mat3 camera(vec3 ro,vec3 ta,float roll){
  vec3 w=normalize(ta-ro),up=vec3(sin(roll),cos(roll),0.);
  vec3 u=normalize(cross(up,w)),v=cross(w,u);
  return mat3(u,v,w);
}
// Oświetlenie + mgła głębi. Pudło (t<0) jest przezroczyste — tam prześwituje tło.
vec4 shade(vec3 ro,vec3 rd,float t,float maxd,float glow,float emit){
  vec3 g=uC1*glow*(.5+.8*KICK);
  float ga=clamp(glow,0.,1.);
  if(t<0.) return vec4(g*(.55+.6*uInt),ga*.8);
  vec3 p=ro+rd*t,n=calcNormal(p);
  vec3 l=normalize(vec3(.5,.8,-.4));
  float dif=max(dot(n,l),0.);
  float head=max(dot(n,-rd),0.); // "latarka" z kamery — doświetla zakamarki
  float rim=pow(1.-head,3.);
  vec3 col=uC2*(.08+.45*dif+.3*head)+uC1*rim*.5+uC1*emit;
  float fog=exp(-pow(t/maxd,2.)*3.);
  col=col*fog+g;
  return vec4(col*(.55+.6*uInt),clamp(fog+ga,0.,1.));
}
`;

export const SCENES = [
  // =====================================================================
  // GŁĘBIA — 3D
  // =====================================================================
  // WYŁĄCZONE: Monolity — usuń "// " z poniższych linii, żeby przywrócić.
//   {
//     id: 'pillars', name: 'Monolity', layer: 'depth', mood: 'drive',
//     map: /* glsl */ `
// float map(vec3 p){
//   vec2 id=floor(p.xz/4.);
//   vec3 q=p;q.xz=mod(q.xz,4.)-2.;
//   float h=.8+hash(id)*2.2;
//   float w=.3+.05*KICK;
//   float b=sdBox(q-vec3(0.,h-2.,0.),vec3(w,h,w));
//   return min(b,p.y+2.);
// }`,
//     frag: /* glsl */ `
// void main(){
//   vec2 uv=cuv();
//   vec3 ro=vec3(sin(uTime*.13)*.6,-.6+sin(uTime*.07)*.5,uTime*2.);
//   vec3 ta=ro+vec3(sin(uTime*.1)*.8*uVar.x,.1,3.);
//   vec3 rd=camera(ro,ta,sin(uTime*.05)*.15*uVar.y)*normalize(vec3(uv,1.5));
//   float glow;float t=march(ro,rd,40.,glow);
//   float emit=0.;
//   if(t>0.){
//     vec3 p=ro+rd*t;
//     if(p.y<-1.99){
//       vec2 g=abs(fract(p.xz*.5)-.5);
//       emit=(1.-smoothstep(0.,.03,min(g.x,g.y)))*.35;
//     } else {
//       float bnd=fract(p.y*1.5-uBeats*.5);
//       emit=step(bnd,.08)*(.4+1.2*KICK);
//     }
//   }
//   fragColor=shade(ro,rd,t,40.,glow,emit);
// }`,
//   },
  {
    id: 'arches', name: 'Łuki', layer: 'depth', mood: 'drive',
    map: /* glsl */ `
float map(vec3 p){
  float id=floor(p.z/2.5);
  vec3 q=p;q.z=mod(q.z,2.5)-1.25;
  q.xy*=rot(id*(.15+.3*uVar.x)+uBeats*.03);
  float s=2.2;
  float outer=sdBox(q,vec3(s,s,.12));
  float inner=sdBox(q,vec3(s-.25,s-.25,1.));
  return max(outer,-inner);
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(sin(uTime*.2)*.4,cos(uTime*.17)*.4,uTime*2.5);
  vec3 rd=camera(ro,ro+vec3(0.,0.,3.),uTime*.05*(uVar.y-.5))*normalize(vec3(uv,1.3));
  float glow;float t=march(ro,rd,45.,glow);
  float emit=0.;
  if(t>0.){
    float id=floor((ro.z+rd.z*t)/2.5);
    float wave=fract(id/8.-uBeats*.25);
    emit=smoothstep(.12,0.,wave)*(.6+1.5*KICK)+KICK*.25;
  }
  fragColor=shade(ro,rd,t,45.,glow,emit);
}`,
  },
  {
    id: 'core', name: 'Rdzeń', layer: 'depth', mood: 'both',
    map: /* glsl */ `
float map(vec3 p){
  p.xz*=rot(uTime*.15);p.xy*=rot(uTime*.1+uVar.x*3.);
  float sc=1.+.06*KICK+.04*BASS;
  p/=sc;
  float d=sdBox(p,vec3(1.));
  float s=1.;
  for(int m=0;m<3;m++){
    vec3 a=mod(p*s,2.)-1.;s*=3.;
    vec3 r=abs(1.-3.*abs(a));
    float da=max(r.x,r.y),db=max(r.y,r.z),dc=max(r.z,r.x);
    d=max(d,(min(da,min(db,dc))-1.)/s);
  }
  return d*sc;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float a=uTime*.1;
  float dist=4.3+.5*sin(uTime*.07)-uVar.y*.8;
  vec3 ro=vec3(sin(a)*dist,sin(uTime*.05)*1.2,cos(a)*dist);
  vec3 rd=camera(ro,vec3(0.),0.)*normalize(vec3(uv,1.6));
  float glow;float t=march(ro,rd,12.,glow);
  float emit=0.;
  if(t>0.){
    vec3 p=ro+rd*t;
    emit=smoothstep(.95,1.,fract(length(p)*2.-uBeats*.5))*(.5+1.2*KICK);
  }
  fragColor=shade(ro,rd,t,12.,glow,emit);
}`,
  },
  {
    id: 'field', name: 'Pole', layer: 'depth', mood: 'both',
    map: /* glsl */ `
float map(vec3 p){
  vec2 id=floor(p.xz);
  vec3 q=p;q.xz=fract(q.xz)-.5;
  float h=sin(id.x*.45+uTime*.8)*cos(id.y*.35+uTime*.6)*.8*(.4+BASS)+hash(id)*.3;
  float s=.3+.1*KICK*step(.7,hash(id+floor(uBeats)));
  float b=sdBox(q-vec3(0.,h,0.),vec3(s))-.02;
  return min(b*.8,.4); // sąsiednie kostki mają inne wysokości — krok ostrożny
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(uTime*.8,2.4+sin(uTime*.1)*.5+uVar.x,uTime*1.2);
  vec3 ta=ro+vec3(1.,-1.3+uVar.y*.6,2.);
  vec3 rd=camera(ro,ta,sin(uTime*.07)*.1)*normalize(vec3(uv,1.4));
  float glow;float t=march(ro,rd,30.,glow);
  float emit=0.;
  if(t>0.){
    vec3 p=ro+rd*t;
    float on=step(.82,hash(floor(p.xz)+floor(uBeats)));
    emit=on*(.25+1.4*KICK);
  }
  fragColor=shade(ro,rd,t,30.,glow,emit);
}`,
  },

  {
    id: 'rings', name: 'Pierścienie', layer: 'depth', mood: 'both',
    map: /* glsl */ `
float map(vec3 p){
  float d=1e3;
  for(int i=0;i<5;i++){
    float fi=float(i);
    vec3 q=p;
    q.yz*=rot(uTime*(.2+fi*.07)+fi*.7+uVar.x*3.);
    q.xy*=rot(uTime*(.13+fi*.05)*(mod(fi,2.)*2.-1.)+uBeats*.0625*PI*uVar.y);
    d=min(d,sdTorus(q,vec2(.6+fi*.45,.035+.02*KICK)));
  }
  return d;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float a=uTime*.06;
  vec3 ro=vec3(sin(a)*5.5,1.2+sin(uTime*.05),cos(a)*5.5);
  vec3 rd=camera(ro,vec3(0.),sin(uTime*.04)*.2)*normalize(vec3(uv,1.5+uVar.z*.6));
  float glow;float t=march(ro,rd,14.,glow);
  float emit=0.;
  if(t>0.){
    float r=length(ro+rd*t);
    emit=exp(-pow(fract(uBeats*.25)*3.-r,2.)*8.)*(.4+1.2*KICK);
  }
  fragColor=shade(ro,rd,t,14.,glow,emit);
}`,
  },
  {
    id: 'spiral', name: 'Spirala', layer: 'depth', mood: 'drive',
    map: /* glsl */ `
float map(vec3 p){
  p.xy*=rot(p.z*(.08+.12*uVar.x));
  float sec=TAU/10.;
  float a=atan(p.y,p.x);
  a-=floor(a/sec+.5)*sec;
  vec2 xy=vec2(cos(a),sin(a))*length(p.xy);
  vec3 q=vec3(xy.x-2.2,xy.y,mod(p.z,1.2)-.6);
  q.xz*=rot(uBeats*.25*PI*uVar.y);
  return sdBox(q,vec3(.22+.08*KICK))*.8;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(0.,0.,uTime*2.5);
  vec3 rd=camera(ro,ro+vec3(sin(uTime*.1)*.4,cos(uTime*.13)*.4,3.),uTime*.03)*normalize(vec3(uv,1.2));
  float glow;float t=march(ro,rd,35.,glow);
  float emit=0.;
  if(t>0.){
    float zi=floor((ro.z+rd.z*t)/1.2);
    emit=step(.85,hash(vec2(zi,floor(uBeats))))*(.3+1.4*KICK);
  }
  fragColor=shade(ro,rd,t,35.,glow,emit);
}`,
  },
  {
    id: 'mercury', name: 'Rtęć', layer: 'depth', mood: 'calm',
    map: /* glsl */ `
float map(vec3 p){
  float d=length(p)-(.6+.15*KICK);
  for(int i=0;i<6;i++){
    float fi=float(i);
    vec3 c=vec3(sin(uTime*.4+fi*1.7),sin(uTime*.33+fi*2.3)*.8,cos(uTime*.37+fi*1.1))*(.9+.3*uVar.x);
    d=smin(d,length(p-c)-(.4+.1*sin(fi+uTime)+.12*BASS),.5+.2*uVar.y);
  }
  return d;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float a=uTime*.08;
  vec3 ro=vec3(sin(a)*4.5,sin(uTime*.06)*1.5,cos(a)*4.5);
  vec3 rd=camera(ro,vec3(0.),0.)*normalize(vec3(uv,1.5));
  float glow;float t=march(ro,rd,12.,glow);
  float emit=0.;
  if(t>0.){
    vec3 p=ro+rd*t;
    emit=smoothstep(.92,1.,sin(p.y*10.-uBeats*PI)*.5+.5)*(.2+1.*KICK);
  }
  fragColor=shade(ro,rd,t,12.,glow,emit);
}`,
  },
  {
    id: 'gyroid', name: 'Gyroid', layer: 'depth', mood: 'both',
    map: /* glsl */ `
vec2 path(float z){return vec2(sin(z*.15)*1.5,cos(z*.12)*1.2);}
float map(vec3 p){
  float s=1.2+uVar.x*.8;
  vec3 q=p*s;
  float g=(abs(dot(sin(q),cos(q.zxy)))-(.08+.14*uVar.y+.1*BASS))/s*.6;
  float tube=1.2-length(p.xy-path(p.z)); // pusty kanał na trasie kamery
  return max(g,tube);
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float z=uTime*1.8;
  vec3 ro=vec3(path(z),z);
  vec3 ta=vec3(path(z+2.),z+2.);
  vec3 rd=camera(ro,ta,sin(uTime*.07)*.3)*normalize(vec3(uv,1.2));
  float glow;float t=march(ro,rd,20.,glow);
  float emit=0.;
  if(t>0.){
    float w=fract((ro.z+rd.z*t)*.2-uBeats*.25);
    emit=(1.-smoothstep(0.,.06,abs(w-.5)))*(.5+1.2*KICK);
  }
  fragColor=shade(ro,rd,t,20.,glow,emit);
}`,
  },
  {
    id: 'crystal', name: 'Kryształ', layer: 'depth', mood: 'both',
    map: /* glsl */ `
float map(vec3 p){
  p.xz*=rot(uTime*.12);p.yz*=rot(uTime*.09);
  float sc=1.;
  for(int i=0;i<4;i++){
    p=abs(p);
    if(p.x<p.y)p.xy=p.yx;
    if(p.x<p.z)p.xz=p.zx;
    if(p.y<p.z)p.yz=p.zy;
    p.xy*=rot(.15+uVar.x*.4+.05*sin(uTime*.2));
    p=p*2.-vec3(1.,.6+uVar.y*.3,.3);
    sc*=2.;
  }
  return sdBox(p,vec3(.45+.15*KICK))/sc;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float a=uTime*.07;
  float dist=3.2+.4*sin(uTime*.05)+uVar.z*.8;
  vec3 ro=vec3(sin(a)*dist,sin(uTime*.04)*1.,cos(a)*dist);
  vec3 rd=camera(ro,vec3(0.),0.)*normalize(vec3(uv,1.5));
  float glow;float t=march(ro,rd,10.,glow);
  float emit=0.;
  if(t>0.) emit=smoothstep(.95,1.,fract(length(ro+rd*t)*3.-uBeats*.5))*(.5+1.2*KICK);
  fragColor=shade(ro,rd,t,10.,glow,emit);
}`,
  },

  // =====================================================================
  // GŁĘBIA — płaskie (alfa z jasności)
  // =====================================================================
  {
    id: 'tunnel', name: 'Tunel', layer: 'depth', mood: 'drive',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  p*=rot(uBeats*.03*(uVar.x-.5)*PI+sin(uTime*.05)*.2);
  float sides=floor(3.+uVar.y*5.99);
  float a=atan(p.y,p.x);
  float seg=TAU/sides;
  float r=cos(floor(.5+a/seg)*seg-a)*length(p);
  float z=.3/max(r,1e-3);
  float d=z+uTime*.5;
  float rings=band(abs(fract(d*3.)-.5),.03+.12*KICK);
  vec3 col=mix(uC2,uC1,.5+.5*sin(d*.35+uVar.z*6.))*rings;
  float edge=abs(fract(a/seg)-.5)*seg*length(p);
  col+=uC1*band(edge,.0015)*(.25+.6*uHigh*uReact);
  col*=smoothstep(.02,.3,r)*(.45+.8*uInt);
  col+=uC1*KICK*.12*smoothstep(.5,1.2,length(p));
  fragColor=vec4(col,cover(col));
}`,
  },
  {
    id: 'grid', name: 'Korytarz', layer: 'depth', mood: 'drive',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  p*=rot(sin(uTime*.1)*.1*uVar.x);
  float y=p.y+(uVar.y-.5)*.2;
  float z=.35/max(abs(y),1e-3);
  vec2 g=vec2(p.x*z,z+uTime*1.5);
  float gx=abs(fract(g.x)-.5),gy=abs(fract(g.y)-.5);
  float l=max(band(gx,.03),band(gy,.03+.1*KICK));
  float fade=smoothstep(0.,.35,abs(y));
  vec3 col=uC1*l*fade*fade;
  col+=uC2*exp(-abs(y)*18.)*(.4+.9*BASS+KICK);
  col*=.5+.6*uInt;
  fragColor=vec4(col,cover(col));
}`,
  },
  {
    id: 'kaleido', name: 'Kalejdoskop', layer: 'depth', mood: 'drive',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  float n=floor(3.+uVar.x*7.);
  float r=length(p),a=atan(p.y,p.x);
  float seg=PI/n;
  a=mod(a+uTime*.05,2.*seg);a=abs(a-seg);
  p=vec2(cos(a),sin(a))*r;
  p=p*(1.5+uVar.y*2.)+vec2(uTime*.15,0.);
  p*=rot(.3+uVar.z*2.);
  vec2 g=fract(p)-.5;
  float sq=abs(max(abs(g.x),abs(g.y))-(.25+.12*sin(uBeats*PI*.5+r*3.)));
  float l=band(sq,.015+.04*KICK);
  float ci=band(abs(length(g)-.18),.01);
  vec3 col=uC1*l+uC2*ci*.6;
  col*=smoothstep(1.3,.1,r)*(.45+.6*uInt+.4*KICK);
  fragColor=vec4(col,cover(col));
}`,
  },
  {
    id: 'orbit', name: 'Orbity', layer: 'depth', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  float r=length(p),a=atan(p.y,p.x);
  float n=7.+floor(uVar.x*8.);
  float rr=r*n,k=floor(rr);
  float cnt=4.+k*(2.+floor(uVar.y*4.));
  float dir=mod(k,2.)*2.-1.;
  float stp=floor(uBeats)+smoothstep(0.,.35,fract(uBeats));
  float aa=a/TAU*cnt+dir*(uTime*.15*(1.+k*.1)+stp*(.25+.5*uVar.z));
  vec2 cell=vec2((fract(aa)-.5)*TAU*r/cnt,(fract(rr)-.5)/n);
  float rad=(.14+.2*KICK)/n;
  float dotv=1.-smoothstep(rad-px(),rad+px(),length(cell));
  vec3 col=mix(uC1,uC2,mod(k,2.)*.7)*dotv;
  col*=smoothstep(1.,.3,r)*(.5+.6*uInt);
  fragColor=vec4(col,cover(col));
}`,
  },
  {
    id: 'pulse', name: 'Puls', layer: 'depth', mood: 'calm',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*rot(uTime*.05);
  float sides=floor(3.+uVar.x*4.99);
  float a=atan(p.y,p.x),seg=TAU/sides;
  float poly=cos(floor(.5+a/seg)*seg-a)*length(p);
  float r=mix(length(p),poly,step(.5,uVar.y));
  vec3 col=vec3(0.);
  for(int i=0;i<6;i++){
    float t=fract(uBeats*.25+float(i)/6.);
    col+=mix(uC1,uC2,t)*band(abs(r-t*1.1),.002+.004*(1.-t))*(1.-t)*(1.-t);
  }
  float R0=.18+.03*BASS+.06*KICK;
  col+=uC1*band(abs(r-R0),.004+.01*KICK)*(.7+.6*KICK);
  col+=uC1*.25*exp(-r*r*40.)*(BASS*.5+KICK);
  col*=.6+.5*uInt;
  fragColor=vec4(col,cover(col));
}`,
  },

  // =====================================================================
  // GŁĘBIA — fraktale 3D
  // =====================================================================
  {
    id: 'bulb', name: 'Mandelbulb', layer: 'depth', mood: 'both',
    map: /* glsl */ `
float map(vec3 p){
  p.xz*=rot(uTime*.1);p.yz*=rot(.3+uTime*.07);
  float sc=1.+.05*KICK;
  p/=sc;
  // "Moc" fraktala powoli oddycha; bas lekko ją podbija.
  float pw=6.+uVar.x*3.+.8*sin(uTime*.08)+.6*BASS;
  vec3 z=p;float dr=1.,r=length(z);
  for(int i=0;i<6;i++){
    r=length(z);
    if(r>2.) break;
    float th=acos(clamp(z.z/r,-1.,1.))*pw,ph=atan(z.y,z.x)*pw;
    dr=pow(r,pw-1.)*pw*dr+1.;
    z=pow(r,pw)*vec3(sin(th)*cos(ph),sin(ph)*sin(th),cos(th))+p;
  }
  return .5*log(max(r,1e-4))*r/dr*sc;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float a=uTime*.05;
  float dist=3.4+.3*sin(uTime*.06)-uVar.y*.5;
  vec3 ro=vec3(sin(a)*dist,.4*sin(uTime*.04),cos(a)*dist);
  vec3 rd=camera(ro,vec3(0.),0.)*normalize(vec3(uv,1.7));
  float glow;float t=march(ro,rd,8.,glow);
  float emit=0.;
  if(t>0.) emit=smoothstep(.93,1.,fract(length(ro+rd*t)*4.-uBeats*.5))*(.5+1.3*KICK);
  fragColor=shade(ro,rd,t,8.,glow,emit);
}`,
  },
  {
    id: 'apollo', name: 'Apollonius', layer: 'depth', mood: 'both',
    map: /* glsl */ `
float map(vec3 p){
  float S=1.6+uVar.y*.8;
  p/=S;
  float s=1.;
  float k0=1.15+.12*uVar.x+.04*BASS;
  for(int i=0;i<7;i++){
    p=-1.+2.*fract(.5*p+.5);
    float k=k0/dot(p,p);
    p*=k;s*=k;
  }
  return .25*abs(p.y)/s*S;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float z=uTime*.35;
  vec3 ro=vec3(.9+.2*sin(z*.3),.95+.2*cos(z*.23),z);
  vec3 ta=ro+vec3(.3*sin(z*.2),.2*cos(z*.17),1.);
  vec3 rd=camera(ro,ta,sin(uTime*.05)*.4)*normalize(vec3(uv,1.3));
  float glow;float t=march(ro,rd,10.,glow);
  float emit=0.;
  if(t>0.){
    float w=fract((ro.z+rd.z*t)*.5-uBeats*.25);
    emit=(1.-smoothstep(0.,.05,abs(w-.5)))*(.4+1.2*KICK);
  }
  fragColor=shade(ro,rd,t,10.,glow,emit);
}`,
  },

  // =====================================================================
  // GŁĘBIA — organiczne 3D
  // =====================================================================
  // WYŁĄCZONE: Wodorosty — usuń "// " z poniższych linii, żeby przywrócić.
//   {
//     id: 'kelp', name: 'Wodorosty', layer: 'depth', mood: 'calm',
//     map: /* glsl */ `
// float map(vec3 p){
//   vec2 id=floor(p.xz/2.);
//   vec3 q=p;q.xz=mod(q.xz,2.)-1.;
//   float h=hash(id);
//   float sway=(p.y+2.)*.25; // im wyżej, tym mocniej faluje
//   q.x+=sin(p.y*1.2+uTime*.8+h*6.)*.25*sway*(.6+.8*uVar.x)*(1.+BASS);
//   q.z+=cos(p.y*.9+uTime*.6+h*4.)*.2*sway;
//   float r=.12+.05*sin(p.y*4.-uTime*2.+h*10.)+.05*KICK;
//   float d=max(length(q.xz)-r,p.y-(1.+h*(1.5+2.*uVar.y)));
//   return min(d,p.y+2.)*.6;
// }`,
//     frag: /* glsl */ `
// void main(){
//   vec2 uv=cuv();
//   vec3 ro=vec3(.15*sin(uTime*.2),-.6+.3*sin(uTime*.11),uTime*.8);
//   vec3 ta=ro+vec3(.4*sin(uTime*.07),.35,3.);
//   vec3 rd=camera(ro,ta,sin(uTime*.05)*.1)*normalize(vec3(uv,1.4));
//   float glow;float t=march(ro,rd,22.,glow);
//   float emit=0.;
//   if(t>0.){
//     vec3 p=ro+rd*t;
//     if(p.y>-1.98){
//       float h=hash(floor(p.xz/2.));
//       emit=smoothstep(.85,1.,fract(p.y*.5-uBeats*.25+h))*(.4+1.2*KICK);
//     }
//   }
//   fragColor=shade(ro,rd,t,22.,glow,emit);
// }`,
//   },
  {
    id: 'organism', name: 'Organizm', layer: 'depth', mood: 'both',
    map: /* glsl */ `
float map(vec3 p){
  p.xz*=rot(uTime*.1);p.xy*=rot(uTime*.07);
  float t=uTime*.6;
  float disp=sin(3.*p.x+t)*sin(3.*p.y+t*1.3)*sin(3.*p.z+t*.7)*(.15+.1*uVar.x)
            +sin(7.*p.x-t)*sin(6.*p.y+t)*sin(8.*p.z)*.05*(1.+BASS);
  return (length(p)-(1.1+.12*KICK+.05*BASS)+disp)*.6;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float a=uTime*.06;
  float dist=3.9-uVar.y*.6;
  vec3 ro=vec3(sin(a)*dist,.6*sin(uTime*.05),cos(a)*dist);
  vec3 rd=camera(ro,vec3(0.),0.)*normalize(vec3(uv,1.6));
  float glow;float t=march(ro,rd,10.,glow);
  float emit=0.;
  if(t>0.){
    vec3 p=ro+rd*t;
    float vein=abs(sin(5.*p.x+uTime*.4)*sin(5.*p.y-uTime*.3)*sin(5.*p.z));
    emit=(1.-smoothstep(0.,.08,vein))*(.25+1.*KICK);
  }
  fragColor=shade(ro,rd,t,10.,glow,emit);
}`,
  },
  {
    id: 'artery', name: 'Arteria', layer: 'depth', mood: 'drive',
    map: /* glsl */ `
// Fala skurczu przesuwająca się wzdłuż tunelu w rytm beatu.
float peri(float z){return exp(-pow((fract(z*.1-uBeats*.25)-.5)*6.,2.));}
float map(vec3 p){
  float a=atan(p.y,p.x),z=p.z;
  float R=1.4+.5*uVar.y+.25*sin(z*.7+uTime*.5)+.12*sin(a*floor(3.+uVar.x*6.)+z*1.3)+.06*sin(a*11.-z*2.+uTime);
  R-=.35*peri(z)*(.4+KICK);
  return (R-length(p.xy))*.7;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(.2*sin(uTime*.3),.2*cos(uTime*.25),uTime*1.5);
  vec3 rd=camera(ro,ro+vec3(0.,0.,3.),sin(uTime*.1)*.3)*normalize(vec3(uv,1.2));
  float glow;float t=march(ro,rd,25.,glow);
  float emit=0.;
  if(t>0.){
    vec3 p=ro+rd*t;
    float a=atan(p.y,p.x);
    float veins=smoothstep(.9,1.,sin(a*6.+p.z*2.+sin(p.z)*2.)*.5+.5)*.3;
    emit=veins+peri(p.z)*(.3+1.*KICK);
  }
  fragColor=shade(ro,rd,t,25.,glow,emit);
}`,
  },

  {
    id: 'ripples', name: 'Fale', layer: 'depth', mood: 'both',
    // Kręgi widma: co pół taktu w środku rodzi się kontur w kształcie okrągłego wykresu
    // częstotliwości (płaty rosną ze średnimi/wysokimi) i rozchodzi się na zewnątrz.
    // Każdy krąg jest lekko obrócony (wir), kolor przechodzi z akcentu w drugi kolor palety.
    // uVar: x = liczba płatów, y = odstęp kręgów, z = skręcenie (wir), w = grubość linii.
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  float r=length(p),a=atan(p.y,p.x);
  float lobes=floor(3.+uVar.x*7.);
  float gap=.07+.07*uVar.y;
  float ph=fract(uBeats*.5);               // nowy krąg co 2 beaty
  float thick=.0025+.004*uVar.w;
  vec3 col=vec3(0.);
  for(int i=0;i<9;i++){
    float fi=float(i);
    float age=(fi+ph)/9.;                  // 0 = środek, 1 = brzeg
    float R=(fi+ph)*gap;
    float tw=(fi+ph)*(uVar.z-.5)*.9+uTime*.08*(mod(fi,2.)*2.-1.);
    float shape=.035*sin(a*lobes+tw)*(.3+uMid*uReact)+.015*sin(a*(lobes*2.+1.)-tw*1.7)*(.2+uHigh*uReact);
    float d=abs(r-R-shape*(.4+age*2.));
    float amp=(1.-age)*(1.-age)*(i==0?1.+1.2*KICK:1.);
    float line=exp(-d/thick)+.25*exp(-d/(thick*8.));  // ostra linia + miękka poświata
    col+=mix(uC1,uC2,age)*line*amp;
  }
  col+=uC1*exp(-r*r*60.)*(.15+.6*BASS);  // pulsujące źródło w środku
  col*=.6+.6*uInt;
  fragColor=vec4(col,cover(col));
}`,
  },

  // =====================================================================
  // GŁĘBIA — organiczne 3D (druga seria)
  // =====================================================================
  {
    id: 'mycel', name: 'Grzybnia', layer: 'depth', mood: 'both',
    // Lot przez sieć splątanych włókien (przecięcia dwóch gyroidów); po nitkach biegną impulsy.
    map: /* glsl */ `
float gy(vec3 p){ return dot(sin(p),cos(p.zxy)); }
float map(vec3 p){
  float s=1.5+uVar.x*.8;
  vec3 q=p*s;
  float a=gy(q),b=gy(q*1.37+vec3(1.3,2.1,.7));
  return (length(vec2(a,b))-(.1+.05*BASS))/(s*2.4);
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(sin(uTime*.1)*.6,cos(uTime*.08)*.6,uTime*.55);
  vec3 rd=camera(ro,ro+vec3(sin(uTime*.07)*.5,cos(uTime*.05)*.5,2.),sin(uTime*.05)*.3)*normalize(vec3(uv,1.2));
  float glow;float t=march(ro,rd,14.,glow);
  float emit=0.;
  if(t>0.){
    vec3 p=ro+rd*t;
    float w=fract(p.z*.35+dot(p.xy,vec2(.2,.15))-uBeats*.5);
    emit=(1.-smoothstep(0.,.07,abs(w-.5)))*(.6+1.2*KICK);
  }
  fragColor=shade(ro,rd,t,14.,glow,emit);
}`,
  },
  {
    id: 'nautilus', name: 'Muszla', layer: 'depth', mood: 'calm',
    // Spirala logarytmiczna łodzika; skala rośnie płynnie, więc kamera bez końca "wkręca się" do środka.
    map: /* glsl */ `
float map(vec3 p){
  p.xz*=rot(uTime*.06);
  float b=.17+.03*uVar.x;
  float sc=exp(fract(uTime*.03)*b*TAU);   // samopodobieństwo: powiększenie o jeden zwój = ten sam kształt
  p*=sc;
  float r=length(p.xz),a=atan(p.z,p.x);
  float k=(log(max(r,1e-4))/b-a)/TAU;
  float d=1e3;
  for(int i=0;i<2;i++){
    float kk=clamp(floor(k)+float(i),-7.,1.);
    float Rc=exp(b*(a+TAU*kk));
    d=min(d,length(vec2(r-Rc,p.y))-Rc*(.42+.04*KICK));
  }
  d=max(abs(d)-.01,p.y);                 // otwarta od góry: widać komory
  d+=.004*sin(a*26.+uTime*.5);           // żeberka
  return d*.6/sc;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(.4,2.4+uVar.y*.6,1.4);
  vec3 rd=camera(ro,vec3(-.1,0.,-.1),0.)*normalize(vec3(uv,1.5));
  float glow;float t=march(ro,rd,8.,glow);
  float emit=0.;
  if(t>0.){ vec3 p=ro+rd*t; emit=smoothstep(.9,1.,sin(length(p.xz)*14.-uBeats*PI))*(.3+.8*KICK); }
  fragColor=shade(ro,rd,t,8.,glow,emit);
}`,
  },
  {
    id: 'flower', name: 'Kwiat', layer: 'depth', mood: 'both',
    // Trzy okółki płatków rozwijają się przez 16 taktów i zamykają; stopa lekko szarpie płatkami.
    map: /* glsl */ `
float petals(vec3 p,float n,float len,float tilt,float off){
  float a=atan(p.z,p.x)+off,sec=TAU/n;
  a=mod(a+sec*.5,sec)-sec*.5;
  float r=length(p.xz);
  vec3 q=vec3(cos(a)*r,p.y,sin(a)*r);
  q.xy*=rot(tilt);
  q.x-=len*.5;
  return sdEll(q,vec3(len*.5,.03,len*.22));
}
float map(vec3 p){
  p.xz*=rot(uTime*.07);
  float open=.5+.5*sin(uBeats*PI/32.);    // rozwijanie i zamykanie co 16 taktów
  float tilt=mix(1.25,.1,open)+.08*KICK;
  float n=floor(5.+uVar.x*4.);
  float d=petals(p,n,1.3,-tilt,0.);
  d=min(d,petals(p-vec3(0.,.05,0.),n,1.,-tilt*1.15-.15,PI/n));
  d=min(d,petals(p-vec3(0.,.1,0.),n,.65,-tilt*1.3-.3,0.));
  d=min(d,length(p-vec3(0.,.12,0.))-.16-.04*BASS);
  return d*.8;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  float a=uTime*.08;
  vec3 ro=vec3(sin(a)*3.,2.1+uVar.y*.6,cos(a)*3.);
  vec3 rd=camera(ro,vec3(0.,.2,0.),0.)*normalize(vec3(uv,1.6));
  float glow;float t=march(ro,rd,10.,glow);
  float emit=0.;
  if(t>0.){ vec3 p=ro+rd*t; emit=smoothstep(.7,1.3,length(p.xz))*(.25+.8*KICK); }
  fragColor=shade(ro,rd,t,10.,glow,emit);
}`,
  },
  {
    id: 'spine', name: 'Kręgosłup', layer: 'depth', mood: 'drive',
    // Łańcuch kręgów wije się jak wąż; skręt i światło przebiegają wzdłuż w rytm.
    map: /* glsl */ `
float map(vec3 p){
  float x=p.x;
  vec2 c=vec2(sin(x*.7+uTime*.5)*.55,cos(x*.5+uTime*.35)*.35)*(.7+.4*BASS);
  vec3 q=vec3(x,p.y-c.x,p.z-c.y);
  float id=floor(q.x/.42+.5);
  q.x-=id*.42;
  q.yz*=rot(id*.18+sin(uBeats*PI*.5-id*.4)*.4);
  float disc=max(length(q.yz)-.15,abs(q.x)-.07)-.02;
  float ring=length(vec2(length(q.yz-vec2(.2,0.))-.07,q.x))-.03;
  vec3 qa=vec3(q.x,q.y,abs(q.z));
  float wing=sdSeg(qa,vec3(0.,0.,.12),vec3(0.,.08,.42),.035);
  float top=sdSeg(q,vec3(0.,.12,0.),vec3(-.06,.38,0.),.03);
  return smin(smin(disc,ring,.05),min(wing,top),.04)*.8;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(uTime*.45-1.3,.55,1.7);
  vec3 rd=camera(ro,ro+vec3(1.8,-.45,-1.7),.05*sin(uTime*.1))*normalize(vec3(uv,1.5));
  float glow;float t=march(ro,rd,10.,glow);
  float emit=0.;
  if(t>0.){ vec3 p=ro+rd*t; float id=floor(p.x/.42+.5); emit=smoothstep(.85,1.,fract(id*.125-uBeats*.25))*(.5+1.*KICK); }
  fragColor=shade(ro,rd,t,10.,glow,emit);
}`,
  },
  {
    id: 'villi', name: 'Kosmki', layer: 'depth', mood: 'calm',
    // Tunel z falujących wypustek (jak wnętrze jelita); końcówki lekko świecą.
    map: /* glsl */ `
float map(vec3 p){
  float r=length(p.xy),a=atan(p.y,p.x);
  float R=1.7;
  float wall=R-r;
  float n=20.,sec=TAU/n;
  float ia=floor(a/sec+.5);
  float zc=.32,iz=floor(p.z/zc+.5);
  vec3 q=vec3((a-ia*sec)*r,p.z-iz*zc,R-r);
  float h=hash(vec2(ia,iz));
  float len=.3+.35*h;
  q.xy+=vec2(sin(uTime*1.1+h*6.+iz*.3),cos(uTime*.8+h*4.))*.07*q.z*(1.+BASS);
  float v=sdSeg(q,vec3(0.),vec3(0.,0.,len),.05+.02*KICK);
  return min(wall,v)*.6;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(.25*sin(uTime*.2),.25*cos(uTime*.17),uTime*.7);
  vec3 rd=camera(ro,ro+vec3(0.,0.,2.),uTime*.04)*normalize(vec3(uv,1.15));
  float glow;float t=march(ro,rd,16.,glow);
  float emit=0.;
  if(t>0.){ vec3 p=ro+rd*t; emit=smoothstep(1.,1.4,1.7-length(p.xy)+.9)*(.2+.6*KICK); }
  fragColor=shade(ro,rd,t,16.,glow,emit);
}`,
  },
  {
    id: 'seeds', name: 'Nasiona', layer: 'depth', mood: 'both',
    // Chmura strąków wirujących w strumieniu powietrza; stopa je rozpycha.
    map: /* glsl */ `
float map(vec3 p){
  p.xy*=rot(p.z*.12+uTime*.08);
  vec3 c=vec3(1.4);
  vec3 id=floor(p/c+.5);
  vec3 q=p-id*c;
  vec3 h=vec3(hash(id.xy+id.z),hash(id.yz+3.),hash(id.zx+7.));
  q-=(h-.5)*.5*(1.+.6*KICK);
  q.xy*=rot(uTime*(h.x-.5)*2.+h.y*6.);
  q.yz*=rot(uTime*(h.y-.5)*1.5+h.z*6.);
  return sdEll(q,vec3(.11,.11,.3)*(.7+.6*h.z))*.7;
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(.7,.7,uTime*.5);
  vec3 rd=camera(ro,ro+vec3(sin(uTime*.06)*.4,cos(uTime*.05)*.3,2.),0.)*normalize(vec3(uv,1.3));
  float glow;float t=march(ro,rd,14.,glow);
  fragColor=shade(ro,rd,t,14.,glow,t>0.?.08+.4*KICK:0.);
}`,
  },
  {
    id: 'shoal', name: 'Ławica', layer: 'depth', mood: 'drive',
    // Ławica ryb płynie razem i wspólnie zmienia kierunek; ogony machają.
    map: /* glsl */ `
float map(vec3 p){
  float clear=1.4-length(p);             // wolna przestrzeń wokół kamery
  float hd=uTime*.12+.9*sin(uTime*.23);
  vec3 dir=normalize(vec3(sin(hd),.15*sin(uTime*.4),cos(hd)));
  p-=dir*uTime*.9;
  vec3 c=vec3(1.15);
  vec3 id=floor(p/c+.5);
  vec3 q=p-id*c;
  vec3 h=vec3(hash(id.xy+id.z*3.),hash(id.yz+5.),hash(id.zx+9.));
  q-=(h-.5)*.5;
  q.xz*=rot(hd);
  q.x+=sin(q.z*16.+uTime*9.+h.x*6.)*.02*(1.+KICK);
  float body=sdEll(q,vec3(.035,.06,.17));
  float tail=sdEll(q-vec3(0.,0.,-.19),vec3(.008,.055,.04)); // płetwa ogonowa
  return max(min(body,tail)*.7,clear);
}`,
    frag: /* glsl */ `
void main(){
  vec2 uv=cuv();
  vec3 ro=vec3(0.,0.,0.);
  vec3 rd=camera(ro,vec3(sin(uTime*.03),.1,cos(uTime*.03)),0.)*normalize(vec3(uv,1.3));
  float glow;float t=march(ro,rd,12.,glow);
  fragColor=shade(ro,rd,t,12.,glow,t>0.?.1+.3*KICK:0.);
}`,
  },

  // =====================================================================
  // TŁO
  // =====================================================================
  {
    id: 'julia', name: 'Julia', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(1.6-uVar.x*.4)*rot(uTime*.02);
  float a=uTime*.05+uVar.y*6.;
  vec2 c=vec2(-.8,.156)+.07*vec2(cos(a),sin(a*1.3));
  vec2 z=p;float n=0.;
  for(int k=0;k<64;k++){
    z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;
    if(dot(z,z)>16.) break;
    n+=1.;
  }
  vec3 col=uBg;
  if(n<63.){
    // Gładkie liczenie iteracji; pasma rozchodzą się od zbioru w rytm beatu.
    float sm=n-log2(log2(dot(z,z)))+4.;
    float bands=.5+.5*sin(sm*.35-uBeats*PI*.5);
    col=mix(uC2,uC1,bands)*pow(clamp(sm/48.,0.,1.),.7)*(1.+.4*BASS+.3*KICK);
  }
  col*=.5+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'fog', name: 'Mgła', layer: 'back', mood: 'calm',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(1.2+uVar.x);
  float t=uTime*.12;
  vec2 q=vec2(fbm(p+vec2(0,t)),fbm(p+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p+3.*q+vec2(1.7,9.2)+t*1.3),fbm(p+3.*q+vec2(8.3,2.8)-t));
  float f=fbm(p+(2.5+2.*uVar.y)*r);
  float lum=smoothstep(.35,.95,f);
  vec3 col=mix(uBg,uC2,smoothstep(.2,.8,f));
  col=mix(col,uC1,lum*lum*(.4+.9*BASS+.6*KICK));
  col*=.55+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'glow', name: 'Poświata', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  vec2 d=p-vec2(sin(uTime*.05)*.3+(uVar.y-.5)*.8,.75);
  float r=length(d);
  vec2 dir=d/max(r,1e-3);
  float beams=noise(dir*(5.+uVar.x*8.)+vec2(uTime*.1,0.))*noise(dir*14.-vec2(0.,uTime*.08));
  beams=smoothstep(.1,.6,beams);
  vec3 col=mix(uC2,uC1,beams*.6)*beams*exp(-r*.9)*(.6+.6*BASS);
  col+=uC1*exp(-r*r*6.)*.15;
  col+=uC2*.08*fbm(p*2.+uTime*.05);
  col*=.6+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'horizon', name: 'Horyzont', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  float y=p.y+(uVar.x-.5)*.3;
  float h=exp(-abs(y)*(3.+uVar.y*6.));
  float n=fbm(vec2(p.x*1.5+uTime*.05,y*4.));
  vec3 col=mix(uBg,uC2,h)*(.6+.8*n);
  col+=uC1*exp(-abs(y)*40.)*(.25+.6*BASS+.5*KICK);
  col*=.6+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'moire', name: 'Moiré', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*rot(uTime*.03);
  float t=uTime*.2;
  vec2 o=vec2(sin(t*.7),cos(t*.53))*(.06+.22*uVar.x);
  float f=(30.+uVar.y*60.)*(1.+.03*BASS);
  float a=sin(length(p-o)*f-uBeats*PI*.5);
  float b=sin(length(p+o)*f+uTime*.7);
  float s1=smoothstep(-.35,.35,a),s2=smoothstep(-.35,.35,b);
  float m=abs(s1-s2);
  float v=smoothstep(1.1,.15,length(p));
  vec3 col=(uC1*m*(.45+.45*uInt+.6*KICK)+uC2*s1*s2*.25)*v;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'strata', name: 'Strata', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  float cols=60.+uVar.x*120.;
  float x=floor((p.x+2.)*cols);
  float h=hash(vec2(x,floor(uVar.y*10.)));
  float y=p.y*(1.+h*3.)+uTime*(.2+h*1.5)*(h>.5?1.:-1.);
  float seg=noise(vec2(x*.37,y*2.));
  float on=smoothstep(.55-.2*BASS,.75,seg);
  float line=1.-smoothstep(.2,.45,abs(fract((p.x+2.)*cols)-.5));
  vec3 col=mix(uC2,uC1,h)*on*line*(.35+.4*uInt+.8*KICK*step(.8,h));
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'lines', name: 'Skaner', layer: 'back', mood: 'drive',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  p*=rot(floor(uVar.x*4.)*PI*.25);
  float n=12.+uVar.y*40.;
  float w=sin(p.x*2.5+uTime*.6)*.08*uVar.z+sin(p.x*9.-uTime*1.7)*.015*(.3+uMid*uReact);
  float y=(p.y+w)*n+uBeats*.5;
  float l=band(abs(fract(y)-.5),.04+.18*KICK);
  float sweep=exp(-pow((p.y-(fract(uBeats*.25)*1.4-.7))*6.,2.));
  vec3 col=uC1*l*(.3+.65*sweep+.3*KICK)+uC2*sweep*.15;
  col+=uC1*l*hash(floor(gl_FragCoord.xy/2.)+floor(uTime*30.))*uHigh*uReact*.4;
  col*=.5+.6*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'void', name: 'Pustka', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  vec2 o=(uVar.xy-.5)*vec2(.8,.4);
  vec3 col=uBg+uC2*.06*exp(-dot(p-o,p-o)*(1.+uVar.z*4.))*(1.+BASS);
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'dust', name: 'Pył', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  vec3 col=vec3(0.);
  for(int i=0;i<4;i++){
    float fi=float(i);
    vec2 q=p*(6.+fi*5.)*(.6+uVar.z*.9)+vec2(uTime*(.08+fi*.05)*(uVar.x-.3),uTime*.03*fi)+fi*13.;
    vec2 id=floor(q),f=fract(q)-.5;
    float h=hash(id+fi);
    vec2 o=vec2(hash(id+3.1),hash(id+7.7))-.5;
    float r=(.03+.05*uVar.w)/(1.+fi*.8)*(1.+2.*KICK*step(.92,h));
    float star=(1.-smoothstep(0.,r,length(f-o*.7)))*step(.45+.3*uVar.y,h);
    col+=mix(uC2,uC1,h)*star*(1.2-fi*.2);
  }
  col*=.7+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'aurora', name: 'Zorza', layer: 'back', mood: 'calm',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  vec3 col=vec3(0.);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float x=p.x*(1.2+fi*.4)+fi*3.;
    float y=p.y-(.05+fi*.12-uVar.x*.2)-(.08+.14*uVar.y)*sin(x*1.3+uTime*.2+fi)-.08*sin(x*3.1-uTime*.3);
    float c=y>0.?exp(-y*5.):exp(y*40.);
    float streak=.4+.6*noise(vec2(x*9.,uTime*.3+fi));
    col+=mix(uC1,uC2,fi*.5)*c*streak*(.3+.35*BASS);
  }
  col*=.6+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'raster', name: 'Raster', layer: 'back', mood: 'drive',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  float n=40.+uVar.x*40.;
  vec2 g=p*n,id=floor(g),f=fract(g)-.5;
  float v=smoothstep(.3,.8,fbm(id/n*(1.+uVar.y*3.)+vec2(uTime*.05,0.)));
  float w=exp(-pow(length(id/n)-fract(uBeats*.25)*1.5,2.)*30.);
  float r=(v*.45+w*.3*(.5+KICK))*.5;
  float dotv=1.-smoothstep(r-.05,r+.05,length(f));
  vec3 col=mix(uC2,uC1,w)*dotv*(.45+.5*uInt);
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'contours', name: 'Izolinie', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(1.5+uVar.x);
  float h=fbm(p+vec2(uTime*.04,-uTime*.03))+.1*BASS*sin(length(p)*6.-uBeats*PI*.5);
  float n=14.+uVar.y*14.;
  float l=band(abs(fract(h*n)-.5),.06);
  vec3 col=mix(uC2,uC1,smoothstep(.3,.8,h))*l*(.4+.5*uInt+.3*KICK);
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'cells', name: 'Komórki', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(3.+uVar.x*3.);
  vec2 i=floor(p),f=fract(p);
  float d1=8.,d2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y);
    vec2 h=vec2(hash(i+g),hash(i+g+17.3));
    vec2 o=.5+.4*sin(uTime*.3+TAU*h);
    float d=length(g+o-f);
    if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d;
  }
  float wall=1.-smoothstep(0.,.04+.08*uVar.y+.05*BASS,d2-d1);
  float nucleus=1.-smoothstep(0.,.12+.06*KICK,d1);
  vec3 col=uC2*wall*.8+uC1*nucleus*.5+uC2*.12*(1.-d1);
  col*=.5+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'turing', name: 'Turing', layer: 'back', mood: 'both',
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(2.+uVar.x*2.);
  vec2 w=vec2(fbm(p*.8+uTime*.03),fbm(p*.8+vec2(5.,3.)-uTime*.03));
  float f=sin((p.x+w.x*2.5)*(8.+uVar.y*6.)+sin((p.y+w.y*2.5)*6.)*2.+uTime*.2);
  float s=smoothstep(-.2,.2,f);
  vec3 col=mix(uBg,mix(uC2,uC1,w.x),s)*(.4+.4*uInt)*(1.+.3*BASS+.2*KICK);
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'veins', name: 'Żyły', layer: 'back', mood: 'calm',
    // Sieć naczyń (grzbiety szumu), przez którą od "serca" płynie puls — ostre czoło, wygasający ogon.
    // uVar: x = skala, y = ostrość naczyń, z = puls co 2 beaty / co beat, w = położenie serca (serce powoli wędruje).
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(1.5+uVar.x);
  vec2 q=p+.3*vec2(fbm(p+uTime*.05),fbm(p-uTime*.04));
  float v=0.,a=.5;vec2 pp=q*2.;
  for(int i=0;i<4;i++){
    v+=a*pow(1.-abs(noise(pp)*2.-1.),3.+uVar.y*6.); // "grzbiety" szumu = sieć naczyń
    pp=rot(.6)*pp*2.1+3.1;a*=.5;
  }
  // Puls płynie naczyniami: "czas dotarcia" = odległość od serca, zakrzywiona tak jak naczynia.
  // serce powoli wędruje po ekranie
  vec2 heart=(uVar.w-.5)*vec2(.8,.4)+vec2(sin(uTime*.031)*.55,sin(uTime*.023+1.3)*.32);
  float T=length(q-heart)*1.6+.3*fbm(q*3.);
  float rate=uVar.z<.5?.5:1.;            // puls co 2 beaty albo co beat
  float pulse=0.;
  for(int k=0;k<3;k++){
    float age=fract(uBeats*rate)+float(k); // ile pulsów temu wyszedł z serca
    float d=T-age*1.3/rate*.5;              // >0: przed czołem fali, <0: za nim
    float wave=d>0.?exp(-d*d*180.):exp(d*4.); // ostre czoło, wygasający ogon
    pulse+=wave*exp(-age*.8)*(k==0?1.+1.2*KICK:1.);
  }
  vec3 col=uC2*v*.3;                                   // spokojne, stałe naczynia
  col+=mix(uC2,uC1,.75)*v*pulse*1.6;                   // fala w naczyniach
  col+=uC1*pow(v,3.)*pulse*1.4;                        // jasny rdzeń grubszych naczyń
  col*=.55+.5*uInt;
  fragColor=vec4(col,1.);
}`,
  },
  {
    id: 'pond', name: 'Tafla', layer: 'back', mood: 'calm',
    // Spokojna, ciemna woda: co beat w losowym miejscu spada kropla (stopa = mocniejsza),
    // powolna fala powierzchni rośnie z basem, tafla odbija "niebo" w kolorach palety.
    // uVar: x = krople co beat / co 2 beaty, y = siła fali, z = szybkość kręgów, w = kierunek światła.
    frag: /* glsl */ `
float pondH(vec2 p){
  float h=(sin(p.x*2.6+uTime*.35)*sin(p.y*2.1-uTime*.28)+.5*sin((p.x+p.y)*4.3-uTime*.5))
          *(.15+.25*uVar.y)*(.5+BASS);    // powolna fala powierzchni
  float rate=uVar.x<.5?1.:.5;               // krople co beat albo co 2 beaty
  float b=uBeats*rate;
  float spd=.18+.14*uVar.z;
  for(int k=0;k<5;k++){
    float n=floor(b)-float(k);            // numer kropli
    float age=fract(b)+float(k);
    vec2 pos=(vec2(hash(vec2(n,3.1)),hash(vec2(n,7.7)))-.5)*vec2(1.6,.9);
    float d=length(p-pos)-age*spd/rate;
    float amp=exp(-age*1.1)*(k==0?.7+.8*KICK:.7);
    h+=sin(d*48.)*exp(-d*d*120.)*amp;
  }
  return h;
}
void main(){
  vec2 p=cuv();
  const float e=.0015;
  float h=pondH(p),hx=pondH(p+vec2(e,0.)),hy=pondH(p+vec2(0.,e));
  vec3 n=normalize(vec3((h-hx)/e*.012,(h-hy)/e*.012,1.));
  float la=uVar.w*TAU;
  vec3 l=normalize(vec3(cos(la)*.5,sin(la)*.5,.75));
  float spec=pow(max(dot(reflect(-l,n),vec3(0.,0.,1.)),0.),48.);
  // odbicie "nieba": nachylenie powierzchni przesuwa po gradiencie palety
  float sky=clamp(.45+n.y*4.+n.x*1.5+p.y*.5,0.,1.);
  vec3 col=mix(uBg,mix(uC2,uC1,.3)*.75,sky*sky)+uC1*spec*(.6+.5*uInt);
  col*=1.-.5*smoothstep(.35,1.15,length(p));
  fragColor=vec4(col,1.);
}`,
  },
  // ---- tła organiczne (druga seria) ----
  {
    id: 'plankton', name: 'Bioluminescencja', layer: 'back', mood: 'calm',
    // Drobny plankton dryfuje w ciemnej wodzie; fala rozbłysku przechodzi od środka co 2 beaty.
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  vec3 col=uBg;
  float ph=fract(uBeats*.5);
  float R=ph*1.7;
  for(int i=0;i<3;i++){
    float fi=float(i);
    float sc=9.+fi*7.;
    vec2 drift=vec2(uTime*.04*(fi+1.),sin(uTime*.1+fi)*.4);
    vec2 q=p*sc+drift+fi*17.;
    vec2 id=floor(q),f=fract(q)-.5;
    float h=hash(id+fi*3.);
    vec2 o=vec2(hash(id+11.),hash(id+23.))-.5;
    vec2 cp=(id+.5+o*.6-drift-fi*17.)/sc;        // położenie drobinki na ekranie
    float wave=exp(-pow(length(cp)-R,2.)*50.)*(1.-ph);
    float dd=length(f-o*.6);
    float on=step(.55,h);
    float b=.12+.1*sin(uTime*(.6+h)+h*30.)+wave*(1.2+KICK);
    col+=mix(uC2,uC1,clamp(b,0.,1.))*on*((1.-smoothstep(0.,.06+.05*wave,dd))*b+(1.-smoothstep(0.,.4,dd))*b*.12);
  }
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'ink', name: 'Atrament', layer: 'back', mood: 'calm',
    // Tusz rozlewa się w wodzie miękkimi, wijącymi się smugami; brzegi smug lekko świecą.
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(1.+uVar.x);
  float t=uTime*.05;
  vec2 q=p+vec2(fbm(p*1.5+t),fbm(p*1.5-t+4.));
  vec2 r=p+1.2*vec2(fbm(q*2.+vec2(1.7,9.2)+t*1.5),fbm(q*2.+vec2(8.3,2.8)-t));
  float f=fbm(r*1.8);
  float ink=smoothstep(.45,.62,f);
  float edge=ink*(1.-smoothstep(.62,.82,f));
  vec3 col=mix(uBg,uC2*.55,ink)+uC1*edge*(.22+.45*BASS);
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'incense', name: 'Dym kadzidła', layer: 'back', mood: 'calm',
    // Cienkie smugi dymu unoszą się od dołu, wiją i rozwiewają.
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  vec3 col=vec3(0.);
  for(int i=0;i<4;i++){
    float fi=float(i);
    float x0=(fi-1.5)*.38+(uVar.x-.5)*.3;
    float y=p.y+.55;                                  // 0 przy dole ekranu
    float wob=fbm(vec2(y*1.4-uTime*.22,fi*3.1))-.5;
    float x=x0+wob*(.12+.7*y)+sin(y*3.-uTime*.5+fi)*.05*y;
    float w=.004+.05*y*y;
    float sm=exp(-abs(p.x-x)/w)*smoothstep(-.05,.15,y)*(1.-smoothstep(.85,1.4,y));
    sm*=.45+.55*fbm(vec2(p.x*6.,y*4.-uTime*.35)+fi);
    col+=mix(uC1,uC2,clamp(y*.8,0.,1.))*sm*(.3+.25*BASS);
  }
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'dunes', name: 'Wydmy', layer: 'back', mood: 'calm',
    // Zmarszczki piasku na wydmach, oświetlone nisko z boku; wiatr powoli je przesuwa.
    frag: /* glsl */ `
float dune(vec2 p){
  return fbm(p*vec2(.7,1.4)+vec2(uTime*.015,0.))*1.1
        +.05*sin((p.y*1.1+fbm(p*2.)*.7)*(26.+uVar.x*14.)+p.x*2.5+uTime*.2);
}
void main(){
  vec2 p=cuv()*1.4;
  const float e=.004;
  float h=dune(p),hx=dune(p+vec2(e,0.)),hy=dune(p+vec2(0.,e));
  vec3 n=normalize(vec3((h-hx)/e*.12,(h-hy)/e*.12,1.));
  vec3 l=normalize(vec3(-.85,.35,.4));
  float dif=max(dot(n,l),0.);
  vec3 col=mix(uBg,mix(uC2,uC1,.2)*.7,smoothstep(.1,1.2,h))+uC1*pow(dif,2.)*.55*(.7+.4*BASS);
  col*=1.-.4*smoothstep(.5,1.4,length(p));
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'woodgrain', name: 'Słoje', layer: 'back', mood: 'calm',
    // Słoje drewna — falujące linie powoli płyną.
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  vec2 q=p*vec2(1.,.22)+.22*vec2(fbm(p*1.4+uTime*.03),fbm(p*1.4-uTime*.02));
  float r=length(q-vec2(.25+uVar.x*.3,0.));
  float g=sin(r*(38.+uVar.y*20.)+fbm(p*6.)*3.-uTime*.35);
  float line=smoothstep(.7,1.,g);
  vec3 col=mix(uBg,uC2*.45,.5+.5*g)+uC1*line*.22*(.6+.6*BASS);
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'leaf', name: 'Liść', layer: 'back', mood: 'both',
    // Liść z żyłkami (główna, boczne, siateczka); od ogonka do czubka przepływa puls.
    frag: /* glsl */ `
float vor(vec2 p){
  vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y),o=vec2(hash(i+g),hash(i+g+5.3));
    float d=length(g+o-f);
    if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d;
  }
  return d2-d1;
}
void main(){
  vec2 p=cuv()*1.25*rot(-.35+sin(uTime*.05)*.1);
  float inside=(p.x+1.)*(1.-p.x)*.42-abs(p.y);              // kształt liścia (>0 wewnątrz)
  float mid=1.-smoothstep(0.,.008*(1.1-p.x),abs(p.y));
  float sx=p.x-abs(p.y)*1.3,id=floor(sx/.17+.5);
  float side=1.-smoothstep(0.,.005*(1.-abs(p.y)*2.),abs(sx-id*.17));
  float net=1.-smoothstep(0.,.03,vor(p*14.));
  float veins=max(mid,side)+net*.35;
  float T=(p.x+1.)*.55+abs(p.y)*.9;                        // czas dotarcia pulsu od ogonka
  float ph=fract(uBeats*.25);
  float pulse=exp(-pow(T-ph*1.4,2.)*70.)*(1.+KICK);
  float m=smoothstep(0.,.02,inside);
  vec3 col=uBg+m*(uC2*.14+veins*(uC2*.35+uC1*pulse));
  col+=uC1*(1.-smoothstep(0.,.01,abs(inside)))*.25;        // obrys
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'scales', name: 'Łuska', layer: 'back', mood: 'drive',
    // Łuski węża / ryby; połysk przesuwa się po nich w rytm.
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(5.+uVar.x*4.);
  p.y+=uTime*.12;
  vec2 id=floor(p);
  if(mod(id.y,2.)>.5) p.x+=.5;
  id=floor(p);
  vec2 f=fract(p);
  // łuski zachodzą na siebie jak dachówki: łuski z rzędu wyżej przykrywają bieżącą
  float du=min(length(f-vec2(0.,1.)),length(f-vec2(1.,1.)));
  float d=du<.72?du:length(f-vec2(.5,0.));
  d/=.72;
  float body=1.-smoothstep(.97,1.,d);
  float rim=(1.-smoothstep(.0,.06,abs(d-.95)));
  float sheen=pow(.5+.5*sin(p.x*.6+p.y*.4-uBeats*PI*.5),6.);
  vec3 col=uC2*(.12+.35*(1.-d))*body+uC1*rim*.3+uC1*sheen*(1.-d)*body*(.35+.5*KICK);
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'mitosis', name: 'Mitoza', layer: 'back', mood: 'calm',
    // Komórki pod mikroskopem powoli się dzielą (rozciągają i rozpadają na dwie).
    frag: /* glsl */ `
void main(){
  vec2 p=cuv()*(2.6+uVar.x*1.5)+vec2(uTime*.03,0.);
  vec2 i=floor(p);
  float field=9.,nuc=0.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=i+vec2(x,y);
    float h=hash(g);
    vec2 c=g+.5+(vec2(hash(g+3.1),hash(g+7.3))-.5)*.4;
    float ph=fract(uTime*.04+h);                 // faza podziału
    float sep=smoothstep(.45,1.,ph)*.28;
    vec2 ax=vec2(cos(h*6.28),sin(h*6.28));
    float r=.3-.06*smoothstep(.45,1.,ph);
    float d=smin(length(p-c-ax*sep)-r,length(p-c+ax*sep)-r,.15);
    field=min(field,d);
    nuc+=1.-smoothstep(0.,.09,min(length(p-c-ax*sep*1.3),length(p-c+ax*sep*1.3)));
  }
  float mem=1.-smoothstep(0.,.025,abs(field));
  float cell=1.-smoothstep(-.02,0.,field);
  vec3 col=uBg+uC2*cell*.18+uC1*mem*(.35+.3*BASS)+uC2*nuc*.45;
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
  {
    id: 'roots', name: 'Korzenie', layer: 'back', mood: 'both',
    // Kłącza rozrastają się od dołu ekranu przez frazę (16 taktów), potem zaczynają od nowa.
    frag: /* glsl */ `
void main(){
  vec2 p=cuv();
  float grow=smoothstep(0.,.9,fract(uBeats/64.))*1.3;   // jak wysoko sięgają korzenie
  vec3 col=vec3(0.);
  for(int i=0;i<7;i++){
    float fi=float(i);
    float y=p.y+.55;                            // 0 przy dole
    float x0=(fi-3.)*.27+(hash(vec2(fi,1.))-.5)*.15;
    float x=x0+(fbm(vec2(y*1.8,fi*2.3))-.5)*.5*y;
    float w=.012*(1.-y/1.4);
    float d=abs(p.x-x);
    float on=step(y,grow*(.7+.3*hash(vec2(fi,4.))));
    float root=(1.-smoothstep(w*.5,w+.003,d))*on*step(0.,y);
    // odgałęzienie
    float bx=x+(y-.3-fi*.03)*.6*(hash(vec2(fi,8.))-.5)*2.;
    float br=(1.-smoothstep(.002,.008,abs(p.x-bx)))*step(.3+fi*.03,y)*on*.7;
    float tip=exp(-pow(y-grow*(.7+.3*hash(vec2(fi,4.))),2.)*400.)*exp(-d*d*2000.);
    col+=uC2*(root+br)*.6+uC1*tip*(.8+KICK);
  }
  fragColor=vec4(col*(.6+.5*uInt),1.);
}`,
  },
];

export const DEPTH = SCENES.filter((s) => s.layer === 'depth');
export const BACK = SCENES.filter((s) => s.layer === 'back');

export const sceneSource = (sc) => COMMON + (sc.map ? sc.map + RAYMARCH : '') + sc.frag;
