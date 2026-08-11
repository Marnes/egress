import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { WhiteoutSpec } from '../types.js';
import type { OccluderContext, OccluderInstance } from './registry.js';

export function whiteout(spec: WhiteoutSpec, context: OccluderContext): OccluderInstance {
  const count = Math.max(0, Math.round(spec.particleCount));
  const positions = new Float32Array(count * 3);
  const [width, height, depth] = context.bounds.size;
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * width;
    positions[index * 3 + 1] = random() * height;
    positions[index * 3 + 2] = (random() - 0.5) * depth;
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute('position', position);
  const material = new THREE.PointsMaterial({
    color: spec.color,
    size: Math.max(Math.min(width, height, depth) * 0.018, 0.01),
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    fog: false
  });
  const particles = new THREE.Points(geometry, material);

  const pass = new ShaderPass({
    name: 'EgressWhiteout',
    uniforms: {
      tDiffuse: { value: null },
      color: { value: new THREE.Color(spec.color) },
      time: { value: 0 },
      gustHz: { value: spec.gustHz }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec3 color;
      uniform float time;
      uniform float gustHz;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec4 beauty = texture2D(tDiffuse, vUv);
        float cells = hash(floor(vUv * 90.0 + vec2(time * 2.1, time * -0.7)));
        float gust = 0.5 + 0.5 * sin(time * gustHz * 6.2831853 + vUv.y * 5.0);
        float fade = min(0.85, 0.18 + cells * 0.16 + gust * 0.14);
        gl_FragColor = vec4(mix(beauty.rgb, color, fade), beauty.a);
      }
    `
  });
  let elapsed = 0;

  return {
    object: particles,
    composerPass: pass,
    update(dtSeconds) {
      elapsed += Math.max(0, dtSeconds);
      const gust = 1 + Math.sin(elapsed * spec.gustHz * Math.PI * 2) * 0.35;
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        positions[offset] += spec.driftMps * gust * dtSeconds;
        if (positions[offset] > width / 2) positions[offset] -= width;
      }
      position.needsUpdate = true;
      pass.uniforms.time.value = elapsed;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      pass.dispose();
    }
  };
}
