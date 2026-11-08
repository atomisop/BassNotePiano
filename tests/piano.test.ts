import { describe, expect, it } from "vitest";
import { buildKeys, countWhiteKeys, isBlackKey, keyboardKeyToMidi, midiToFrequency, midiToName } from "@/lib/piano/notes";
import { parseMidiMessage } from "@/lib/piano/midiMessage";
import { accuracyPercent, applyNote, createSession, hardestNote, progressPercent, targetNote, type Exercise } from "@/lib/piano/practiceScoring";

const phrase: Exercise = { id: "t", title: "t", notes: [60, 62, 64] };

describe("note math", () => {
  it("A4 is 440 Hz and an octave doubles", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });
  it("names notes with the octave number", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(61)).toBe("C#4");
    expect(midiToName(21)).toBe("A0");
    expect(midiToName(108)).toBe("C8");
  });
  it("knows black keys and builds one octave plus the top C", () => {
    expect([60, 62, 64, 65, 67, 69, 71].some(isBlackKey)).toBe(false);
    expect([61, 63, 66, 68, 70].every(isBlackKey)).toBe(true);
    const keys = buildKeys(60, 72);
    expect(keys).toHaveLength(13);
    expect(countWhiteKeys(keys)).toBe(8);
    expect(keys.find((k) => k.midi === 61)?.whiteIndex).toBe(1);
  });
  it("rejects an invalid range", () => {
    expect(() => buildKeys(72, 60)).toThrow(RangeError);
    expect(() => buildKeys(5, 60)).toThrow(RangeError);
  });
  it("maps the computer keyboard from the base note and ignores other keys", () => {
    expect(keyboardKeyToMidi("a", 60)).toBe(60);
    expect(keyboardKeyToMidi("W", 60)).toBe(61);
    expect(keyboardKeyToMidi("k", 60)).toBe(72);
    expect(keyboardKeyToMidi("z", 60)).toBeNull();
    expect(keyboardKeyToMidi("a", 107)).toBe(107);
    expect(keyboardKeyToMidi("k", 107)).toBeNull();
  });
});

describe("parseMidiMessage", () => {
  it("reads note on, note off, and velocity 0 as off, on any channel", () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: "noteOn", midi: 60, velocity: 100 });
    expect(parseMidiMessage([0x93, 64, 1])).toEqual({ type: "noteOn", midi: 64, velocity: 1 });
    expect(parseMidiMessage([0x80, 60, 0])?.type).toBe("noteOff");
    expect(parseMidiMessage([0x90, 60, 0])?.type).toBe("noteOff");
  });
  it("ignores everything else and bad data", () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull(); // control change
    expect(parseMidiMessage([0xf8])).toBeNull(); // clock
    expect(parseMidiMessage([0x90, 200, 100])).toBeNull();
    expect(parseMidiMessage(null)).toBeNull();
    expect(parseMidiMessage([])).toBeNull();
  });
});

describe("practice scoring", () => {
  it("advances on the right note, holds on a wrong one", () => {
    let s = createSession(phrase, "guided");
    expect(targetNote(s)).toBe(60);
    s = applyNote(s, 62, 1000);
    expect(s.position).toBe(0);
    expect(s.last).toMatchObject({ result: "wrong", expected: 60 });
    s = applyNote(s, 60, 2000);
    expect(s.position).toBe(1);
    expect(targetNote(s)).toBe(62);
  });
  it("goes 0 to 100 percent and reports accuracy from all attempts", () => {
    let s = createSession(phrase, "memory");
    expect(progressPercent(s)).toBe(0);
    s = applyNote(s, 61, 1000); // wrong
    s = applyNote(s, 60, 2000);
    s = applyNote(s, 62, 3000);
    s = applyNote(s, 64, 4000);
    expect(s.finished).toBe(true);
    expect(progressPercent(s)).toBe(100);
    expect(s.attempts).toBe(4);
    expect(accuracyPercent(s)).toBe(75);
    expect(hardestNote(s)).toBe(60);
    expect(targetNote(s)).toBeNull();
  });
  it("counts the same note arriving twice within the debounce window once", () => {
    let s = createSession(phrase, "guided");
    s = applyNote(s, 60, 1000);
    const again = applyNote(s, 60, 1030); // a touch plus a MIDI echo
    expect(again).toBe(s);
    expect(again.attempts).toBe(1);
  });
  it("does not debounce a different note, or the same note later", () => {
    let s = createSession(phrase, "guided");
    s = applyNote(s, 60, 1000);
    s = applyNote(s, 62, 1010);
    expect(s.attempts).toBe(2);
    s = applyNote(s, 99, 5000);
    s = applyNote(s, 99, 5200);
    expect(s.attempts).toBe(4);
  });
  it("ignores notes after the exercise is finished, so a score cannot be inflated", () => {
    let s = createSession(phrase, "guided");
    for (const [i, n] of [60, 62, 64].entries()) s = applyNote(s, n, 1000 * (i + 1));
    const done = applyNote(s, 60, 9000);
    expect(done).toBe(s);
    expect(done.attempts).toBe(3);
  });
  it("is immutable and never reports accuracy before an attempt", () => {
    const s = createSession(phrase, "guided");
    const next = applyNote(s, 60, 1000);
    expect(s.attempts).toBe(0);
    expect(next).not.toBe(s);
    expect(accuracyPercent(s)).toBe(0);
    expect(hardestNote(s)).toBeNull();
  });
  it("rejects an empty exercise", () => {
    expect(() => createSession({ id: "x", title: "x", notes: [] }, "guided")).toThrow(RangeError);
  });
});
