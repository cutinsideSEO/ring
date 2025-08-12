import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { DecalGeometry } from "three-stdlib";

// ==========================================
// v5.1 – Minimal changes requested
// • Slot #1 locked to FRONT/TOP (+Z), others clockwise.
// • UI/theme: warm neutral, boutique jewelry vibe.
// ==========================================

// ===== Helper: Export a group as GLB =====
function ExportButton({ groupRef }: { groupRef: React.RefObject<THREE.Group> }) {
  const onExport = () => {
    const group = groupRef.current;
    if (!group) return;
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "custom-ring.glb";
        a.click();
        URL.revokeObjectURL(url);
      },
      { binary: true }
    );
  };
  return (
    <button onClick={onExport} className="btn">
      Download GLB
    </button>
  );
}

// ===== Utility: angle for slot index (front/top fixed) =====
function angleForIndex(i: number, total = 12) {
  const step = (Math.PI * 2) / total;
  const start = Math.PI / 2; // +Z is front/top
  return start - i * step; // clockwise
}

// ===== Extruded Band (flat profile) =====
const Band = React.forwardRef<THREE.Mesh, {
  innerR: number; // inner radius (mm)
  bandWidth: number; // radial width (mm)
  bandHeight: number; // height along Y (mm)
  color?: string;
}>(
  ({ innerR, bandWidth, bandHeight, color = "#d4af37" }, ref) => {
    const geom = useMemo(() => {
      const outerR = innerR + bandWidth;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
      shape.holes.push(hole);

      const bevelT = Math.min(0.35, bandHeight * 0.22);
      const bevelS = Math.min(0.6, bandWidth * 0.12);
      const eg = new THREE.ExtrudeGeometry(shape, {
        depth: bandHeight,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelThickness: bevelT,
        bevelSize: bevelS,
        curveSegments: 128,
      });
      // Center depth and rotate so height aligns with Y
      eg.translate(0, 0, -bandHeight / 2);
      eg.rotateX(-Math.PI / 2);
      eg.computeVertexNormals();
      return eg;
    }, [innerR, bandWidth, bandHeight]);

    return (
      <mesh ref={ref} castShadow receiveShadow>
        <primitive object={geom} attach="geometry" />
        <meshPhysicalMaterial
          color={color}
          metalness={1}
          roughness={0.18}
          clearcoat={0.5}
          clearcoatRoughness={0.28}
        />
      </mesh>
    );
  }
);
Band.displayName = "Band";

// ===== Domain Data =====
const ZODIAC = [
  { key: "aries", glyph: "\u2648", label: "Aries" },
  { key: "taurus", glyph: "\u2649", label: "Taurus" },
  { key: "gemini", glyph: "\u264A", label: "Gemini" },
  { key: "cancer", glyph: "\u264B", label: "Cancer" },
  { key: "leo", glyph: "\u264C", label: "Leo" },
  { key: "virgo", glyph: "\u264D", label: "Virgo" },
  { key: "libra", glyph: "\u264E", label: "Libra" },
  { key: "scorpio", glyph: "\u264F", label: "Scorpio" },
  { key: "sagittarius", glyph: "\u2650", label: "Sagittarius" },
  { key: "capricorn", glyph: "\u2651", label: "Capricorn" },
  { key: "aquarius", glyph: "\u2652", label: "Aquarius" },
  { key: "pisces", glyph: "\u2653", label: "Pisces" },
] as const;

const STONES: { key: string; label: string; hex: string; ior?: number }[] = [
  { key: "diamond", label: "Diamond", hex: "#ffffff", ior: 2.4 },
  { key: "ruby", label: "Ruby", hex: "#E0115F", ior: 1.77 },
  { key: "sapphire", label: "Sapphire", hex: "#0F52BA", ior: 1.77 },
  { key: "emerald", label: "Emerald", hex: "#50C878", ior: 1.58 },
  { key: "amethyst", label: "Amethyst", hex: "#9966CC", ior: 1.54 },
  { key: "topaz", label: "Topaz", hex: "#FFB000", ior: 1.61 },
  { key: "aquamarine", label: "Aquamarine", hex: "#7FFFD4", ior: 1.58 },
  { key: "garnet", label: "Garnet", hex: "#9B111E", ior: 1.79 },
  { key: "peridot", label: "Peridot", hex: "#B4C424", ior: 1.65 },
  { key: "turquoise", label: "Turquoise", hex: "#30D5C8", ior: 1.61 },
  { key: "citrine", label: "Citrine", hex: "#E4B700", ior: 1.55 },
];

// ===== Types =====
export type Slot =
  | { kind: "zodiac"; value: (typeof ZODIAC)[number]["key"] }
  | { kind: "stone"; value: string }
  | { kind: "text"; value: string };

