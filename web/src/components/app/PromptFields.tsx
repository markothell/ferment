"use client";

import { useState } from "react";
import { Field } from "./Field";

const REVEALS = [
  { value: "sealed", label: "Sealed", hint: "Nobody sees others' answers until it closes. The first confident answer doesn't bend the rest." },
  { value: "after_share", label: "After you share", hint: "You see everyone's once you've shared yours." },
  { value: "open", label: "Open", hint: "Answers appear as they arrive." },
] as const;

const SHAPES = [
  { value: "story", label: "Tell it", hint: "A voice note or a few written words." },
  { value: "placement", label: "Place yourself", hint: "On a line between two ends, or in a square of two." },
  { value: "story_placement", label: "Tell it and place it", hint: "The stories arrange themselves by where people stand." },
  { value: "words", label: "Choose words", hint: "Pick from a list you start, and add words of your own." },
] as const;

type Shape = (typeof SHAPES)[number]["value"];
type Axis = { poleA: string; poleB: string };

export type PromptDefaults = {
  question?: string;
  context?: string;
  shape?: Shape;
  telling?: "voice" | "text" | null;
  reveal?: (typeof REVEALS)[number]["value"];
  axes?: Axis[];
  placing?: "free" | "quadrants" | null;
  seedWords?: string[];
  pickMax?: number | null;
  coinMax?: number | null;
};

/** The question builder's fields: the question, how people answer, and when they see each other. */
export function PromptFields({
  defaultReveal = "sealed", defaults = {},
}: {
  defaultReveal?: (typeof REVEALS)[number]["value"];
  defaults?: PromptDefaults;
}) {
  const [shape, setShape] = useState<Shape>(defaults.shape ?? "story");
  const [twoAxes, setTwoAxes] = useState((defaults.axes?.length ?? 0) === 2);
  const reveal = defaults.reveal ?? defaultReveal;
  const telling = defaults.telling ?? "voice";
  const tells = shape === "story" || shape === "story_placement";
  const places = shape === "placement" || shape === "story_placement";
  const [a1, a2] = [defaults.axes?.[0], defaults.axes?.[1]];

  return (
    <>
      <Field label="The question" name="question" required maxLength={200} defaultValue={defaults.question} />
      <Field label="A little context" name="context" multiline maxLength={1000} placeholder="Optional" rows={2} defaultValue={defaults.context} />

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">How people answer</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SHAPES.map((s) => (
            <label key={s.value} className="flex gap-3 rounded-[10px] border border-[var(--rule)] p-3">
              <input type="radio" name="shape" value={s.value} checked={shape === s.value} onChange={() => setShape(s.value)} className="mt-1" />
              <span>
                <span className="block font-medium">{s.label}</span>
                <span className="block text-sm text-[var(--ink-soft)]">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {tells && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Answers lead with</legend>
          <div className="flex gap-6">
            <label className="flex items-center gap-2"><input type="radio" name="telling" value="voice" defaultChecked={telling === "voice"} /> voice</label>
            <label className="flex items-center gap-2"><input type="radio" name="telling" value="text" defaultChecked={telling === "text"} /> writing</label>
          </div>
        </fieldset>
      )}

      {places && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-medium">The line people place themselves on</legend>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <input name="axis1a" className="field" required maxLength={40} placeholder="One end" defaultValue={a1?.poleA} aria-label="First axis, one end" />
            <span aria-hidden className="text-[var(--ink-faint)]">↔</span>
            <input name="axis1b" className="field" required maxLength={40} placeholder="The other end" defaultValue={a1?.poleB} aria-label="First axis, the other end" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={twoAxes} onChange={(e) => setTwoAxes(e.target.checked)} /> Add a second line, making a square
          </label>
          {twoAxes && (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input name="axis2a" className="field" required maxLength={40} placeholder="Top" defaultValue={a2?.poleA} aria-label="Second axis, top" />
                <span aria-hidden className="text-[var(--ink-faint)]">↕</span>
                <input name="axis2b" className="field" required maxLength={40} placeholder="Bottom" defaultValue={a2?.poleB} aria-label="Second axis, bottom" />
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="placing" value="free" defaultChecked={defaults.placing !== "quadrants"} /> place anywhere
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="placing" value="quadrants" defaultChecked={defaults.placing === "quadrants"} /> choose one of four corners
                </label>
              </div>
            </>
          )}
        </fieldset>
      )}

      {shape === "words" && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-medium">The words to choose from</legend>
          <textarea
            name="words"
            rows={3}
            className="field"
            required
            placeholder="rest, play, grief, hope, work"
            defaultValue={defaults.seedWords?.join(", ")}
            aria-describedby="words-hint"
          />
          <p id="words-hint" className="text-sm text-[var(--ink-soft)]">Separate them with commas. Up to 40.</p>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              Each person picks up to
              <input name="pickMax" type="number" min={1} max={10} defaultValue={defaults.pickMax ?? 5} className="field !w-20 !py-2" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              and adds up to
              <input name="coinMax" type="number" min={0} max={5} defaultValue={defaults.coinMax ?? 2} className="field !w-20 !py-2" />
              of their own
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">When people see each other&apos;s answers</legend>
        {REVEALS.map((r) => (
          <label key={r.value} className="flex gap-3 rounded-[10px] border border-[var(--rule)] p-3">
            <input type="radio" name="reveal" value={r.value} defaultChecked={r.value === reveal} className="mt-1" />
            <span>
              <span className="block font-medium">{r.label}</span>
              <span className="block text-sm text-[var(--ink-soft)]">{r.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block space-y-2">
        <span className="block font-medium">Close after</span>
        <select name="timer" className="field" defaultValue="">
          <option value="">No timer: when everyone has answered, or by hand</option>
          <option value="24">A day</option>
          <option value="72">Three days</option>
          <option value="168">A week</option>
        </select>
      </label>
    </>
  );
}
