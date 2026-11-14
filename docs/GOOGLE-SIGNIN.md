# Sign in with Google

Added 2026-11-12. The "Continue with Google" button on Log in and Create account appears only when the two keys below are set. Until then nothing changes.

## What the owner sets up (about ten minutes)

1. In the Google Cloud console, make a project (or use one), then **APIs & Services > OAuth consent screen**: user type External, app name "Bass Note Piano", support email, the privacy policy link (`https://bassnotepiano.com/privacy`), then **Publish app** (in production). Only the basic scopes are used (`openid`, `email`, `profile`), so Google needs no review.
2. **Credentials > Create credentials > OAuth client ID**, type Web application. Authorized redirect URI: `https://bassnotepiano.com/api/auth/callback/google` (add the same path on a staging or preview address if you want to test there).
3. In Netlify, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (the secret is secret: never in a pull request or a chat). `NEXTAUTH_URL` must already be the public site address.
4. Deploy. Open the Log in page: the Google button shows.

## The rules (all in `src/lib/googleSignIn.ts`, tested in `tests/db/googleSignIn.test.ts`)

- Google's own "email verified" flag must be true.
- An existing account is found by its Google id first (survives an email change), then by email. A first Google sign-in links the two.
- **Never through Google:** admins and the owner (they keep password plus authenticator code), a child account (an accepted parent link: the parent manages it), a banned account, a payment-locked account.
- A password account nobody ever confirmed is confirmed by Google and its password is removed, so whoever registered it first cannot keep a way in to someone else's inbox.
- A new person gets a normal student account (verified email, free trial, owner alert "signed up with Google") with no password. They can add one later with **Forgot password** (Settings says so on the password card). Closed sign-ups (`signup.open` off) and disposable domains refuse new accounts the same way as the form; existing people can still come in.
- **What is taken from Google:** the verified email, the name (for a new account only), Google's account id, and the profile picture. The picture (`googleAvatar.ts`) is copied once into the account's own photo, only when the account has none (an uploaded photo is never replaced), only from Google's picture hosts, at 128 px, with a 4 second timeout and an 80 KB cap, and never linked to Google afterwards. Nothing else is read and no Google token is kept.
- A friend's invite link (`?ref=`) is not carried through Google sign-up.
- Sign-out, "sign out other devices", the new-device email and the session id work exactly as for a password sign-in.

## If something is wrong

- Button missing: `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is not set on the deployed site.
- Google says `redirect_uri_mismatch`: the redirect URI in step 2 does not match the site address exactly.
- A person is refused: the sign-in screen says why (admin, child account, locked, closed sign-ups, unverified email).
