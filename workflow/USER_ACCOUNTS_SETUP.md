# User accounts setup

Argus uses Supabase Auth Magic Links and PostgreSQL. Anonymous extension use
does not require Supabase; account controls stay disabled until public
configuration is provided. The default Supabase email service and default
Magic Link template are sufficient for development—custom SMTP is not needed.

## Supabase

1. Create a Supabase project and run
   `supabase/migrations/202607150001_user_accounts.sql` in the SQL editor or
   with the Supabase CLI.
2. Keep email authentication enabled, including new-user sign-up and email
   confirmation. Supabase anonymous sign-ins can remain disabled because
   Argus anonymous use is local-only.
3. Keep the default **Magic link or OTP** email template. It must contain
   `{{ .ConfirmationURL }}`. Do not replace it with `{{ .Token }}`.
4. In Authentication > URL Configuration, add this Redirect URL exactly:
   `https://argus-1ygn.onrender.com/auth/callback**`. The wildcard covers the
   extension id and one-time anti-CSRF state query parameters.
5. Copy the project URL and publishable key (`sb_publishable_...`) into
   `config.js`. The key is public and protected by RLS. Legacy anon keys also
   work. Never put a secret or service-role key there.

## Server

Configure the values documented in `server/.env.example` on the server host:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (set this to the publishable key)
- `SUPABASE_SECRET_KEY` (server only, required for account deletion)

Deploy the server before enabling account controls in a published extension.
The deployment must serve both `/auth/callback` and the account APIs. The
existing AI endpoints continue to work when these variables are absent.

The extension manifest allows external messages only from the production
callback origin. If `API_BASE` changes, update both the Supabase Redirect URL
and `manifest.json`'s `externally_connectable.matches` entry.

## Smoke test

1. Load the unpacked extension and confirm anonymous settings still work.
2. Send a login email from Settings > Account & Sync.
3. Open the email in the same Chrome profile, click **Sign in**, and confirm
   that the callback page reports success without asking for a code.
4. Confirm the first login uploads local state when the cloud state is empty.
5. Change a setting and verify `user_states.revision` increments.
6. Sign into the same email on another profile and confirm cloud state replaces
   that profile's local state.
7. Sign out (local state remains), then test account deletion (local and cloud
   state are removed).
