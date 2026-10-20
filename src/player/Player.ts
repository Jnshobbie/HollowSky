import { BoxGeometry, CapsuleGeometry, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { InputState } from '../input/TouchControls';
import type { Aabb } from '../world/City';

const SPEED = 8;
const GRAVITY = 28;
const JUMP = 11;
const MAX_FALL = 30;

type Axis = 'x' | 'y' | 'z';
const AXES: ReadonlyArray<Axis> = ['x', 'y', 'z'];

export class Player {
  readonly mesh: Mesh;
  readonly visualUp = new Vector3(0, 1, 0);
  grounded = false;

  private fallSpeed = 0;
  private readonly heading = new Vector3(0, 0, 1);
  private readonly up = new Vector3();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly wish = new Vector3();
  private readonly basisX = new Vector3();
  private readonly basisZ = new Vector3();
  private readonly basis = new Matrix4();
  private readonly axis = new Vector3();
  private readonly half = new Vector3();
  private readonly absG = new Vector3();
  private readonly delta = new Vector3();

  constructor(start: Vector3) {
    this.mesh = new Mesh(
      new CapsuleGeometry(0.35, 0.9, 4, 8),
      new MeshStandardMaterial({ color: 0xffc857 }),
    );
    const nose = new Mesh(new BoxGeometry(0.2, 0.2, 0.3), new MeshStandardMaterial({ color: 0xff5a36 }));
    nose.position.set(0, 0.3, 0.4);
    this.mesh.add(nose);
    this.mesh.position.copy(start);
  }

  private moveAxis(axis: Axis, d: number, gAxis: number, colliders: ReadonlyArray<Aabb>, bound: number): void {
    const pos = this.mesh.position;
    const h = this.half[axis];
    pos[axis] += d;

    const lim = bound - h;
    if (pos[axis] > lim || pos[axis] < -lim) {
      pos[axis] = Math.max(-lim, Math.min(lim, pos[axis]));
      this.onHit(d, gAxis);
    }
    for (const b of colliders) {
      if (d === 0 || !this.overlaps(b)) continue;
      pos[axis] = d > 0 ? b.min[axis] - h : b.max[axis] + h;
      this.onHit(d, gAxis);
    }
  }

  private rotateUpToward(target: Vector3, t: number): void {
    const angle = Math.acos(Math.max(-1, Math.min(1, this.visualUp.dot(target))));
    if (angle < 1e-4) {
      this.visualUp.copy(target);
      return;
    }
    // Opposite vectors have no single rotation axis, so fall back to the heading
    this.axis.crossVectors(this.visualUp, target);
    if (this.axis.lengthSq() < 1e-8) this.axis.copy(this.heading);
    this.axis.normalize();
    this.visualUp.applyAxisAngle(this.axis, angle * t).normalize();
  }

  private onHit(d: number, gAxis: number): void {
    if (gAxis === 0) return;
    if (d * gAxis > 0) this.grounded = true;
    else this.fallSpeed = 0; // bumped a ceiling
  }

  private overlaps(b: Aabb): boolean {
    const p = this.mesh.position;
    const h = this.half;
    return (
      p.x + h.x > b.min.x && p.x - h.x < b.max.x &&
      p.y + h.y > b.min.y && p.y - h.y < b.max.y &&
      p.z + h.z > b.min.z && p.z - h.z < b.max.z
    );
  }

  update(
    dt: number,
    input: InputState,
    g: Vector3,
    camForward: Vector3,
    bound: number,
    colliders: ReadonlyArray<Aabb>,
  ): void {
    this.up.copy(g).negate();

    // Camera-relative movement on the plane perpendicular to "up"
    this.fwd.copy(camForward).addScaledVector(this.up, -camForward.dot(this.up)).normalize();
    this.right.crossVectors(this.fwd, this.up);
    this.wish.set(0, 0, 0).addScaledVector(this.fwd, input.move.y).addScaledVector(this.right, input.move.x);
    if (this.wish.lengthSq() > 1) this.wish.normalize();

    // Gravity along g (positive fallSpeed = falling toward the floor)
    this.fallSpeed = Math.min(this.fallSpeed + GRAVITY * dt, MAX_FALL);
    if (this.grounded && input.jump) {
      this.fallSpeed = -JUMP;
      this.grounded = false;
    }

    // Move one axis at a time against the arena walls and the city boxes
    this.absG.set(Math.abs(g.x), Math.abs(g.y), Math.abs(g.z));
    this.half.set(0.4, 0.4, 0.4).addScaledVector(this.absG, 0.4);
    this.delta.copy(this.wish).multiplyScalar(SPEED * dt).addScaledVector(g, this.fallSpeed * dt);
    this.grounded = false;
    for (const axis of AXES) this.moveAxis(axis, this.delta[axis], g[axis], colliders, bound);
    if (this.grounded && this.fallSpeed > 0) this.fallSpeed = 0;

    // Smooth "up" so the world flip feels like a roll, not a snap
    this.rotateUpToward(this.up, 1 - Math.exp(-10 * dt));

    // Face movement direction
    if (this.wish.lengthSq() > 0.01) {
      this.heading.lerp(this.wish.clone().normalize(), 1 - Math.exp(-12 * dt));
    }
    this.heading.addScaledVector(this.visualUp, -this.heading.dot(this.visualUp));
    if (this.heading.lengthSq() < 1e-6) this.heading.copy(this.fwd);
    this.heading.normalize();

    this.basisZ.copy(this.heading);
    this.basisX.crossVectors(this.visualUp, this.basisZ);
    this.basis.makeBasis(this.basisX, this.visualUp, this.basisZ);
    this.mesh.quaternion.setFromRotationMatrix(this.basis);
  }
}