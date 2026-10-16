import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { harvestAudio } from "@/domain/harvests.read";
import { responseAudio } from "@/domain/rounds";
import { auth } from "@/lib/auth";
import { LOCAL_AUDIO_PREFIX, isOurAudio } from "@/lib/audioStore";

// Plays a recording to someone who may hear it, asked fresh on every request
// (lib/audioStore.ts#listenPath). The stored address never reaches the browser:
// Blob recordings are fetched here and passed through, ranges included so the
// player can seek; local dev reads .data/audio.

export const runtime = "nodejs";

const TYPES: Record<string, string> = { webm: "audio/webm", m4a: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", aac: "audio/aac" };
const PASSED = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];
// Short, and private: once someone can't hear it any more, their browser stops replaying it soon after.
const CACHE = "private, max-age=300";

export async function GET(request: Request, { params }: RouteContext<"/api/listen/[...key]">) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse(null, { status: 401 });
  const { key } = await params;
  const viewerId = session.user.id;
  const stored =
    key.length === 2 && key[0] === "r" ? await responseAudio(db, key[1], viewerId)
    : key.length === 3 && key[0] === "h" ? await harvestAudio(db, key[1], key[2], viewerId)
    : null;
  if (!stored || !isOurAudio(stored)) return new NextResponse(null, { status: 404 });

  if (stored.startsWith(LOCAL_AUDIO_PREFIX)) {
    const file = stored.slice(LOCAL_AUDIO_PREFIX.length);
    try {
      const bytes = await readFile(`./.data/audio/${file}`);
      return new NextResponse(bytes, { headers: { "content-type": TYPES[file.split(".").pop()!], "cache-control": CACHE } });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  const range = request.headers.get("range");
  const upstream = await fetch(stored, range ? { headers: { range } } : undefined);
  if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: upstream.status === 416 ? 416 : 502 });
  const headers = new Headers({ "cache-control": CACHE });
  for (const h of PASSED) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
