import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/** A single strand of the double helix */
function HelixStrand({
  offset = 0,
  color,
  segments = 40,
  radius = 1.2,
  height = 8,
}: {
  offset?: number;
  color: string;
  segments?: number;
  radius?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 4 + offset;
      pts.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          (t - 0.5) * height,
          Math.sin(angle) * radius,
        ),
      );
    }
    return pts;
  }, [offset, segments, radius, height]);

  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);

  return (
    <mesh>
      <tubeGeometry args={[curve, 80, 0.06, 8, false]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.25}
        roughness={0.3}
        metalness={0.5}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

/** Rungs connecting the two strands */
function HelixRungs({
  segments = 20,
  radius = 1.2,
  height = 8,
}: {
  segments?: number;
  radius?: number;
  height?: number;
}) {
  const rungs = useMemo(() => {
    const r: { start: THREE.Vector3; end: THREE.Vector3; color: string }[] = [];
    const colors = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b'];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 4;
      const y = (t - 0.5) * height;
      r.push({
        start: new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
        end: new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius),
        color: colors[i % colors.length],
      });
    }
    return r;
  }, [segments, radius, height]);

  return (
    <>
      {rungs.map((rung, i) => {
        const dir = rung.end.clone().sub(rung.start);
        const mid = rung.start.clone().add(rung.end).multiplyScalar(0.5);
        const len = dir.length();
        dir.normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return (
          <mesh key={i} position={mid} quaternion={q}>
            <cylinderGeometry args={[0.04, 0.04, len, 6]} />
            <meshStandardMaterial
              color={rung.color}
              emissive={rung.color}
              emissiveIntensity={0.2}
              transparent
              opacity={0.6}
            />
          </mesh>
        );
      })}
    </>
  );
}

/** Rotating DNA double helix group */
function HelixGroup() {
  const ref = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.15;
  });

  return (
    <group ref={ref}>
      <HelixStrand offset={0} color="#22c55e" />
      <HelixStrand offset={Math.PI} color="#3b82f6" />
      <HelixRungs />
    </group>
  );
}

/** Standalone DNA helix scene — use as a visual element */
export function DNAHelix({ className = '', height = 400 }: { className?: string; height?: number }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { setOk(isWebGLAvailable()); }, []);

  return (
    <div className={className} style={{ height, width: '100%' }}>
      {ok && (
        <Canvas
          camera={{ position: [0, 0, 6], fov: 45 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, failIfMajorPerformanceCaveat: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.5} />
          <pointLight position={[5, 5, 5]} intensity={0.8} color="#22c55e" />
          <pointLight position={[-5, -3, 3]} intensity={0.4} color="#3b82f6" />

          <HelixGroup />
        </Canvas>
      )}
    </div>
  );
}
