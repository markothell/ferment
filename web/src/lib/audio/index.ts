// Browser voice capture and playback, carried over from 08's @hs/audio
// (verified on iPhone and Android on production, 2026-09-11).
//
// What is here: the browser's quirks. Format detection, timed duration, peak
// resampling, the IndexedDB stash, the single shared <audio> element.
//
// What is deliberately NOT here: markup, CSS classes, and copy. Each app has
// its own hand-styled visual language and its own voice, so the recorder UI and
// the player chrome stay in the app and drive `useRecorder` / `usePlayer`.
//

export {
  canRecord,
  pickMimeType,
  baseMimeType,
  fileExtensionFor,
  formatDuration,
  resamplePeaks,
  createStash,
  type Recording,
  type Stash,
  type StashOptions,
} from './recorder';

export {
  useRecorder,
  type RecorderState,
  type RecorderErrorCode,
  type UseRecorderOptions,
  type UseRecorderResult,
} from './useRecorder';

export { default as PlayerProvider, usePlayer } from './PlayerProvider';
