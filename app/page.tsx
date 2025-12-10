"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

type Vec3 = [number, number, number];

// 3×3×3 위치 생성
const spacing = 1.05;
const cubePositions: Vec3[] = [];
const offsets = [-1, 0, 1];

for (const x of offsets) {
  for (const y of offsets) {
    for (const z of offsets) {
      cubePositions.push([x * spacing, y * spacing, z * spacing]);
    }
  }
}

// 색 결정
function getCubeColor([x, y, z]: Vec3): string {
  if (x > 0.5) return "#ff5555"; 
  if (x < -0.5) return "#ff9933"; 
  if (y > 0.5) return "#ffffff"; 
  if (y < -0.5) return "#ffff55"; 
  if (z > 0.5) return "#5555ff"; 
  if (z < -0.5) return "#55ff55"; 
  return "#222222";
}

function SmallCube({ position }: { position: Vec3 }) {
  const [x, y, z] = position;

  const materials = [
    // +X (right)
    new THREE.MeshStandardMaterial({ color: x > 0.5 ? "#ff5555" : "#222222" }),
    // -X (left)
    new THREE.MeshStandardMaterial({ color: x < -0.5 ? "#ff9933" : "#222222" }),
    // +Y (top)
    new THREE.MeshStandardMaterial({ color: y > 0.5 ? "#ffffff" : "#222222" }),
    // -Y (bottom)
    new THREE.MeshStandardMaterial({ color: y < -0.5 ? "#ffff55" : "#222222" }),
    // +Z (front)
    new THREE.MeshStandardMaterial({ color: z > 0.5 ? "#5555ff" : "#222222" }),
    // -Z (back)
    new THREE.MeshStandardMaterial({ color: z < -0.5 ? "#55ff55" : "#222222" }),
  ];

  return (
    <mesh position={position} material={materials}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function RubiksLikeCube() {
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.6;
    groupRef.current.rotation.x += delta * 0.3;
  });

  return (
    <group ref={groupRef}>
      {cubePositions.map((pos, idx) => (
        <SmallCube key={idx} position={pos} />
      ))}
    </group>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <section className="w-full max-w-3xl flex flex-col items-center gap-4 px-4">
        <h1 className="text-3xl font-bold text-center">3×3×3 Cube Demo</h1>
        <p className="text-sm text-slate-300 text-center">
          27개의 작은 큐브로 이루어진 3×3×3 큐브입니다. 자동 회전하며, 드래그와 줌 조작이 가능합니다.
        </p>
        <div className="w-full h-[450px] border border-slate-700 rounded-xl overflow-hidden bg-black">
          <Canvas camera={{ position: [6, 6, 6], fov: 55 }}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[8, 10, 5]} intensity={1.2} castShadow />
            <directionalLight position={[-6, -8, -5]} intensity={0.5} />
            <RubiksLikeCube />
            <OrbitControls enablePan={false} />
          </Canvas>
        </div>
      </section>
    </main>
  );
}
