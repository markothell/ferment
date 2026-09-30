"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createStash, formatDuration, useRecorder, type Recording, type RecorderErrorCode } from "@/lib/audio";
import { uploadRecording } from "@/lib/audio/upload";

type State = { error?: string; ok?: string } | undefined;

// The recorder hook owns the browser (08's @hs/audio); this owns the words.
const ERRORS: Record<RecorderErrorCode, string> = {
  denied: "Your browser is holding the microphone back. Allow it for this site and try again, or write it instead.",
  failed: "The microphone didn't start. Trying again often works, or you can write it instead.",
  empty: "That recording came out empty, which some phones do without warning. Try again, or write it instead.",
};

/**
 * Answering a story question: voice first or writing first, as the question
 * asks, and always both. A recording is uploaded when you share, then fixed:
 * after that only the words can change.
 */
export function Composer({
  action, community, roundId, telling, maxSeconds, storage, existing, submitLabel, children,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  community: string;
  roundId: string;
  telling: "voice" | "text";
  maxSeconds: number;
  storage: "blob" | "local";
  existing: { text: string; audioUrl: string | null; audioSeconds: number | null } | null;
  submitLabel: string;
  /** Extra answer parts inside the same form: the placement, for "tell it and place it". */
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [mode, setMode] = useState<"voice" | "text">(existing?.audioUrl || existing?.text ? "text" : telling);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const secondsRef = useRef<HTMLInputElement>(null);
  const uploaded = useRef(false);

  // A take that reached IndexedDB survives a reload or a dropped connection.
  const stash = useMemo(() => (typeof window === "undefined" ? null : createStash({ dbName: "ferment-audio" })), []);
  useEffect(() => {
    if (!stash || existing?.audioUrl) return;
    stash.read(roundId).then((r) => { if (r) { setRecording(r); setMode("voice"); } }).catch(() => {});
  }, [stash, roundId, existing?.audioUrl]);

  const rec = useRecorder({ maxSeconds, recording, onRecording: (r) => setRecording(r), stash, scope: roundId });

  // Once shared, the take lives on the server: drop the local copy.
  useEffect(() => {
    if (!state?.ok) return;
    void stash?.clear();
    uploaded.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- responding to the action's result
    setRecording(null);
  }, [state, stash]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!recording || uploaded.current || existing?.audioUrl) return; // let the action run
    e.preventDefault();
    setSendError(null);
    setSending(0);
    try {
      const url = await uploadRecording(recording.blob, { roundId, mimeType: recording.mimeType, storage, onProgress: setSending });
      urlRef.current!.value = url;
      secondsRef.current!.value = String(Math.round(recording.durationMs / 100) / 10);
      uploaded.current = true;
      formRef.current!.requestSubmit();
    } catch {
      setSendError("That didn't reach us. Your recording is still here, so try sharing again.");
    } finally {
      setSending(null);
    }
  }

  const busy = pending || sending !== null;
  const recordingNow = rec.state === "recording" || rec.state === "starting";

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="community" value={community} />
      <input type="hidden" name="round" value={roundId} />
      <input ref={urlRef} type="hidden" name="audioUrl" defaultValue="" />
      <input ref={secondsRef} type="hidden" name="audioSeconds" defaultValue="" />

      {existing?.audioUrl ? (
        <div className="space-y-2">
          <audio controls preload="none" src={existing.audioUrl} className="w-full" />
          <p className="mono text-xs text-[var(--ink-faint)]">
            Your voice note{existing.audioSeconds ? ` · ${formatDuration(existing.audioSeconds * 1000)}` : ""}. It stays as you recorded it.
          </p>
        </div>
      ) : mode === "voice" ? (
        <div className="space-y-3 rounded-[12px] border border-[var(--rule)] p-4">
          {!rec.supported ? (
            <p className="text-[var(--ink-soft)]">This browser can&apos;t record. Write it instead; it counts the same.</p>
          ) : rec.state === "recording" ? (
            <>
              <Wave peaks={rec.livePeaks} live />
              <p className="mono text-center text-sm text-[var(--ink-soft)]">
                {formatDuration(rec.elapsedMs)} <span className="text-[var(--ink-faint)]">/ {formatDuration(maxSeconds * 1000)}</span>
              </p>
              {rec.remainingMs <= 10_000 && (
                <p className="text-center text-xs text-[var(--ink-faint)]">{Math.ceil(rec.remainingMs / 1000)}s left. It stops itself.</p>
              )}
              <div className="flex justify-center">
                <button type="button" onClick={rec.stop} className="button-quiet">Stop</button>
              </div>
            </>
          ) : recording ? (
            <>
              <Wave peaks={recording.peaks} />
              {rec.previewUrl && <audio controls src={rec.previewUrl} className="w-full" />}
              <p className="mono text-center text-xs text-[var(--ink-faint)]">
                {formatDuration(recording.durationMs)}{rec.timedOut ? " · reached the limit" : ""}
              </p>
              <div className="flex justify-center">
                <button type="button" onClick={rec.discard} disabled={busy} className="link text-sm">Record again</button>
              </div>
            </>
          ) : (
            <div className="space-y-3 text-center">
              <button type="button" onClick={rec.start} disabled={rec.state === "starting"} className="record" aria-label="Start recording">
                <span aria-hidden className="record-dot" />
              </button>
              <p className="text-sm text-[var(--ink-soft)]">Tap to record, up to {formatDuration(maxSeconds * 1000)}.</p>
            </div>
          )}
          {rec.error && <p className="text-sm text-[var(--mine)]">{ERRORS[rec.error]}</p>}
        </div>
      ) : null}

      {(mode === "text" || recording || existing?.audioUrl) && (
        <textarea
          name="text"
          rows={mode === "text" && !existing?.audioUrl && !recording ? 5 : 2}
          className="field"
          defaultValue={existing?.text ?? ""}
          placeholder={recording || existing?.audioUrl ? "Anything to add in writing? (optional)" : "Write it here."}
          maxLength={5000}
        />
      )}

      {children}

      {sendError && <p className="text-[var(--mine)]" role="alert">{sendError}</p>}
      {state?.error && <p className="text-[var(--mine)]" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-[var(--ink-soft)]" role="status">{state.ok}</p>}

      <div className="flex flex-wrap items-center gap-4">
        {(mode === "text" || recording || existing) && (
          <button type="submit" className="button !w-auto px-8" disabled={busy || recordingNow}>
            {sending !== null ? `Sending ${sending}%` : pending ? "Sharing…" : submitLabel}
          </button>
        )}
        {!existing?.audioUrl && !recording && !recordingNow && (
          <button type="button" className="link text-sm" onClick={() => setMode(mode === "voice" ? "text" : "voice")}>
            {mode === "voice" ? "Write it instead" : "Record instead"}
          </button>
        )}
      </div>
    </form>
  );
}

/** The waveform. Decorative; the duration is written beside it. Your live take is in your color. */
function Wave({ peaks, live = false }: { peaks: number[]; live?: boolean }) {
  const bars = peaks.length ? peaks : new Array(32).fill(0.04);
  return (
    <div aria-hidden className="flex h-12 items-center justify-center gap-[2px]">
      {bars.slice(-64).map((p, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full"
          style={{ height: `${Math.max(3, Math.min(1, p) * 48)}px`, background: live ? "var(--mine)" : "var(--ink-faint)" }}
        />
      ))}
    </div>
  );
}
