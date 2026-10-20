import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

type Level = 0 | 1 | 2 | 3; // 3 = bloom + shadows, 2 = shadows, 1 = plain, 0 = plain + lower resolution

const HAZE = 0xdcc7a4;
const SUN_DIR = new Vector3(0.55, 0.75, 0.35).normalize(); // relative to the starting "up"
const LOW_FPS = 42;

/**
 * Lighting, haze, shadows, bloom and automatic quality.
 * URL options: ?q=high|mid|low|min locks a quality level, ?debug shows fps and level.
 */
export class Look {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly composer: EffectComposer;
  private readonly sunDir = SUN_DIR.clone();
  private readonly prevUp = new Vector3(0, 1, 0);
  private readonly q = new Quaternion();
  private readonly debugEl: HTMLDivElement | null;

  private level: Level = 3;
  private locked = false;
  private winStart = 0;
  private winFrames = 0;
  private warmUntil = 3000;
  private fps = 0;
  private lastDebug = 0;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const params = new URLSearchParams(window.location.search);
    const forced: Record<string, Level> = { high: 3, mid: 2, low: 1, min: 0 };
    const q = params.get('q');
    if (q !== null && q in forced) {
      this.level = forced[q];
      this.locked = true;
    }

    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.setClearColor(HAZE);

    scene.background = new Color(HAZE);
    scene.fog = new Fog(HAZE, 22, 95);

    this.hemi = new HemisphereLight(0xfff0d8, 0x8a735c, 1.6);
    scene.add(this.hemi);

    this.sun = new DirectionalLight(0xffd29a, 4.2);
    const mapSize = window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -55;
    sc.right = 55;
    sc.top = 55;
    sc.bottom = -55;
    sc.near = 1;
    sc.far = 170;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(
      new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.6, 0.6, 1.0),
    );
    this.composer.addPass(new OutputPass());
    this.applyLevel();

    const vignette = document.createElement('div');
    vignette.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:5;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(25,12,0,0.38) 100%)';
    document.body.appendChild(vignette);

    if (params.has('debug')) {
      this.debugEl = document.createElement('div');
      this.debugEl.style.cssText =
        'position:fixed;left:8px;bottom:8px;color:#fff;font:12px monospace;background:rgba(0,0,0,0.5);padding:2px 6px;z-index:30;pointer-events:none';
      document.body.appendChild(this.debugEl);
    } else {
      this.debugEl = null;
    }

    window.addEventListener('resize', () => {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /** Call once per frame before render(). `up` is the smoothed gravity "up". */
  update(now: number, up: Vector3): void {
    // The sun turns with gravity, so shadows always fall toward the current floor
    this.q.setFromUnitVectors(this.prevUp, up);
    this.sunDir.applyQuaternion(this.q);
    this.prevUp.copy(up);
    this.sun.position.copy(this.sunDir).multiplyScalar(75);
    this.hemi.position.copy(up);
    this.adapt(now);
  }

  render(): void {
    if (this.level >= 3) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private adapt(now: number): void {
    if (this.winStart === 0) this.winStart = now;
    this.winFrames++;
    const span = now - this.winStart;
    if (span >= 2000) {
      this.fps = (this.winFrames * 1000) / span;
      this.winFrames = 0;
      this.winStart = now;
      if (!this.locked && now > this.warmUntil && this.fps < LOW_FPS && this.level > 0) {
        this.level = (this.level - 1) as Level;
        this.applyLevel();
        this.warmUntil = now + 3000;
      }
    }
    if (this.debugEl && now - this.lastDebug > 500) {
      this.lastDebug = now;
      this.debugEl.textContent = `Q${this.level}  ${Math.round(this.fps)} fps`;
    }
  }

  private applyLevel(): void {
    this.sun.castShadow = this.level >= 2;
    const ratio = this.level === 0 ? 1 : Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}