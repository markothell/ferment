"use client";

import { baseMimeType, fileExtensionFor } from "./recorder";

/**
 * Send a finished take to storage and return its URL. Blob: straight from the
 * browser with a short-lived token from /api/audio/upload. Local dev: POSTed
 * to /api/audio/local.
 */
export async function uploadRecording(
  blob: Blob,
  { roundId, mimeType, storage, onProgress }: { roundId: string; mimeType: string; storage: "blob" | "local"; onProgress?: (percent: number) => void },
): Promise<string> {
  const type = baseMimeType(mimeType);
  if (storage === "local") {
    onProgress?.(10);
    const res = await fetch("/api/audio/local", { method: "POST", headers: { "content-type": type }, body: blob });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Upload failed");
    onProgress?.(100);
    return json.url as string;
  }
  const { upload } = await import("@vercel/blob/client");
  const result = await upload(`rounds/${roundId}/take.${fileExtensionFor(type)}`, new Blob([blob], { type }), {
    access: "public",
    handleUploadUrl: "/api/audio/upload",
    contentType: type,
    onUploadProgress: (e) => onProgress?.(Math.round(e.percentage)),
  });
  return result.url;
}
