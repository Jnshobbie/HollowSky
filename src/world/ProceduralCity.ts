import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  CylinderGeometry,
  SphereGeometry,
} from 'three';
import type { Aabb } from './City';

// Same tiny seeded generator as City.ts so the city is identical every run
function mulberry32(seed: number): () => number {
  let a = seed;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

const WIN_W = 2.2; // meters per window column
const WIN_H = 3.2; // meters per floor

interface FacadeStyle {
  base: string;
  frame: string;
  glass: ReadonlyArray<string>;
  litChance: number;
}

const STYLES: ReadonlyArray<FacadeStyle> = [
  { base: '#5a6578', frame: '#2a3038', glass: ['#0f1a26', '#13222f', '#0b141d'], litChance: 0.28 },
  { base: '#7d7468', frame: '#3a362f', glass: ['#1a1d22', '#14171c', '#20252b'], litChance: 0.4 },
  { base: '#3d4a63', frame: '#1c2230', glass: ['#122033', '#0d1a2a', '#162840'], litChance: 0.2 },
];

const LIT_COLORS: ReadonlyArray<string> = ['#ffd9a0', '#ffcf85', '#cfe6ff', '#fff0c8'];

interface FacadeTextures {
  map: CanvasTexture;
  emissive: CanvasTexture;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  return [c, ctx];
}

function finishTexture(c: HTMLCanvasElement, srgb: boolean): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/** One tile = COLS x ROWS windows. UVs are in tile units, so repeat follows world size. */
function makeFacadeTextures(style: FacadeStyle, rand: Rand): FacadeTextures {
  const COLS = 8;
  const ROWS = 8;
  const CELL = 64;
  const [mapC, m] = makeCanvas(COLS * CELL, ROWS * CELL);
  const [emC, e] = makeCanvas(COLS * CELL, ROWS * CELL);
  m.fillStyle = style.base;
  m.fillRect(0, 0, mapC.width, mapC.height);
  e.fillStyle = '#000';
  e.fillRect(0, 0, emC.width, emC.height);

  // concrete grain
  for (let i = 0; i < 2500; i++) {
    m.fillStyle = `rgba(255,255,255,${rand() * 0.04})`;
    m.fillRect(rand() * mapC.width, rand() * mapC.height, 2, 2);
    m.fillStyle = `rgba(0,0,0,${rand() * 0.07})`;
    m.fillRect(rand() * mapC.width, rand() * mapC.height, 3, 2);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL + 9;
      const y = r * CELL + 9;
      const w = CELL - 18;
      const h = CELL - 22;
      m.fillStyle = style.frame;
      m.fillRect(x - 3, y - 3, w + 6, h + 6);
      const glass = style.glass[Math.floor(rand() * style.glass.length)] ?? '#101820';
      m.fillStyle = glass;
      m.fillRect(x, y, w, h);
      // sky reflection streak
      const g = m.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, 'rgba(120,160,210,0.16)');
      g.addColorStop(0.5, 'rgba(120,160,210,0)');
      m.fillStyle = g;
      m.fillRect(x, y, w, h);
      // sill
      m.fillStyle = 'rgba(255,255,255,0.08)';
      m.fillRect(x - 3, y + h + 3, w + 6, 3);

      if (rand() < style.litChance) {
        const col = LIT_COLORS[Math.floor(rand() * LIT_COLORS.length)] ?? '#ffd9a0';
        e.fillStyle = col;
        e.globalAlpha = 0.55 + rand() * 0.45;
        e.fillRect(x, y, w, h);
        e.globalAlpha = 1;
        // curtain / furniture shadow so lit windows are not flat
        e.fillStyle = 'rgba(0,0,0,0.35)';
        e.fillRect(x, y, w, Math.floor(h * (0.1 + rand() * 0.3)));
      }
    }
  }
  return { map: finishTexture(mapC, true), emissive: finishTexture(emC, true) };
}

