/**
 * MapLibre custom layer — renders LiDAR green meshes with Three.js.
 * MapLibre v4 passes CustomRenderMethodInput (not a raw matrix) as arg 2.
 *
 * Mesh coords are meters [east, up, north] from the course origin. The satellite
 * basemap has no terrain DEM, so we pin altitude to 0 and keep only relative
 * relief — using absolute USGS elev here floats greens ~100m above the map.
 */
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import type { GreenMeshCourse } from '../../lib/golfGreen3d';

const LAYER_ID = 'golf-green-3d';
/** Mild vertical exaggerate so 1–2 m of green undulation still reads. */
const RELIEF_SCALE = 2.5;

export interface Green3DState {
  course: GreenMeshCourse | null;
  activeHole: number | null;
  enabled: boolean;
}

type Getter = () => Green3DState;

function clearMeshes(scene: THREE.Scene) {
  for (const child of [...scene.children]) {
    if (child instanceof THREE.Light) continue;
    scene.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  }
}

function rebuildMeshes(
  scene: THREE.Scene,
  course: GreenMeshCourse | null,
  activeHole: number | null,
) {
  clearMeshes(scene);
  if (!course?.greens.length) return;

  for (const g of course.greens) {
    // Only the active green — rendering every hole as a floating sheet was
    // unreadable and blocked the fairway.
    if (activeHole != null && g.hole !== activeHole) continue;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(g.positions, 3),
    );
    geom.setIndex(g.indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      color: 0xa7f3d0,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      shininess: 18,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.set(1, RELIEF_SCALE, 1);
    scene.add(mesh);
  }
}

function asMatrix4(input: unknown): THREE.Matrix4 {
  const mat = new THREE.Matrix4();
  if (!input) return mat;
  if (Array.isArray(input) || ArrayBuffer.isView(input)) {
    return mat.fromArray(input as ArrayLike<number>);
  }
  if (typeof input === 'object' && input !== null) {
    const obj = input as {
      modelViewProjectionMatrix?: ArrayLike<number>;
      defaultProjectionData?: { mainMatrix?: ArrayLike<number> };
    };
    // MapLibre v5+ prefers defaultProjectionData.mainMatrix; v4 exposes MVP.
    const arr =
      obj.defaultProjectionData?.mainMatrix ??
      obj.modelViewProjectionMatrix;
    if (arr) return mat.fromArray(arr);
  }
  return mat;
}

export function attachGreen3DLayer(
  map: maplibregl.Map,
  getState: Getter,
): void {
  if (map.getLayer(LAYER_ID)) return;

  const scene = new THREE.Scene();
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;
  let lastKey = '';

  const layer: maplibregl.CustomLayerInterface = {
    id: LAYER_ID,
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      camera = new THREE.Camera();
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const sun = new THREE.DirectionalLight(0xffffff, 1.05);
      sun.position.set(80, 220, 40);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xb8f0c8, 0.45);
      fill.position.set(-60, 40, -80);
      scene.add(fill);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    render(_gl, options) {
      if (!renderer || !camera) return;
      const { course, activeHole, enabled } = getState();
      const key = `${enabled ? 1 : 0}:${course?.id ?? ''}:${activeHole ?? ''}:${course?.greens.length ?? 0}`;
      if (key !== lastKey) {
        if (enabled && course?.greens.length) {
          rebuildMeshes(scene, course, activeHole);
        } else {
          clearMeshes(scene);
        }
        lastKey = key;
      }
      if (!enabled || !course?.greens.length) return;

      // Flat satellite basemap → pin to ground (0). Mesh Y is already relative
      // to each green's base elev, so relief still shows without floating.
      const origin = maplibregl.MercatorCoordinate.fromLngLat(
        [course.lon, course.lat],
        0,
      );
      const scale = origin.meterInMercatorCoordinateUnits();

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2,
      );
      const local = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(rotationX);

      camera.projectionMatrix = asMatrix4(options).clone().multiply(local);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
  };

  map.addLayer(layer);
}

export function detachGreen3DLayer(map: maplibregl.Map): void {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
}
