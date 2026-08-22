"use client";

/**
 * STEP 6 — 3D PIANO FEASIBILITY. Isolated, unlinked route — nothing else in
 * the app links here, and it's excluded from every middleware matcher (see
 * middleware.ts's `config.matcher`, none of which cover `/3d-test`). Not
 * integrated into the homepage or any production surface.
 *
 * ── Two passes, in order ──────────────────────────────────────────────────
 * Pass 1 (kept, see inspectScene): walk the loaded scene graph and record
 * name, world-space bounds, position, material and triangle count for every
 * mesh, through the SAME loading path the real homepage would eventually
 * use (@react-three/drei's useGLTF, wrapping three's own GLTFLoader).
 *
 * Pass 2 (classifyMesh, below): identify which meshes are keys/body/lid/legs
 * /pedals from that real data. Every threshold in classifyMesh was read off
 * the model's actual 80 meshes, not guessed — see the comment above the
 * function for the specific evidence. Per the master doc's explicit
 * instruction, names are NOT the basis for identification (this model's
 * names are generic Maya export IDs like "pCube23" — uninformative on their
 * own); they're geometry-only rules (size, position, clustering), and the
 * highlight toggle below exists specifically to visually PROVE the
 * classification against the rendered model rather than trust it blind.
 */

import { Suspense, useState, useRef, useMemo, useEffect, Component, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  classifyMesh,
  createDefaultPianoMaterial,
  createCinematicPianoMaterials,
  PART_COLORS,
  PART_LABELS,
  type PartType,
} from "@/lib/piano-parts";

const MODEL_URL = "/models/grand_piano.glb";

interface NodeInfo {
  name: string;
  type: string;
  depth: number;
  parentName: string;
  position: [number, number, number];
  worldBoundsSize: [number, number, number] | null;
  worldBoundsCenter: [number, number, number] | null;
  materialName: string | null;
  materialColor: string | null;
  triangleCount: number | null;
  part: PartType;
  hasVertexColors: boolean;
  textureMaps: string[];
}

// classifyMesh/PART_COLORS/PART_LABELS now live in @/lib/piano-parts —
// shared with the real homepage scene (PianoScene.tsx) so both use the same
// evidence-based thresholds. See that file for the full reasoning per range.

function inspectScene(root: THREE.Object3D): NodeInfo[] {
  const results: NodeInfo[] = [];

  function visit(obj: THREE.Object3D, depth: number, parentName: string) {
    let worldBoundsSize: [number, number, number] | null = null;
    let worldBoundsCenter: [number, number, number] | null = null;
    let materialName: string | null = null;
    let materialColor: string | null = null;
    let triangleCount: number | null = null;
    let part: PartType = "OTHER";
    let hasVertexColors = false;
    let textureMaps: string[] = [];

    if (obj instanceof THREE.Mesh) {
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      worldBoundsSize = [size.x, size.y, size.z];
      worldBoundsCenter = [center.x, center.y, center.z];
      part = classifyMesh(worldBoundsSize, worldBoundsCenter);

      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (mat) {
        materialName = mat.name || null;
        if ("color" in mat && mat.color instanceof THREE.Color) {
          materialColor = `#${mat.color.getHexString()}`;
        }
        // Every texture slot a glTF material could carry — checked
        // explicitly rather than assumed, since the Step 6 inspection only
        // ever read `.color` and never checked for an actual image texture.
        const slots = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "bumpMap"] as const;
        textureMaps = slots.filter((slot) => (mat as unknown as Record<string, unknown>)[slot] != null);
      }

      hasVertexColors = obj.geometry?.getAttribute("color") != null;

      const geom = obj.geometry;
      if (geom) {
        const posAttr = geom.getAttribute("position");
        const indexAttr = geom.getIndex();
        triangleCount = indexAttr ? indexAttr.count / 3 : posAttr ? posAttr.count / 3 : null;
      }

      // Tag the object itself so the highlight pass (below) can find it
      // again without re-walking the tree or re-classifying.
      obj.userData.part = part;
    }

    results.push({
      name: obj.name || "(unnamed)",
      type: obj.type,
      depth,
      parentName,
      position: [obj.position.x, obj.position.y, obj.position.z],
      worldBoundsSize,
      worldBoundsCenter,
      materialName,
      materialColor,
      triangleCount,
      part,
      hasVertexColors,
      textureMaps,
    });

    obj.children.forEach((child) => visit(child, depth + 1, obj.name || "(unnamed)"));
  }

  visit(root, 0, "(root)");
  return results;
}

