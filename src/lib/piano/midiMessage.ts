/** Reads one raw Web MIDI message. Only note on / note off matter; everything else (clock, pitch bend, control change) is ignored. */
export type MidiEvent = { type: "noteOn" | "noteOff"; midi: number; velocity: number } | null;

export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiEvent {
  if (!data || data.length < 3) return null;
  const status = data[0] & 0xf0;
  const midi = data[1];
  const velocity = data[2];
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
  if (status === 0x90 && velocity > 0) return { type: "noteOn", midi, velocity };
  // A note on with velocity 0 is how many keyboards say "note off".
  if (status === 0x80 || (status === 0x90 && velocity === 0)) return { type: "noteOff", midi, velocity };
  return null;
}
