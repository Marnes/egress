import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { Theme } from '../types.js';

export class GradePass extends ShaderPass {
  constructor(grade: Theme['grade']) {
    super({
      name: 'EgressGrade',
      uniforms: {
        tDiffuse: { value: null },
        vignette: { value: grade.vignette },
        exposure: { value: grade.exposure },
        saturation: { value: grade.saturation ?? 1 },
        contrast: { value: grade.contrast ?? 1 }
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
        uniform float vignette;
        uniform float exposure;
        uniform float saturation;
        uniform float contrast;
        varying vec2 vUv;
        void main() {
          vec4 source = texture2D(tDiffuse, vUv);
          vec2 centered = vUv * 2.0 - 1.0;
          float edge = smoothstep(0.35, 1.25, dot(centered, centered));
          vec3 color = source.rgb * exposure * (1.0 - edge * clamp(vignette, 0.0, 1.0));
          float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(luminance), color, saturation);
          color = (color - 0.5) * contrast + 0.5;
          gl_FragColor = vec4(color, source.a);
        }
      `
    });
  }

  update(dtSeconds: number): void {
    void dtSeconds;
  }
}
