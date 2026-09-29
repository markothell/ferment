// Browser audio capture: format detection, waveform peaks, and the stash.
//
// Extracted from apps/chorus (2026-08-05) rather than copied a second time.
// Every comment below marks a bug that was already paid for once — the iOS MP4
// branch, the missing duration metadata, the MIME parameter spacing that killed
// the first live iPhone recording. A second copy would rediscover all of them.
//
// Nothing here knows what it is recording ABOUT. No app copy, no styling, no
// product concepts — those belong to the app (see useRecorder for the boundary).

export interface Recording {
  blob: Blob;
  mimeType: string;
  /** Measured with a timer, NOT read off the file. See pickMimeType. */
  durationMs: number;
  peaks: number[];
}

// Feature-detect, never hardcode. Chrome/Android/Firefox produce WebM/Opus;
// Safari and every iOS browser produce MP4/AAC. Hardcoding webm is the single
// most common way voice recording ships broken on iPhone — MediaRecorder
// constructs fine and then emits an empty or unplayable blob.
export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  // Some Safari builds support recording but report nothing. An empty string
  // lets the browser choose its own default rather than refusing to record.
  return '';
}

export function canRecord(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
    && pickMimeType() !== null;
}

// The type WITHOUT its codecs parameter — `audio/webm;codecs=opus` → `audio/webm`.
//
// This is what gets declared to Vercel Blob, and it is not cosmetic. Blob
// matches an upload's content type against `allowedContentTypes` by exact
// string, and a MIME parameter may legally be written with or without a space
// after the semicolon. Chrome reports `audio/webm;codecs=opus`, Safari reports
// `audio/webm; codecs=opus`, and an allowlist can only ever spell one of them —
// which is how the first iPhone recording died at the upload step while the
// same code worked on Android. Stripping the parameter leaves one canonical
// string per format, and the codecs are recoverable from the file itself.
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

export function fileExtensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ── The stash ───────────────────────────────────────────────────────────────
// The recording is written here the moment it stops, BEFORE any upload is
// attempted, so a failed upload or an accidental refresh leaves it recoverable.
// IndexedDB rather than localStorage because this is a binary blob, and not
// sessionStorage because a Blob can't be stringified at all.
//
// The database name is a PARAMETER, not a constant. Each app keeps its own, so
// adopting this package cannot orphan a stash already sitting on somebody's
// phone — Chorus still passes 'chorus' and reads exactly what it wrote before.

export interface StashOptions {
  /** IndexedDB database name. Per app — see above. */
  dbName: string;
  storeName?: string;
  /**
   * A stash older than this is a recording somebody walked away from weeks
   * ago. Restoring it into a fresh form would be a surprise, not a rescue.
   */
  maxAgeMs?: number;
}

export interface Stash {
  /** @returns whether the write actually landed. Load-bearing — see below. */
  write(rec: Recording, scope: string): Promise<boolean>;
  read(scope: string): Promise<Recording | null>;
  clear(): Promise<void>;
}

const DEFAULT_STORE = 'stashed-recording';
const STASH_KEY = 'current';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build a stash bound to one IndexedDB database.
 *
 * `scope` is whatever the app uses to mean "which thing was this recorded
 * for" — a memorial slug in Chorus, a seed id in Threshold. It exists because
 * one deployment can serve many of them, and a recording made for one must
 * never resurface in another's form.
 */
export function createStash({
  dbName,
  storeName = DEFAULT_STORE,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: StashOptions): Stash {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    // Every stash operation is best-effort. Private browsing, a full disk, or a
    // browser with IndexedDB disabled must degrade to "no safety net", never to
    // a thrown error in the middle of recording.
    //
    // It RETURNS whether the write landed, and that return value is
    // load-bearing: an app's failure copy may tell someone their recording is
    // safe on this phone, and that sentence may only be shown when this
    // resolved true. A swallowed error that nobody reads turns reassurance into
    // a guess.
    async write(rec, scope) {
      try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).put(
            {
              blob: rec.blob, mimeType: rec.mimeType, durationMs: rec.durationMs,
              peaks: rec.peaks, slug: scope, at: Date.now(),
            },
            STASH_KEY,
          );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return true;
      } catch {
        return false;
      }
    },

    async read(scope) {
      try {
        const db = await openDb();
        const value = await new Promise<(Recording & { slug?: string; at?: number }) | null>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).get(STASH_KEY);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => reject(req.error);
        });
        db.close();
        if (!value?.blob) return null;
        // A stash written before scopes were recorded is honoured: there is
        // exactly one live subject per phone in that window, and dropping a
        // real recording is a worse outcome than restoring one into the wrong
        // form, which the review player makes audible before anyone sends it.
        if (value.slug && value.slug !== scope) return null;
        if (value.at && Date.now() - value.at > maxAgeMs) return null;
        return { blob: value.blob, mimeType: value.mimeType, durationMs: value.durationMs, peaks: value.peaks };
      } catch {
        return null;
      }
    },

    async clear() {
      try {
        const db = await openDb();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).delete(STASH_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
        db.close();
      } catch {
        // no-op
      }
    },
  };
}

// ── Peaks ───────────────────────────────────────────────────────────────────

/**
 * Resample a running amplitude series down to a fixed number of bars.
 * Kept pure and exported so it can be tested without an AudioContext.
 */
export function resamplePeaks(samples: number[], bars = 48): number[] {
  if (!samples.length) return [];
  const out: number[] = [];
  const per = samples.length / bars;
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * per);
    const end = Math.max(start + 1, Math.floor((i + 1) * per));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      if (samples[j] > peak) peak = samples[j];
    }
    out.push(peak);
  }
  // Normalize to the loudest bar so a quiet recording still draws a waveform
  // rather than a flat line — this is a picture of shape, not of volume.
  const max = Math.max(...out);
  return max > 0 ? out.map(v => Math.round((v / max) * 100) / 100) : out;
}
