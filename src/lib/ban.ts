/** What a banned person sees when they try to sign in. Shared by the server and the sign-in forms. */
export const BANNED_MESSAGE = "You have been permanently banned from this site.";

/** The error code the sign-in step throws for a banned account, so every sign-in screen can show the message above. */
export const BANNED_ERROR_CODE = "BANNED";