function makeRoofTexture(rand: Rand): CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#4a4d54';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.05})`;
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.15})`;
    ctx.fillRect(rand() * 256, rand() * 256, 3, 3);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 244, 244);
  return finishTexture(c, true);
}

/** Wet asphalt for a full wall. Streets run along the cell boundaries. */
function makeStreetTexture(size: number, cells: number, rand: Rand): CanvasTexture {
  const [c, ctx] = makeCanvas(size, size);
  const cell = size / cells;
  ctx.fillStyle = '#2a2d33'; // sidewalk / lots base (darker concrete)
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.035})`;
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  const road = cell * 0.34; // road half-width in px
  const curb = 10;
  const drawRoad = (horizontal: boolean, at: number): void => {
    const x = horizontal ? 0 : at - road;
    const y = horizontal ? at - road : 0;
    const w = horizontal ? size : road * 2;
    const h = horizontal ? road * 2 : size;
    // curb + sidewalk
    ctx.fillStyle = '#5a5e66';
    ctx.fillRect(horizontal ? 0 : x - curb, horizontal ? y - curb : 0, horizontal ? size : w + curb * 2, horizontal ? h + curb * 2 : size);
    // asphalt
    ctx.fillStyle = '#1c1e24';
    ctx.fillRect(x, y, w, h);
    // center dashes
    ctx.fillStyle = 'rgba(230,200,90,0.75)';
    for (let p = 0; p < size; p += 44) {
      if (horizontal) ctx.fillRect(p, at - 2, 24, 4);
      else ctx.fillRect(at - 2, p, 4, 24);
    }
    // edge lines
    ctx.fillStyle = 'rgba(220,220,220,0.35)';
    if (horizontal) {
      ctx.fillRect(0, y + 8, size, 2);
      ctx.fillRect(0, y + h - 10, size, 2);
    } else {
      ctx.fillRect(x + 8, 0, 2, size);
      ctx.fillRect(x + w - 10, 0, 2, size);
    }
  };
  for (let i = 0; i <= cells; i++) {
    drawRoad(true, i * cell);
    drawRoad(false, i * cell);
  }
  // crosswalks at intersections
  ctx.fillStyle = 'rgba(235,235,235,0.55)';
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      const cx = i * cell;
      const cy = j * cell;
      for (let k = -4; k <= 4; k++) {
        ctx.fillRect(cx + k * 9 - 3, cy - road - 26, 6, 18);
        ctx.fillRect(cx + k * 9 - 3, cy + road + 8, 6, 18);
      }
    }
  }
  // oil / wet patches
  for (let i = 0; i < 70; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
    g.addColorStop(0, 'rgba(60,80,110,0.18)');
    g.addColorStop(1, 'rgba(60,80,110,0)');
    ctx.save();
    ctx.translate(rand() * size, rand() * size);
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, 80, 80);
    ctx.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---- geometry builder -------------------------------------------------------

class Builder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly nrm: number[] = [];
  readonly idx: number[] = [];

  quad(p: Vector3[], n: Vector3, uvs: number[]): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      const v = p[i];
      if (!v) continue;
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.x, n.y, n.z);
      this.uv.push(uvs[i * 2] ?? 0, uvs[i * 2 + 1] ?? 0);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

interface BuildingBox {
  axis: number; // growth axis (0,1,2); the building grows from the wall at sign*half
  sign: number;
  u: number; // center along axis (a+1)%3
  v: number; // center along axis (a+2)%3
  w: number; // size along u
  d: number; // size along v
  h0: number; // start height from wall
  h1: number; // end height from wall
}

/**
 * Emits the 4 side faces (to `sides`) and the roof (to `roofs`) of one box.
 * UVs on sides are in window-tile units: horizontal = meters / (WIN_W*8), vertical = meters / (WIN_H*8).
 */
