import * as THREE from "three";

/**
 * Shared between `/3d-test` (the Step 6 feasibility/QA tool) and the real
 * homepage scene (Step 9) — one source of truth for which mesh is which
 * part of the piano, so the two never quietly drift apart.
 *
 * Every threshold here was read off grand_piano.glb's real 80 meshes during
 * Step 6, not guessed — see PianoScene.tsx / the Step 6 report for the full
 * evidence (counts, positions, why each range is where it is). All 80 meshes
 * share one flat grey material (lambert1) — there is no texture or vertex
 * color anywhere in this model (confirmed exhaustively — every glTF texture
 * slot and vertex colors, checked, zero found), so classification is
 * geometry-only: world-space size and vertical position.
 *
 * The color has moved twice. First correction: the GLB reports #8f8f8f, but
 * `Downloads/source/Grand piano.fbx` — the original 2019 authoring file this
 * GLB was exported from — reports #666666 for the identical material (same
 * 80 meshes, same names, same lambert1, zero textures either way); that was
 * a color-space shift from the FBX→glTF export, so #666666 was used as the
 * asset's true original value.
 *
 * Later changes are deliberate stylistic choices, not source-file
 * corrections, chasing a Sketchfab reference render ("Grand Piano" by
 * Andrew Mad) the user pointed at repeatedly. Two wrong guesses before
 * landing here: first "make it black" (#26282c), then "sample the case's
 * apparent slate blue-grey" (#4a515a) — both wrong because they treated
 * what's a LIGHTING effect as if it were the material's diffuse color.
 * The user's own final description settled it: "the whole piano is gloss
 * black reflecting those lights" — an orange-red key light and a soft
 * purplish-pink ambient, top-left at 45°. A glossy black surface shows
 * exactly this: whatever color light hits it, reflected as a bright
 * specular highlight, over an otherwise near-black diffuse base. So the
 * base color goes back to near-black, and getting the "orange-ish
 * red"/"purplish pink" into the piano is a material-glossiness +
 * scene-lighting job (see createDefaultPianoMaterial's roughness/metalness
 * below, and the light rig in PianoBackdropCanvas.tsx / 3d-test/page.tsx),
 * not another color swap here.
 */
const PIANO_MATERIAL_COLOR = "#121214";

export type PartType = "WHITE_KEY" | "BLACK_KEY" | "LEG" | "LID" | "BODY" | "PEDAL" | "FLOOR" | "OTHER";

export function classifyMesh(size: [number, number, number], center: [number, number, number]): PartType {
  const [sx, sy, sz] = size;
  const [, cy] = center;

  if (sz >= 0.95 && sz <= 1.1 && sx >= 0.15 && sx <= 0.25 && sy < 0.1) return "WHITE_KEY";
  if (sz >= 0.8 && sz < 0.95 && sx >= 0.1 && sx < 0.15 && sy >= 0.07 && sy <= 0.11) return "BLACK_KEY";
  // Thickness (sx/sz > 0.3) separates the 3 real legs from two thin support
  // rods that share the legs' height range and low y-center but are only
  // ~0.11–0.12 wide, nowhere near a real leg's ~0.6–0.68 — found by
  // rendering with highlighting on during Step 6 (leg count came back 5,
  // not 3, until this was added).
  if (sy >= 1.3 && sy <= 2.0 && cy < -0.5 && sx > 0.3 && sx < 1 && sz > 0.3 && sz < 1) return "LEG";
  if (sy > 3 && sz > 6 && cy > 2) return "LID";
  if (sz > 6 && sy >= 1.0 && sy <= 1.5 && cy < 1) return "BODY";
  if (cy < -1.4 && cy > -1.65 && sx < 0.7 && sz < 0.7) return "PEDAL";
  if (sy < 0.01 && sx > 20) return "FLOOR";
  return "OTHER";
}

export interface ClassifiedMeshInfo {
  object: THREE.Mesh;
  part: PartType;
  worldCenter: THREE.Vector3;
  worldSize: THREE.Vector3;
}

/**
 * Walks a loaded GLTF scene once, classifying every mesh and tagging it
 * (`mesh.userData.part`) so later passes (highlighting, key-wave animation)
 * don't need to re-walk the tree or recompute bounds every frame.
 */
export function classifyScene(root: THREE.Object3D): ClassifiedMeshInfo[] {
  const results: ClassifiedMeshInfo[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(obj);
    const worldSize = new THREE.Vector3();
    const worldCenter = new THREE.Vector3();
    box.getSize(worldSize);
    box.getCenter(worldCenter);
    const part = classifyMesh([worldSize.x, worldSize.y, worldSize.z], [worldCenter.x, worldCenter.y, worldCenter.z]);
    obj.userData.part = part;
    results.push({ object: obj, part, worldCenter, worldSize });
  });
  return results;
}

export const PART_COLORS: Record<PartType, string> = {
  WHITE_KEY: "#4ade80",
  BLACK_KEY: "#60a5fa",
  LEG: "#f472b6",
  LID: "#facc15",
  BODY: "#fb923c",
  PEDAL: "#c084fc",
  FLOOR: "#334155",
  OTHER: PIANO_MATERIAL_COLOR,
};