function PianoModel({
  onInspected,
  highlight,
}: {
  onInspected: (nodes: NodeInfo[], box: THREE.Box3) => void;
  highlight: boolean;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const inspected = useRef(false);
  // One shared highlight material per part type, reused across all meshes of
  // that type — cheaper than a new material instance per mesh, and easy to
  // toggle without touching geometry.
  const highlightMaterials = useMemo(() => {
    const map = new Map<PartType, THREE.MeshStandardMaterial>();
    (Object.keys(PART_COLORS) as PartType[]).forEach((part) => {
      if (part === "OTHER") return;
      map.set(
        part,
        new THREE.MeshStandardMaterial({ color: PART_COLORS[part], emissive: PART_COLORS[part], emissiveIntensity: 0.35 }),
      );
    });
    return map;
  }, []);
  // A known-good reconstruction of the model's default material, not a
  // captured live reference. The first version of this tried to remember
  // each mesh's original `.material` in a ref and restore it on toggle-off
  // — fragile, because useGLTF's cache returns the SAME scene object across
  // remounts, so a remount that happened to land while highlighting was on
  // would re-"capture" the highlight colour as if it were the original,
  // corrupting the off-state permanently. See piano-parts.ts's
  // PIANO_MATERIAL_COLOR/createDefaultPianoMaterial for what color and
  // gloss the LIVE homepage actually uses (untouched by this cinematic
  // pass). Imported from piano-parts.ts rather than hardcoded here a
  // second time — a duplicated literal is exactly what let this page and
  // the real homepage scene drift out of sync once already.
  const defaultMaterial = useMemo(() => createDefaultPianoMaterial(), []);
  // The cinematic per-part palette (see piano-parts.ts) — one material per
  // classified part, not one flat material for the whole model, per the
  // user's explicit "group objects by function... apply different
  // materials to each logical group" instruction. This is what actually
  // renders here now; defaultMaterial above is kept as a documented
  // fallback only (unclassified/edge-case meshes).
  const cinematicMaterials = useMemo(() => createCinematicPianoMaterials(), []);

  if (!inspected.current) {
    inspected.current = true;
    const nodes = inspectScene(scene);
    const overallBox = new THREE.Box3().setFromObject(scene);
    onInspected(nodes, overallBox);
  }

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const part = obj.userData.part as PartType | undefined;
    if (highlight && part && part !== "OTHER") {
      obj.material = highlightMaterials.get(part)!;
    } else {
      obj.material = (part && cinematicMaterials.get(part)) || defaultMaterial;
    }
  });

  return <primitive object={scene} />;
}

/**
 * The reference's background isn't a flat color — it's a vertical gradient
 * (dusty lavender at top → muted rose/mauve → deep plum/wine → near-black
 * at the bottom). three.js's `<color attach="background">` only accepts a
 * single flat color, so this bakes the 4 exact stops into a 1×256 canvas
 * texture once and sets it as `scene.background` directly — cheap (tiny
 * texture, built once on mount) and exact, rather than approximating the
 * gradient with a lit skybox mesh.
 */
function GradientBackground() {
  const { scene } = useThree();
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#B8A4D0");
    gradient.addColorStop(0.35, "#A96F80");
    gradient.addColorStop(0.7, "#542A38");
    gradient.addColorStop(1, "#180F16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    return () => {
      texture.dispose();
      scene.background = null;
    };
  }, [scene]);
  return null;
}

function SlowSpin({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.15;
  });
  return <group ref={ref}>{children}</group>;
}

