// Client-safe: the refusal codes Google sign-in can end with, and the plain sentence for each.
export type GoogleRefusal = "unverified" | "banned" | "locked" | "admin" | "child" | "closed" | "disposable" | "failed";

/** The plain sentence a refused person sees on the sign-in screen, by the code in `?error=`. */
export const GOOGLE_REFUSAL_MESSAGE: Record<GoogleRefusal, string> = {
  unverified: "Google says that email address is not verified yet, so we cannot sign you in with it.",
  banned: "This account cannot sign in.",
  locked: "This account is locked until a payment is settled. Contact support from the page that opens when you sign in with your password.",
  admin: "Studio accounts sign in with a password and a code. Use the email and password form.",
  child: "Your parent manages this account. Sign in with your email and password, or ask your parent.",
  closed: "New sign-ups are closed right now.",
  disposable: "That looks like a temporary email address. Please use one you can actually receive mail at.",
  failed: "Google sign-in did not work. Try again, or use your email and password.",
};

