import "server-only";

import { Refusal } from "@/domain/errors";

export type ActionState = { error?: string; ok?: string } | undefined;

/**
 * Run a domain call from a server action: a Refusal becomes words on the
 * form, anything else is a real error. Call redirect() after this, never
 * inside it — redirect works by throwing.
 */
export async function attempt(fn: () => Promise<unknown>): Promise<ActionState | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    throw e;
  }
}
