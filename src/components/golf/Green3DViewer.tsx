/**
 * Dedicated 3D green viewer — elevation heatmap + relief exaggerate.
 * Opens as a modal (not a map overlay), matching common GPS-app green views.
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import * as THREE from 'three';
import type { GreenMesh, GreenMeshCourse } from '../../lib/golfGreen3d';

interface Props {
  course: GreenMeshCourse;
  hole: number;
  onClose: () => void;
}

function elevColor(t: number): THREE.Color {
  const c = new THREE.Color();
  if (t > 0.66) c.setHSL(0.05, 0.85, 0.48 + (t - 0.66) * 0.2);
  else if (t > 0.33) c.setHSL(0.28, 0.7, 0.4 + (t - 0.33) * 0.25);
  else c.setHSL(0.58, 0.75, 0.35 + t * 0.35);
  return c;
}

function buildGreenMesh(g: GreenMesh, magnify: number): THREE.Group {
  const group = new THREE.Group();
  const pos = g.positions;
  let minY = Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cz = 0;
  const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1]!;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    cx += pos[i]!;
    cz += pos[i + 2]!;
  }
  cx /= n;
  cz /= n;
  const span = Math.max(0.05, maxY - minY);

  const positions = new Float32Array(pos.length);
  const colors = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    positions[i] = pos[i]! - cx;
    positions[i + 1] = (pos[i + 1]! - minY) * magnify;
    positions[i + 2] = pos[i + 2]! - cz;
    const t = (pos[i + 1]! - minY) / span;
    const col = elevColor(t);
    colors[i] = col.r;
    colors[i + 1] = col.g;
    colors[i + 2] = col.b;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setIndex(g.indices);
  geom.computeVertexNormals();

  group.add(
    new THREE.Mesh(
      geom,
      new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        shininess: 12,
      }),
    ),
  );

  const skirt = new THREE.Mesh(
    geom.clone(),
    new THREE.MeshPhongMaterial({
      color: 0x3f3f46,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  skirt.scale.set(1.01, 0.12, 1.01);
  group.add(skirt);

  return group;
}

export function Green3DViewer({ course, hole, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [magnify, setMagnify] = useState(3);
  const green = course.greens.find((g) => g.hole === hole) ?? null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !green) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);
    const camera = new THREE.PerspectiveCamera(
      42,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.1,
      5000,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(40, 80, 20);
    scene.add(sun);

    const grid = new THREE.GridHelper(220, 22, 0x27272a, 0x18181b);
    grid.position.y = -0.5;
    scene.add(grid);

    const root = buildGreenMesh(green, magnify);
    scene.add(root);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let rotY = 0.35;
    let rotX = 0.55;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.008;
      rotX = Math.min(
        1.2,
        Math.max(0.15, rotX + (e.clientY - lastY) * 0.006),
      );
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dist = 90;
      camera.position.set(
        Math.sin(rotY) * Math.cos(rotX) * dist,
        Math.sin(rotX) * dist + 20,
        Math.cos(rotY) * Math.cos(rotX) * dist,
      );
      camera.lookAt(0, 4, 0);
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      scene.remove(root);
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [green, magnify]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0a0a0c] text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="font-mono text-sm font-semibold tracking-wide">
          # {hole}
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
          3D Green
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Close 3D green"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {green ? (
          <div ref={hostRef} className="absolute inset-0 touch-none" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-white/60">
            No LiDAR mesh for this hole yet.
          </div>
        )}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
          <span>High</span>
          <div
            className="h-28 w-2 rounded-full"
            style={{
              background:
                'linear-gradient(180deg,#ef4444 0%,#22c55e 50%,#3b82f6 100%)',
            }}
          />
          <span>Low</span>
        </div>
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 text-sm font-semibold text-white/90 drop-shadow">
          Front
        </div>
      </div>

      <div className="space-y-2 px-5 pb-6 pt-2">
        <div className="text-center text-xs font-medium text-white/70">
          Adjust Magnification
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={magnify}
          onChange={(e) => setMagnify(Number(e.target.value))}
          className="w-full accent-sky-500"
        />
        <div className="flex justify-between font-mono text-[10px] text-white/50">
          <span>1X</span>
          <span>2X</span>
          <span>3X</span>
          <span>4X</span>
          <span>5X</span>
        </div>
      </div>
    </div>
  );
}
