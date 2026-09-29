// Carried over as-is from 08's @hs/audio, where it's proven on real phones. Its
// effects sync state from the browser (support, a restored take, preview URLs).
/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canRecord, pickMimeType, resamplePeaks, type Recording, type Stash,
} from './recorder';

// The recording state machine, headless.
//
// THE BOUNDARY: this hook owns the browser — MediaRecorder lifecycle, the
// AudioContext analyser, the timer, teardown, and the stash write. It owns no
// markup, no CSS class, and no sentence of copy. Those belong to the app,
// because each app in this repo has its own hand-styled visual language and its
// own voice, and a shared component would force Chorus's radio-dial amber onto
// everything that ever wants a microphone.
//
// So errors come back as a CODE, never a message. The app writes the words.

export type RecorderState = 'idle' | 'starting' | 'recording' | 'review';

export type RecorderErrorCode =
  /** getUserMedia was refused — a permission the person can still grant. */
  | 'denied'
  /** getUserMedia or MediaRecorder failed for any other reason. */
  | 'failed'
  /** Recording stopped but produced no bytes. Seen on flaky Safari builds. */
  | 'empty';

export interface UseRecorderOptions {
  /** Hard cap. The recorder stops itself at this length. */
  maxSeconds: number;
  /** The current recording, owned by the caller so it survives remounts. */
  recording: Recording | null;
  /**
   * `stashed` says whether the recording reached IndexedDB. It travels with
   * the recording because an app's failure copy may promise the recording is
   * saved on this phone, and that promise has to be checkable.
   */
  onRecording: (rec: Recording | null, stashed?: boolean) => void;
  /** Omit for no safety net — the recording then lives in memory only. */
  stash?: Stash | null;
  /** Which subject this recording belongs to. See createStash. */
  scope?: string;
}

export interface UseRecorderResult {
  state: RecorderState;
  supported: boolean;
  error: RecorderErrorCode | null;
  elapsedMs: number;
  remainingMs: number;
  /** Live waveform while recording. */
  livePeaks: number[];
  /** Object URL for the finished take, for a review player. */
  previewUrl: string | null;
  /** The recorder hit maxSeconds rather than the person tapping stop. */
  timedOut: boolean;
  start: () => void;
  stop: () => void;
  discard: () => void;
}

export function useRecorder({
  maxSeconds, recording, onRecording, stash = null, scope = '',
}: UseRecorderOptions): UseRecorderResult {
  const [state, setState] = useState<RecorderState>(recording ? 'review' : 'idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [error, setError] = useState<RecorderErrorCode | null>(null);
  const [supported, setSupported] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const samplesRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Held in refs so the MediaRecorder callbacks, which are registered once,
  // always see the current values rather than the ones from the render that
  // started the recording.
  const onRecordingRef = useRef(onRecording);
  const stashRef = useRef(stash);
  const scopeRef = useRef(scope);
  const maxSecondsRef = useRef(maxSeconds);
  useEffect(() => {
    onRecordingRef.current = onRecording;
    stashRef.current = stash;
    scopeRef.current = scope;
    maxSecondsRef.current = maxSeconds;
  });

  // canRecord() touches navigator, so it can only run after mount — deciding
  // during render would make the server and client disagree.
  useEffect(() => { setSupported(canRecord()); }, []);

  // A recording restored from a stash arrives after this hook has already
  // initialised idle, so the initial state above misses it. Without this the
  // recovered recording would be attached and invisible — the person would have
  // no way to hear what they were about to send.
  useEffect(() => {
    if (recording) setState(s => (s === 'idle' ? 'review' : s));
  }, [recording]);

  // One object URL per blob, revoked when the blob changes or on unmount.
  // Keyed on blob identity rather than created once: a recording handed back
  // from the stash replaces an earlier one without passing through discard(),
  // and a URL cached across that swap would play the wrong take.
  useEffect(() => {
    if (!recording?.blob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(recording.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recording?.blob]);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const handleStop = useCallback(() => {
    const durationMs = Date.now() - startedAtRef.current;
    const mimeType = recorderRef.current?.mimeType || pickMimeType() || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const peaks = resamplePeaks(samplesRef.current, 48);
    teardown();

    if (!blob.size) {
      setState('idle');
      setError('empty');
      return;
    }

    const rec: Recording = { blob, mimeType, durationMs, peaks };
    // Handed back BEFORE anything else can go wrong. From here a crash, a
    // refresh, or a failed upload can all be recovered from.
    onRecordingRef.current(rec);
    setState('review');

    // Reported back rather than assumed: private browsing, a full disk or a
    // browser with IndexedDB switched off all leave the recording in memory
    // only, and an app may say something different in that case.
    const s = stashRef.current;
    if (s) void s.write(rec, scopeRef.current).then(ok => onRecordingRef.current(rec, ok));
  }, [teardown]);

  const start = useCallback(async () => {
    if (state === 'starting' || state === 'recording') return;
    setError(null);
    setState('starting');
    chunksRef.current = [];
    samplesRef.current = [];
    setLivePeaks([]);
    setElapsedMs(0);

    try {
      // getUserMedia must be reached directly from the tap on iOS — an await
      // before this line loses the user-gesture context and the prompt never
      // appears.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = handleStop;
      recorder.start();

      // Duration is TIMED, never read back off the file: iOS writes MP4 with
      // no duration metadata, which surfaces as an Infinity in every player
      // and an un-scrubbable track.
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsedMs(ms);
        if (ms >= maxSecondsRef.current * 1000) stop();
      }, 200);

      // Amplitude for the waveform, sampled off the live stream.
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const sample = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = Math.abs(buffer[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        samplesRef.current.push(peak);
        setLivePeaks(resamplePeaks(samplesRef.current, 40));
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);

      setState('recording');
    } catch (err) {
      teardown();
      setState('idle');
      const name = err instanceof Error ? err.name : '';
      setError(name === 'NotAllowedError' ? 'denied' : 'failed');
    }
  }, [state, handleStop, stop, teardown]);

  const discard = useCallback(() => {
    // Clear the stash too. "Record it again" is somebody deciding this take is
    // wrong; leaving it on disk would hand it back to them the next time a form
    // restores an unsent recording.
    void stashRef.current?.clear();
    onRecordingRef.current(null);
    setElapsedMs(0);
    setState('idle');
  }, []);

  // The timer checks every 200ms, so an auto-stop lands just past the limit;
  // anyone who tapped Stop inside the last half-second was cut off in every
  // sense that matters. Derived from the recording rather than remembered in
  // state, so it survives a remount and explains a restored stash too.
  const timedOut = Boolean(recording && recording.durationMs >= maxSeconds * 1000 - 500);

  return {
    state,
    supported,
    error,
    elapsedMs,
    remainingMs: Math.max(0, maxSeconds * 1000 - elapsedMs),
    livePeaks,
    previewUrl,
    timedOut,
    start: () => { void start(); },
    stop,
    discard,
  };
}
