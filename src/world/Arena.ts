import { BackSide, BoxGeometry, CanvasTexture, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { mulberry32 } from './rng';

/** The six walls of the world: asphalt streets with lane markings and crosswalks. */
export function createArena(size: number, cells: number): Mesh {
  const S = 1024;
  const rand = mulberry32(5);
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');

  g.fillStyle = '#55524b';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 7000; i++) {
    const light = rand() < 0.5;
    g.fillStyle = light ? `rgba(255,255,255,${0.02 + rand() * 0.05})` : `rgba(0,0,0,${0.04 + rand() * 0.08})`;
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 3);
  }

  const unit = S / size; // pixels per world unit
  const step = S / cells;

  // Dashed yellow lane lines along the cell borders (the streets between buildings)
  g.strokeStyle = 'rgba(214,180,90,0.75)';
  g.lineWidth = 0.25 * unit;
  g.setLineDash([2 * unit, 2 * unit]);
  for (let i = 1; i < cells; i++) {
    const p = i * step;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, S);
    g.moveTo(0, p);
    g.lineTo(S, p);
    g.stroke();
  }
  g.setLineDash([]);

  // Zebra crosswalks on the four arms of every intersection
  g.fillStyle = 'rgba(235,230,215,0.8)';
  for (let i = 1; i < cells; i++) {
    for (let j = 1; j < cells; j++) {
      const cx = i * step;
      const cy = j * step;
      for (const off of [-3, 3]) {
        for (let n = 0; n < 8; n++) {
          const o = -1.6 * unit + n * 0.4 * unit;
          g.fillRect(cx + off * unit - 0.6 * unit, cy + o, 1.2 * unit, 0.2 * unit); // arms along x
          g.fillRect(cx + o, cy + off * unit - 0.6 * unit, 0.2 * unit, 1.2 * unit); // arms along y
        }
      }
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;

  const mesh = new Mesh(
    new BoxGeometry(size, size, size),
    new MeshStandardMaterial({ map: tex, side: BackSide, roughness: 0.95 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}