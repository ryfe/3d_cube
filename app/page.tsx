"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";

// 인덱스 좌표 타입 (-1, 0, 1)
type Vec3 = [number, number, number];

// 각 조각이 들고 있는 6개 면 색 (+X, -X, +Y, -Y, +Z, -Z)
type FaceColors = [string, string, string, string, string, string];

type CubeCell = {
  id: number;
  index: Vec3; // 논리 좌표 (루빅스 큐브 셀 위치)
  faces: FaceColors; // 각 면 색상
};

const spacing = 1.05; // 큐브 사이 간격
const offsets = [-1, 0, 1];

// 실제 루빅스 큐브처럼 방향별 초기 색 지정 (+X, -X, +Y, -Y, +Z, -Z)
function getInitialFaceColors([x, y, z]: Vec3): FaceColors {
  return [
    // +X (right, R)
    x > 0.5 ? "#ff5555" : "#222222",
    // -X (left, L)
    x < -0.5 ? "#ff9933" : "#222222",
    // +Y (up, U)
    y > 0.5 ? "#ffffff" : "#222222",
    // -Y (down, D)
    y < -0.5 ? "#ffff55" : "#222222",
    // +Z (front, F)
    z > 0.5 ? "#5555ff" : "#222222",
    // -Z (back, B)
    z < -0.5 ? "#55ff55" : "#222222",
  ];
}

// 3×3×3 셀 초기 생성
const initialCubes: CubeCell[] = [];
let idCounter = 0;
for (const x of offsets) {
  for (const y of offsets) {
    for (const z of offsets) {
      const index: Vec3 = [x, y, z];
      initialCubes.push({
        id: idCounter++,
        index,
        faces: getInitialFaceColors(index),
      });
    }
  }
}

// ==== 회전 유틸리티 (윗면 U 전용) ====

// 좌표 회전 (Y축 기준 90도, 오른손 좌표계 기준)
function rotateAroundY90([x, y, z]: Vec3): Vec3 {
  // (x, z) -> (z, -x)
  return [z, y, -x];
}

// faces: [ +X, -X, +Y, -Y, +Z, -Z ]
function rotateFacesAroundY90([fx, fmx, fy, fmy, fz, fmz]: FaceColors): FaceColors {
  return [
    // new +X  = old +Z
    fz,
    // new -X  = old -Z
    fmz,
    // new +Y  = old +Y
    fy,
    // new -Y  = old -Y
    fmy,
    // new +Z  = old -X
    fmx,
    // new -Z  = old +X
    fx,
  ];
}

// 윗면 U 레이어에 90도 회전 적용
function applyUTurn(cubes: CubeCell[]): CubeCell[] {
  const layerY = 1;
  return cubes.map((cell) => {
    const [x, y, z] = cell.index;
    if (y !== layerY) return cell;
    return {
      ...cell,
      index: rotateAroundY90(cell.index),
      faces: rotateFacesAroundY90(cell.faces),
    };
  });
}

type SmallCubeProps = {
  cell: CubeCell;
  position: [number, number, number];
};

function SmallCube({ cell, position }: SmallCubeProps) {
  // 6면 material을 한 번만 생성 (컴포넌트 마운트 시)
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
    ],
    []
  );

  // faces가 바뀔 때만 색상 업데이트
  useEffect(() => {
    for (let i = 0; i < 6; i++) {

      materials[i].color.set(cell.faces[i]);
    }
  }, [cell.faces, materials]);

  return (
    <mesh position={position} material={materials}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function RubiksLikeCube() {
  const [cubes, setCubes] = useState(initialCubes);

  const topGroupRef = useRef<THREE.Group>(null);
  const isRotatingRef = useRef(false);
  const targetAngleRef = useRef(0);
  const currentAngleRef = useRef(0);
  const needsResetRef = useRef(false); // state 반영 후에만 그룹 회전 리셋

  useFrame((_, delta) => {
    if (!isRotatingRef.current) return;
    if (!topGroupRef.current) return;

    const speed = Math.PI/4; // rad/s
    const remaining = targetAngleRef.current - currentAngleRef.current;
    const step = Math.sign(remaining) * speed * delta;

    if (Math.abs(step) >= Math.abs(remaining)) {
      // 회전 종료: 딱 목표 각도로 스냅
      currentAngleRef.current = targetAngleRef.current;
      topGroupRef.current.rotation.y = currentAngleRef.current;

      // 논리 상태에 즉시 반영
      setCubes((prev) => applyUTurn(prev));

      // 애니메이션 종료 (리셋은 state 반영 후에)
      isRotatingRef.current = false;
      needsResetRef.current = true;
    } else {
      currentAngleRef.current += step;
      topGroupRef.current.rotation.y = currentAngleRef.current;
    }
  });

  // Space로 U 회전 시작
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isRotatingRef.current) return;

      isRotatingRef.current = true;
      targetAngleRef.current = Math.PI / 2;
      currentAngleRef.current = 0;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!needsResetRef.current) return;
    if (!topGroupRef.current) return;

    // state(cubes)가 실제로 반영된 뒤에만 시각적 회전값을 리셋
    topGroupRef.current.rotation.y = 0;
    currentAngleRef.current = 0;
    targetAngleRef.current = 0;
    needsResetRef.current = false;
  }, [cubes]);

  return (
    <>
      {cubes
        .filter((c) => c.index[1] !== 1)
        .map((c) => (
          <SmallCube
            key={c.id}
            cell={c}
            position={[c.index[0] * spacing, c.index[1] * spacing, c.index[2] * spacing]}
          />
        ))}
      <group ref={topGroupRef}>
        {cubes
          .filter((c) => c.index[1] === 1)
          .map((c) => (
            <SmallCube
              key={c.id}
              cell={c}
              position={[c.index[0] * spacing, c.index[1] * spacing, c.index[2] * spacing]}
            />
          ))}
      </group>
    </>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <section className="w-full max-w-3xl flex flex-col items-center gap-4 px-4">
        <h1 className="text-3xl font-bold text-center">3×3×3 Cube Demo</h1>
        <p className="text-sm text-slate-300 text-center">
          27개의 작은 큐브로 이루어진 3×3×3 루빅스 큐브입니다. 마우스로 드래그/줌이 가능하고,
          스페이스바로 윗면을 90도 회전시킬 수 있습니다.
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
        <p className="text-xs text-slate-500 text-center mt-1">
          Tip: 스페이스바를 눌러 윗면을 시계 방향으로 돌려보세요.
        </p>
      </section>
    </main>
  );
}