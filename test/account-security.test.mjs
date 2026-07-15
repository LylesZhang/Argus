import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('extension config never contains a service-role credential', async () => {
  const config = await readFile(new URL('config.js', root), 'utf8');
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE_KEY\s*=/i);
  assert.doesNotMatch(config, /eyJ[A-Za-z0-9_-]{80,}/);
});

test('account tables enable RLS and user state is user-scoped', async () => {
  const sql = await readFile(
    new URL('supabase/migrations/202607150001_user_accounts.sql', root),
    'utf8',
  );
  for (const table of ['profiles', 'user_states', 'entitlements', 'billing_customers', 'subscriptions']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /auth\.uid\(\) = user_id/i);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/i);
});

test('manifest grants only the public Supabase host pattern', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://*.supabase.co/*'));
  assert.deepEqual(manifest.externally_connectable?.matches, [
    'https://argus-1ygn.onrender.com/auth/callback*',
  ]);
  assert.equal(manifest.permissions.includes('identity'), false);
});

test('account UI and worker use Magic Link rather than six-digit OTP verification', async () => {
  const [background, panel, server] = await Promise.all([
    readFile(new URL('background/index.js', root), 'utf8'),
    readFile(new URL('panel/panel.html', root), 'utf8'),
    readFile(new URL('server/index.js', root), 'utf8'),
  ]);
  assert.match(background, /AUTH_REQUEST_MAGIC_LINK/);
  assert.match(background, /runtime\.onMessageExternal/);
  assert.match(background, /redirect_to=/);
  assert.doesNotMatch(background, /AUTH_VERIFY_OTP/);
  assert.doesNotMatch(panel, /Six-digit code|account-verify-code/);
  assert.match(server, /app\.get\('\/auth\/callback'/);
  assert.match(server, /Referrer-Policy.*no-referrer/s);
});
