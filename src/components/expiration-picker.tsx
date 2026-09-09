import { EXPIRATION_OPTIONS } from "@/lib/expiration";

export function ExpirationPicker({ value, onChange, disabled }: {
  value: number;
  onChange: (seconds: number) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="mb-6 disabled:opacity-60">
      <legend className="mb-3 text-sm font-medium">Available for</legend>
      <div className="flex gap-1 rounded-xl border border-line bg-[#f2f4f8] p-1">
        {EXPIRATION_OPTIONS.map((option) => (
          <label key={option.seconds} className="relative flex-1 cursor-pointer">
            <input type="radio" name="expiration" value={option.seconds} checked={value === option.seconds} onChange={() => onChange(option.seconds)} className="peer sr-only" />
            <span className="block rounded-lg px-2 py-2.5 text-center text-sm text-muted transition-colors peer-checked:bg-white peer-checked:font-medium peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed">{option.label}</span>
          </label>
        ))}
      </div>
      <p className="mt-2.5 text-xs leading-5 text-muted">The clock starts when your upload finishes.</p>
    </fieldset>
  );
}
