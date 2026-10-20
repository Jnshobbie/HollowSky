import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { Aabb } from './City';
import { mulberry32 } from './rng';

const CELL_W = 3; // world units per window bay
const CELL_H = 3.2; // world units per floor
const TILE = 4; // bays/floors per texture tile
const PALETTE: ReadonlyArray<number> = [0xb9b2a5, 0x9c9488, 0x8c5b47, 0xa88f6d, 0x6a737c];
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

function makeWindowTextures(): { color: CanvasTexture; lit: CanvasTexture } {
  const rand = mulberry32(7);
  const S = 256;
  const c = S / TILE;
  const colorCanvas = document.createElement('canvas');
  const litCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = S;
  litCanvas.width = litCanvas.height = S;
  const g = colorCanvas.getContext('2d');
  const l = litCanvas.getContext('2d');
  if (!g || !l) throw new Error('2D canvas unavailable');

  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.05})`;
    g.fillRect(rand() * S, rand() * S, 2 + rand() * 6, 2 + rand() * 6);
  }
  l.fillStyle = '#000000';
  l.fillRect(0, 0, S, S);

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const gx = x * c + 12;
      const gy = y * c + 10;
      const gw = c - 24;
      const gh = c - 22;
      const grad = g.createLinearGradient(0, gy, 0, gy + gh);
      grad.addColorStop(0, '#9bb4cb');
      grad.addColorStop(1, '#4a5d73');
      g.fillStyle = grad;
      g.fillRect(gx, gy, gw, gh);
      g.fillStyle = '#c9c2b4';
      g.fillRect(gx - 3, gy + gh, gw + 6, 4); // window sill
      g.strokeStyle = '#2b2b2b';
      g.lineWidth = 2;
      g.strokeRect(gx, gy, gw, gh);
      g.beginPath();
      g.moveTo(gx + gw / 2, gy);
      g.lineTo(gx + gw / 2, gy + gh);
      g.stroke();
      if (rand() < 0.16) {
        l.fillStyle = '#ffb866';
        l.fillRect(gx + 2, gy + 2, gw - 4, gh - 4);
      }
    }
  }

  const prep = (canvas: HTMLCanvasElement): CanvasTexture => {
    const t = new CanvasTexture(canvas);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { color: prep(colorCanvas), lit: prep(litCanvas) };
}

/**
 * Builds every building as real faces in ONE mesh (one draw call per material).
 * Facades get a window texture scaled in world units; roofs are plain.
 * The wall each building grows from is derived from its collision box.
 */
export function createFacades(colliders: ReadonlyArray<Aabb>, half: number): Mesh {
  const rand = mulberry32(99);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const facadeIdx: number[] = [];
  const roofIdx: number[] = [];
  const color = new Color();

  for (const b of colliders) {
    const lo = [b.min.x, b.min.y, b.min.z];
    const hi = [b.max.x, b.max.y, b.max.z];
    let a = -1; // axis the building grows along
    let s = 0; // sign of the wall it grows from
    for (let k = 0; k < 3; k++) {
      if (lo[k] <= -half + 1e-3) {
        a = k;
        s = -1;
      } else if (hi[k] >= half - 1e-3) {
        a = k;
        s = 1;
      }
    }
    if (a < 0) continue;

    const c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
    const sz = [0, 1, 2].map((k) => hi[k] - lo[k]);
    const base = PALETTE[Math.floor(rand() * PALETTE.length)];
    const tone = 0.85 + rand() * 0.25;

    for (let k = 0; k < 3; k++) {
      for (const sigma of [-1, 1]) {
        if (k === a && sigma === s) continue; // base face sits against the wall
        const roof = k === a;
        const t1 = (k + 1) % 3;
        const t2 = (k + 2) % 3;
        const first = pos.length / 3;

        for (const [ca, cb] of CORNERS) {
          const p = [0, 0, 0];
          p[k] = c[k] + (sigma * sz[k]) / 2;
          p[t1] = c[t1] + (ca * sz[t1]) / 2;
          p[t2] = c[t2] + (cb * sz[t2]) / 2;
          pos.push(p[0], p[1], p[2]);
          const n = [0, 0, 0];
          n[k] = sigma;
          nor.push(n[0], n[1], n[2]);

          const dist = Math.abs(p[a] - s * half); // height above the street
          if (roof) {
            uv.push(p[t1] / 10, p[t2] / 10);
          } else {
            const other = 3 - k - a;
            uv.push(p[other] / (CELL_W * TILE), dist / (CELL_H * TILE));
          }

          // Fake ambient occlusion: darker near the street, lighter up high
          const shade = roof ? 0.85 : 0.7 + 0.3 * Math.min(1, dist / sz[a]);
          color.setHex(base).multiplyScalar(tone * shade);
          col.push(color.r, color.g, color.b);
        }

        const idx = roof ? roofIdx : facadeIdx;
        if (sigma > 0) idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
        else idx.push(first, first + 2, first + 1, first, first + 3, first + 2);
      }
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(new BufferAttribute(new Uint32Array([...facadeIdx, ...roofIdx]), 1));
  geo.addGroup(0, facadeIdx.length, 0);
  geo.addGroup(facadeIdx.length, roofIdx.length, 1);

  const tex = makeWindowTextures();
  const facadeMat = new MeshStandardMaterial({
    map: tex.color,
    emissiveMap: tex.lit,
    emissive: 0xffffff,
    emissiveIntensity: 1.1,
    vertexColors: true,
    roughness: 0.9,
  });
  const roofMat = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });

  const mesh = new Mesh(geo, [facadeMat, roofMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}