// What the app knows about where the person has been in this visit, so a Back button can take them to the screen they
// actually came from instead of a fixed page. Browser history cannot be read, so each page change is recorded here.

type Win = Window & { __bnpNavStack?: string[] };

/** Called on every page change. Going back to the previous entry pops it; anything else is a new step. */
export function recordNavigation(key: string): void {
  const w = window as Win;
  const stack = (w.__bnpNavStack ??= []);
  if (stack[stack.length - 1] === key) return;
  if (stack.length >= 2 && stack[stack.length - 2] === key) stack.pop();
  else stack.push(key);
  if (stack.length > 100) stack.shift();
}

/** True when the page before this one belongs to the app (so history.back lands somewhere that makes sense). */
export function canGoBackInApp(): boolean {
  const w = window as Win;
  if ((w.__bnpNavStack?.length ?? 0) > 1) return true;
  // After a reload the record is empty: trust the browser's own referrer when it is this site.
  try {
    return window.history.length > 1 && document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
