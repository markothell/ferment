import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { webm: "audio/webm", m4a: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", aac: "audio/aac" };

export async function GET(request: Request, { params }: RouteContext<"/api/audio/local/[file]">) {
  const { file } = await params;
  const m = /^([a-z0-9]+)\.(webm|m4a|ogg|mp3|aac)$/.exec(file);
  if (!m) return new NextResponse(null, { status: 404 });
  if (!(await auth.api.getSession({ headers: request.headers }))) return new NextResponse(null, { status: 401 });
  try {
    const bytes = await readFile(`./.data/audio/${file}`);
    return new NextResponse(bytes, { headers: { "content-type": TYPES[m[2]], "cache-control": "private, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
