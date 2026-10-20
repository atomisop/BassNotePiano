# Admin two-step sign-in

Only the admin account can turn this on; students are never asked. Once on, signing in needs the password AND a 6-digit code
from an authenticator app (or one single-use backup code). Code: `src/lib/adminTwoStep.ts`, `src/lib/totpCore.ts`.

- Secret: stored encrypted (AES-256-GCM) with `ADMIN_TOTP_ENCRYPTION_KEY` (32 random bytes, base64: `openssl rand -base64 32`).
- Backup codes: 8, shown once, stored as hashes, each works once.
- Enforced in `authorize` (`src/lib/auth.ts`), which every route to a session ends in (password, emailed code, password reset,
  verify email). A reset or verify auto sign-in for an admin with two-step on therefore ends with "try logging in manually".
- Wrong codes are counted in `FailedLoginAttempt`, the same lockout as wrong passwords (Settings > Security).
- A code cannot be used twice (`User.totpLastStep`).

## Risk: locking yourself out

If you lose the phone AND the backup codes, you cannot sign in as that admin. The key is also needed to read the stored secret: if
`ADMIN_TOTP_ENCRYPTION_KEY` is changed or lost, every saved secret becomes unreadable. Recovery is then in the database:
`UPDATE "User" SET "totpSecretEnc" = NULL, "totpEnabledAt" = NULL, "totpLastStep" = NULL WHERE email = '...';`

## Testing it safely first

1. Add `ADMIN_TOTP_ENCRYPTION_KEY` in Netlify (Site configuration > Environment variables) and deploy.
2. Make a SECOND admin account (Admin > Accounts > a test account > make admin), signed in on a different browser.
3. In that account: Settings > Sign-in & security > Two-step sign-in > Set up. Scan, enter the code, save the backup codes.
4. Sign out and in again: password, then the code. Then sign out and sign in with one backup code. Try the same code again (must fail).
5. Keep your real owner session signed in the whole time. Only after all of that, turn it on for your own account.