export default function ThreeDTestPage() {
  const [nodes, setNodes] = useState<NodeInfo[] | null>(null);
  const [overallSize, setOverallSize] = useState<[number, number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const handleInspected = (n: NodeInfo[], box: THREE.Box3) => {
    setNodes(n);
    const size = new THREE.Vector3();
    box.getSize(size);
    setOverallSize([size.x, size.y, size.z]);
    (window as unknown as { __glbInspection: unknown }).__glbInspection = n;
  };

  // Its own useMemo, not a plain derived `const`: `nodes?.filter(...) ?? []`
  // makes a new array every render even when `nodes` hasn't changed, which
  // was silently defeating `byPart`'s memo below (deps always looked
  // "changed" by reference) — this keeps `meshNodes` referentially stable
  // so that memo actually skips recomputation when nothing changed.
  const meshNodes = useMemo(() => nodes?.filter((n) => n.type === "Mesh" || n.type === "SkinnedMesh") ?? [], [nodes]);
  const byPart = useMemo(() => {
    const groups = new Map<PartType, NodeInfo[]>();
    meshNodes.forEach((n) => {
      if (!groups.has(n.part)) groups.set(n.part, []);
      groups.get(n.part)!.push(n);
    });
    return groups;
  }, [meshNodes]);

  const partOrder: PartType[] = ["WHITE_KEY", "BLACK_KEY", "LEG", "LID", "BODY", "PEDAL", "FLOOR", "OTHER"];

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: "monospace" }}>
      <div style={{ flex: "1 1 60%", position: "relative" }}>
        {/* CINEMATIC COLOR-GRADE PASS (per the user's own written brief —
            see piano-parts.ts's createCinematicPianoMaterials for the
            material half). This Canvas config is DIFFERENT from the live
            homepage's PianoBackdropCanvas.tsx on purpose — that file is
            deliberately untouched until this look is approved here first.
            ACES Filmic tone mapping is back (the homepage dropped it
            earlier because `<Environment preset="studio">`'s bright neutral
            HDRI, stacked under ACES, washed everything white) — no
            Environment is used here either, so that failure mode doesn't
            apply; ACES is what gives the filmic, non-clipping highlight
            rolloff the brief asks for. toneMappingExposure is tuned down
            from the 1.0 default specifically to keep the highlights from
            clipping to white per the brief's "do not overexpose" rule. */}
        <Canvas
          // Widened from the original close-up key-inspection framing
          // ([0, 1.2, 2.2]) to a full establishing shot — same distance
          // PianoBackdropCanvas.tsx's own hero keyframe uses — so this
          // cinematic pass can actually be judged against the reference at
          // whole-piano scale, not one key filling the frame. OrbitControls
          // (below) is still live for zooming into detail afterward.
          camera={{ position: [6, 3.4, 7], fov: 45 }}
          shadows
          gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.7 }}
        >
          <GradientBackground />
          {/* AMBIENT — kept very low and plum-tinted, not neutral white, so
              the scene stays dark per the brief ("do NOT flood the scene
              with neutral white... scene must remain dark"). */}
          <ambientLight color="#2a1c22" intensity={0.24} />
          {/* KEY LIGHT — warm red/orange, upper front/side; this is the
              light actually doing the "orange-ish red top-left at 45°"
              illumination the brief calls out repeatedly. */}
          <directionalLight position={[-4, 5, 4]} color="#E04A32" intensity={1.2} castShadow />
          {/* FILL LIGHT — soft lavender/purple, low intensity, camera side
              this time (was positioned behind the piano at first and barely
              touched any camera-facing surface — moved to roughly the
              camera's own side so the keyboard actually picks up some cool
              lavender instead of reading as solid warm-red; still the
              softest, lowest-key light of the four). */}
          <directionalLight position={[5, 2, 6]} color="#B7A0D2" intensity={0.55} />
          {/* RIM LIGHT — warm red/orange again, from behind/the side, to
              outline the piano's silhouette against the dark background. */}
          <directionalLight position={[-3, 2, -5]} color="#D94632" intensity={0.7} />
          {/* INTERIOR BOUNCE — a small, short-range warm point light near
              the open lid/key-well area. The brief calls for the interior
              to read distinctly warmer than the exterior body; the model's
              LID/BODY are each a single mesh (inside and outside share one
              surface), so a separate "interior material" isn't possible
              without adding geometry (which the brief explicitly forbids)
              — a short-throw light positioned inside the cavity gets the
              same visible result through lighting instead. Intensity was
              cut hard from a first pass (1.4 at distance 3) that blew out
              into a solid white-hot orb — point-light irradiance scales
              with inverse-square distance, so at the close range this
              cavity sits at, even a "moderate" intensity clips every
              channel to white, which is exactly the overexposure the brief
              says to avoid. */}
          <pointLight position={[0, 0.55, -0.35]} color="#D94A32" intensity={0.16} distance={2} decay={2} />
          <Suspense fallback={null}>
            <ErrorCatcher onError={setError}>
              {spin ? (
                <SlowSpin>
                  <PianoModel onInspected={handleInspected} highlight={highlight} />
                </SlowSpin>
              ) : (
                <PianoModel onInspected={handleInspected} highlight={highlight} />
              )}
            </ErrorCatcher>
          </Suspense>
          <OrbitControls makeDefault />
          <gridHelper args={[10, 10, "#333", "#222"]} />
        </Canvas>
        <div style={{ position: "absolute", top: 12, left: 12, fontSize: 12, display: "flex", gap: 8 }}>
          <button
            onClick={() => setSpin((s) => !s)}
            style={{ padding: "6px 10px", background: "#222", color: "#eee", border: "1px solid #444", cursor: "pointer" }}
          >
            {spin ? "Stop spin" : "Start spin"}
          </button>
          <button
            onClick={() => setHighlight((h) => !h)}
            style={{
              padding: "6px 10px",
              background: highlight ? "#3a2f0f" : "#222",
              color: highlight ? "#facc15" : "#eee",
              border: "1px solid #444",
              cursor: "pointer",
            }}
          >
            {highlight ? "Highlighting ON" : "Highlighting OFF"}
          </button>
        </div>
        {error && (
          <div style={{ position: "absolute", top: 12, right: 12, color: "#ff6b6b", fontSize: 12, maxWidth: 300 }}>
            {error}
          </div>
        )}
        {highlight && (
          <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 10, display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 400 }}>
            {partOrder
              .filter((p) => p !== "OTHER" && byPart.has(p))
              .map((p) => (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, background: PART_COLORS[p] }} />
                  {PART_LABELS[p]} ({byPart.get(p)!.length})
                </div>
              ))}
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 40%", overflowY: "auto", padding: 16, fontSize: 11, lineHeight: 1.5, borderLeft: "1px solid #333" }}>
        <h1 style={{ fontSize: 14, marginBottom: 4 }}>grand_piano.glb — classification</h1>
        <p style={{ color: "#888", marginBottom: 12 }}>
          {nodes ? `${nodes.length} total nodes, ${meshNodes.length} meshes` : "Loading…"}
          {overallSize && (
            <>
              {" · overall bounds "}
              {overallSize.map((v) => v.toFixed(3)).join(" × ")}
            </>
          )}
        </p>

        {partOrder.map((p) => {
          const group = byPart.get(p);
          if (!group || group.length === 0) return null;
          return (
            <div key={p} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, background: PART_COLORS[p] }} />
                <strong style={{ color: "#f0c98a" }}>
                  {PART_LABELS[p]} — {group.length}
                </strong>
              </div>
              <div style={{ color: "#999", fontSize: 10 }}>
                {group
                  .slice(0, 6)
                  .map((n) => n.name)
                  .join(", ")}
                {group.length > 6 ? ` … +${group.length - 6} more` : ""}
              </div>
            </div>
          );
        })}

        <button
          onClick={() => setShowRaw((s) => !s)}
          style={{ marginTop: 8, padding: "6px 10px", background: "#222", color: "#eee", border: "1px solid #444", cursor: "pointer" }}
        >
          {showRaw ? "Hide raw dump" : "Show raw dump"}
        </button>

        {showRaw &&
          meshNodes
            .slice()
            .sort((a, b) => (b.worldBoundsSize?.[1] ?? 0) - (a.worldBoundsSize?.[1] ?? 0))
            .map((n, i) => (
              <div key={i} style={{ marginTop: 10, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #222" }}>
                <div style={{ color: "#f0c98a" }}>
                  {n.name}{" "}
                  <span style={{ color: "#666" }}>
                    ({n.type}, part {n.part}, parent {n.parentName})
                  </span>
                </div>
                <div>pos: [{n.position.map((v) => v.toFixed(3)).join(", ")}]</div>
                {n.worldBoundsSize && (
                  <div>
                    world size: [{n.worldBoundsSize.map((v) => v.toFixed(4)).join(", ")}] center: [
                    {n.worldBoundsCenter!.map((v) => v.toFixed(3)).join(", ")}]
                  </div>
                )}
                <div>
                  material: {n.materialName || "—"} {n.materialColor} · tris: {n.triangleCount ?? "—"}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

class ErrorCatcher extends Component<{ onError: (msg: string) => void; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { onError: (msg: string) => void; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

useGLTF.preload(MODEL_URL);
