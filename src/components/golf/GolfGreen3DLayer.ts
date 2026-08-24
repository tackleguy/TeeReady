/**
 * MapLibre custom layer — renders LiDAR green meshes with Three.js.
 */
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import type { GreenMeshCourse } from '../../lib/golfGreen3d';

const LAYER_ID = 'golf-green-3d';

export interface Green3DState {
  course: GreenMeshCourse | null;
  activeHole: number | null;
}

type Getter = () => Green3DState;

function rebuildScene(
  scene: THREE.Scene,
  course: GreenMeshCourse | null,
  activeHole: number | null,
) {
  while (scene.children.length) {
    const child = scene.children[0];
    scene.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }
  if (!course?.greens.length) return;

  for (const g of course.greens) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(g.positions, 3),
    );
    geom.setIndex(g.indices);
    geom.computeVertexNormals();

    const active = activeHole === g.hole;
    const mat = new THREE.MeshLambertMaterial({
      color: active ? 0x86efac : 0x4ade80,
      transparent: true,
      opacity: active ? 0.94 : 0.62,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geom, mat));
  }
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
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sun = new THREE.DirectionalLight(0xffffff, 0.85);
      sun.position.set(120, 180, 80);
      scene.add(sun);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    render(_gl, matrix) {
      if (!renderer || !camera) return;
      const { course, activeHole } = getState();
      const key = `${course?.id ?? ''}:${activeHole ?? ''}:${course?.greens.length ?? 0}`;
      if (key !== lastKey) {
        rebuildScene(scene, course, activeHole);
        lastKey = key;
      }
      if (!course?.greens.length) return;

      const baseElev =
        course.greens.find((g) => g.hole === activeHole)?.baseElevM ??
        course.greens[0]?.baseElevM ??
        0;
      const origin = maplibregl.MercatorCoordinate.fromLngLat(
        [course.lon, course.lat],
        baseElev,
      );
      const scale = origin.meterInMercatorCoordinateUnits();

      const translate = new THREE.Matrix4().makeTranslation(
        origin.x,
        origin.y,
        origin.z,
      );
      const rotate = new THREE.Matrix4().makeRotationX(Math.PI / 2);
      const scaleMat = new THREE.Matrix4().makeScale(scale, -scale, scale);
      const local = new THREE.Matrix4()
        .multiply(translate)
        .multiply(rotate)
        .multiply(scaleMat);

      const proj = new THREE.Matrix4().fromArray(matrix);
      camera.projectionMatrix = proj.multiply(local);

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
