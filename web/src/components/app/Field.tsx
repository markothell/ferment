export function Field({
  label, name, hint, multiline = false, ...rest
}: {
  label: string;
  name: string;
  hint?: string;
  multiline?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block space-y-2">
      <span className="block font-medium">{label}</span>
      {hint && <span className="block text-sm text-[var(--ink-soft)]">{hint}</span>}
      {multiline ? (
        <textarea name={name} rows={4} className="field" {...rest} />
      ) : (
        <input name={name} className="field" {...rest} />
      )}
    </label>
  );
}
