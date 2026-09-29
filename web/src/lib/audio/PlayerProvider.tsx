'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

// ONE audio element for the whole app.
//
// A wall of recordings with an <audio> per card gives you two voices talking
// over each other the moment somebody taps a second one — on a memorial that
// isn't a glitch, it's grotesque, and in a ranking task it makes comparison
// impossible. A single shared element makes "only one at a time" structural
// rather than something every player has to remember to enforce.
//
// It also means playback survives navigation, so tapping through to read
// something doesn't cut the voice off.
//
// This provider renders NO markup — only context — which is what lets it be
// shared while each app keeps its own player chrome.

interface PlayerState {
  /** Id of the clip currently loaded, playing or paused. */
  currentId: string | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

interface PlayerApi extends PlayerState {
  toggle: (id: string, url: string, durationMs: number) => void;
  seekFraction: (fraction: number) => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

export default function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>({
    currentId: null, playing: false, positionMs: 0, durationMs: 0,
  });
  // The duration we were told at record time. iOS MP4 often carries none, so
  // the element's own duration can be NaN or Infinity — the stored value is
  // the trustworthy one and it's what the scrubber is measured against.
  const knownDurationRef = useRef(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onTime = () => setState(s => ({ ...s, positionMs: audio.currentTime * 1000 }));
    const onPlay = () => setState(s => ({ ...s, playing: true }));
    const onPause = () => setState(s => ({ ...s, playing: false }));
    const onEnded = () => setState(s => ({ ...s, playing: false, positionMs: 0 }));
    const onLoaded = () => {
      const native = audio.duration;
      const usable = Number.isFinite(native) && native > 0 ? native * 1000 : knownDurationRef.current;
      setState(s => ({ ...s, durationMs: usable }));
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoaded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoaded);
    };
  }, []);

  const toggle = useCallback((id: string, url: string, durationMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.currentId === id) {
      if (audio.paused) void audio.play().catch(() => {});
      else audio.pause();
      return;
    }

    knownDurationRef.current = durationMs;
    audio.src = url;
    audio.currentTime = 0;
    setState({ currentId: id, playing: false, positionMs: 0, durationMs });
    void audio.play().catch(() => {
      // Autoplay policy or a dead URL. The button falls back to "paused",
      // which is honest — nothing is playing.
      setState(s => ({ ...s, playing: false }));
    });
  }, [state.currentId]);

  const seekFraction = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !state.durationMs) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    audio.currentTime = (clamped * state.durationMs) / 1000;
    setState(s => ({ ...s, positionMs: clamped * s.durationMs }));
  }, [state.durationMs]);

  const value = useMemo(
    () => ({ ...state, toggle, seekFraction }),
    [state, toggle, seekFraction],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
