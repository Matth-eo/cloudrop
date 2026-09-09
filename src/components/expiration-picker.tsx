import { EXPIRATION_OPTIONS } from "@/lib/expiration";

export function ExpirationPicker({ value, onChange, disabled }: {
  value: number;
  onChange: (seconds: number) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="expiration-picker disabled:opacity-60">
      <legend className="text-xs text-muted">Available for</legend>
      <div className="expiration-options">
        {EXPIRATION_OPTIONS.map((option) => (
          <label key={option.seconds} className="relative cursor-pointer">
            <input type="radio" name="expiration" value={option.seconds} checked={value === option.seconds} onChange={() => onChange(option.seconds)} className="peer sr-only" />
            <span className="expiration-option peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed">{option.label}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">The clock starts when your upload finishes.</p>
    </fieldset>
  );
}
