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
