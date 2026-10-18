import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three';

export interface Aabb {
  min: Vector3;
  max: Vector3;
}

// Small seeded random generator so the city is identical on every run
function mulberry32(seed: number): () => number {
  let a = seed;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Slight tint per face axis (x, y, z) so you can tell which wall you are on
const FACE_COLORS: ReadonlyArray<number> = [0x6b7a99, 0x7a8794, 0x9a8b78];

interface Block {
  center: Vector3;
  size: Vector3;
  axis: number;
}

/**
 * Gray-box city: buildings grow inward from all 6 walls of the arena,
 * so every wall can become a street when gravity shifts.
 */
export class City {
  readonly mesh: InstancedMesh;
  readonly colliders: Aabb[] = [];

  constructor(half: number, cells = 6, seed = 1337) {
    const rand = mulberry32(seed);
    const cell = (half * 2) / cells;
    const mid = cells / 2;
    const blocks: Block[] = [];

    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      for (const s of [-1, 1]) {
        for (let i = 0; i < cells; i++) {
          for (let j = 0; j < cells; j++) {
            // Keep a clear plaza where the player spawns (bottom wall, center)
            const spawn = a === 1 && s === -1 && (i === mid - 1 || i === mid) && (j === mid - 1 || j === mid);
            if (spawn || rand() < 0.25) continue;

            const w = cell * (0.45 + rand() * 0.3);
            const d = cell * (0.45 + rand() * 0.3);
            const h = 3 + rand() * rand() * 10;

            const c = [0, 0, 0];
            const sz = [0, 0, 0];
            c[a] = s * (half - h / 2);
            sz[a] = h;
            c[u] = -half + (i + 0.5) * cell;
            sz[u] = w;
            c[v] = -half + (j + 0.5) * cell;
            sz[v] = d;
            blocks.push({ center: new Vector3(c[0], c[1], c[2]), size: new Vector3(sz[0], sz[1], sz[2]), axis: a });
          }
        }
      }
    }

    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
      blocks.length,
    );
    this.mesh.frustumCulled = false;

    const m = new Matrix4();
    const color = new Color();
    blocks.forEach((b, idx) => {
      m.makeScale(b.size.x, b.size.y, b.size.z);
      m.setPosition(b.center);
      this.mesh.setMatrixAt(idx, m);
      color.setHex(FACE_COLORS[b.axis]).multiplyScalar(0.8 + rand() * 0.4);
      this.mesh.setColorAt(idx, color);
      const halfSize = b.size.clone().multiplyScalar(0.5);
      this.colliders.push({
        min: b.center.clone().sub(halfSize),
        max: b.center.clone().add(halfSize),
      });
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}