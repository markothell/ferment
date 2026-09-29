// Where recordings live. With BLOB_READ_WRITE_TOKEN: Vercel Blob, uploaded by
// the browser straight to storage. Without it (local dev): .data/audio, served
// back through /api/audio/local. A response may only point at one of these.

export const LOCAL_AUDIO_PREFIX = "/api/audio/local/";
const LOCAL_FILE = /^\/api\/audio\/local\/[a-z0-9]+\.(webm|m4a|ogg|mp3|aac)$/;

export type AudioStorage = "blob" | "local";

export function audioStorage(): AudioStorage {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

/**
 * Our own Blob store's public host, and no other store's: any Vercel Blob URL
 * would otherwise pass, including one on a store someone else controls.
 * BLOB_PUBLIC_HOST wins; otherwise it's read from the token
 * (vercel_blob_rw_<storeId>_…), whose store id is the host's first label.
 */
export function ourBlobHost(env = process.env): string | null {
  if (env.BLOB_PUBLIC_HOST) return env.BLOB_PUBLIC_HOST.toLowerCase();
  const storeId = env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

export function isOurAudio(url: string, env = process.env): boolean {
  if (LOCAL_FILE.test(url)) return true;
  const host = ourBlobHost(env);
  if (!host) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.host === host && !u.username && !u.password && u.pathname.startsWith("/rounds/");
}

// Blob matches content types by exact string, and Safari spells the codecs
// parameter with a space; the client sends the base type (baseMimeType).
export const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac"];
export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
