"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseMidiMessage } from "@/lib/piano/midiMessage";

export type MidiStatus = "idle" | "requesting" | "connected" | "denied" | "unsupported" | "no-device";

/**
 * Optional physical MIDI keyboard. Progressive enhancement only: nothing is requested until the player taps "Connect a keyboard",
 * the on-screen and computer keyboards work with or without it, and a browser without Web MIDI (Safari, most phones) simply says so.
 */
export function useMidiInput(handlers: { onNoteOn: (midi: number) => void; onNoteOff: (midi: number) => void }) {
  const [status, setStatus] = useState<MidiStatus>("idle");
  const [devices, setDevices] = useState<string[]>([]);
  const handlerRef = useRef(handlers);
  const accessRef = useRef<MIDIAccess | null>(null);

  useEffect(() => {
    handlerRef.current = handlers;
  });

  const attach = useCallback((access: MIDIAccess) => {
    const names: string[] = [];
    for (const input of access.inputs.values()) {
      names.push(input.name || "MIDI keyboard");
      input.onmidimessage = (e: MIDIMessageEvent) => {
        const event = parseMidiMessage(e.data);
        if (!event) return;
        if (event.type === "noteOn") handlerRef.current.onNoteOn(event.midi);
        else handlerRef.current.onNoteOff(event.midi);
      };
    }
    setDevices(names);
    setStatus(names.length ? "connected" : "no-device");
  }, []);

  const enable = useCallback(async () => {
    if (typeof navigator.requestMIDIAccess !== "function") {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    try {
      const access = await navigator.requestMIDIAccess();
      accessRef.current = access;
      access.onstatechange = () => attach(access);
      attach(access);
    } catch {
      setStatus("denied");
    }
  }, [attach]);

  useEffect(
    () => () => {
      const access = accessRef.current;
      if (!access) return;
      access.onstatechange = null;
      for (const input of access.inputs.values()) input.onmidimessage = null;
    },
    [],
  );

  const supported = typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
  return { status, devices, enable, supported };
}
