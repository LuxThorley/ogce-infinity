// Strata: Lux Genesis (OGCE v9.0) HD shader library (WebGL1 / GLSL ES 1.00, no libraries).
// OUTMODE 0 = direct to screen (tone-map + gamma in-shader, Low tier)
// OUTMODE 1 = linear HDR into a half-float target; OUTMODE 2 = Reinhard-encoded HDR into an RGBA8 target.
export const OUT = `
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec4 outCol(vec3 c, float a){
#if OUTMODE == 0
  return vec4(pow(aces(c*uExposure), vec3(1.0/2.2)), a);
#elif OUTMODE == 1
  return vec4(c, a);
#else
  c = max(c, 0.0); return vec4(c/(1.0+c), a);
#endif
}`;
const SWAY = `float ph = uTime*1.6 + w.x*0.35 + w.z*0.27;
  w.x += sin(ph)*aSway*uWind*0.12 + sin(uTime*7.0+w.z*3.0)*aSway*uWind*0.012; w.z += cos(ph*0.8)*aSway*uWind*0.07;`;

export const LIT_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aSway;
uniform mat4 uVP, uModel, uLightVP0, uLightVP1; uniform float uTime, uWind;
varying vec3 vNor, vCol, vWorld; varying vec4 vL0, vL1; varying float vSway;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  ${SWAY}
  vWorld = w.xyz; vNor = normalize(mat3(uModel) * aNor); vCol = aCol; vSway = aSway;
  vec4 wo = w + vec4(vNor*0.045, 0.0);           // normal-offset shadow bias
  vL0 = uLightVP0 * wo; vL1 = uLightVP1 * wo;
  gl_Position = uVP * w;
}`;
export const LIT_FS = `
precision PREC float;
varying vec3 vNor, vCol, vWorld; varying vec4 vL0, vL1; varying float vSway;
uniform vec3 uSunDir, uSunCol, uSkyAmb, uGroundAmb, uFogCol, uHazeCol, uCam, uTint;
uniform float uFog, uEmissive, uAlpha, uShadowOn, uTime, uRough, uMetal, uExposure, uClipY, uWaterY, uSnow, uAutumn, uCascades, uSeasonOK;
uniform vec2 uTexel; uniform int uTaps;
uniform sampler2D uShadow, uDetail; uniform float uDetailOn, uFogH;
${OUT}
float unpack(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float pcf(vec2 uv, float z, float lo, float hi, float radius){
  float s = 0.0, n = 0.0, rot = ign(gl_FragCoord.xy)*6.2831;
  for (int i = 0; i < 16; i++) {
    if (i >= uTaps) break;
    float fi = float(i), r = sqrt((fi+0.5)/float(uTaps)) * radius, a = fi*2.39996 + rot;
    vec2 o = vec2(cos(a), sin(a)) * r * uTexel;
    vec2 q = vec2(clamp(uv.x + o.x, lo, hi), uv.y + o.y);
    s += z - 0.0018 > unpack(texture2D(uShadow, q)) ? 0.0 : 1.0; n += 1.0;
  }
  return s / max(n, 1.0);
}
float shadow(){
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = vL0.xyz / vL0.w * 0.5 + 0.5;
  float c = 0.0;
  if (uCascades > 1.5 && (p.x < 0.03 || p.x > 0.97 || p.y < 0.03 || p.y > 0.97 || p.z > 0.999)) { p = vL1.xyz / vL1.w * 0.5 + 0.5; c = 1.0; }
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float w = uCascades > 1.5 ? 0.5 : 1.0;
  vec2 uv = vec2((p.x + c) * w, p.y);
  float s = pcf(uv, p.z, c*w + uTexel.x, (c+1.0)*w - uTexel.x, c > 0.5 ? 1.2 : 2.2);
  vec2 e = smoothstep(0.0, 0.06, p.xy) * smoothstep(1.0, 0.94, p.xy);
  return mix(1.0, s, e.x*e.y);
}
// GGX / Smith / Schlick (physically based-ish)
float D_GGX(float nh, float a){ float a2 = a*a; float d = nh*nh*(a2-1.0)+1.0; return a2/(3.14159*d*d); }
float V_Smith(float nv, float nl, float a){ float k = a*0.5; return 0.25/((nv*(1.0-k)+k)*(nl*(1.0-k)+k)); }
void main(){
  if (vWorld.y < uClipY) discard;
  vec3 n = normalize(vNor); if(!gl_FrontFacing) n = -n;
  vec3 albedo = pow(vCol * uTint, vec3(2.2));
  float dRough = 0.0;
  if (uDetailOn > 0.5) { // procedural PBR detail: noise albedo, normal and roughness maps, triplanar-projected in world space
    vec3 bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    float sc = 0.55;
    vec4 tx = texture2D(uDetail, vWorld.zy * sc), ty = texture2D(uDetail, vWorld.xz * sc), tz = texture2D(uDetail, vWorld.xy * sc);
    vec4 tf = texture2D(uDetail, vWorld.xz * sc * 0.13);
    vec4 D = tx * bw.x + ty * bw.y + tz * bw.z;
    float fade = 1.0 - smoothstep(18.0, 45.0, length(uCam - vWorld));
    albedo *= mix(1.0, mix(0.78, 1.22, D.r) * mix(0.9, 1.1, tf.r), fade * 0.9);
    vec2 nx = (tx.gb * 2.0 - 1.0), ny = (ty.gb * 2.0 - 1.0), nz = (tz.gb * 2.0 - 1.0);
    vec3 pert = vec3(0.0, nx.y, nx.x) * bw.x + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z;
    n = normalize(n + pert * 0.55 * fade);
    dRough = (D.a - 0.5) * 0.4 * fade;
  }
  // seasons: autumn turns swaying foliage gold, winter dusts upward faces with snow
  float leafy = smoothstep(0.25, 0.6, vSway) * uSeasonOK;
  albedo = mix(albedo, albedo.grb * vec3(1.6, 0.75, 0.35) + vec3(0.06, 0.02, 0.0), uAutumn * leafy);
  float snow = uSnow * uSeasonOK * smoothstep(0.55, 0.9, n.y) * step(uWaterY + 0.3, vWorld.y) * (0.75 + 0.25*sin(vWorld.x*3.1+vWorld.z*2.3));
  albedo = mix(albedo, vec3(0.92, 0.95, 1.0), clamp(snow, 0.0, 1.0));
  float rough = clamp(mix(uRough, 0.55, snow) + dRough, 0.04, 1.0);
  vec3 v = normalize(uCam - vWorld), l = uSunDir, h = normalize(l + v);
  float nl = max(dot(n, l), 0.0), nv = max(dot(n, v), 1e-3), nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0);
  float sh = shadow();
  vec3 F0 = mix(vec3(0.04), albedo, uMetal);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - vh, 5.0);
  float a = max(rough*rough, 0.02);
  vec3 spec = D_GGX(nh, a) * V_Smith(nv, nl, a) * F;
  vec3 kd = (1.0 - F) * (1.0 - uMetal);
  vec3 amb = mix(uGroundAmb, uSkyAmb, n.y*0.5+0.5);
  float rim = pow(1.0 - nv, 4.0) * 0.25 * (1.0 - rough*0.5);
  vec3 col = (kd * albedo / 3.14159 + spec) * uSunCol * 3.14159 * nl * sh
           + albedo * amb * (1.0 - uMetal*0.6) + F0 * amb * uMetal * 0.8
           + rim * uSkyAmb * 0.5 + albedo * uEmissive * 1.6;
  // translucent foliage glow when backlit
  col += albedo * uSunCol * leafy * pow(max(dot(-v, l), 0.0), 6.0) * 0.6 * sh;
  // caustics on the sea and pond floor
  float under = uWaterY - vWorld.y;
  if (under > 0.0) {
    vec2 p = vWorld.xz*1.7; float c = sin(p.x + uTime*1.3 + sin(p.y*1.3 + uTime)) * sin(p.y*1.1 - uTime*1.1 + sin(p.x*0.9));
    col *= mix(vec3(1.0), vec3(0.45, 0.75, 0.85), clamp(under*1.2, 0.0, 1.0));
    col += uSunCol * pow(abs(c), 6.0) * 0.5 * exp(-under*1.5) * nl;
  }
  // aerial perspective: distance + height fog, tinted towards the sun
  float d = length(uCam - vWorld);
  float f = 1.0 - exp(-pow(d * uFog, 1.6));
  f *= mix(1.0, 0.55, clamp((vWorld.y - uWaterY) * 0.06, 0.0, 1.0));
  // volumetric-style ground fog: analytic integral of exponential height density along the view ray
  float hy = max(vWorld.y - uWaterY, 0.0), cy = max(uCam.y - uWaterY, 0.0);
  float hf = uFogH * d * exp(-0.35 * min(hy, cy)) * (abs(cy - hy) > 0.01 ? (1.0 - exp(-0.35 * abs(cy - hy))) / (0.35 * abs(cy - hy)) : 1.0);
  f = max(f, 1.0 - exp(-hf));
  vec3 fogc = mix(uFogCol, uHazeCol, pow(max(dot(-v, l), 0.0), 6.0));
  col = mix(col, fogc, clamp(f, 0.0, 1.0));
  gl_FragColor = outCol(col, uAlpha);
}`;
export const GRASS_VS = `
attribute vec3 aPos; attribute vec4 aInst; attribute vec2 aInst2;
uniform mat4 uVP; uniform float uTime, uWind, uFar; uniform vec3 uCam;
varying vec3 vWorld, vCol; varying float vH, vFade; varying vec2 vUv;
void main(){
  float s = aInst.w, r = aInst2.x, cr = cos(r), sr = sin(r);
  vec3 lp = vec3(aPos.x * cr - aPos.z * sr, aPos.y, aPos.x * sr + aPos.z * cr) * vec3(s, s * (0.8 + aInst2.y * 0.6), s);
  vec3 w = aInst.xyz + lp;
  float bend = aPos.y * aPos.y, ph = uTime * 1.9 + aInst.x * 0.31 + aInst.z * 0.23;
  w.x += (sin(ph) * 0.18 + sin(ph * 2.7) * 0.05) * uWind * bend * s; w.z += cos(ph * 0.8) * 0.12 * uWind * bend * s;
  float d = length(uCam.xz - aInst.xz); vFade = 1.0 - smoothstep(uFar * 0.7, uFar, d);
  w.y -= (1.0 - vFade) * 0.6 * s;  // sink into the ground at the LOD edge instead of popping
  vWorld = w; vH = aPos.y; vUv = vec2(aPos.x + aPos.z + 0.5, aPos.y);
  vCol = mix(vec3(0.16, 0.32, 0.08), vec3(0.42, 0.62, 0.16), aInst2.y);
  gl_Position = uVP * vec4(w, 1.0);
}`;
export const GRASS_FS = `
precision PREC float;
varying vec3 vWorld, vCol; varying float vH, vFade; varying vec2 vUv;
uniform vec3 uSunDir, uSunCol, uSkyAmb, uGroundAmb, uFogCol, uCam; uniform float uFog, uExposure, uCard, uAutumn, uSnow;
${OUT}
void main(){
  if (uCard > 0.5) { // impostor tuft: a card cut into 7 tapering blades of varying height
    float k = floor(vUv.x * 7.0), bl = 1.0 - abs(fract(vUv.x * 7.0) - 0.5) * 2.0, ht = 0.55 + 0.45 * fract(sin(k * 12.9898) * 43758.5453);
    if (vH > ht * bl || vUv.x < 0.0 || vUv.x > 1.0 || vFade < 0.02) discard; }
  vec3 albedo = pow(vCol, vec3(2.2)) * mix(0.55, 1.15, vH);
  albedo = mix(albedo, albedo.grb * vec3(1.5, 0.8, 0.35), uAutumn * 0.8); albedo = mix(albedo, vec3(0.85, 0.9, 0.95), uSnow * 0.6 * vH);
  vec3 v = normalize(uCam - vWorld);
  float wrap = max(dot(vec3(0.0, 1.0, 0.0), uSunDir) * 0.6 + 0.4, 0.0);
  float trans = pow(max(dot(-v, uSunDir), 0.0), 4.0) * vH;
  vec3 col = albedo * (uSunCol * (wrap * 0.8 + trans * 0.9) + mix(uGroundAmb, uSkyAmb, vH) * mix(0.45, 1.0, vH));
  float d = length(uCam - vWorld), f = 1.0 - exp(-pow(d * uFog, 1.6));
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  gl_FragColor = outCol(col, 1.0);
}`;
export const DEPTH_VS = `
attribute vec3 aPos; attribute float aSway; uniform mat4 uLightVP, uModel; uniform float uTime, uWind; varying float vZ;
void main(){ vec4 w = uModel * vec4(aPos,1.0); ${SWAY}
  vec4 p = uLightVP * w; vZ = p.z / p.w * 0.5 + 0.5; gl_Position = p; }`;
export const DEPTH_FS = `
precision PREC float; varying float vZ;
vec4 pack(float d){ vec4 e = vec4(1.0, 255.0, 65025.0, 16581375.0) * d; e = fract(e); e -= e.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0); return e; }
void main(){ gl_FragColor = pack(clamp(vZ, 0.0, 0.9999)); }`;

export const SKY_VS = `attribute vec2 aPos; varying vec2 vP; void main(){ vP = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
export const SKY_FS = `
precision PREC float; varying vec2 vP;
uniform mat4 uInvVP; uniform vec3 uCam, uSunDir, uZenith, uHorizon, uSunCol; uniform float uTime, uDay, uCloud, uExposure, uAurora, uMeteors, uLux;
${OUT}
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+7.1; a*=0.5; } return s; }
void main(){
  vec4 w = uInvVP * vec4(vP, 1.0, 1.0); vec3 dir = normalize(w.xyz / w.w - uCam);
  float y = dir.y, mu = dot(dir, uSunDir);
  // single-scattering approximation: Rayleigh (1+mu^2) and Henyey-Greenstein Mie (g = 0.76)
  float rayleigh = 0.75 * (1.0 + mu*mu);
  float g = 0.76, mie = (1.0-g*g) / pow(1.0 + g*g - 2.0*g*mu, 1.5) * 0.08;
  float optical = 1.0 / (max(y, 0.0) + 0.06);
  vec3 extinction = exp(-vec3(0.06, 0.11, 0.24) * optical * (1.0 - uDay*0.55));
  vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.5)) * rayleigh;
  col = mix(col, col * extinction + uHorizon * (1.0 - extinction) * 0.35, 0.5);
  float sunUp = smoothstep(-0.08, 0.06, uSunDir.y);
  col += uSunCol * mie * sunUp * (0.6 + 0.4*uDay);
  if (y < 0.0) col = mix(uHorizon, uHorizon*0.7, clamp(-y*4.0, 0.0, 1.0));
  float sd = max(mu, 0.0);
  col += uSunCol * (smoothstep(0.9993, 0.9997, sd) * 30.0 + pow(sd, 10.0) * 0.35) * sunUp;
  vec3 md = -uSunDir; float m = max(dot(dir, md), 0.0);
  col += vec3(0.75,0.8,0.95) * (smoothstep(0.9994, 0.9997, m) * 6.0 + pow(m, 60.0)*0.08) * (1.0 - uDay);
  if (y > 0.0) {
    float night = 1.0 - uDay;
    vec3 sp = floor(dir * 300.0); float st = h(sp.xy + sp.z*13.1);
    col += vec3(1.0, 0.95, 0.9) * step(0.9968, st) * night * (0.6 + 0.4*sin(uTime*3.0 + st*90.0)) * smoothstep(0.0, 0.25, y) * 1.5;
    // Milky Way band
    float band = exp(-pow(dot(dir, normalize(vec3(0.3, 0.6, -0.74)))*3.2, 2.0));
    col += vec3(0.35, 0.38, 0.55) * band * fbm(dir.xz*9.0) * night * 0.35;
    // aurora curtains (Aurora Veil event or winter nights)
    if (uAurora > 0.0) {
      vec2 ap = dir.xz / (y + 0.2);
      float cur = fbm(vec2(ap.x*1.5 + uTime*0.05, ap.y*0.4)) ;
      float a = smoothstep(0.45, 0.8, cur) * smoothstep(0.05, 0.35, y) * smoothstep(0.9, 0.4, y);
      col += mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 0.25, 1.0), smoothstep(0.2, 0.6, y)) * a * uAurora * night * 1.4;
    }
    // meteor streaks (Meteor Shower event)
    if (uMeteors > 0.0) for (int i = 0; i < 3; i++) {
      float fi = float(i), slot = floor(uTime*0.45 + fi*0.37), k = fract(uTime*0.45 + fi*0.37);
      vec3 s = normalize(vec3(h(vec2(slot, fi))*2.0-1.0, 0.45 + h(vec2(fi, slot))*0.4, h(vec2(slot+3.1, fi))*2.0-1.0));
      vec3 e = normalize(s + vec3(0.25, -0.12, 0.1)); vec3 p = mix(s, e, k);
      float dline = length(cross(dir, normalize(p))) ; float trail = smoothstep(0.004, 0.0, dline) * smoothstep(0.0, 0.2, k) * (1.0 - k);
      col += vec3(1.0, 0.9, 0.7) * trail * uMeteors * night * 4.0;
    }
    // volumetric-looking clouds (2-layer fbm, lit by the sun)
    vec2 uv = dir.xz / (y + 0.12) * 0.9 + vec2(uTime*0.006, uTime*0.002);
    float base = fbm(uv*1.4) + 0.2;
    float c = smoothstep(1.0 - uCloud*0.75, 1.15 - uCloud*0.5, base);
    float lit = clamp((base - fbm(uv*1.4 + uSunDir.xz*0.08) ) * 4.0 + 0.6, 0.2, 1.4);
    vec3 cc = mix(vec3(0.22,0.24,0.32), vec3(1.0,0.97,0.93), uDay) * (0.65 + 0.45*lit) + uSunCol * pow(sd, 6.0) * 0.6 * c;
    col = mix(col, cc, c * smoothstep(0.0, 0.18, y) * 0.92);
    col += vec3(1.0, 0.85, 0.4) * uLux * 0.15 * fbm(dir.xz*4.0 + uTime*0.1) * smoothstep(0.0, 0.4, y);
  }
  gl_FragColor = outCol(col, 1.0);
}`;

export const WATER_VS = `attribute vec2 aPos; uniform mat4 uVP; uniform float uLevel; varying vec3 vW; void main(){ vW = vec3(aPos.x, uLevel, aPos.y); gl_Position = uVP * vec4(vW,1.0); }`;
export const WATER_FS = `
precision PREC float; varying vec3 vW;
uniform vec3 uCam, uSunDir, uSunCol, uZenith, uHorizon, uFogCol; uniform float uTime, uFog, uDay, uExposure, uReflOn, uLevel;
uniform sampler2D uRefl, uHeight, uRefr; uniform vec2 uRes; uniform vec4 uHRange; uniform float uRefrOn;
${OUT}
void main(){
  vec2 p = vW.xz; float t = uTime;
  vec2 g = vec2(0.0);
  g += vec2(0.8,0.6) * cos(dot(p, vec2(0.8,0.6))*1.3 + t*1.6) * 0.10;
  g += vec2(-0.5,0.85) * cos(dot(p, vec2(-0.5,0.85))*2.1 + t*2.0) * 0.06;
  g += vec2(0.95,-0.3) * cos(dot(p, vec2(0.95,-0.3))*3.7 + t*2.7) * 0.035;
  g += vec2(0.2,0.98) * cos(dot(p, vec2(0.2,0.98))*6.3 + t*3.4) * 0.02;
  g += vec2(-0.7,-0.7) * cos(dot(p, vec2(-0.7,-0.7))*11.0 + t*4.6) * 0.012;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(uCam - vW);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y,0.0,1.0),0.5));
  if (uReflOn > 0.5) {
    vec2 suv = gl_FragCoord.xy / uRes + n.xz * 0.035;
    vec3 rc = texture2D(uRefl, clamp(suv, 0.001, 0.999)).rgb;
#if OUTMODE == 2
    rc = rc / max(1.0 - rc, 0.02);
#endif
    sky = mix(rc, sky, 0.3) * vec3(0.82, 0.9, 0.96); // planar reflection, slightly absorbed/tinted by the water (keeps hazy skies from bleaching it white)
  }
  // depth from the baked terrain height field: shallow turquoise, deep blue, foam at the shore
  vec2 huv = (vW.xz - uHRange.xy) / uHRange.zw;
  float ground = texture2D(uHeight, huv).r * 10.0 - 6.0;
  float depth = max(uLevel - ground, 0.0);
  vec3 deep = mix(vec3(0.01,0.04,0.08), vec3(0.02,0.16,0.24), uDay);
  vec3 shallow = mix(vec3(0.03,0.12,0.12), vec3(0.12,0.55,0.52), uDay);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 2.5, depth));
  if (uRefrOn > 0.5) { // refraction: the bent view of the bed through the surface, absorbed with depth (Beer–Lambert)
    vec2 ruv = clamp(gl_FragCoord.xy / uRes - n.xz * 0.05 * clamp(depth, 0.0, 1.5), 0.001, 0.999);
    vec3 bed = texture2D(uRefr, ruv).rgb;
#if OUTMODE == 2
    bed = bed / max(1.0 - bed, 0.02);
#endif
    vec3 absorb = exp(-vec3(0.45, 0.12, 0.08) * depth * 1.6);
    body = mix(bed * absorb + body * (1.0 - absorb), body, smoothstep(0.5, 3.5, depth));
  }
  vec3 col = mix(body, sky, clamp(fres, 0.0, 0.85));
  col += uSunCol * pow(max(dot(r, uSunDir), 0.0), 400.0) * 6.0 + uSunCol * pow(max(dot(r, uSunDir), 0.0), 40.0) * 0.25;
  float foamN = sin(p.x*3.0 + t*1.7) * sin(p.y*2.7 - t*1.3);
  float foam = smoothstep(0.35, 0.0, depth) * (0.55 + 0.45*foamN) + smoothstep(0.6, 0.4, abs(depth - 0.45 - 0.1*sin(t*1.2 + p.x*0.4))) * 0.25 * smoothstep(1.2, 0.3, depth);
  col = mix(col, vec3(0.9, 0.95, 1.0) * (0.4 + 0.6*uDay), clamp(foam, 0.0, 1.0) * 0.8);
  float d = length(uCam - vW); float f = 1.0 - exp(-pow(d * uFog, 1.6));
  col = mix(col, uFogCol, clamp(f,0.0,1.0));
  float alpha = uRefrOn > 0.5 ? 1.0 : mix(0.45, 0.95, max(fres, smoothstep(0.0, 1.8, depth))) ;
  gl_FragColor = outCol(col, clamp(alpha + foam*0.5, 0.0, 1.0));
}`;
export const LINE_VS = `attribute vec3 aPos; uniform mat4 uVP; void main(){ gl_Position = uVP * vec4(aPos,1.0); }`;
export const LINE_FS = `precision PREC float; uniform vec4 uColor; uniform float uExposure; ${OUT} void main(){ gl_FragColor = outCol(uColor.rgb, uColor.a); }`;

export const POINT_VS = `
attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
uniform mat4 uVP; uniform float uScale; varying vec4 vCol;
void main(){ vec4 p = uVP * vec4(aPos, 1.0); gl_Position = p; gl_PointSize = clamp(aSize * uScale / max(p.w, 0.1), 1.0, 96.0); vCol = aCol; }`;
export const POINT_FS = `
precision PREC float; varying vec4 vCol; uniform float uExposure, uAdd; ${OUT}
void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); a *= a;
  gl_FragColor = uAdd > 0.5 ? outCol(vCol.rgb * vCol.a * a, 0.0) : outCol(vCol.rgb, vCol.a * a); }`;

// ---------- post-processing ----------
export const POST_VS = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const DEC = `vec3 dec(vec4 c){
#if OUTMODE == 2
  return c.rgb / max(1.0 - c.rgb, 0.004);
#else
  return c.rgb;
#endif
}
vec4 enc(vec3 c){
#if OUTMODE == 2
  c = max(c, 0.0); return vec4(c/(1.0+c), 1.0);
#else
  return vec4(c, 1.0);
#endif
}`;
export const BRIGHT_FS = `precision PREC float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold; ${DEC}
void main(){ vec3 s = dec(texture2D(uTex, vUv + uTexel*vec2(-1,-1))) + dec(texture2D(uTex, vUv + uTexel*vec2(1,-1))) + dec(texture2D(uTex, vUv + uTexel*vec2(-1,1))) + dec(texture2D(uTex, vUv + uTexel*vec2(1,1)));
  s *= 0.25; float l = dot(s, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = enc(s * smoothstep(uThreshold, uThreshold*2.0, l)); }`;
export const BLUR_FS = `precision PREC float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir; ${DEC}
void main(){ vec3 c = dec(texture2D(uTex, vUv)) * 0.227027;
  c += (dec(texture2D(uTex, vUv + uDir*1.3846)) + dec(texture2D(uTex, vUv - uDir*1.3846))) * 0.316216;
  c += (dec(texture2D(uTex, vUv + uDir*3.2308)) + dec(texture2D(uTex, vUv - uDir*3.2308))) * 0.070270;
  gl_FragColor = enc(c); }`;
export const COMPOSITE_FS = `
precision PREC float; varying vec2 vUv;
uniform sampler2D uScene, uBloom, uDepth; uniform vec2 uRes, uSunUV; uniform float uDofOn, uFocus, uAperture, uShaftK, uExposure, uBloomOn, uBloomK, uAOOn, uNear, uFar, uNight, uVignette, uWarm, uTime;
${DEC}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float lin(float d){ float z = d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear)); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec3 c = dec(texture2D(uScene, vUv));
  if (uDofOn > 0.5) { // depth of field (photo mode and cinematics): 16-tap golden-angle disc, circle of confusion from depth
    float dz = lin(texture2D(uDepth, vUv).r), coc = clamp(abs(dz - uFocus) / max(dz, 0.1) * uAperture, 0.0, 1.0);
    if (coc > 0.02) { vec3 acc = c; float wsum = 1.0, rot = ign(gl_FragCoord.xy)*6.2831;
      for (int i = 0; i < 16; i++) { float fi = float(i), r = sqrt((fi+0.5)/16.0) * coc * 0.012, a = fi*2.39996 + rot;
        vec2 uv = vUv + vec2(cos(a), sin(a)*uRes.x/uRes.y) * r; float dzi = lin(texture2D(uDepth, uv).r);
        float wi = dzi < dz ? clamp(abs(dzi - uFocus) / max(dzi, 0.1) * uAperture * 2.0, 0.0, 1.0) : 1.0;
        acc += dec(texture2D(uScene, uv)) * wi; wsum += wi; }
      c = acc / wsum; }
  }
  if (uShaftK > 0.0) { // volumetric light shafts: radial march towards the sun over bright sky pixels (screen-space)
    vec2 dl = (uSunUV - vUv) / 28.0; vec2 uv = vUv; float decay = 1.0, sum = 0.0; float j = ign(gl_FragCoord.xy);
    uv += dl * j;
    for (int i = 0; i < 28; i++) { uv += dl; float dd = texture2D(uDepth, clamp(uv, 0.0, 1.0)).r; float sky = step(0.99999, dd);
      vec3 s = dec(texture2D(uScene, clamp(uv, 0.0, 1.0))); sum += sky * clamp(dot(s, vec3(0.3, 0.5, 0.2)) - 0.6, 0.0, 4.0) * decay; decay *= 0.95; }
    c += vec3(1.0, 0.86, 0.62) * sum * uShaftK / 28.0;
  }
  if (uAOOn > 0.5) {               // screen-space ambient occlusion from the depth texture (12-tap spiral)
    float d0 = lin(texture2D(uDepth, vUv).r);
    if (d0 < uFar*0.6) {
      float ao = 0.0, rot = ign(gl_FragCoord.xy)*6.2831, rad = clamp(1.1 / d0, 0.002, 0.05);
      for (int i = 0; i < 12; i++) {
        float fi = float(i), r = (fi+1.0)/12.0, a = fi*2.39996 + rot;
        vec2 o = vec2(cos(a), sin(a)*uRes.x/uRes.y) * r * rad;
        float d = lin(texture2D(uDepth, vUv + o).r), diff = d0 - d;
        ao += smoothstep(0.03, 0.35, diff) * (1.0 - smoothstep(0.8, 2.5, diff));
      }
      c *= 1.0 - clamp(ao/12.0, 0.0, 1.0) * 0.7;
    }
  }
  if (uBloomOn > 0.5) c += dec(texture2D(uBloom, vUv)) * uBloomK;
  c = aces(c * uExposure);
  // colour grading: gentle contrast + saturation, cool shadows at night, warm highlights at golden hour
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12 - uNight*0.25);
  c = mix(c, c*vec3(0.85, 0.95, 1.15), uNight*0.5*(1.0-l));
  c = mix(c, c*vec3(1.08, 1.0, 0.9), uWarm*0.6*l);
  c = clamp((c - 0.5) * 1.06 + 0.5, 0.0, 1.0);
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * uVignette;
  c = pow(c, vec3(1.0/2.2));
  c += (ign(gl_FragCoord.xy + fract(uTime)*100.0) - 0.5) / 255.0; // dither against banding
  gl_FragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));       // luma in alpha for FXAA
}`;
export const FXAA_FS = `
precision PREC float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec3 rgbNW = texture2D(uTex, vUv + vec2(-1.0,-1.0)*uTexel).rgb, rgbNE = texture2D(uTex, vUv + vec2(1.0,-1.0)*uTexel).rgb;
  vec3 rgbSW = texture2D(uTex, vUv + vec2(-1.0,1.0)*uTexel).rgb, rgbSE = texture2D(uTex, vUv + vec2(1.0,1.0)*uTexel).rgb;
  vec4 M = texture2D(uTex, vUv); vec3 rgbM = M.rgb;
  vec3 L = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, L), lNE = dot(rgbNE, L), lSW = dot(rgbSW, L), lSE = dot(rgbSE, L), lM = dot(rgbM, L);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0/128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
  vec3 A = 0.5 * (texture2D(uTex, vUv + dir*(1.0/3.0 - 0.5)).rgb + texture2D(uTex, vUv + dir*(2.0/3.0 - 0.5)).rgb);
  vec3 B = A*0.5 + 0.25 * (texture2D(uTex, vUv + dir*-0.5).rgb + texture2D(uTex, vUv + dir*0.5).rgb);
  float lB = dot(B, L);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? A : B, 1.0);
}`;
