"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useState, useEffect } from "react";
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
  position: Vec3; // 이미 계산된 위치
};

function SmallCube({ cell, position }: SmallCubeProps) {
  const faceColors = cell.faces ?? getInitialFaceColors(cell.index);

  const materials = faceColors.map(
    (color) => new THREE.MeshStandardMaterial({ color })
  );

  return (
    <mesh position={position} material={materials}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function RubiksLikeCube() {
  const [cubes, setCubes] = useState<CubeCell[]>(initialCubes);

  const topGroupRef = useRef<THREE.Group | null>(null); // 윗면(Top layer) 그룹

  const isRotatingRef = useRef(false);
  const targetAngleRef = useRef(0); // 목표 회전 각도 (rad)
  const currentAngleRef = useRef(0); // 현재 회전 상태 (rad)

  // 윗면 회전 애니메이션
  useFrame((_, delta) => {
    if (!topGroupRef.current || !isRotatingRef.current) return;

    const speed = Math.PI; // rad/s (90도 회전 ~0.5초 정도)
    const remaining = targetAngleRef.current - currentAngleRef.current;
    const step = Math.sign(remaining) * speed * delta;

    if (Math.abs(step) >= Math.abs(remaining)) {
      // 회전 끝
      currentAngleRef.current = targetAngleRef.current;
      topGroupRef.current.rotation.y = currentAngleRef.current;
      isRotatingRef.current = false;

      // 회전 결과를 논리 좌표와 면 색에 반영 (윗면 y === 1 인 셀만)
      setCubes((prev) => applyUTurn(prev));

      // 그룹 회전값 리셋 (좌표에 반영했으니 0으로 돌려놓음)
      topGroupRef.current.rotation.y = 0;
      currentAngleRef.current = 0;
      targetAngleRef.current = 0;
    } else {
      currentAngleRef.current += step;
      topGroupRef.current.rotation.y = currentAngleRef.current;
    }
  });

  // 스페이스바로 윗면 회전 트리거
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (!isRotatingRef.current) {
          isRotatingRef.current = true;
          targetAngleRef.current = currentAngleRef.current + Math.PI / 2; // 90도 회전
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // 윗면(y === 1)과 나머지 셀 분리
  const topLayer = cubes.filter((cell) => cell.index[1] === 1);
  const others = cubes.filter((cell) => cell.index[1] !== 1);

  return (
    <group>
      {/* 윗면 레이어 (그룹 기준 y = spacing, 내부는 y = 0) */}
      <group ref={topGroupRef} position={[0, spacing, 0]}>
        {topLayer.map((cell) => {
          const [x, , z] = cell.index;
          const localPos: Vec3 = [x * spacing, 0, z * spacing];
          return <SmallCube key={cell.id} cell={cell} position={localPos} />;
        })}
      </group>

      {/* 나머지 셀들 */}
      {others.map((cell) => {
        const [x, y, z] = cell.index;
        const pos: Vec3 = [x * spacing, y * spacing, z * spacing];
        return <SmallCube key={cell.id} cell={cell} position={pos} />;
      })}
    </group>
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
