import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from 'three';
import type { Texture } from 'three';
import type { Aabb } from './City';
import { mulberry32 } from './rng';

/** Real PBR facades (public/textures/<dir>). w/h = world units covered by one texture tile: tune to resize the windows. */
const KINDS: ReadonlyArray<{ dir: string; w: number; h: number }> = [
  { dir: 'Facade020B', w: 18, h: 27 },
  { dir: 'Facade018A', w: 10.4, h: 20.8 },
  { dir: 'Facade014', w: 50, h: 50 },
];
const ROOF = { dir: 'RoofingTiles001', size: 6 };
const WINDOW_GLOW = 1.4; // brightness of the lit windows
const TINT = 0.25; // how much of the old per-building colour is mixed in (0 = pure texture)
const PALETTE: ReadonlyArray<number> = [0xb9b2a5, 0x9c9488, 0x8c5b47, 0xa88f6d, 0x6a737c];
const WHITE = new Color(0xffffff);
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

const loader = new TextureLoader();
function tex(path: string, srgb: boolean): Texture {
  const t = loader.load(`${import.meta.env.BASE_URL}textures/${path}`);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
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
  const facadeIdx: number[][] = KINDS.map(() => []);
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
    const kind = Math.floor(rand() * KINDS.length);
    const K = KINDS[kind] ?? KINDS[0];
    if (!K) continue;
    const uOff = rand() * K.w;

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
            uv.push(p[t1] / ROOF.size, p[t2] / ROOF.size);
          } else {
            const other = 3 - k - a;
            uv.push((p[other] + uOff) / K.w, dist / K.h);
          }

          // Fake ambient occlusion: darker near the street, lighter up high
          const shade = roof ? 1.1 : 0.7 + 0.3 * Math.min(1, dist / sz[a]);
          color.setHex(base).lerp(WHITE, 1 - TINT).multiplyScalar(tone * shade);
          col.push(color.r, color.g, color.b);
        }

        const idx = roof ? roofIdx : (facadeIdx[kind] ?? roofIdx);
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
  geo.setIndex(new BufferAttribute(new Uint32Array([...facadeIdx.flat(), ...roofIdx]), 1));
  let offset = 0;
  facadeIdx.forEach((list, i) => {
    geo.addGroup(offset, list.length, i);
    offset += list.length;
  });
  geo.addGroup(offset, roofIdx.length, KINDS.length);

  const mats = KINDS.map((k) => {
    const m = new MeshStandardMaterial({
      map: tex(`${k.dir}/color.jpg`, true),
      normalMap: tex(`${k.dir}/normal.jpg`, false),
      normalScale: new Vector2(0.8, 0.8),
      emissiveMap: tex(`${k.dir}/emission.jpg`, true),
      emissive: 0xffffff,
      emissiveIntensity: WINDOW_GLOW,
      vertexColors: true,
      roughness: 0.7,
    });
    return m;
  });
  const roofMat = new MeshStandardMaterial({
    map: tex(`${ROOF.dir}/color.jpg`, true),
    normalMap: tex(`${ROOF.dir}/normal.jpg`, false),
    vertexColors: true,
    roughness: 0.95,
  });

  const mesh = new Mesh(geo, [...mats, roofMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}