// ===== Canvas-generated textures for decals =====
function makeZodiacTexture(signKey: (typeof ZODIAC)[number]["key"], color = "#3b3b3b"): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size * 0.58}px \"Cormorant Garamond\", ui-serif, Georgia, \"Times New Roman\", serif`;
  const glyph = ZODIAC.find((z) => z.key === signKey)?.glyph ?? "?";
  ctx.fillText(glyph, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeTextTexture(text: string, color = "#3b3b3b"): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size * 0.45}px \"Inter\", ui-sans-serif, -apple-system, Segoe UI, Arial`;
  ctx.fillText(text, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ===== Decal marks projected on the band (zodiac + text only) =====
function DecalMarks({
  targetRef,
  innerR,
  outerR,
  size,
  slots,
  inside,
  markColor = "#3b3b3b",
}: {
  targetRef: React.RefObject<THREE.Mesh>;
  innerR: number;
  outerR: number;
  size: number;
  slots: Slot[];
  inside: boolean;
  markColor?: string;
}) {
  const decals = useMemo(() => {
    const mesh = targetRef.current;
    if (!mesh) return [] as JSX.Element[];

    const items: JSX.Element[] = [];
    const depth = Math.max(0.6, size * 0.5);

    for (let i = 0; i < 12; i++) {
      const s = slots[i];
      if (!s || s.kind === "stone") continue; // stones handled as 3D meshes

      const a = angleForIndex(i, 12);
      const radius = inside ? innerR + 0.05 : outerR - 0.05;
      const pos = new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      const normal = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(inside ? -1 : 1).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      const euler = new THREE.Euler().setFromQuaternion(quat);

      const tex = s.kind === "zodiac" ? makeZodiacTexture(s.value as any, markColor) : makeTextTexture((s as any).value ?? "", markColor);
      const geom = new DecalGeometry(mesh, pos, euler, new THREE.Vector3(size, size, depth));

      items.push(
        <mesh key={i} geometry={geom} position={[0, 0, 0]}>
          <meshStandardMaterial map={tex} transparent depthTest polygonOffset polygonOffsetFactor={-1} roughness={0.45} metalness={0} color={"white"} />
        </mesh>
      );
    }
    return items;
  }, [targetRef.current, innerR, outerR, inside, size, slots, markColor]);

  return <group>{decals}</group>;
}

// ===== 3D Gems =====
function Gems({
  innerR,
  outerR,
  height,
  size,
  slots,
  inside,
}: {
  innerR: number;
  outerR: number;
  height: number;
  size: number; // controls gem scale
  slots: Slot[];
  inside: boolean;
}) {
  const elements = useMemo(() => {
    const arr: JSX.Element[] = [];
    for (let i = 0; i < 12; i++) {
      const s = slots[i];
      if (!s || s.kind !== "stone") continue;
      const a = angleForIndex(i, 12);
      const normal = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(inside ? -1 : 1).normalize();
      const baseR = inside ? innerR : outerR;
      const gemSize = Math.max(0.8, size * 0.55);
      const offset = gemSize * 0.6; // slightly out of the surface
      const pos = normal.clone().multiplyScalar(baseR + (inside ? -offset : offset));

      // Orientation: align gem Y axis with normal
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const stone = STONES.find((st) => st.key === s.value) || STONES[0];
      const color = new THREE.Color(stone.hex);
      const ior = stone.ior ?? 1.6;

      arr.push(
        <group key={`gem-${i}`} position={pos.toArray()} quaternion={quat}>
          {/* Simple brilliant-like cut: icosahedron squashed */}
          <mesh castShadow receiveShadow>
            <icosahedronGeometry args={[gemSize, 0]} />
            <meshPhysicalMaterial
              color={color}
              metalness={0}
              roughness={0.03}
              transmission={1}
              thickness={gemSize * 0.9}
              ior={ior}
              specularIntensity={1}
              envMapIntensity={1.2}
              attenuationDistance={2.5}
              attenuationColor={color}
            />
          </mesh>
          {/* Tiny seat (metal bezel) to make contact look real */}
          <mesh castShadow receiveShadow position={[0, -gemSize * 0.52, 0]}>
            <cylinderGeometry args={[gemSize * 0.58, gemSize * 0.62, Math.min(0.5, height * 0.3), 24]} />
            <meshPhysicalMaterial color="#d6c27a" metalness={1} roughness={0.25} />
          </mesh>
        </group>
      );
    }
    return arr;
  }, [innerR, outerR, height, size, slots, inside]);

  return <group>{elements}</group>;
}

// ===== Diagnostic badges (runtime tests) =====
function Badge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`badge ${ok ? "badge-ok" : "badge-bad"}`}>{label}</span>;
}