function emitBox(b: BuildingBox, half: number, sides: Builder, roofs: Builder, uOff: number): void {
  const a = b.axis;
  const u = (a + 1) % 3;
  const v = (a + 2) % 3;
  const make = (du: number, dv: number, h: number): Vector3 => {
    const p = [0, 0, 0];
    p[a] = b.sign * (half - h);
    p[u] = b.u + du;
    p[v] = b.v + dv;
    return new Vector3(p[0], p[1], p[2]);
  };
  const hw = b.w / 2;
  const hd = b.d / 2;
  const tileW = WIN_W * 8;
  const tileH = WIN_H * 8;
  const v0 = (b.h0 / tileH) * 1;
  const v1 = (b.h1 / tileH) * 1;

  const side = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    normal: Vector3,
    len: number,
    flip: boolean,
  ): void => {
    const p0 = make(ax, ay, b.h0);
    const p1 = make(bx, by, b.h0);
    const p2 = make(bx, by, b.h1);
    const p3 = make(ax, ay, b.h1);
    const u0 = uOff / tileW;
    const u1 = u0 + len / tileW;
    const pts = flip ? [p1, p0, p3, p2] : [p0, p1, p2, p3];
    const uvs = flip ? [u1, v0, u0, v0, u0, v1, u1, v1] : [u0, v0, u1, v0, u1, v1, u0, v1];
    sides.quad(pts, normal, uvs);
  };

  // Outward normals in world space
  const nu = new Vector3();
  const nv = new Vector3();
  const nuA = [0, 0, 0];
  const nvA = [0, 0, 0];
  nuA[u] = 1;
  nvA[v] = 1;
  nu.set(nuA[0] ?? 0, nuA[1] ?? 0, nuA[2] ?? 0);
  nv.set(nvA[0] ?? 0, nvA[1] ?? 0, nvA[2] ?? 0);

  // Winding depends on handedness of (u, v, growth-up). Axes cycle x->y->z so
  // (u, v, a) is right-handed; "up" is sign * axis a.
  const flip = b.sign < 0;
  side(hw, -hd, hw, hd, nu.clone(), b.d, flip);
  side(-hw, hd, -hw, -hd, nu.clone().negate(), b.d, flip);
  side(hw, hd, -hw, hd, nv.clone(), b.w, flip);
  side(-hw, -hd, hw, -hd, nv.clone().negate(), b.w, flip);

  // roof
  const up = new Vector3();
  const upA = [0, 0, 0];
  upA[a] = -b.sign; // toward arena center
  up.set(upA[0] ?? 0, upA[1] ?? 0, upA[2] ?? 0);
  const r = [make(-hw, -hd, b.h1), make(hw, -hd, b.h1), make(hw, hd, b.h1), make(-hw, hd, b.h1)];
  const pts = flip ? [r[0] as Vector3, r[1] as Vector3, r[2] as Vector3, r[3] as Vector3] : [r[1] as Vector3, r[0] as Vector3, r[3] as Vector3, r[2] as Vector3];
  roofs.quad(pts, up, [0, 0, 1, 0, 1, 1, 0, 1]);
}

// -----------------------------------------------------------------------------

export class ProceduralCity {
  /** Add this to the scene. */
  readonly mesh = new Group();
  readonly colliders: Aabb[] = [];

