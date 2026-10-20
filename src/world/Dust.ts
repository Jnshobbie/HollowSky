import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Points,
  PointsMaterial,
  SRGBColorSpace,
} from 'three';
import type { Vector3 } from 'three';

/** Floating dust motes in the sunlight. They drift toward the current gravity. */
export class Dust {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly phase: Float32Array;
  private readonly attr: BufferAttribute;
  private readonly count: number;
  private readonly limit: number;

  constructor(count: number, half: number) {
    this.count = count;
    this.limit = half - 1;
    this.positions = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) this.positions[i * 3 + k] = (Math.random() * 2 - 1) * (half - 2);
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.attr = new BufferAttribute(this.positions, 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', this.attr);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;

    this.points = new Points(
      geo,
      new PointsMaterial({
        map: tex,
        size: 0.45,
        color: 0xffe2b0,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  update(dt: number, g: Vector3, now: number): void {
    const t = now / 1000;
    const p = this.positions;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      const ph = this.phase[i];
      p[o] += (g.x * 0.7 + Math.sin(t * 0.6 + ph) * 0.25) * dt;
      p[o + 1] += (g.y * 0.7 + Math.cos(t * 0.5 + ph * 1.3) * 0.25) * dt;
      p[o + 2] += (g.z * 0.7 + Math.sin(t * 0.4 + ph * 0.7) * 0.25) * dt;
      for (let k = 0; k < 3; k++) {
        if (p[o + k] > this.limit) p[o + k] = -this.limit;
        else if (p[o + k] < -this.limit) p[o + k] = this.limit;
      }
    }
    this.attr.needsUpdate = true;
  }
}