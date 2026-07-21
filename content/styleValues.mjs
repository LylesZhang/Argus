/**
 * Convert a persisted spacing value to an explicit CSS em value.
 * Zero must remain `0em`; returning an empty string would expose the host
 * page's own letter/word spacing and make the stepper non-monotonic.
 */
export function toEmSpacing(value) {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric : 0}em`;
}
