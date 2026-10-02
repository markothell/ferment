import { CIRCLE_COLORS, type CircleColor } from "@/lib/circleColors";

/** A row of swatches, one radio each, named "color". */
export function ColorPicker({ value = "saffron" }: { value?: CircleColor }) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">colour</legend>
      <div className="flex flex-wrap gap-3">
        {CIRCLE_COLORS.map((c) => (
          <label key={c} className={`swatch tint-${c} relative cursor-pointer`} title={c}>
            <input type="radio" name="color" value={c} defaultChecked={c === value} aria-label={c} />
            <span />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
