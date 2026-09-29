import { mkdir, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIO_MAX_BYTES, AUDIO_TYPES, LOCAL_AUDIO_PREFIX, audioStorage } from "@/lib/audioStore";
import { fileExtensionFor } from "@/lib/audio/recorder";
import { newId } from "@/lib/id";

// Local dev only: recordings go to .data/audio when there's no Blob store.
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (audioStorage() !== "local") return NextResponse.json({ error: "Use Blob storage." }, { status: 404 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign in to record." }, { status: 401 });

  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.includes(type)) return NextResponse.json({ error: "That isn't a recording." }, { status: 415 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > AUDIO_MAX_BYTES) return NextResponse.json({ error: "That recording is empty or too large." }, { status: 413 });

  const name = `${newId()}.${fileExtensionFor(type)}`;
  await mkdir("./.data/audio", { recursive: true });
  await writeFile(`./.data/audio/${name}`, bytes);
  return NextResponse.json({ url: `${LOCAL_AUDIO_PREFIX}${name}` });
}
