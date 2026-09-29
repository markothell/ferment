// Where recordings live. With BLOB_READ_WRITE_TOKEN: Vercel Blob, uploaded by
// the browser straight to storage. Without it (local dev): .data/audio, served
// back through /api/audio/local. A response may only point at one of these.

export const LOCAL_AUDIO_PREFIX = "/api/audio/local/";
const BLOB_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/rounds\//i;

export type AudioStorage = "blob" | "local";

export function audioStorage(): AudioStorage {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

export function isOurAudio(url: string): boolean {
  return BLOB_HOST.test(url) || /^\/api\/audio\/local\/[a-z0-9]+\.(webm|m4a|ogg|mp3|aac)$/i.test(url);
}

// Blob matches content types by exact string, and Safari spells the codecs
// parameter with a space; the client sends the base type (baseMimeType).
export const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac"];
export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
