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

type Move = {
  axis: 0 | 1 | 2; // 0: X, 1: Y, 2: Z
  layer: -1 | 0 | 1; // -1, 0, 1
  direction: 1 | -1; // 1: 시계, -1: 반시계
};

// faces index meaning: [ +X, -X, +Y, -Y, +Z, -Z ]
type FaceKey = "U" | "R" | "F" | "D" | "L" | "B";

function keyFromColorMap(colorToFace: Map<string, FaceKey>, color: string): FaceKey {
  const k = colorToFace.get(color);
  if (!k) throw new Error(`Unknown sticker color: ${color}. Did you build the color map from centers?`);
  return k;
}

// Build a mapping from hex color -> face letter using the 6 center stickers.
function buildColorToFaceMap(cubes: CubeCell[]): Map<string, FaceKey> {
  const findCell = (x: number, y: number, z: number) => cubes.find((c) => c.index[0] === x && c.index[1] === y && c.index[2] === z);

  const centerU = findCell(0, 1, 0)?.faces[2]; // +Y
  const centerD = findCell(0, -1, 0)?.faces[3]; // -Y
  const centerR = findCell(1, 0, 0)?.faces[0]; // +X
  const centerL = findCell(-1, 0, 0)?.faces[1]; // -X
  const centerF = findCell(0, 0, 1)?.faces[4]; // +Z
  const centerB = findCell(0, 0, -1)?.faces[5]; // -Z

  if (!centerU || !centerD || !centerR || !centerL || !centerF || !centerB) {
    throw new Error("Failed to locate one or more center stickers. Cube state is invalid.");
  }

  const m = new Map<string, FaceKey>();
  m.set(centerU, "U");
  m.set(centerR, "R");
  m.set(centerF, "F");
  m.set(centerD, "D");
  m.set(centerL, "L");
  m.set(centerB, "B");
  return m;
}

// Convert the current cube state to the standard 54-char facelet string in URFDLB order.
// Each face is read row-major (top-left -> bottom-right) when looking at that face from outside.
function cubeToFaceletsURFDLB(cubes: CubeCell[]): string {
  const colorToFace = buildColorToFaceMap(cubes);

  // Helper to get a sticker color at (x,y,z) for a given face normal.
  const getSticker = (x: number, y: number, z: number, face: FaceKey): FaceKey => {
    const cell = cubes.find((c) => c.index[0] === x && c.index[1] === y && c.index[2] === z);
    if (!cell) throw new Error(`Missing cell at index (${x},${y},${z})`);

    // Pick the right face color from FaceColors
    let color = "#222222";
    switch (face) {
      case "R":
        color = cell.faces[0];
        break; // +X
      case "L":
        color = cell.faces[1];
        break; // -X
      case "U":
        color = cell.faces[2];
        break; // +Y
      case "D":
        color = cell.faces[3];
        break; // -Y
      case "F":
        color = cell.faces[4];
        break; // +Z
      case "B":
        color = cell.faces[5];
        break; // -Z
    }

    return keyFromColorMap(colorToFace, color);
  };

  // Face readers return 9 facelets.
  const readU = (): FaceKey[] => {
    // y = +1, row: z -1 -> +1, col: x -1 -> +1
    const out: FaceKey[] = [];
    for (const z of [-1, 0, 1]) {
      for (const x of [-1, 0, 1]) out.push(getSticker(x, 1, z, "U"));
    }
    return out;
  };

  const readD = (): FaceKey[] => {
    // y = -1, viewed from -Y, row: z +1 -> -1, col: x -1 -> +1
    const out: FaceKey[] = [];
    for (const z of [1, 0, -1]) {
      for (const x of [-1, 0, 1]) out.push(getSticker(x, -1, z, "D"));
    }
    return out;
  };

  const readF = (): FaceKey[] => {
    // z = +1, row: y +1 -> -1, col: x -1 -> +1
    const out: FaceKey[] = [];
    for (const y of [1, 0, -1]) {
      for (const x of [-1, 0, 1]) out.push(getSticker(x, y, 1, "F"));
    }
    return out;
  };

  const readB = (): FaceKey[] => {
    // z = -1, viewed from -Z, row: y +1 -> -1, col: x +1 -> -1 (mirrored)
    const out: FaceKey[] = [];
    for (const y of [1, 0, -1]) {
      for (const x of [1, 0, -1]) out.push(getSticker(x, y, -1, "B"));
    }
    return out;
  };

  const readR = (): FaceKey[] => {
    // x = +1, viewed from +X, row: y +1 -> -1, col: z +1 -> -1
    const out: FaceKey[] = [];
    for (const y of [1, 0, -1]) {
      for (const z of [1, 0, -1]) out.push(getSticker(1, y, z, "R"));
    }
    return out;
  };

  const readL = (): FaceKey[] => {
    // x = -1, viewed from -X, row: y +1 -> -1, col: z -1 -> +1
    const out: FaceKey[] = [];
    for (const y of [1, 0, -1]) {
      for (const z of [-1, 0, 1]) out.push(getSticker(-1, y, z, "L"));
    }
    return out;
  };

  // URFDLB order
  return [...readU(), ...readR(), ...readF(), ...readD(), ...readL(), ...readB()].join("");
}

