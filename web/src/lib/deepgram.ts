import "server-only";

import { readFile } from "node:fs/promises";
import { TryLater, type Transcriber } from "@/domain/transcripts";
import { LOCAL_AUDIO_PREFIX } from "./audioStore";

// Deepgram, asked and answered in one request: no callback, so nothing has to
// be reachable from outside and it works on a laptop. A Blob recording is
// public, so Deepgram fetches it by URL; a local one (.data/audio) is sent as
// bytes. With no DEEPGRAM_API_KEY there is no transcriber and recordings stay
// pending until there is one.

const LISTEN = "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true";
// Five minutes of audio comes back in seconds; this only stops a stalled request.
const TIMEOUT_MS = 90_000;

export function deepgram(key = process.env.DEEPGRAM_API_KEY): Transcriber | null {
  if (!key) return null;
  return async (audioUrl) => {
    // A missing local file won't appear later: let it fail rather than wait.
    const bytes = audioUrl.startsWith(LOCAL_AUDIO_PREFIX) ? await readFile(`./.data/audio/${audioUrl.slice(LOCAL_AUDIO_PREFIX.length)}`) : null;
    let res: Response;
    try {
      res = await fetch(LISTEN, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { authorization: `Token ${key}`, "content-type": bytes ? "application/octet-stream" : "application/json" },
        body: bytes ?? JSON.stringify({ url: audioUrl }),
      });
    } catch (e) {
      throw new TryLater(`Deepgram unreachable: ${e instanceof Error ? e.message : e}`);
    }
    if (res.status === 429 || res.status >= 500) throw new TryLater(`Deepgram ${res.status}`);
    if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const transcript = body?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return typeof transcript === "string" ? transcript : "";
  };
}
