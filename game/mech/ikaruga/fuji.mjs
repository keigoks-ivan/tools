import * as THREE from 'three';

// The atlas projects the visible terrain from Aomi (35.623 N, 139.784 E).
// Pixels store the terrain normal's east/south components, distance, and a
// snow mask. The first two scanlines store skyline elevation per bearing.
// Snow cover is artistic; the ridges are
// sampled from Mapzen Terrarium z10, USGS global terrain data, 2026-11-27.
// https://registry.opendata.aws/terrain-tiles/
// https://github.com/tilezen/joerd/blob/master/docs/attribution.md
const atlasURL = new URL('./fuji-relief.webp', import.meta.url).href;
const radians = THREE.MathUtils.degToRad;

// A horizontal arc keeps all bearings intact when looking from the shore.
// The game uses +X east and +Z south. Kengamine appears at about 253°.
function horizonArc() {
  const radius = 7400, segments = 384;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, azimuth = radians(216 + 77 * u);
    for (const v of [0, 1]) {
      positions.push(radius * Math.sin(azimuth), 0, -radius * Math.cos(azimuth));
      uvs.push(u, v);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function buildFuji(world, group) {
  const mesh = new THREE.Mesh(horizonArc(), new THREE.ShaderMaterial({
    uniforms: {
      relief: { value: null },
      sunlight: { value: world.lightDir },
      horizon: { value: world.scene.fog.color },
    },
    vertexShader: `
      uniform sampler2D relief;
      varying vec2 sampleUV;
      void main() {
        // Fit the top edge to the sampled ridgeline itself. This avoids alpha
        // fringes and keeps the silhouette smooth even in a zoomed cockpit.
        float skyline = texture2D(relief, vec2(uv.x, .995)).r;
        sampleUV = vec2(uv.x, uv.y * skyline);
        float edge = smoothstep(0.0, .045, min(uv.x, 1.0 - uv.x));
        vec3 summit = position;
        summit.y = 7400.0 * tan(radians(-.45 + 4.0 * sampleUV.y)) * edge;
        vec3 point = (modelMatrix * vec4(summit, 1.0)).xyz;
        // The peak is ~100 km away. Preserve the much smaller real parallax
        // of a distant object while keeping the mesh inside the far plane.
        gl_Position = projectionMatrix * viewMatrix * vec4(point + cameraPosition * .926, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D relief;
      uniform vec3 sunlight, horizon;
      varying vec2 sampleUV;
      void main() {
        vec4 data = texture2D(relief, sampleUV);
        vec2 slope = data.rg * 2.0 - 1.0;
        vec3 normal = vec3(slope.x, sqrt(max(0.0, 1.0 - dot(slope,slope))), slope.y);
        float sun = max(0.0, dot(normal, sunlight));
        vec3 woods = mix(vec3(.029,.048,.082), vec3(.14,.19,.22), sun);
        vec3 snow = mix(vec3(.31,.42,.59), vec3(1.08,1.04,.97), sun);
        float cover = clamp((data.a - .25) / .75, 0.0, 1.0);
        float haze = .15 + .43 * data.b;
        vec3 aerial = mix(horizon, vec3(.25,.35,.48), .57);
        vec3 rock = mix(woods, snow, cover);
        vec3 color = mix(rock, aerial, haze);
        // At this distance the bay's haze hides the low plain. Let the actual
        // sky and shore behind it show through as each foothill enters the mist.
        float visibility = smoothstep(.055, .29, sampleUV.y - .011 * data.b);
        gl_FragColor = vec4(color, visibility);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }));
  mesh.name = '東京湾からの富士山と丹沢山地';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.noAO = mesh.userData.fieldGeometry = mesh.userData.fieldMaterial = true;
  const atlas = new THREE.TextureLoader().load(atlasURL, () => { mesh.visible = true; });
  // The alpha channel contains data; browser premultiplication would alter
  // the terrain normals at the dark foothills.
  atlas.premultiplyAlpha = false;
  atlas.colorSpace = THREE.NoColorSpace;
  mesh.material.uniforms.relief.value = atlas;
  mesh.material.addEventListener('dispose', () => atlas.dispose());
  group.add(mesh);
  return mesh;
}

// The Wakasu embarkation starts at (480, 60). Track a little along the
// waterfront so the near truss moves against the far, almost stationary peak.
export function frameFuji(camera, player, progress) {
  const t = THREE.MathUtils.smootherstep(progress, 0, 1);
  const x = player.pos.x + 150 - 12 * t, z = player.pos.z + 77 + 4 * t;
  const portrait = 1 - THREE.MathUtils.smoothstep(camera.aspect, .55, 1);
  const y = 52 + 2 * t, bearing = radians(247 + .8 * t + 2.8 * portrait);
  camera.position.set(x, y, z);
  camera.lookAt(x + Math.sin(bearing) * 500, y - 8, z - Math.cos(bearing) * 500);
  // Port and starboard trusses leave the snow cap clear in a landscape frame.
  // A slightly wider vertical lens also keeps it in view on portrait devices.
  camera.fov = THREE.MathUtils.lerp(22, 19, t) / Math.min(1, Math.max(.72, camera.aspect));
  camera.updateProjectionMatrix();
}
