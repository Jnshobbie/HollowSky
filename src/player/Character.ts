import { Box3, Group, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface LoadedCharacter {
  /** Add this to the scene / to Player.mesh. Faces +Z, 1 unit = 1 metre. */
  root: Group;
  /** Height used to scale the model, in metres. */
  height: number;
}

/**
 * Loads the Jake model (see public/models/jake.glb).
 * The exported rig is upside-down and ~1000x too large in skinned space, so we
 * rotate it upright, measure the real skinned bounds and scale to `height`.
 * `origin: 'center'` puts the pivot at mid-body (matches the capsule), 'feet' at the soles.
 */
export async function loadCharacter(
  url: string,
  height = 1.7,
  origin: 'feet' | 'center' = 'center',
): Promise<LoadedCharacter> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);

  const model = gltf.scene;
  model.rotation.x = Math.PI; // rig is exported upside-down
  const root = new Group();
  root.add(model);
  root.updateMatrixWorld(true);

  const box = new Box3().setFromObject(model, true); // precise: uses the skinned pose
  const size = box.getSize(new Vector3());
  model.scale.setScalar(height / size.y);
  root.updateMatrixWorld(true);

  const fitted = new Box3().setFromObject(model, true);
  const center = fitted.getCenter(new Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= origin === 'feet' ? fitted.min.y : center.y;

  model.traverse((o: Object3D) => {
    if (o instanceof Mesh) o.frustumCulled = false; // skinned bounds are unreliable on this rig
  });

  return { root, height };
}