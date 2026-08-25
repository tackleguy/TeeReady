/**
 * TeeReady green reader — LiDAR relief with smooth orbit and turf lighting.
 * Own look: deep emerald atmosphere, lit grass (not a rainbow heatmap clone).
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

const RELIEF_STEPS = [1, 2, 3, 4, 5] as const;

function buildTurfMesh(g: GreenMesh): THREE.Group {
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
  const span = Math.max(0.08, maxY - minY);

  const positions = new Float32Array(pos.length);
  const colors = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const rawY = pos[i + 1]!;
    const t = (rawY - minY) / span;
    positions[i] = pos[i]! - cx;
    positions[i + 1] = rawY - minY;
    positions[i + 2] = pos[i + 2]! - cz;
    // Subtle turf variation — emerald family, lighter on crowns.
    const r = 0.12 + t * 0.18;
    const gC = 0.38 + t * 0.28;
    const b = 0.22 + t * 0.08;
    colors[i] = r;
    colors[i + 1] = gC;
    colors[i + 2] = b;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setIndex(g.indices);
  geom.computeVertexNormals();

  const turf = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
  );
  turf.name = 'turf';
  group.add(turf);

  // Soft wire contour for break reading.
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geom),
    new THREE.LineBasicMaterial({
      color: 0xa7f3d0,
      transparent: true,
      opacity: 0.12,
    }),
  );
  wire.name = 'wire';
  group.add(wire);

  const rim = new THREE.Mesh(
    geom.clone(),
    new THREE.MeshStandardMaterial({
      color: 0x143528,
      side: THREE.BackSide,
      roughness: 1,
    }),
  );
  rim.scale.set(1.015, 0.08, 1.015);
  group.add(rim);

  return group;
}

export function Green3DViewer({ course, hole, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [relief, setRelief] = useState(3);
  const reliefRef = useRef(relief);
  reliefRef.current = relief;
  const green = course.greens.find((g) => g.hole === hole) ?? null;
  const elevSpan =
    green == null
      ? null
      : (() => {
          const ys = green.positions.filter((_, i) => i % 3 === 1);
          return Math.max(...ys) - Math.min(...ys);
        })();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !green) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07140f);
    scene.fog = new THREE.FogExp2(0x07140f, 0.0065);

    const camera = new THREE.PerspectiveCamera(
      40,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.1,
      5000,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xb8f0c8, 0.35));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.15);
    key.position.set(55, 90, 30);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6ee7b7, 0.45);
    fill.position.set(-40, 35, -50);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.2);
    rim.position.set(0, 20, -80);
    scene.add(rim);

    const root = buildTurfMesh(green);
    scene.add(root);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let rotY = 0.4;
    let rotX = 0.52;
    let velY = 0;
    let velX = 0;
    let targetRelief = reliefRef.current;
    let currentRelief = reliefRef.current;
    let idle = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      velY = 0;
      velX = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      velY = dx * 0.007;
      velX = dy * 0.005;
      rotY += velY;
      rotX = Math.min(1.15, Math.max(0.18, rotX + velX));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scroll nudges relief smoothly.
      const next = Math.min(
        5,
        Math.max(1, Math.round(reliefRef.current - Math.sign(e.deltaY))),
      );
      setRelief(next);
    };

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('wheel', onWheel, { passive: false });

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      idle += 0.004;
      if (!dragging) {
        rotY += velY + Math.sin(idle) * 0.0008;
        rotX += velX;
        velY *= 0.92;
        velX *= 0.92;
        rotX = Math.min(1.15, Math.max(0.18, rotX));
      }

      targetRelief = reliefRef.current;
      currentRelief += (targetRelief - currentRelief) * 0.12;
      root.scale.y = currentRelief;

      const dist = 88;
      camera.position.set(
        Math.sin(rotY) * Math.cos(rotX) * dist,
        Math.sin(rotX) * dist + 18,
        Math.cos(rotY) * Math.cos(rotX) * dist,
      );
      camera.lookAt(0, 3 + currentRelief * 0.6, 0);
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
      host.removeEventListener('wheel', onWheel);
      scene.remove(root);
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else (m as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [green]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col text-emerald-50"
      style={{
        background:
          'radial-gradient(120% 80% at 50% 20%, #0d2a1c 0%, #07140f 55%, #040a08 100%)',
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div>
          <div className="text-[22px] font-semibold tracking-tight text-emerald-50">
            Hole {hole}
          </div>
          <div className="text-[11px] text-emerald-200/70">
            Green read
            {elevSpan != null
              ? ` · ${elevSpan.toFixed(1)} m of fall`
              : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-emerald-400/25 bg-emerald-950/50 p-2.5 text-emerald-100/90 shadow-lg shadow-black/30 transition hover:border-emerald-300/40 hover:bg-emerald-900/60"
          aria-label="Close green reader"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {green ? (
          <div ref={hostRef} className="absolute inset-0 touch-none" />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-emerald-200/60">
            No LiDAR mesh for this hole yet.
          </div>
        )}
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/20 bg-emerald-950/55 px-3 py-1 text-[10px] font-medium tracking-wide text-emerald-100/75 backdrop-blur-md">
          Drag to orbit · scroll to exaggerate
        </div>
      </div>

      <div className="space-y-3 px-5 pb-7 pt-3">
        <div className="text-center text-[12px] font-medium text-emerald-100/80">
          Relief
        </div>
        <div className="mx-auto flex max-w-sm gap-1.5">
          {RELIEF_STEPS.map((n) => {
            const on = relief === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRelief(n)}
                className={[
                  'flex-1 rounded-xl py-2.5 text-[12px] font-semibold tabular-nums transition',
                  on
                    ? 'bg-emerald-400 text-emerald-950 shadow-md shadow-emerald-900/40'
                    : 'border border-emerald-500/20 bg-emerald-950/40 text-emerald-100/70 hover:border-emerald-400/35',
                ].join(' ')}
              >
                {n}×
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
