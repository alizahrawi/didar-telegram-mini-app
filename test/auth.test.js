import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSessionToken, validateTelegramInitData, verifySessionToken } from '../src/auth.js';

function signedInitData(botToken, user, authDate) {
  const values = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAExample', user: JSON.stringify(user) });
  const check = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  values.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return values.toString();
}

test('validates authentic Telegram init data', () => {
  const now = 1_800_000_000;
  const raw = signedInitData('123:secret', { id: 42, first_name: 'زهرا', username: 'zahra' }, now - 10);
  const result = validateTelegramInitData(raw, '123:secret', now);
  assert.equal(result.telegramId, '42');
  assert.equal(result.firstName, 'زهرا');
});

test('rejects tampered and expired Telegram init data', () => {
  const now = 1_800_000_000;
  const raw = signedInitData('123:secret', { id: 42, first_name: 'زهرا' }, now - 10);
  assert.throws(() => validateTelegramInitData(raw.replace('%D8%B2%D9%87%D8%B1%D8%A7', 'Mallory'), '123:secret', now));
  const expired = signedInitData('123:secret', { id: 42, first_name: 'زهرا' }, now - 90_000);
  assert.throws(() => validateTelegramInitData(expired, '123:secret', now), /expired/);
});

test('creates and verifies a signed session token', () => {
  const token = createSessionToken({ id: 'user-1', telegram_id: '42' }, 'a'.repeat(32));
  assert.equal(verifySessionToken(token, 'a'.repeat(32)).sub, 'user-1');
  assert.throws(() => verifySessionToken(`${token}x`, 'a'.repeat(32)));
});
