import { describe, expect, it } from "vitest";
import {
  CHROMATIC_SCALES,
  ROOT_KEYS,
  spellDegree,
  spellScale,
  getScaleInAllKeys,
  buildChordOnDegree,
  getChordInAllKeys,
} from "./music-theory";

describe("spellDegree", () => {
  it("spells the unaltered major-scale degrees of C", () => {
    expect(spellDegree("C", "1")).toBe("C");
    expect(spellDegree("C", "2")).toBe("D");
    expect(spellDegree("C", "3")).toBe("E");
    expect(spellDegree("C", "4")).toBe("F");
    expect(spellDegree("C", "5")).toBe("G");
    expect(spellDegree("C", "6")).toBe("A");
    expect(spellDegree("C", "7")).toBe("B");
  });

  it("spells G major's degrees, including the sharp 7th", () => {
    expect(spellDegree("G", "1")).toBe("G");
    expect(spellDegree("G", "2")).toBe("A");
    expect(spellDegree("G", "3")).toBe("B");
    expect(spellDegree("G", "4")).toBe("C");
    expect(spellDegree("G", "5")).toBe("D");
    expect(spellDegree("G", "6")).toBe("E");
    expect(spellDegree("G", "7")).toBe("F#");
  });

  it("always spells b3/b5/b7/b9 as a flatted letter, never a sharp enharmonic", () => {
    expect(spellDegree("C", "b3")).toBe("Eb");
    expect(spellDegree("C", "b5")).toBe("Gb");
    expect(spellDegree("C", "b7")).toBe("Bb");
    expect(spellDegree("C", "b9")).toBe("Db");
  });

  it("always spells #4/#5/#9 as a sharped letter, never a flat enharmonic", () => {
    expect(spellDegree("C", "#4")).toBe("F#");
    expect(spellDegree("C", "#5")).toBe("G#");
    expect(spellDegree("C", "#9")).toBe("D#");
  });

  it("folds extended degrees (9/11/13) back onto their base letter", () => {
    expect(spellDegree("C", "9")).toBe(spellDegree("C", "2"));
    expect(spellDegree("C", "11")).toBe(spellDegree("C", "4"));
    expect(spellDegree("C", "13")).toBe(spellDegree("C", "6"));
  });

  it("collapses a double-flat to its plain enharmonic spelling", () => {
    // 7th degree of C, double-flatted: B -> Bbb, which the book simplifies to A.
    expect(spellDegree("C", "bb7")).toBe("A");
  });

  it("collapses a double-sharp to its plain enharmonic spelling", () => {
    // 4th degree of C, double-sharped: F -> F##, which the book simplifies to G.
    expect(spellDegree("C", "##4")).toBe("G");
  });

  it("returns the root itself, spelled exactly as given, for every curriculum key on degree 1", () => {
    for (const root of ROOT_KEYS) {
      expect(spellDegree(root, "1")).toBe(root);
    }
  });

  it("handles roots that are themselves flatted or sharped", () => {
    expect(spellDegree("Db", "3")).toBe("F");
    expect(spellDegree("F#", "3")).toBe("A#");
    expect(spellDegree("Bb", "b7")).toBe("Ab");
  });

  it("throws on an unrecognized root letter", () => {
    expect(() => spellDegree("H", "1")).toThrow();
  });

  it("throws on a malformed degree token", () => {
    expect(() => spellDegree("C", "x")).toThrow();
    expect(() => spellDegree("C", "")).toThrow();
  });
});

describe("spellScale", () => {
  it("spells a full formula from a root, degree by degree", () => {
    const result = spellScale("C", "1-b3-4-5-b7");
    expect(result.root).toBe("C");
    expect(result.degrees).toEqual(["1", "b3", "4", "5", "b7"]);
    expect(result.notes).toEqual(["C", "Eb", "F", "G", "Bb"]);
  });

  it("tolerates whitespace around degree tokens", () => {
    expect(spellScale("C", "1 - b3 - 5").notes).toEqual(["C", "Eb", "G"]);
  });
});

describe("getScaleInAllKeys", () => {
  it("returns an entry for every curriculum root key, matching spellScale", () => {
    const formula = "1-b3-4-5-b7";
    const all = getScaleInAllKeys(formula);
    expect(Object.keys(all).sort()).toEqual([...ROOT_KEYS].sort());
    for (const root of ROOT_KEYS) {
      expect(all[root]).toEqual(spellScale(root, formula).notes);
    }
  });
});

describe("buildChordOnDegree", () => {
  it("builds a native chord rooted on a scale degree", () => {
    const chord = buildChordOnDegree("C", "6", "minor7");
    expect(chord.rootNote).toBe("A");
    expect(chord.symbol).toBe("Am7");
    expect(chord.notes).toEqual(["A", "C", "E", "G"]);
  });

  it("builds a major triad on the tonic", () => {
    const chord = buildChordOnDegree("G", "1", "major");
    expect(chord.rootNote).toBe("G");
    expect(chord.symbol).toBe("G");
    expect(chord.notes).toEqual(["G", "B", "D"]);
  });

  it("builds a diminished triad on a flatted degree", () => {
    const chord = buildChordOnDegree("C", "7", "diminished");
    expect(chord.rootNote).toBe("B");
    expect(chord.symbol).toBe("Bdim");
    expect(chord.notes).toEqual(["B", "D", "F"]);
  });
});

describe("getChordInAllKeys", () => {
  it("returns a chord for every curriculum root key, matching buildChordOnDegree", () => {
    const all = getChordInAllKeys("6", "minor7");
    expect(Object.keys(all).sort()).toEqual([...ROOT_KEYS].sort());
    for (const root of ROOT_KEYS) {
      expect(all[root]).toEqual(buildChordOnDegree(root, "6", "minor7"));
    }
  });
});

describe("CHROMATIC_SCALES", () => {
  it("has exactly 12 notes for every curriculum key, starting on the root", () => {
    for (const root of ROOT_KEYS) {
      const scale = CHROMATIC_SCALES[root];
      expect(scale).toHaveLength(12);
      expect(scale[0]).toBe(root);
    }
  });

  it("matches the book's curated spelling for C and F", () => {
    expect(CHROMATIC_SCALES.C).toEqual([
      "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
    ]);
    expect(CHROMATIC_SCALES.F).toEqual([
      "F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E",
    ]);
  });
});
