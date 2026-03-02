import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Glass peptide vial with liquid inside */
function Vial() {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((state) => {
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.3;
    groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1 - 0.1;
  });

  return (
    <group ref={groupRef}>
      {/* Outer glass cylinder */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 2.2, 32, 1, true]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.15}
          roughness={0.05}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          envMapIntensity={1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Bottom cap */}
      <mesh position={[0, -1.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 32]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.2}
          roughness={0.05}
          metalness={0.1}
          clearcoat={1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Liquid inside */}
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 1.4, 32]} />
        <meshPhysicalMaterial
          color="#22c55e"
          transparent
          opacity={0.4}
          roughness={0.1}
          metalness={0.05}
          emissive="#22c55e"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Cap / stopper */}
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.42, 0.44, 0.3, 32]} />
        <meshStandardMaterial color="#6b7280" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* Crimp ring */}
      <mesh position={[0, 1.12, 0]}>
        <torusGeometry args={[0.42, 0.03, 8, 32]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Label */}
      <mesh position={[0, 0.1, 0.41]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.55, 0.7]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.85} />
      </mesh>
      {/* Label accent stripe */}
      <mesh position={[0, 0.3, 0.415]}>
        <planeGeometry args={[0.5, 0.06]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

/** Orbiting particles around the vial */
function OrbitalParticles({ count = 30 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null!);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 1.2 + Math.random() * 0.8;
      const y = (Math.random() - 0.5) * 3;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }
    return pos;
  }, [count]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.2;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#22c55e" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

/** Full vial scene */
export function VialScene({ className = '', height = 400 }: { className?: string; height?: number }) {
  return (
    <div className={className} style={{ height, width: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <spotLight position={[5, 5, 5]} angle={0.3} penumbra={0.5} intensity={1} color="#ffffff" />
        <pointLight position={[-3, 2, 2]} intensity={0.5} color="#22c55e" />
        <pointLight position={[3, -2, -2]} intensity={0.3} color="#3b82f6" />

        <Vial />

        <OrbitalParticles count={40} />
      </Canvas>
    </div>
  );
}
