"use client";
import { useRef, useState, type RefObject } from "react";
import { PausableAudio } from "../lib/pausable-audio";
import { speechSegments, TurnGate } from "../lib/voice-turn";
import type { VoiceInputGate } from "../lib/voice-input-gate";
import type { Stage } from "../lib/reader-stage";

export function useReplyAudio({ voiceInputGate, turnGate, setStage, setVoiceNotice, onInterrupt }: {
  voiceInputGate: RefObject<VoiceInputGate>; turnGate: RefObject<TurnGate>;
  setStage: (stage: Stage) => void; setVoiceNotice: (notice: string) => void; onInterrupt: () => void;
}) {
  const [replayAvailable, setReplayAvailable] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const audioPlayer = useRef<AudioBufferSourceNode | null>(null);
  const audioPlayback = useRef<PausableAudio | null>(null);
  const replay = useRef<{ buffers: AudioBuffer[]; exchangeId: string } | null>(null);
  const playingExchange = useRef<string | null>(null);
  async function prepareAudio() {
    if (!audioContext.current || audioContext.current.state === "closed") audioContext.current = new AudioContext();
    if (audioContext.current.state === "suspended") await audioContext.current.resume();
    return audioContext.current;
  }
  async function playBuffer(buffer: AudioBuffer, context: AudioContext, signal: AbortSignal) {
    await voiceInputGate.current.wait(signal);
    signal.throwIfAborted();
    const playback = new PausableAudio(context, buffer, node => { audioPlayer.current = node; });
    audioPlayback.current = playback;
    try { await playback.play(signal); }
    finally { if (audioPlayback.current === playback) audioPlayback.current = null; }
  }

  async function speak(text: string, signal: AbortSignal, exchangeId: string) {
    setStage("voicing"); playingExchange.current = exchangeId; replay.current = { buffers: [], exchangeId }; setReplayAvailable(false);
    const saved = replay.current;
    try {
      const context = audioContext.current || await prepareAudio();
      const jobs = speechSegments(text).map(async (segment, index) => {
        try {
          const response = await fetch("/api/speech", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: segment }) });
          if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error || "Speech generation failed"); }
          const buffer = await context.decodeAudioData(await response.arrayBuffer()); signal.throwIfAborted();
          saved.buffers[index] = buffer; setReplayAvailable(true);
          return { buffer };
        } catch (error) { return { error }; }
      });
      for (const job of jobs) {
        const result = await job; signal.throwIfAborted();
        if (!result.buffer) throw result.error;
        setStage("speaking"); await playBuffer(result.buffer, context, signal);
      }
      signal.throwIfAborted(); playingExchange.current = null; setStage("ready");
    } catch (caught) {
      if (signal.aborted) return;
      playingExchange.current = null; setStage("ready");
      setVoiceNotice(caught instanceof Error ? `The answer is ready. ${caught.message}` : "The answer is ready, but audio is unavailable. You can read it above.");
    }
  }

  function stopAudio() {
    if (audioPlayer.current) { try { audioPlayer.current.stop(); } catch {} audioPlayer.current = null; }
  }

  async function replayAudio() {
    const saved = replay.current; if (!saved?.buffers.length) return;
    onInterrupt(); const signal = turnGate.current.next(); playingExchange.current = saved.exchangeId;
    try { const context = await prepareAudio(); signal.throwIfAborted(); setStage("speaking"); for (const buffer of saved.buffers.filter(Boolean)) await playBuffer(buffer, context, signal); signal.throwIfAborted(); playingExchange.current = null; setStage("ready"); }
    catch { if (!signal.aborted) { playingExchange.current = null; setStage("ready"); setVoiceNotice("Your browser could not play the audio. The text answer is still available."); } }
  }

  return { replayAvailable, setReplayAvailable, audioContext, audioPlayer, audioPlayback, replay, playingExchange, prepareAudio, speak, stopAudio, replayAudio };
}