export const PART_LABELS: Record<PartType, string> = {
  WHITE_KEY: "White key",
  BLACK_KEY: "Black key",
  LEG: "Leg",
  LID: "Lid",
  BODY: "Body",
  PEDAL: "Pedal",
  FLOOR: "Floor",
  OTHER: "Unclassified",
};

/** The model's one real material, reconstructed from the known-correct
 *  value (not a captured live reference — see Step 6's report for why that
 *  approach was fragile).
 *
 *  roughness/metalness are the actual "gloss black" — MeshStandardMaterial
 *  defaults to roughness 1 (fully matte), which spreads specular reflection
 *  so wide it's effectively invisible, so no light color would ever show up
 *  as a highlight no matter how dark/saturated PIANO_MATERIAL_COLOR is. Low
 *  roughness + low metalness (a dielectric, not a metal — real piano
 *  lacquer is clear-coated paint, not bare metal) is what lets the two
 *  colored lights in the scene appear as bright reflected highlights over
 *  the near-black base, matching "gloss black reflecting those lights."
 *
 *  First attempt used a truer near-black (#0a0a0c) and it went almost
 *  invisible instead — a physically-based renderer scales a surface's
 *  DIFFUSE response by its own albedo, so a near-zero base color kills the
 *  ambient/fill contribution almost entirely no matter how bright those
 *  lights are; only a light's tiny direct specular hotspot survived, and
 *  even that was too dim to read from most camera angles. PIANO_MATERIAL_
 *  COLOR was nudged up slightly (#121214) so there's a little diffuse
 *  response to work with, and roughness was raised a touch (spreads the
 *  specular lobe wider, so the colored reflection is visible across more
 *  of the surface, not one pinpoint) — see the light rig itself in
 *  PianoBackdropCanvas.tsx / 3d-test/page.tsx for the intensity side of
 *  this same fix. */
export function createDefaultPianoMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PIANO_MATERIAL_COLOR, roughness: 0.32, metalness: 0.08 });
}

/**
 * A second, separate palette — additive, doesn't touch anything above.
 * `createDefaultPianoMaterial`/`PIANO_MATERIAL_COLOR` are what
 * PianoBackdropCanvas.tsx (the live homepage) actually renders; this one is
 * for the cinematic color-grade pass the user specified directly (exact hex
 * values, per-part grouping, and lighting-vs-material split are all theirs,
 * not derived from the model or a screenshot sample), applied only in
 * `/3d-test` for now — the request that produced this was explicit that the
 * homepage shouldn't change until it's approved there too.
 *
 * The reds/oranges/lavenders in the reference are LIGHTING, per that same
 * brief ("Do NOT paint the whole piano red... The warm red should appear
 * where light touches the piano") — these material colors alone are meant
 * to look like plain dark-charcoal/ivory/bronze under neutral light; see
 * the light rig in 3d-test/page.tsx for the half of this that's actually
 * doing the cinematic work.
 */
export const CINEMATIC_PART_COLORS: Record<PartType, string> = {
  WHITE_KEY: "#D7C7B2",
  BLACK_KEY: "#10151B",
  LEG: "#202833",
  LID: "#202833",
  BODY: "#202833",
  PEDAL: "#3A302B",
  FLOOR: "#331A26",
  OTHER: "#202833",
};

/** roughness/metalness per part — not specified as exact numbers in the
 *  brief, so chosen from its material *descriptions*: keys "warm and
 *  slightly desaturated" (soft, not glossy → higher roughness, no
 *  metalness); body/lid/legs "gloss black"-adjacent charcoal (low
 *  roughness, slight metalness, same reasoning as createDefaultPianoMaterial
 *  above); pedals "dark bronze/charcoal... not shiny chrome... not bright
 *  gold" (some metalness for a bronze feel, but rough enough to stay matte
 *  rather than mirror-like); floor catches light diffusely, no gloss. */
export function createCinematicPianoMaterials(): Map<PartType, THREE.MeshStandardMaterial> {
  const ROUGHNESS: Record<PartType, number> = {
    WHITE_KEY: 0.55,
    BLACK_KEY: 0.4,
    LEG: 0.32,
    LID: 0.32,
    BODY: 0.32,
    PEDAL: 0.5,
    FLOOR: 0.68,
    OTHER: 0.34,
  };
  const METALNESS: Record<PartType, number> = {
    WHITE_KEY: 0,
    BLACK_KEY: 0.05,
    LEG: 0.14,
    LID: 0.14,
    BODY: 0.14,
    PEDAL: 0.35,
    FLOOR: 0,
    OTHER: 0.1,
  };
  const map = new Map<PartType, THREE.MeshStandardMaterial>();
  (Object.keys(CINEMATIC_PART_COLORS) as PartType[]).forEach((part) => {
    map.set(
      part,
      new THREE.MeshStandardMaterial({
        color: CINEMATIC_PART_COLORS[part],
        roughness: ROUGHNESS[part],
        metalness: METALNESS[part],
      }),
    );
  });
  return map;
}