  constructor(half: number, cells = 6, seed = 1337) {
    const rand = mulberry32(seed);
    const cell = (half * 2) / cells;
    const mid = cells / 2;

    // --- facade materials (one per style) + roof material
    const sideBuilders = STYLES.map(() => new Builder());
    const roofBuilder = new Builder();
    const facadeMats = STYLES.map((s) => {
      const t = makeFacadeTextures(s, rand);
      return new MeshStandardMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: new Color(0xffffff),
        emissiveIntensity: 1.6,
        roughness: 0.55,
        metalness: 0.25,
      });
    });
    const roofMat = new MeshStandardMaterial({ map: makeRoofTexture(rand), roughness: 0.95 });

    const props: Array<{ p: Vector3; s: Vector3; k: 'box' | 'cyl' }> = [];
    const lamps: Array<{ p: Vector3; up: Vector3 }> = [];

    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      for (const s of [-1, 1]) {
        for (let i = 0; i < cells; i++) {
          for (let j = 0; j < cells; j++) {
            const spawn = a === 1 && s === -1 && (i === mid - 1 || i === mid) && (j === mid - 1 || j === mid);
            if (spawn || rand() < 0.2) continue;

            const w = cell * (0.5 + rand() * 0.28);
            const d = cell * (0.5 + rand() * 0.28);
            // Skyline: mostly mid-rise, a few towers (kept under the arena half so walls stay playable)
            const tower = rand() < 0.18;
            const h = tower ? 16 + rand() * 9 : 6 + rand() * rand() * 12;
            const cu = -half + (i + 0.5) * cell;
            const cv = -half + (j + 0.5) * cell;
            const styleIdx = Math.floor(rand() * STYLES.length);
            const sb = sideBuilders[styleIdx] ?? sideBuilders[0];
            if (!sb) continue;
            const uOff = rand() * 200;

            // Podium + setback tower gives a real silhouette
            const setback = h > 11 && rand() < 0.65;
            const podiumH = setback ? h * (0.35 + rand() * 0.2) : h;
            emitBox({ axis: a, sign: s, u: cu, v: cv, w, d, h0: 0, h1: podiumH }, half, sb, roofBuilder, uOff);
            const mk = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Aabb => ({
              min: new Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
              max: new Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
            });
            const addCollider = (ww: number, dd: number, h0: number, h1: number): void => {
              const c = [0, 0, 0];
              const sz = [0, 0, 0];
              c[a] = s * (half - (h0 + h1) / 2);
              sz[a] = h1 - h0;
              c[u] = cu;
              sz[u] = ww;
              c[v] = cv;
              sz[v] = dd;
              this.colliders.push(mk(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, sz[0] ?? 0, sz[1] ?? 0, sz[2] ?? 0));
            };
            addCollider(w, d, 0, podiumH);

            let topH = podiumH;
            let topW = w;
            let topD = d;
            if (setback) {
              topW = w * (0.55 + rand() * 0.2);
              topD = d * (0.55 + rand() * 0.2);
              emitBox({ axis: a, sign: s, u: cu, v: cv, w: topW, d: topD, h0: podiumH, h1: h }, half, sb, roofBuilder, uOff + 37);
              addCollider(topW, topD, podiumH, h);
              topH = h;
            }

            // Rooftop clutter (visual only)
            const rp = (du: number, dv: number, hh: number): Vector3 => {
              const p = [0, 0, 0];
              p[a] = s * (half - hh);
              p[u] = cu + du;
              p[v] = cv + dv;
              return new Vector3(p[0], p[1], p[2]);
            };
            const clutter = 1 + Math.floor(rand() * 3);
            for (let k = 0; k < clutter; k++) {
              const sx = 0.8 + rand() * 1.6;
              const sy = 0.7 + rand() * 1.0;
              const du = (rand() - 0.5) * topW * 0.6;
              const dv = (rand() - 0.5) * topD * 0.6;
              const sizes = [0, 0, 0];
              sizes[a] = sy;
              sizes[u] = sx;
              sizes[v] = sx * (0.7 + rand() * 0.8);
              props.push({ p: rp(du, dv, topH + sy / 2), s: new Vector3(sizes[0], sizes[1], sizes[2]), k: 'box' });
            }
            if (tower && rand() < 0.8) {
              const sizes = [0, 0, 0];
              const ah = 3 + rand() * 4;
              sizes[a] = ah;
              sizes[u] = 0.18;
              sizes[v] = 0.18;
              props.push({ p: rp(0, 0, topH + ah / 2), s: new Vector3(sizes[0], sizes[1], sizes[2]), k: 'cyl' });
              lamps.push({ p: rp(0, 0, topH + ah), up: new Vector3() }); // aircraft warning light
            }
          }
        }

        // Street lamps on intersections of this wall
        for (let i = 1; i < cells; i++) {
          for (let j = 1; j < cells; j++) {
            if (rand() < 0.45) continue;
            const p = [0, 0, 0];
            const lampH = 4.2;
            const offset = cell * 0.36;
            p[a] = s * (half - lampH / 2);
            p[u] = -half + i * cell + offset;
            p[v] = -half + j * cell + offset;
            const sizes = [0, 0, 0];
            sizes[a] = lampH;
            sizes[u] = 0.14;
            sizes[v] = 0.14;
            props.push({ p: new Vector3(p[0], p[1], p[2]), s: new Vector3(sizes[0], sizes[1], sizes[2]), k: 'cyl' });
            const top = [...p];
            top[a] = s * (half - lampH);
            lamps.push({ p: new Vector3(top[0], top[1], top[2]), up: new Vector3() });
          }
        }
      }
    }

    // --- assemble building meshes
    sideBuilders.forEach((sb, i) => {
      if (sb.idx.length === 0) return;
      const mat = facadeMats[i];
      if (!mat) return;
      const m = new Mesh(sb.build(), mat);
      m.frustumCulled = false;
      this.mesh.add(m);
    });
    const roofs = new Mesh(roofBuilder.build(), roofMat);
    roofs.frustumCulled = false;
    this.mesh.add(roofs);

    // --- props (rooftop units, antenna masts, lamp posts) as instanced meshes
    const darkMetal = new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7, metalness: 0.6 });
    const boxes = props.filter((p) => p.k === 'box');
    const cyls = props.filter((p) => p.k === 'cyl');
    const tmp = new Matrix4();
    const makeInst = (geo: BufferGeometry, list: typeof props): InstancedMesh => {
      const im = new InstancedMesh(geo, darkMetal, Math.max(1, list.length));
      list.forEach((it, n) => {
        // cylinders are Y-aligned by default; orient along the growth axis via the biggest size component
        tmp.identity();
        if (it.k === 'cyl') {
          const axisIdx = it.s.x >= it.s.y && it.s.x >= it.s.z ? 0 : it.s.y >= it.s.z ? 1 : 2;
          const len = axisIdx === 0 ? it.s.x : axisIdx === 1 ? it.s.y : it.s.z;
          const rad = Math.min(it.s.x, it.s.y, it.s.z);
          const r = new Matrix4();
          if (axisIdx === 0) r.makeRotationZ(Math.PI / 2);
          else if (axisIdx === 2) r.makeRotationX(Math.PI / 2);
          tmp.makeScale(rad / 0.5, len, rad / 0.5);
          tmp.premultiply(r);
        } else {
          tmp.makeScale(it.s.x, it.s.y, it.s.z);
        }
        tmp.setPosition(it.p);
        im.setMatrixAt(n, tmp);
      });
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      return im;
    };
    this.mesh.add(makeInst(new CylinderGeometry(0.5, 0.5, 1, 6), cyls));
    this.mesh.add(makeInst(makeUnitBox(), boxes));

    // --- lamp glow bulbs
    const bulb = new InstancedMesh(new SphereGeometry(0.28, 8, 6), new MeshBasicMaterial({ color: 0xffd9a0 }), Math.max(1, lamps.length));
    lamps.forEach((l, n) => {
      tmp.makeTranslation(l.p.x, l.p.y, l.p.z);
      bulb.setMatrixAt(n, tmp);
    });
    bulb.count = lamps.length;
    bulb.instanceMatrix.needsUpdate = true;
    bulb.frustumCulled = false;
    this.mesh.add(bulb);

    // --- ground: textured street planes on all 6 walls (just inside the arena)
    const street = new MeshStandardMaterial({
      map: makeStreetTexture(2048, cells, rand),
      roughness: 0.45,
      metalness: 0.15,
    });
    const eps = 0.03;
    const plane = new PlaneGeometry(half * 2, half * 2);
    const rot: Array<[Vector3, Vector3]> = [
      [new Vector3(1, 0, 0), new Vector3(0, -Math.PI / 2, 0)],
      [new Vector3(-1, 0, 0), new Vector3(0, Math.PI / 2, 0)],
      [new Vector3(0, 1, 0), new Vector3(Math.PI / 2, 0, 0)],
      [new Vector3(0, -1, 0), new Vector3(-Math.PI / 2, 0, 0)],
      [new Vector3(0, 0, 1), new Vector3(0, Math.PI, 0)],
      [new Vector3(0, 0, -1), new Vector3(0, 0, 0)],
    ];
    for (const [dir, euler] of rot) {
      const g = new Mesh(plane, street);
      g.position.copy(dir).multiplyScalar(half - eps);
      g.rotation.set(euler.x, euler.y, euler.z);
      this.mesh.add(g);
    }
  }
}

function makeUnitBox(): BufferGeometry {
  const b = new Builder();
  const h = 0.5;
  const f = (a: number[], b2: number[], c: number[], d: number[], n: number[]): void => {
    const v = (p: number[]): Vector3 => new Vector3(p[0], p[1], p[2]);
    b.quad([v(a), v(b2), v(c), v(d)], v(n), [0, 0, 1, 0, 1, 1, 0, 1]);
  };
  f([-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0, 0, 1]);
  f([h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h], [0, 0, -1]);
  f([h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h], [1, 0, 0]);
  f([-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h], [-1, 0, 0]);
  f([-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0]);
  f([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0]);
  return b.build();
}