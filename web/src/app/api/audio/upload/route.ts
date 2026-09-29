import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AUDIO_MAX_BYTES, AUDIO_TYPES } from "@/lib/audioStore";

// Vercel Blob client-token route: the browser uploads the recording straight to
// storage, so a long voice note on a bad connection never passes through here.
// Only a signed-in person gets a token. The round they record for checks the
// URL again when the response is saved (domain/rounds.ts#respond).

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Recording storage is not configured (BLOB_READ_WRITE_TOKEN)." }, { status: 503 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) throw new Error("Sign in to record.");
        if (!pathname.startsWith("rounds/")) throw new Error("Unexpected upload path");
        return {
          allowedContentTypes: AUDIO_TYPES,
          maximumSizeInBytes: AUDIO_MAX_BYTES,
          addRandomSuffix: true, // unguessable, and two takes never collide
          cacheControlMaxAge: 60 * 60 * 24 * 365, // recordings are never rewritten
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
