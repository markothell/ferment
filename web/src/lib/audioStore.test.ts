import { describe, expect, it } from "vitest";
import { isOurAudio, ourBlobHost } from "./audioStore";

const env = { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_AbC123xyz_secretpart" } as unknown as NodeJS.ProcessEnv;

describe("isOurAudio", () => {
  it("reads our store's host from the token", () => {
    expect(ourBlobHost(env)).toBe("abc123xyz.public.blob.vercel-storage.com");
  });

  it("accepts our store and our local files", () => {
    expect(isOurAudio("https://abc123xyz.public.blob.vercel-storage.com/rounds/r1/take-Qx9.m4a", env)).toBe(true);
    expect(isOurAudio("/api/audio/local/abc123.webm", env)).toBe(true);
  });

  it("refuses another store, other paths, and look-alikes", () => {
    for (const url of [
      "https://someoneelse.public.blob.vercel-storage.com/rounds/r1/take.m4a",
      "https://abc123xyz.public.blob.vercel-storage.com/other/take.m4a",
      "http://abc123xyz.public.blob.vercel-storage.com/rounds/r1/take.m4a",
      "https://abc123xyz.public.blob.vercel-storage.com.evil.example/rounds/x.m4a",
      "https://user@abc123xyz.public.blob.vercel-storage.com/rounds/x.m4a",
      "/api/audio/local/../../secret.webm",
      "/api/audio/local/ABC.webm?x=1",
    ]) expect(isOurAudio(url, env), url).toBe(false);
  });

  it("refuses every Blob URL when there is no store", () => {
    expect(isOurAudio("https://abc123xyz.public.blob.vercel-storage.com/rounds/r1/x.m4a", {} as NodeJS.ProcessEnv)).toBe(false);
  });
});