async function solveWithCubeJS(facelets: string): Promise<string> {
  // npm i cubejs
  const mod: any = await import("cubejs");
  const Cube = mod.default ?? mod;
  // initSolver is required once for the 2-phase tables.
  if (typeof Cube.initSolver === "function") Cube.initSolver();
  const cube = Cube.fromString(facelets);
  return cube.solve();
}

const spacing = 1.05; // 큐브 사이 간격
const offsets = [-1, 0, 1];
const initmove: Move = {
  axis: 1,
  layer: 1,
  direction: 1,
};
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
function rotateAroundX90([x, y, z]: Vec3): Vec3 {
  // 오른손 좌표계 +90° (X축): (y, z) -> (-z, y)
  return [x, -z, y];
}

function rotateAroundY90([x, y, z]: Vec3): Vec3 {
  // 오른손 좌표계 +90° (Y축): (x, z) -> (z, -x)
  return [z, y, -x];
}

function rotateAroundZ90([x, y, z]: Vec3): Vec3 {
  // 오른손 좌표계 +90° (Z축): (x, y) -> (-y, x)
  return [-y, x, z];
}

// faces: [ +X, -X, +Y, -Y, +Z, -Z ]

function rotateFacesAroundX90([fx, fmx, fy, fmy, fz, fmz]: FaceColors): FaceColors {
  // 오른손 좌표계 +90° (X축): +Y -> +Z, +Z -> -Y
  // faces: [ +X, -X, +Y, -Y, +Z, -Z ]
  // new +Y = old -Z
  // new -Y = old +Z
  // new +Z = old +Y
  // new -Z = old -Y
  return [fx, fmx, fmz, fz, fy, fmy];
}

function rotateFacesAroundY90([fx, fmx, fy, fmy, fz, fmz]: FaceColors): FaceColors {
  // X -> Z, Z -> -X
  return [fz, fmz, fy, fmy, fmx, fx];
}

function rotateFacesAroundZ90([fx, fmx, fy, fmy, fz, fmz]: FaceColors): FaceColors {
  // 오른손 좌표계 +90° (Z축): +X -> +Y, +Y -> -X
  // new +X = old -Y
  // new -X = old +Y
  // new +Y = old +X
  // new -Y = old -X
  return [fmy, fy, fx, fmx, fz, fmz];
}

// 레이어에 ±90도 회전 적용 (dir = -1 은 +90을 3번 적용)
function applyTurn(cubes: CubeCell[], move: Move): CubeCell[] {
  const { axis, layer, direction } = move;
  const times = direction === 1 ? 1 : 3;

  const rotateIndexOnce = (v: Vec3): Vec3 => {
    if (axis === 0) return rotateAroundX90(v);
    if (axis === 1) return rotateAroundY90(v);
    return rotateAroundZ90(v);
  };

  const rotateFacesOnce = (f: FaceColors): FaceColors => {
    if (axis === 0) return rotateFacesAroundX90(f);
    if (axis === 1) return rotateFacesAroundY90(f);
    return rotateFacesAroundZ90(f);
  };

  return cubes.map((cell) => {
    if (cell.index[axis] !== layer) return cell;

    let nextIndex = cell.index;
    let nextFaces = cell.faces;
    for (let i = 0; i < times; i++) {
      nextIndex = rotateIndexOnce(nextIndex);
      nextFaces = rotateFacesOnce(nextFaces);
    }

    return { ...cell, index: nextIndex, faces: nextFaces };
  });
}

