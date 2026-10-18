import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

export class ThirdPersonCamera {
  readonly forward = new Vector3(0, 0, -1);
  private readonly prevUp = new Vector3(0, 1, 0);
  private readonly q = new Quaternion();
  private readonly target = new Vector3();

  readonly camera: PerspectiveCamera;
  private readonly distance: number;
  private readonly height: number;

  constructor(camera: PerspectiveCamera, distance = 6, height = 2.2) {
    this.camera = camera;
    this.distance = distance;
    this.height = height;
  }

  addYaw(angle: number, up: Vector3): void {
    this.forward.applyAxisAngle(up, angle);
  }

  update(playerPos: Vector3, up: Vector3): void {
    // Carry the view direction along when "up" rotates (gravity shift)
    this.q.setFromUnitVectors(this.prevUp, up);
    this.forward.applyQuaternion(this.q);
    this.prevUp.copy(up);
    this.forward.addScaledVector(up, -this.forward.dot(up)).normalize();

    this.target.copy(playerPos).addScaledVector(up, 1);
    this.camera.position
      .copy(this.target)
      .addScaledVector(this.forward, -this.distance)
      .addScaledVector(up, this.height);
    this.camera.up.copy(up);
    this.camera.lookAt(this.target);
  }
}