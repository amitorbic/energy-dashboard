import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Volume2, AlertCircle } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type VoiceState = "idle" | "listening" | "processing" | "speaking";

// Tuned for a quiet office mic over a laptop built-in mic; RMS is on a 0-1 scale.
const SPEECH_RMS_THRESHOLD = 0.03;
const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_HOLD_MS = 1200;
const MAX_RECORDING_MS = 30_000;

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ap_token") ?? "";
}

// A ~0 duration silent WAV. Played (and immediately allowed to finish) once,
// synchronously inside the mic tap handler, to satisfy iOS Safari's/Chrome
// Android's "no programmatic audio.play() outside a user gesture" policy —
// the TTS reply later plays from inside an async fetch().then() callback,
// which by itself is NOT a user gesture and gets silently blocked without
// this unlock.
const SILENT_AUDIO_SRC =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export default function VoiceWidget() {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokeRef = useRef(false);
  const activeRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const unlockAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const teardownRecording = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    rafRef.current = null;
    silenceTimerRef.current = null;
    maxTimerRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const stopConversation = useCallback(() => {
    setActive(false);
    activeRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    teardownRecording();
    audioElRef.current?.pause();
    setState("idle");
  }, [teardownRecording]);

  const sendTurn = useCallback(
    async (blob: Blob) => {
      setState("processing");
      setHint(null);

      const form = new FormData();
      form.append("audio", blob, "turn.webm");
      form.append(
        "history",
        JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content })))
      );

      try {
        const res = await fetch("/api/voice/turn", {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: form,
        });
        const data = await res.json();

        if (!res.ok) {
          setHint(data.detail ?? "Voice request failed. Try again.");
          if (activeRef.current) startListening();
          else setState("idle");
          return;
        }

        if (data.note === "empty_transcript") {
          setHint("Didn't catch that — try again.");
          if (activeRef.current) startListening();
          else setState("idle");
          return;
        }

        if (data.note === "empty_reply" || !data.audio_base64) {
          setHint("No response generated. Try again.");
          if (activeRef.current) startListening();
          else setState("idle");
          return;
        }

        setMessages((prev) => [
          ...prev,
          { role: "user", content: data.transcript },
          { role: "assistant", content: data.reply },
        ]);

        setState("speaking");
        const audioEl = new Audio(`data:${data.audio_mime};base64,${data.audio_base64}`);
        audioElRef.current = audioEl;
        audioEl.onended = () => {
          if (activeRef.current) startListening();
          else setState("idle");
        };
        try {
          await audioEl.play();
        } catch (playErr) {
          // Distinct from the outer catch: this is a playback-permission
          // failure (e.g. iOS Safari blocking an unlocked-but-still-denied
          // programmatic play()), not a network/API failure — log it for
          // real instead of reporting a misleading "connection error".
          console.error("Voice widget: TTS playback failed", playErr);
          setHint("Couldn't play the reply audio. Tap the mic to retry.");
          if (activeRef.current) startListening();
          else setState("idle");
        }
      } catch (err) {
        console.error("Voice widget: turn request failed", err);
        setHint("Connection error. Try again.");
        if (activeRef.current) startListening();
        else setState("idle");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [messages]
  );

  const startListening = useCallback(async () => {
    setHint(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        teardownRecording();
        if (blob.size > 0) sendTurn(blob);
        else if (activeRef.current) startListening();
      };
      recorderRef.current = recorder;
      recorder.start();
      spokeRef.current = false;
      setState("listening");

      const data = new Uint8Array(analyser.fftSize);
      const poll = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);

        if (rms > SPEECH_RMS_THRESHOLD) {
          spokeRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (spokeRef.current && rms < SILENCE_RMS_THRESHOLD && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
              recorderRef.current.stop();
            }
          }, SILENCE_HOLD_MS);
        }

        rafRef.current = requestAnimationFrame(poll);
      };
      rafRef.current = requestAnimationFrame(poll);

      maxTimerRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch {
      setHint("Microphone access denied or unavailable.");
      setActive(false);
      activeRef.current = false;
      setState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teardownRecording, sendTurn]);

  const startConversation = useCallback(() => {
    // Must run synchronously inside the click handler's call stack — this
    // is what registers as a "user gesture" with iOS Safari/Android Chrome.
    // Once one play() call has been made this way, later programmatic
    // play() calls from inside async code (sendTurn's fetch callback) are
    // allowed for the rest of the page session.
    if (!unlockAudioRef.current) {
      unlockAudioRef.current = new Audio(SILENT_AUDIO_SRC);
    }
    unlockAudioRef.current.play().catch((err) => {
      console.warn("Voice widget: audio unlock failed", err);
    });

    setActive(true);
    activeRef.current = true;
    startListening();
  }, [startListening]);

  useEffect(() => () => stopConversation(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3">
      {active && (
        <div className="w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Volume2 size={16} className="text-blue-600" />
            Orbi Voice
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 min-h-[16px]">
            {state === "listening" && (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Listening…
              </>
            )}
            {state === "processing" && (
              <>
                <Loader2 size={12} className="animate-spin" /> Thinking…
              </>
            )}
            {state === "speaking" && (
              <>
                <Volume2 size={12} /> Speaking…
              </>
            )}
          </div>

          {hint && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle size={12} /> {hint}
            </div>
          )}

          {lastAssistant && (
            <p className="text-sm text-gray-700 leading-relaxed max-h-32 overflow-y-auto">
              {lastAssistant.content}
            </p>
          )}

          <button
            onClick={stopConversation}
            className="self-start flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            <Square size={12} /> End voice chat
          </button>
        </div>
      )}

      <button
        onClick={active ? stopConversation : startConversation}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          active ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
        } text-white`}
        title={active ? "End voice chat" : "Talk to Orbi"}
      >
        {active ? <Square size={20} /> : <Mic size={22} />}
      </button>
    </div>
  );
}
