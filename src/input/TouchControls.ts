export interface InputState {
  move: { x: number; y: number };
  look: { x: number; y: number };
  jump: boolean;
  dodge: boolean;
  attack: boolean;
  ability: boolean;
}

type ButtonKey = 'jump' | 'dodge' | 'attack' | 'ability';

// PS-style diamond: ✕ bottom, ○ right, □ left, △ top
const BUTTONS: ReadonlyArray<{ key: ButtonKey; label: string; dx: number; dy: number }> = [
  { key: 'jump', label: '✕', dx: 0, dy: 1 },
  { key: 'dodge', label: '○', dx: 1, dy: 0 },
  { key: 'attack', label: '□', dx: -1, dy: 0 },
  { key: 'ability', label: '△', dx: 0, dy: -1 },
];

const RADIUS = 60;

export class TouchControls {
  readonly state: InputState = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    jump: false,
    dodge: false,
    attack: false,
    ability: false,
  };

  private readonly held: Record<ButtonKey, boolean> = {
    jump: false,
    dodge: false,
    attack: false,
    ability: false,
  };
  private readonly keys = new Set<string>();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private joyId: number | null = null;
  private lookId: number | null = null;
  private joyX = 0;
  private joyY = 0;
  private lastX = 0;
  private lastY = 0;
  private readonly joyVec = { x: 0, y: 0 };

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      touchAction: 'none',
      userSelect: 'none',
      zIndex: '10',
    });
    parent.appendChild(root);

    this.base = this.makeCircle(120, 0.08, root);
    this.knob = this.makeCircle(52, 0.25, root);

    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onUp(e));
    root.addEventListener('pointercancel', (e) => this.onUp(e));
    this.buildButtons(root);

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** Call once per frame. Merges touch + keyboard (keyboard is for desktop testing). */
  update(): void {
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    this.state.move.x = this.joyVec.x || kx;
    this.state.move.y = this.joyVec.y || ky;
    this.state.jump = this.held.jump || k.has('Space');
    this.state.dodge = this.held.dodge || k.has('ShiftLeft');
    this.state.attack = this.held.attack || k.has('KeyJ');
    this.state.ability = this.held.ability || k.has('KeyK');
  }

  private makeCircle(size: number, alpha: number, parent: HTMLElement): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.35)',
      background: `rgba(255,255,255,${alpha})`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      display: 'none',
    });
    parent.appendChild(el);
    return el;
  }

  private place(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  private onDown(e: PointerEvent): void {
    if (e.clientX < window.innerWidth / 2) {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      this.joyX = e.clientX;
      this.joyY = e.clientY;
      this.place(this.base, e.clientX, e.clientY);
      this.place(this.knob, e.clientX, e.clientY);
      this.base.style.display = 'block';
      this.knob.style.display = 'block';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.joyId) {
      const dx = e.clientX - this.joyX;
      const dy = e.clientY - this.joyY;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, RADIUS);
      this.joyVec.x = (dx / len) * (clamped / RADIUS);
      this.joyVec.y = -(dy / len) * (clamped / RADIUS);
      this.place(this.knob, this.joyX + (dx / len) * clamped, this.joyY + (dy / len) * clamped);
    } else if (e.pointerId === this.lookId) {
      this.state.look.x += e.clientX - this.lastX;
      this.state.look.y += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.joyVec.x = 0;
      this.joyVec.y = 0;
      this.base.style.display = 'none';
      this.knob.style.display = 'none';
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  private buildButtons(root: HTMLElement): void {
    const cluster = document.createElement('div');
    Object.assign(cluster.style, {
      position: 'absolute',
      right: '24px',
      bottom: '24px',
      width: '190px',
      height: '190px',
    });
    root.appendChild(cluster);

    for (const b of BUTTONS) {
      const el = document.createElement('div');
      el.textContent = b.label;
      Object.assign(el.style, {
        position: 'absolute',
        left: `${95 + b.dx * 62 - 32}px`,
        top: `${95 + b.dy * 62 - 32}px`,
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.4)',
        background: 'rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.7)',
        font: '28px sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      });
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.held[b.key] = true;
        el.style.background = 'rgba(255,255,255,0.3)';
      });
      const release = (): void => {
        this.held[b.key] = false;
        el.style.background = 'rgba(255,255,255,0.1)';
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      cluster.appendChild(el);
    }
  }
}