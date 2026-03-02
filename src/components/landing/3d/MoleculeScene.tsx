import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/** Single atom sphere with glow */
function Atom({ position, scale = 1, color }: { position: [number, number, number]; scale?: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  const speed = useMemo(() => 0.2 + Math.random() * 0.3, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * speed;
    ref.current.rotation.z += delta * speed * 0.5;
  });

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
        roughness={0.3}
        metalness={0.6}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

/** Bond connecting two atoms */
function Bond({ start, end, color }: { start: [number, number, number]; end: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);

  const { midpoint, length, quaternion } = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const mid = s.clone().add(e).multiplyScalar(0.5);
    const dir = e.clone().sub(s);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { midpoint: mid, length: len, quaternion: q };
  }, [start, end]);

  return (
    <mesh
      ref={ref}
      position={[midpoint.x, midpoint.y, midpoint.z]}
      quaternion={quaternion}
    >
      <cylinderGeometry args={[0.08, 0.08, length, 8]} />
      <meshStandardMaterial color={color} transparent opacity={0.5} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

/** A peptide-like molecule cluster */
function MoleculeCluster({ position, rotationSpeed = 0.15 }: { position: [number, number, number]; rotationSpeed?: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const primary = '#22c55e'; // matches our primary teal-green
  const secondary = '#3b82f6';
  const accent = '#a855f7';

  // Define atoms and bonds for a small molecule
  const atoms: { pos: [number, number, number]; color: string; scale: number }[] = [
    { pos: [0, 0, 0], color: primary, scale: 0.45 },
    { pos: [1.4, 0.7, 0.3], color: secondary, scale: 0.35 },
    { pos: [-1.2, 0.5, -0.4], color: accent, scale: 0.3 },
    { pos: [0.3, -1.3, 0.5], color: primary, scale: 0.38 },
    { pos: [-0.5, 1.2, 0.8], color: secondary, scale: 0.32 },
    { pos: [1.0, -0.6, -0.9], color: accent, scale: 0.28 },
  ];

  const bonds: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [3, 5],
  ];

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * rotationSpeed;
    groupRef.current.rotation.x += delta * rotationSpeed * 0.3;
  });

  return (
    <group ref={groupRef} position={position}>
      {atoms.map((a, i) => (
        <Atom key={i} position={a.pos} color={a.color} scale={a.scale} />
      ))}
      {bonds.map(([a, b], i) => (
        <Bond key={`b-${i}`} start={atoms[a].pos} end={atoms[b].pos} color={primary} />
      ))}
    </group>
  );
}

/** Floating particles background */
function Particles({ count = 60 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      pos[i] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, [count]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#22c55e" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

/** Full scene — drop this into any section */
export function MoleculeScene({ className = '' }: { className?: string }) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    setOk(isWebGLAvailable() && typeof THREE.SphereGeometry === 'function');
  }, []);

  if (!ok) return null;

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, failIfMajorPerformanceCaveat: true }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
        }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color="#22c55e" />
        <pointLight position={[-10, -5, 5]} intensity={0.4} color="#3b82f6" />

        <MoleculeCluster position={[3, 1, -2]} rotationSpeed={0.12} />
        <MoleculeCluster position={[-3.5, -1, -1]} rotationSpeed={0.08} />
        <MoleculeCluster position={[0, 2.5, -3]} rotationSpeed={0.18} />

        <Particles count={80} />
      </Canvas>
    </div>
  );
}