function applyMove(_move: Move, axis: 0 | 1 | 2, layer: -1 | 0 | 1, direction: 1 | -1): Move {
  return { axis, layer, direction };
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
  const [move, setMove] = useState<Move>(initmove);

  const rotationGroupRef = useRef<THREE.Group>(null);
  const isRotatingRef = useRef(false);
  const targetAngleRef = useRef(0);
  const currentAngleRef = useRef(0);
  const needsResetRef = useRef(false); // cubes 커밋 후에만 그룹 회전 리셋

  const animTimeRef = useRef(0);
  const animDurationRef = useRef(0.22); // seconds (tweak for snappiness)

  // 회전 시작 순간의 move/축을 고정 (애니메이션/리셋/논리 반영 일관성)
  const activeMoveRef = useRef<Move>(move);
  const activeAxisKeyRef = useRef<"x" | "y" | "z">("y");

  useFrame((_, delta) => {
    if (!isRotatingRef.current) return;
    if (!rotationGroupRef.current) return;

    // 0 -> 1 progress over a fixed duration
    animTimeRef.current += delta;
    const t = Math.min(1, animTimeRef.current / animDurationRef.current);

    // smoothstep easing: 3t^2 - 2t^3
    const eased = t * t * (3 - 2 * t);

    currentAngleRef.current = targetAngleRef.current * eased;
    rotationGroupRef.current.rotation[activeAxisKeyRef.current] = currentAngleRef.current;

    if (t >= 1) {
      // 회전 종료: 정확히 목표 각도로 스냅
      currentAngleRef.current = targetAngleRef.current;
      rotationGroupRef.current.rotation[activeAxisKeyRef.current] = currentAngleRef.current;

      // 회전 애니메이션이 끝난 뒤에만 논리 상태를 90도 반영
      setCubes((prev) => applyTurn(prev, activeMoveRef.current));

      // 애니메이션 종료 (리셋은 cubes 커밋 후에)
      isRotatingRef.current = false;
      needsResetRef.current = true;
    }
  });

  // Space로 U 회전 시작
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRotatingRef.current) return;

      // 표준 표기(시계방향=해당 면을 바깥에서 봤을 때) + Shift=프라임(반시계)
      // Middle slice 방향 규칙: M은 L과 같은 방향, E는 D와 같은 방향, S는 F와 같은 방향
      const getMoveFromCode = (code: string, prime: boolean): Move | null => {
        // baseDir: "시계방향"을 우리 엔진 direction(±1)으로 변환한 값
        // prime이면 반대로 뒤집음
        const mk = (axis: 0 | 1 | 2, layer: -1 | 0 | 1, baseDir: 1 | -1): Move => ({
          axis,
          layer,
          direction: prime ? ((-baseDir) as 1 | -1) : baseDir,
        });

        switch (code) {
          // faces
          case "KeyU":
            return mk(1, 1, -1);
          case "KeyD":
            return mk(1, -1, 1);
          case "KeyL":
            return mk(0, -1, 1);
          case "KeyR":
            return mk(0, 1, -1);
          case "KeyF":
            return mk(2, 1, -1);
          case "KeyB":
            return mk(2, -1, 1);

          // middle slices (3×3)
          // M: x=0, same direction as L
          case "KeyM":
            return mk(0, 0, 1);
          // E: y=0, same direction as D
          case "KeyE":
            return mk(1, 0, 1);
          // S: z=0, same direction as F
          case "KeyS":
            return mk(2, 0, -1);

          default:
            return null;
        }
      };

      const nextMove = getMoveFromCode(e.code, e.shiftKey);
      if (!nextMove) return;

      // state 업데이트(렌더용) + active ref 고정(애니메이션/논리 반영용)
      setMove(() => nextMove);
      activeMoveRef.current = nextMove;
      activeAxisKeyRef.current = nextMove.axis === 0 ? "x" : nextMove.axis === 1 ? "y" : "z";

      isRotatingRef.current = true;
      animTimeRef.current = 0;
      // 방향(dir)에 따라 +90 / -90 (표준 표기 매핑은 위에서 이미 반영됨)
      targetAngleRef.current = nextMove.direction * (Math.PI / 2);
      currentAngleRef.current = 0;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  // cubes 상태가 실제로 반영된 뒤에만 시각적 회전값을 리셋 (1프레임 플래시 방지)
  useEffect(() => {
    if (!needsResetRef.current) return;
    if (!rotationGroupRef.current) return;

    rotationGroupRef.current.rotation[activeAxisKeyRef.current] = 0;
    currentAngleRef.current = 0;
    targetAngleRef.current = 0;
    animTimeRef.current = 0;
    needsResetRef.current = false;
  }, [cubes]);

  const handleExportFacelets = () => {
    try {
      const s = cubeToFaceletsURFDLB(cubes);
      window.dispatchEvent(new CustomEvent("cube:facelets", { detail: s }));
      console.log("facelets(URFDLB):", s);
    } catch (err) {
      console.error(err);
      window.dispatchEvent(
        new CustomEvent("cube:error", {
          detail: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  const handleSolve = async () => {
    try {
      const s = cubeToFaceletsURFDLB(cubes);
      window.dispatchEvent(new CustomEvent("cube:facelets", { detail: s }));
      const sol = await solveWithCubeJS(s);
      window.dispatchEvent(new CustomEvent("cube:solution", { detail: sol }));
      console.log("solution:", sol);
    } catch (err) {
      console.error(err);
      window.dispatchEvent(
        new CustomEvent("cube:error", {
          detail:
            (err instanceof Error ? err.message : String(err)) +
            "\n\nTip: run `npm i cubejs` and restart dev server.",
        })
      );
    }
  };

  useEffect(() => {
    const onExport = () => handleExportFacelets();
    const onSolve = () => void handleSolve();

    window.addEventListener("cube:requestExport", onExport as EventListener);
    window.addEventListener("cube:requestSolve", onSolve as EventListener);

    return () => {
      window.removeEventListener("cube:requestExport", onExport as EventListener);
      window.removeEventListener("cube:requestSolve", onSolve as EventListener);
    };
  }, [cubes]);

  return (
    <>
      {cubes
        .filter((c) => c.index[move.axis] !== move.layer)
        .map((c) => (
          <SmallCube
            key={c.id}
            cell={c}
            position={[c.index[0] * spacing, c.index[1] * spacing, c.index[2] * spacing]}
          />
        ))}
      <group ref={rotationGroupRef}>
        {cubes
          .filter((c) => c.index[move.axis] === move.layer)
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
  const [facelets, setFacelets] = useState<string>("");
  const [solution, setSolution] = useState<string>("");

  useEffect(() => {
    const onFacelets = (e: Event) => setFacelets((e as CustomEvent<string>).detail);
    const onSolution = (e: Event) => setSolution((e as CustomEvent<string>).detail);
    const onError = (e: Event) => alert((e as CustomEvent<string>).detail);

    window.addEventListener("cube:facelets", onFacelets as EventListener);
    window.addEventListener("cube:solution", onSolution as EventListener);
    window.addEventListener("cube:error", onError as EventListener);

    return () => {
      window.removeEventListener("cube:facelets", onFacelets as EventListener);
      window.removeEventListener("cube:solution", onSolution as EventListener);
      window.removeEventListener("cube:error", onError as EventListener);
    };
  }, []);

  const requestExport = () => window.dispatchEvent(new Event("cube:requestExport"));
  const requestSolve = () => window.dispatchEvent(new Event("cube:requestSolve"));

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <section className="w-full max-w-3xl flex flex-col items-center gap-4 px-4">
        <h1 className="text-3xl font-bold text-center">3×3×3 Cube Demo</h1>
        <p className="text-sm text-slate-300 text-center">
          27개의 작은 큐브로 이루어진 3×3×3 루빅스 큐브입니다. 마우스로 드래그/줌이 가능하고,
          U/D/L/R/F/B 키로 각 면을, M/E/S 키로 가운데 슬라이스를 90도 회전할 수 있습니다. (Shift: 프라임)
        </p>
        <div className="relative w-full h-[450px] border border-slate-700 rounded-xl overflow-hidden bg-black">
          <Canvas camera={{ position: [6, 6, 6], fov: 55 }}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[8, 10, 5]} intensity={1.2} castShadow />
            <directionalLight position={[-6, -8, -5]} intensity={0.5} />
            <RubiksLikeCube />
            <OrbitControls enablePan={false} />
          </Canvas>
          <div
            style={{
              position: "absolute",
              left: 16,
              bottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "rgba(0,0,0,0.55)",
              padding: 12,
              borderRadius: 12,
              maxWidth: 520,
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={requestExport}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Export facelets
              </button>
              <button
                onClick={requestSolve}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Solve
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.9, wordBreak: "break-all" }}>
              <div style={{ opacity: 0.75 }}>URFDLB (54):</div>
              <div>{facelets || "(empty)"}</div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.9, wordBreak: "break-word" }}>
              <div style={{ opacity: 0.75 }}>Solution:</div>
              <div>{solution || "(empty)"}</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 text-center mt-1">
          Tip: U/D/L/R/F/B, M/E/S (Shift: 프라임)
        </p>
      </section>
    </main>
  );
}