import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from 'three';
import type { Texture } from 'three';
import { mulberry32 } from './rng';

/** The six walls of the world: asphalt streets with lane markings and crosswalks. */
export function createArena(size: number, cells: number): Mesh {
  const S = 2048;
  let rand = mulberry32(5);
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');

  const unit = S / size; // pixels per world unit
  const step = S / cells;
  const base = import.meta.env.BASE_URL;
  const asphaltImg = new Image();
  const pavingImg = new Image();
  const SIDEWALK = 1.1; // world units of street kept clear on each side of a cell border
  const draw = (): void => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#55524b';
    g.fillRect(0, 0, S, S);
    const fill = (img: HTMLImageElement, tile: number, x: number, y: number, w: number, h: number): void => {
      if (!img.complete || img.naturalWidth === 0) return;
      const pat = g.createPattern(img, 'repeat');
      if (!pat) return;
      pat.setTransform(new DOMMatrix().scale((tile * unit) / img.naturalWidth));
      g.fillStyle = pat;
      g.fillRect(x, y, w, h);
    };
    fill(asphaltImg, 8, 0, 0, S, S);
    g.fillStyle = 'rgba(0,0,0,0.3)'; // dark, wet asphalt
    g.fillRect(0, 0, S, S);
    // Paved sidewalk islands inside every block, leaving the streets on the cell borders
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const inset = SIDEWALK * unit;
        fill(pavingImg, 4, i * step + inset, j * step + inset, step - 2 * inset, step - 2 * inset);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const inset = SIDEWALK * unit;
        g.fillRect(i * step + inset, j * step + inset, step - 2 * inset, step - 2 * inset);
      }
    }
    for (let i = 0; i < 7000; i++) {
      const light = rand() < 0.5;
      g.fillStyle = light ? `rgba(255,255,255,${0.02 + rand() * 0.05})` : `rgba(0,0,0,${0.04 + rand() * 0.08})`;
      g.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 3);
    }
    drawMarkings();
  };

  const drawMarkings = (): void => {
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

  };

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  draw();
  const redraw = (): void => {
    rand = mulberry32(5);
    draw();
    tex.needsUpdate = true;
  };
  asphaltImg.onload = redraw;
  pavingImg.onload = redraw;
  asphaltImg.src = `${base}textures/Asphalt025C/color.jpg`;
  pavingImg.src = `${base}textures/PavingStones034/color.jpg`;

  // Fine asphalt grit and wet-looking roughness, tiled finer than the street layout
  const loader = new TextureLoader();
  const micro = (path: string): Texture => {
    const t = loader.load(`${base}textures/Asphalt025C/${path}`);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(size / 3, size / 3);
    t.anisotropy = 8;
    return t;
  };

  const mesh = new Mesh(
    new BoxGeometry(size, size, size),
    new MeshStandardMaterial({
      map: tex,
      normalMap: micro('normal.jpg'),
      normalScale: new Vector2(1, 1),
      roughnessMap: micro('roughness.jpg'),
      side: BackSide,
      roughness: 1,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}