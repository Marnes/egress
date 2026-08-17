import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import type { OccluderInstance } from './occluders/registry.js';
import { OutlinePass } from './passes/OutlinePass.js';
import { GradePass } from './passes/grade.js';
import type { Theme } from './types.js';
import type { RoomCamera } from './camera.js';

export type RendererOptions = {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: RoomCamera;
  bounds: { size: [number, number, number] };
  theme: Theme;
  occluder?: Pick<OccluderInstance, 'composerPass'>;
  pixelRatio?: number;
};

export type RendererHandle = {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  outlinePass: OutlinePass;
  gradePass: GradePass;
  resize(width: number, height: number, pixelRatio?: number): void;
  render(dtSeconds: number): void;
  dispose(): void;
};

export function createWebGL2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return (
    canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }) ??
    canvas.getContext('webgl2', { antialias: true }) ??
    canvas.getContext('webgl2')
  );
}

export function createRenderer(options: RendererOptions): RendererHandle {
  const context = createWebGL2Context(options.canvas);
  if (!context) throw new Error('WebGL 2 is unavailable in this browser.');
  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    context
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  options.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const lit = materials.some((material) => material instanceof THREE.MeshStandardMaterial);
    // Shadow casting ignores alpha, so a translucent weathering decal would
    // throw the silhouette of a solid rectangle across the room.
    const translucent = materials.some((material) => material.transparent);
    // Opted out of shadowing entirely: a light fitting sits millimetres from
    // its own bulb, and a film of water sits millimetres off the pipe behind
    // it — neither distance a shadow map can resolve, so both collect acne or
    // black themselves out.
    const exempt = object.userData.egressNoShadow === true;
    object.castShadow = lit && !translucent && !exempt;
    object.receiveShadow = lit && !exempt;
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(environmentScene, 0.08);
  options.scene.environment = environmentTarget.texture;
  options.scene.environmentIntensity = 0.08;
  const pixelRatio = options.pixelRatio ?? globalThis.devicePixelRatio ?? 1;
  renderer.setPixelRatio(pixelRatio);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(options.scene, options.camera);
  const saoPass = new SAOPass(options.scene, options.camera, new THREE.Vector2(1, 1));
  saoPass.params.saoIntensity = 0.08;
  saoPass.params.saoScale = 2;
  saoPass.params.saoKernelRadius = 18;
  saoPass.params.saoMinResolution = 0.002;
  saoPass.params.saoBlur = true;
  const outlinePass = new OutlinePass(
    options.scene,
    options.camera,
    options.theme.outline,
    options.theme.palette.ink
  );
  outlinePass.setPixelRatio(pixelRatio);
  const gradePass = new GradePass(options.theme.grade);
  const fxaaPass = new ShaderPass(FXAAShader);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(saoPass);
  if (options.occluder?.composerPass) composer.addPass(options.occluder.composerPass);
  composer.addPass(outlinePass);
  composer.addPass(gradePass);
  composer.addPass(fxaaPass);
  composer.addPass(outputPass);

  let disposed = false;
  return {
    renderer,
    composer,
    outlinePass,
    gradePass,
    resize(width, height, nextPixelRatio = globalThis.devicePixelRatio ?? 1) {
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      renderer.setPixelRatio(nextPixelRatio);
      renderer.setSize(safeWidth, safeHeight, false);
      composer.setPixelRatio(nextPixelRatio);
      composer.setSize(safeWidth, safeHeight);
      outlinePass.setPixelRatio(nextPixelRatio);
      fxaaPass.uniforms.resolution.value.set(
        1 / (safeWidth * nextPixelRatio),
        1 / (safeHeight * nextPixelRatio)
      );
      const aspect = safeWidth / safeHeight;
      if (options.camera instanceof THREE.PerspectiveCamera) {
        options.camera.aspect = aspect;
      } else {
        const [roomWidth, roomHeight, roomDepth] = options.bounds.size;
        const viewHeight = Math.max(roomHeight + 0.4, Math.max(roomWidth, roomDepth) / aspect + 0.4);
        options.camera.left = -viewHeight * aspect / 2;
        options.camera.right = viewHeight * aspect / 2;
        options.camera.top = viewHeight / 2;
        options.camera.bottom = -viewHeight / 2;
      }
      options.camera.updateProjectionMatrix();
    },
    render(dtSeconds) {
      gradePass.update(dtSeconds);
      composer.render(dtSeconds);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderPass.dispose();
      saoPass.dispose();
      outlinePass.dispose();
      gradePass.dispose();
      fxaaPass.dispose();
      outputPass.dispose();
      composer.dispose();
      options.scene.environment = null;
      environmentTarget.dispose();
      environmentScene.dispose();
      pmrem.dispose();
      renderer.dispose();
    }
  };
}
