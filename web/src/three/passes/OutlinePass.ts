import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import type { OutlineSpec } from '../types.js';
import type { RoomCamera } from '../camera.js';

export class OutlinePass extends Pass {
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly normalMaterial: THREE.MeshNormalMaterial;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private pixelRatio = 1;
  private readonly thicknessCssPx: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: RoomCamera,
    spec: OutlineSpec,
    ink: THREE.ColorRepresentation
  ) {
    super();
    this.thicknessCssPx = spec.thicknessPx;
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false
    });
    this.normalTarget.texture.name = 'EgressOutline.normal';
    this.normalTarget.texture.colorSpace = THREE.NoColorSpace;
    this.normalTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.normalTarget.depthTexture.format = THREE.DepthFormat;
    this.normalTarget.depthTexture.name = 'EgressOutline.depth';
    this.normalMaterial = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending });
    this.material = new THREE.ShaderMaterial({
      name: 'EgressOutlineComposite',
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.normalTarget.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        thicknessPx: { value: spec.thicknessPx },
        depthSensitivity: { value: spec.depthSensitivity },
        normalSensitivity: { value: spec.normalSensitivity },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        isPerspective: { value: camera instanceof THREE.PerspectiveCamera ? 1 : 0 },
        ink: { value: new THREE.Color(ink) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tNormal;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float thicknessPx;
        uniform float depthSensitivity;
        uniform float normalSensitivity;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float isPerspective;
        uniform vec3 ink;
        varying vec2 vUv;

        float viewZ(vec2 uv) {
          float depth = texture2D(tDepth, uv).x;
          return isPerspective > 0.5
            ? perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
            : orthographicDepthToViewZ(depth, cameraNear, cameraFar);
        }

        vec3 normalAt(vec2 uv) {
          return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
        }

        void main() {
          vec4 beauty = texture2D(tDiffuse, vUv);
          float rawDepth = texture2D(tDepth, vUv).x;
          if (rawDepth >= 0.999999) {
            gl_FragColor = beauty;
            return;
          }

          vec2 offset = vec2(thicknessPx) / resolution;
          vec2 uvA = vUv + vec2(offset.x, offset.y);
          vec2 uvB = vUv + vec2(-offset.x, offset.y);
          vec2 uvC = vUv + vec2(offset.x, -offset.y);
          vec2 uvD = vUv - offset;
          float centerZ = viewZ(vUv);
          float depthCross = abs(viewZ(uvA) - viewZ(uvD)) + abs(viewZ(uvB) - viewZ(uvC));
          vec3 centerNormal = normalAt(vUv);
          float viewFacing = smoothstep(0.08, 0.35, abs(centerNormal.z));
          float depthEdge = depthCross / max(abs(centerZ), 0.001) * depthSensitivity * viewFacing;
          float normalEdge = max(
            1.0 - dot(centerNormal, normalAt(uvA)),
            1.0 - dot(centerNormal, normalAt(uvD))
          ) * normalSensitivity;
          float edge = smoothstep(0.08, 0.18, max(depthEdge, normalEdge));
          gl_FragColor = vec4(mix(beauty.rgb, ink, edge), beauty.a);
        }
      `
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setPixelRatio(pixelRatio: number): void {
    this.pixelRatio = Math.max(pixelRatio, 0.1);
    this.material.uniforms.thicknessPx.value = this.thicknessCssPx * this.pixelRatio;
  }

  override setSize(width: number, height: number): void {
    this.normalTarget.setSize(width, height);
    this.material.uniforms.resolution.value.set(width, height);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    const oldTarget = renderer.getRenderTarget();
    const oldOverride = this.scene.overrideMaterial;
    const oldBackground = this.scene.background;
    const oldClearColor = renderer.getClearColor(new THREE.Color());
    const oldClearAlpha = renderer.getClearAlpha();
    try {
      this.scene.overrideMaterial = this.normalMaterial;
      this.scene.background = null;
      renderer.setClearColor(0x000000, 1);
      renderer.setRenderTarget(this.normalTarget);
      renderer.clear();
      renderer.render(this.scene, this.camera);
    } finally {
      this.scene.overrideMaterial = oldOverride;
      this.scene.background = oldBackground;
      renderer.setClearColor(oldClearColor, oldClearAlpha);
    }

    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.cameraNear.value = this.camera.near;
    this.material.uniforms.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
    renderer.setRenderTarget(oldTarget);
  }

  override dispose(): void {
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
