const VERT = `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

const FRAG_PAPER = `
uniform sampler2D bm; uniform sampler2D mask; uniform vec3 sun; uniform vec3 camPos;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
vec3 srgb(vec3 c){ return c; }
void main(){
  vec3 m = texture2D(mask, vUv).rgb; vec3 c = texture2D(bm, vUv).rgb;
  float lum = dot(c, vec3(.3,.59,.11));
  // ocean: pale sky blue, deeper water slightly stronger blue
  float shallow = smoothstep(0.10, 0.36, lum);
  vec3 deep = vec3(0.640, 0.776, 0.906);   // ~ #A3C6E7
  vec3 shelf = vec3(0.835, 0.902, 0.960);  // ~ #D5E6F5
  vec3 ocean = mix(deep, shelf, shallow);
  // graticule every 10 deg
  vec2 g = vec2(vUv.x*36.0, vUv.y*18.0);
  vec2 gf = abs(fract(g)-0.5); float gl = 1.0 - smoothstep(0.0, 0.006, min(gf.x*0.5, gf.y));
  ocean = mix(ocean, vec3(0.93,0.96,0.99), gl*0.16);
  // land: warm paper with a hint of real colour and relief
  vec3 paper = vec3(0.975, 0.958, 0.915);
  vec3 tint = mix(vec3(lum), c, 0.85);
  vec3 landc = mix(paper, tint*0.9 + 0.38, 0.22);
  landc *= 0.965 + 0.22*(lum-0.30);
  float landA = smoothstep(0.35, 0.65, m.r);
  vec3 col = mix(ocean, landc, landA);
  col = mix(col, vec3(0.50,0.66,0.82), m.g*0.55);          // coastline
  col = mix(col, vec3(0.70,0.74,0.80), m.b*0.45*landA);     // borders
  // soft daylight shading
  vec3 n = normalize(vN); float ndl = dot(n, normalize(sun));
  col *= 0.80 + 0.22*smoothstep(-0.4, 1.0, ndl);
  // haze toward the limb
  vec3 v = normalize(camPos - vW); float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col = mix(col, vec3(0.92,0.955,0.99), fr*0.6);
  gl_FragColor = vec4(col, 1.0);
}`;


// Porcelain adventure globe. Real coastlines remain legible beneath sampled flights.
const FRAG_GAME = `
uniform sampler2D bm; uniform sampler2D mask; uniform vec3 sun; uniform vec3 camPos;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 m=texture2D(mask,vUv).rgb, terrain=texture2D(bm,vUv).rgb;
  float lum=dot(terrain,vec3(.3,.59,.11)), landA=smoothstep(.35,.65,m.r);
  vec3 ocean=mix(vec3(.09,.26,.50),vec3(.13,.63,.69),smoothstep(.10,.4,lum));
  vec2 g=abs(fract(vec2(vUv.x*36.,vUv.y*18.))-.5);
  float grid=1.-smoothstep(0.,.007,min(g.x*.5,g.y));
  ocean=mix(ocean,vec3(.30,.65,.75),grid*.18);
  vec3 land=mix(vec3(.37,.65,.54),vec3(.93,.81,.57),smoothstep(.18,.65,lum));
  land=mix(land,vec3(.89,.91,.94),smoothstep(.72,.94,lum)*.55);
  land*=.92+lum*.32;
  vec3 col=mix(ocean,land,landA);
  col=mix(col,vec3(.77,.96,.82),m.g*.50);
  col=mix(col,vec3(.35,.59,.55),m.b*.25*landA);
  vec3 n=normalize(vN);float day=smoothstep(-.4,1.,dot(n,normalize(sun)));
  col*=.62+.42*day;
  // Still, locally calculated cloud wisps cost no texture or extra draw call.
  float cloud=sin(vUv.x*83.+sin(vUv.y*31.)*3.)*sin(vUv.y*61.+sin(vUv.x*17.)*2.);
  cloud=smoothstep(.68,.95,cloud)*(1.-smoothstep(.32,.49,abs(vUv.y-.5)));
  col=mix(col,vec3(.93,.94,.98),cloud*.20*(.5+day*.5));
  float rim=pow(1.-max(dot(n,normalize(camPos-vW)),0.),3.);
  col=mix(col,vec3(.48,.66,.92),rim*.68);
  gl_FragColor=vec4(col,1.);
}`;

export { VERT, FRAG_PAPER, FRAG_GAME };