// ===== Main App =====
export default function App() {
  // Inject warm, high-end theme once
  useEffect(() => {
    const css = `
      :root{--bg1:#f2eee8;--bg2:#f8f6f3;--card:#ffffff;--ink:#1a1a1a;--muted:#6f7276;--line:#e6e1da;--accent:#111111;--gold:#d4af37}
      *{box-sizing:border-box}
      html,body,#root{height:100%}
      body{margin:0;background:linear-gradient(135deg,var(--bg1),var(--bg2));color:var(--ink);font-family:Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial}
      .layout{height:100vh;display:grid;grid-template-columns:1fr;}
      @media(min-width:1024px){.layout{grid-template-columns:3fr 2fr;}}
      .viz{position:relative;height:56vh;border-right:1px solid var(--line)}
      @media(min-width:1024px){.viz{height:100vh}}
      .panel{height:100vh;overflow:auto;background:rgba(255,255,255,.92);backdrop-filter:saturate(1.1) blur(10px);padding:32px;border-left:1px solid var(--line)}
      .title{font-family:"Cormorant Garamond", ui-serif, Georgia, "Times New Roman", serif;font-size:42px;line-height:1.1;margin:0 0 8px}
      .sub{color:var(--muted);font-size:14px;margin:0 0 18px}
      .section{margin:18px 0}
      .row{display:flex;gap:10px;align-items:center}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .gridSlots{display:grid;grid-template-columns:1fr;gap:10px}
      @media(min-width:640px){.gridSlots{grid-template-columns:1fr 1fr}}
      label{font-size:13px;color:#2a2a2a;display:block}
      input[type="range"]{width:100%}
      select,input{border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:#fff;color:var(--ink)}
      .pair{display:flex;gap:8px;align-items:center}
      .hint{font-size:11px;color:var(--muted)}
      .btn{background:var(--accent);color:#fff;border:none;border-radius:999px;padding:10px 16px;font-size:13px;cursor:pointer;box-shadow:0 8px 24px rgba(17,17,17,.18)}
      .btn:hover{background:#2a2a2a}
      .slot{display:flex;gap:8px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
      .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;font-size:11px}
      .badge-ok{background:#e6f6ec;color:#1e6b4e}
      .badge-bad{background:#fdecef;color:#9f1239}
      .swatch{width:20px;height:14px;border-radius:4px;border:1px solid var(--line)}
    `;
    const style = document.createElement("style");
    style.id = "ring-ui-css";
    style.innerHTML = css;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Ring parameters (millimeters)
  const [innerDiameter, setInnerDiameter] = useState(18.0);
  const [bandWidth, setBandWidth] = useState(3.0); // radial width
  const [bandHeight, setBandHeight] = useState(2.2); // height along Y
  const [markSize, setMarkSize] = useState(2.6);
  const [inside, setInside] = useState(false);
  const [goldColor, setGoldColor] = useState("#d4af37");
  const [markColor, setMarkColor] = useState("#3b3b3b");

  // Default: zodiac sequence around the band (slot #1 at front)
  const initialSlots: Slot[] = Array.from({ length: 12 }, (_, i) => ({ kind: "zodiac", value: ZODIAC[i % 12].key }));
  const [slots, setSlots] = useState<Slot[]>(initialSlots);

  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  // Derived radii
  const innerR = useMemo(() => innerDiameter / 2, [innerDiameter]);
  const outerR = useMemo(() => innerR + bandWidth, [innerR, bandWidth]);

  const updateSlot = (idx: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? ({ ...s, ...patch } as Slot) : s)));

  // Diagnostics
  const tests = {
    twelveSlots: slots.length === 12,
    geometryValid: outerR > innerR && innerDiameter > 0 && bandHeight > 0,
    slotsValid: slots.every((s) => (s.kind === "zodiac" && ZODIAC.some((z) => z.key === (s as any).value)) || (s.kind === "stone" && STONES.some((st) => st.key === (s as any).value)) || s.kind === "text"),
  } as const;

  return (
    <div className="layout">
      {/* LEFT: Visualization */}
      <div className="viz">
        <Canvas shadows camera={{ position: [50, 28, 52], fov: 35 }}>
          <color attach="background" args={["#f5f3ef"]} />
          <group ref={groupRef} position={[0, 0, 0]}>
            <Band ref={ringRef} innerR={innerR} bandWidth={bandWidth} bandHeight={bandHeight} color={goldColor} />
            <DecalMarks targetRef={ringRef} innerR={innerR} outerR={outerR} size={markSize} slots={slots} inside={inside} markColor={markColor} />
            <Gems innerR={innerR} outerR={outerR} height={bandHeight} size={markSize} slots={slots} inside={inside} />
          </group>

          <ambientLight intensity={0.6} />
          <spotLight position={[60, 90, 40]} angle={0.35} penumbra={0.85} intensity={1.25} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <Environment preset="studio" />
          <OrbitControls makeDefault enablePan={false} minDistance={25} maxDistance={120} />

          {/* Ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -bandHeight * 0.9, 0]} receiveShadow>
            <circleGeometry args={[200, 64]} />
            <meshStandardMaterial color="#ebe7df" />
          </mesh>
        </Canvas>
      </div>

      {/* RIGHT: Options */}
      <div className="panel">
        <h1 className="title">Custom Ring – Zodiac & Stones</h1>
        <p className="sub">Slot <strong>1</strong> is the front/top reference. Positions proceed clockwise. Stones are true 3D; Zodiac/Text are flat engravings.</p>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <Badge ok={tests.twelveSlots} label="12 slots" />
          <Badge ok={tests.geometryValid} label="Geometry OK" />
          <Badge ok={tests.slotsValid} label="Slots valid" />
        </div>

        {/* Ring dimensions */}
        <div className="grid2 section">
          <label>Inner Ø (mm)
            <input type="range" min={14} max={24} step={0.1} value={innerDiameter} onChange={(e) => setInnerDiameter(parseFloat(e.target.value))} />
            <div className="hint">{innerDiameter.toFixed(1)} mm</div>
          </label>
          <label>Band width (mm)
            <input type="range" min={1.8} max={6} step={0.1} value={bandWidth} onChange={(e) => setBandWidth(parseFloat(e.target.value))} />
            <div className="hint">{bandWidth.toFixed(1)} mm</div>
          </label>
          <label>Band height (mm)
            <input type="range" min={1.2} max={3.5} step={0.1} value={bandHeight} onChange={(e) => setBandHeight(parseFloat(e.target.value))} />
            <div className="hint">{bandHeight.toFixed(1)} mm</div>
          </label>
          <label>Mark size (mm)
            <input type="range" min={1} max={6} step={0.1} value={markSize} onChange={(e) => setMarkSize(parseFloat(e.target.value))} />
            <div className="hint">{markSize.toFixed(1)} mm</div>
          </label>
          <div className="row" style={{ alignItems: "center" }}>
            <input id="inside" type="checkbox" checked={inside} onChange={(e) => setInside(e.target.checked)} />
            <label htmlFor="inside">Place inside</label>
          </div>
        </div>

        <div className="row section" style={{ justifyContent: "space-between" }}>
          <div className="pair"><span>Metal</span><input type="color" value={goldColor} onChange={(e) => setGoldColor(e.target.value)} /><span className="swatch" style={{ background: goldColor }} /></div>
          <div className="pair"><span>Mark</span><input type="color" value={markColor} onChange={(e) => setMarkColor(e.target.value)} /><span className="hint">(Zodiac/Text color)</span></div>
          <ExportButton groupRef={groupRef} />
        </div>

        {/* Slot editor */}
        <div className="gridSlots section">
          {slots.map((s, i) => (
            <div key={i} className="slot">
              <span className="hint" style={{ width: 16, textAlign: "center" }}>{i + 1}</span>
              <select
                value={s.kind}
                onChange={(e) => {
                  const kind = e.target.value as Slot["kind"];
                  if (kind === "zodiac") updateSlot(i, { kind, value: ZODIAC[0].key });
                  else if (kind === "stone") updateSlot(i, { kind, value: STONES[0].key });
                  else updateSlot(i, { kind, value: "AB" });
                }}
              >
                <option value="zodiac">Zodiac</option>
                <option value="stone">Stone</option>
                <option value="text">Text</option>
              </select>

              {s.kind === "zodiac" && (
                <select value={(s as any).value} onChange={(e) => updateSlot(i, { value: e.target.value })} style={{ flex: 1 }}>
                  {ZODIAC.map((z) => (
                    <option key={z.key} value={z.key}>{z.label}</option>
                  ))}
                </select>
              )}

              {s.kind === "stone" && (
                <select value={(s as any).value} onChange={(e) => updateSlot(i, { value: e.target.value })} style={{ flex: 1 }}>
                  {STONES.map((st) => (
                    <option key={st.key} value={st.key}>{st.label}</option>
                  ))}
                </select>
              )}

              {s.kind === "text" && (
                <input value={(s as any).value} onChange={(e) => updateSlot(i, { value: e.target.value })} placeholder="AB" maxLength={6} style={{ flex: 1 }} />
              )}
            </div>
          ))}
        </div>

        <p className="hint">If you want prongs or a different crown style for stones, tell me and I'll add it.</p>
      </div>
    </div>
  );
}
