import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  EdgesGeometry,
  Fog,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  CanvasTexture,
  DoubleSide,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { TouchControls } from './input/TouchControls';
import { Player } from './player/Player';
import { GravityManager } from './world/GravityManager';
import { City } from './world/City';

const ARENA = 60;
const HALF = ARENA / 2;

document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';

const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = null;
scene.fog = new Fog(0x0b1020, 20, 90);
scene.add(new AmbientLight(0xffffff, 0.6));
scene.add(new HemisphereLight(0xaad4ff, 0x223344, 1.2));

const arenaGeo = new BoxGeometry(ARENA, ARENA, ARENA);
const gridCanvas = document.createElement('canvas');
gridCanvas.width = 512;
gridCanvas.height = 512;
const ctx = gridCanvas.getContext('2d');
if (ctx) {
  ctx.fillStyle = '#1b2433';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#3a5a80';
  ctx.lineWidth = 2;
  const step = 512 / 20;
  for (let i = 0; i <= 20; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, 512);
    ctx.moveTo(0, i * step);
    ctx.lineTo(512, i * step);
    ctx.stroke();
  }
}
const gridTex = new CanvasTexture(gridCanvas);
scene.add(new Mesh(arenaGeo, new MeshStandardMaterial({ map: gridTex, side: BackSide, roughness: 0.9 })));
scene.add(new LineSegments(new EdgesGeometry(arenaGeo), new LineBasicMaterial({ color: 0x4fd1ff })));
const city = new City(HALF);
scene.add(city.mesh);

// Orange tint on the wall that is about to become the floor
const tintMat = new MeshBasicMaterial({
  color: 0xff7a1a,
  transparent: true,
  opacity: 0,
  side: DoubleSide,
  depthWrite: false,
});
const tint = new Mesh(new PlaneGeometry(ARENA, ARENA), tintMat);
tint.visible = false;
scene.add(tint);

const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
const chase = new ThirdPersonCamera(camera);
const player = new Player(new Vector3(0, -HALF + 0.8, 0));
scene.add(player.mesh);

const controls = new TouchControls(document.body);

// Test values: shift every 15-30s. Use (60, 180) for release.
const gravity = new GravityManager(15, 30, 3);

const hud = document.createElement('div');
hud.style.cssText =
  'position:fixed;top:24px;left:50%;transform:translateX(-50%);color:#ff5a36;font:700 28px sans-serif;z-index:20;pointer-events:none';
document.body.appendChild(hud);
const arrow = document.createElement('div');
arrow.textContent = '▲';
arrow.style.cssText =
  'position:fixed;top:90px;left:50%;margin-left:-20px;width:40px;height:40px;font:40px/40px sans-serif;text-align:center;color:#ff7a1a;z-index:20;pointer-events:none;display:none';
document.body.appendChild(arrow);

let warning = false;
const combat = { active: false }; // enemies will set this later
gravity.canShift = (): boolean => !combat.active;
gravity.onWarning = (s: number): void => {
  warning = true;
  hud.textContent = s > 0 ? `GRAVITY SHIFT IN ${s}` : 'GRAVITY SHIFT AFTER THE FIGHT';
};
gravity.onShift = (): void => {
  warning = false;
  hud.textContent = '';
  arrow.style.display = 'none';
  tint.visible = false;
};

const arrowDir = new Vector3();

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG') gravity.shift(); // debug: force a shift
  if (e.code === 'KeyF') combat.active = !combat.active; // debug: fake a fight on/off
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
const tick = (now: number): void => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  controls.update();
  gravity.update(dt);

  const look = controls.state.look;
  chase.addYaw(-look.x * 0.006, player.visualUp);
  look.x = 0;
  look.y = 0;

  player.update(dt, controls.state, gravity.direction, chase.forward, HALF, city.colliders);
  chase.update(player.mesh.position, player.visualUp);
  camera.position.clampScalar(-(HALF - 0.3), HALF - 0.3);
  
  if (warning) {
    tint.visible = true;
    tint.position.copy(gravity.next).multiplyScalar(HALF - 0.05);
    tint.lookAt(0, 0, 0);
    tintMat.opacity = 0.12 + 0.1 * Math.sin(now / 120);
    // Arrow pointing toward the new "down", in screen space
    arrowDir.copy(gravity.next).transformDirection(camera.matrixWorldInverse);
    arrow.style.display = 'block';
    arrow.style.transform = `rotate(${Math.atan2(arrowDir.x, arrowDir.y)}rad)`;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);