import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSessionToken, slugify, validateTelegramInitData, verifySessionToken } from '../src/worker.js';

function signedInitData(botToken, user, authDate) {
  const values = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAExample', user: JSON.stringify(user) });
  const check = [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  values.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return values.toString();
}

test('validates authentic Telegram init data', async () => {
  const now = 1_800_000_000;
  const raw = signedInitData('123:secret', { id: 42, first_name: 'زهرا', username: 'zahra' }, now - 10);
  const result = await validateTelegramInitData(raw, '123:secret', now);
  assert.equal(result.telegramId, '42');
  assert.equal(result.firstName, 'زهرا');
});

test('rejects tampered and expired Telegram init data', async () => {
  const now = 1_800_000_000;
  const raw = signedInitData('123:secret', { id: 42, first_name: 'زهرا' }, now - 10);
  await assert.rejects(() => validateTelegramInitData(raw.replace('%D8%B2%D9%87%D8%B1%D8%A7', 'Mallory'), '123:secret', now));
  const expired = signedInitData('123:secret', { id: 42, first_name: 'زهرا' }, now - 90_000);
  await assert.rejects(() => validateTelegramInitData(expired, '123:secret', now), /expired/);
});

test('creates and verifies a signed session token', async () => {
  const token = await createSessionToken({ id: 'user-1', telegram_id: '42' }, 'a'.repeat(32));
  assert.equal((await verifySessionToken(token, 'a'.repeat(32))).sub, 'user-1');
  await assert.rejects(() => verifySessionToken(`${token}x`, 'a'.repeat(32)));
});

test('creates Telegram-safe room slugs', () => {
  assert.equal(slugify('Demo Room'), 'demo-room');
  assert.match(slugify('شب دیدار'), /^room-[a-f0-9-]{8}$/);
});
