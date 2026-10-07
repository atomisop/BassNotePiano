/**
 * The two things shadcn's <Input>/<Label> don't already cover for this app's
 * forms. Everything else the old hand-rolled fields spelled out, the ground
 * fill, the hairline, the text colour, the 40px height, is already what
 * `Input` renders via the themed tokens, so it isn't repeated here.
 *
 * These exist because the same two decisions were being retyped at all 48
 * form controls across the app, which is how they drifted: some fields showed
 * an error border, some didn't, and the label size varied by screen.
 */

/**
 * Labels sit smaller and quieter than shadcn's default `text-small`, matching
 * the eyebrow-and-caption scale the rest of the app uses above a field.
 */
export const fieldLabel = "mb-1 block text-small font-medium text-slate-400";

/**
 * The invalid state. `Input` already carries `border-input` and
 * `focus-visible:ring-ring`; both are overridden here rather than added to,
 * so the focus ring turns red too instead of a red border snapping back to an
 * accent-coloured ring the moment the field is focused. cn()'s tailwind-merge
 * is what makes the override win, plain concatenation would leave both.
 */
export const fieldInvalid = "border-red-400/60 focus-visible:ring-red-400/60";
