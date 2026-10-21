import { DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { TouchControls } from './input/TouchControls';
import { Player } from './player/Player';
import { GravityManager } from './world/GravityManager';
import { ProceduralCity } from './world/ProceduralCity';
import { Look } from './render/Look';
import { createArena } from './world/Arena';
import { Dust } from './world/Dust';
import { createFacades } from './world/Facades'; 
import { loadCharacter } from './player/Character';

const ARENA = 60;
const HALF = ARENA / 2;

document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';

const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = null;


scene.add(createArena(ARENA, 6));
const city = new ProceduralCity(HALF)
scene.add(createFacades(city.colliders, HALF));

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
const fx = new Look(renderer, scene, camera);
const dust = new Dust(260, HALF);
scene.add(dust.points);
const chase = new ThirdPersonCamera(camera);
const player = new Player(new Vector3(0, -HALF + 0.8, 0));
const character = await loadCharacter('/models/jake_1024.glb');
player.mesh.add(character.root);

scene.add(player.mesh);
player.mesh.castShadow = true;

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

  fx.update(now, player.visualUp);
  dust.update(dt, gravity.direction, now);
  fx.render();
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);