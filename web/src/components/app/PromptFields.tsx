import { Field } from "./Field";

const REVEALS = [
  { value: "sealed", label: "Sealed", hint: "Nobody sees others' answers until it closes. The first confident answer doesn't bend the rest." },
  { value: "after_share", label: "After you share", hint: "You see everyone's once you've shared yours." },
  { value: "open", label: "Open", hint: "Answers appear as they arrive." },
] as const;

/** The question builder's fields. Story answers for now; the other shapes come next. */
export function PromptFields({ defaultReveal = "sealed" }: { defaultReveal?: (typeof REVEALS)[number]["value"] }) {
  return (
    <>
      <Field label="The question" name="question" required maxLength={200} />
      <Field label="A little context" name="context" multiline maxLength={1000} placeholder="Optional" rows={2} />
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">Answers lead with</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2"><input type="radio" name="telling" value="voice" defaultChecked /> voice</label>
          <label className="flex items-center gap-2"><input type="radio" name="telling" value="text" /> writing</label>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">When people see each other&apos;s answers</legend>
        {REVEALS.map((r) => (
          <label key={r.value} className="flex gap-3 rounded-[10px] border border-[var(--rule)] p-3">
            <input type="radio" name="reveal" value={r.value} defaultChecked={r.value === defaultReveal} className="mt-1" />
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
