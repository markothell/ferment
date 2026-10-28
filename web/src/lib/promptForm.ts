import type { PromptInput } from "@/domain/prompts";

// Reads a question from a form built with PromptFields: the question, how
// people answer, and when they see each other. Used wherever a form asks one.
export const str = (form: FormData, key: string) => String(form.get(key) || "");

export function promptFrom(form: FormData): PromptInput {
  const reveal = str(form, "reveal");
  const shape = str(form, "shape");
  const axes = [[str(form, "axis1a"), str(form, "axis1b")], [str(form, "axis2a"), str(form, "axis2b")]]
    .filter(([a, b]) => a.trim() || b.trim())
    .map(([poleA, poleB]) => ({ poleA, poleB }));
  return {
    question: str(form, "question"),
    context: str(form, "context"),
    shape: shape === "placement" || shape === "story_placement" || shape === "words" ? shape : "story",
    telling: str(form, "telling") === "text" ? "text" : "voice",
    reveal: reveal === "open" || reveal === "after_share" ? reveal : "sealed",
    axes,
    placing: str(form, "placing") === "quadrants" ? "quadrants" : "free",
    seedWords: str(form, "words").split(/[,\n]/),
    pickMax: Number(str(form, "pickMax")) || undefined,
    coinMax: str(form, "coinMax") === "" ? undefined : Number(str(form, "coinMax")),
  };
}

/** The round's timer as the form gives it: hours, or none. */
export const timerFrom = (form: FormData) => str(form, "timer") || null;
