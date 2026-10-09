// A short code per payment ("BNP-4K7Q2") the payer puts in the Zelle message
// or Venmo note. It lets the bank email be matched to the right payment even
// when someone else sends the money, or two students share a name. Pure, so it
// is tested. It is derived from the payment id, so nothing is stored.

const PREFIX = "BNP";
const CODE_LENGTH = 5;
const FIND_CODE = /BNP([A-Z0-9]{5})/;

/** Letters people mix up when typing a code by hand read as the same character. */
function normalize(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/** The code shown to the payer, e.g. "BNP-4K7Q2". */
export function paymentReferenceCode(paymentId: string): string {
  return `${PREFIX}-${paymentId.slice(-CODE_LENGTH).toUpperCase()}`;
}

/** A payment's code in the normalized form used to compare codes, e.g. "4K7Q2". */
export function normalizedCodeOf(paymentId: string): string {
  return normalize(paymentId.slice(-CODE_LENGTH));
}

/**
 * True when two codes are NOT equal but differ by one wrong character or by one swapped pair: a typo, not another
 * payment's code. Only ever used among payments already open for the exact same amount.
 */
export function codesOneTypoApart(a: string, b: string): boolean {
  if (a === b || a.length !== b.length) return false;
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i);
  if (diffs.length === 1) return true;
  return diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]];
}

/** The code inside a note, in the same normalized form for every payment, or null if the note has none. */
export function referenceInMemo(memo: string | null | undefined): string | null {
  if (!memo) return null;
  const found = normalize(memo).match(FIND_CODE);
  return found ? found[1] : null;
}

/** True when the note carries exactly this payment's code. */
export function memoHasReferenceFor(memo: string | null | undefined, paymentId: string): boolean {
  const inMemo = referenceInMemo(memo);
  return inMemo !== null && inMemo === normalize(paymentId.slice(-CODE_LENGTH));
}

/** True when the note carries a code, but not this payment's: the money was sent for something else. */
export function memoHasOtherReference(memo: string | null | undefined, paymentId: string): boolean {
  const inMemo = referenceInMemo(memo);
  return inMemo !== null && inMemo !== normalize(paymentId.slice(-CODE_LENGTH));
}
