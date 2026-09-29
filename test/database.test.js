import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../src/database.js';

test('room, membership and chat lifecycle works', (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'didar-test-'));
  const db = createDatabase(path.join(folder, 'test.db'));
  t.after(() => { db.close(); fs.rmSync(folder, { recursive: true, force: true }); });

  const user = db.upsertUser({ telegramId: '100', firstName: 'سارا', lastName: 'احمدی' });
  const room = db.createRoom({ title: 'شب دیدار', description: 'تست روم', hostUserId: user.id });
  assert.match(room.slug, /^room-[a-f0-9]{8}$/);
  db.saveMember(room.id, user.id, { displayName: 'سارا احمدی', roleTitle: 'مدیر محصول' });
  const view = db.getRoom(room.slug, user.id);
  assert.equal(view.members.length, 1);
  assert.equal(view.me.role_title, 'مدیر محصول');
  const message = db.createMessage(room.id, user.id, 'سلام به همه');
  assert.equal(message.display_name, 'سارا احمدی');
  assert.equal(db.listMessages(room.id)[0].body, 'سلام به همه');
});

test('room slugs remain unique', (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'didar-test-'));
  const db = createDatabase(path.join(folder, 'test.db'));
  t.after(() => { db.close(); fs.rmSync(folder, { recursive: true, force: true }); });
  const user = db.upsertUser({ telegramId: '101', firstName: 'علی' });
  const a = db.createRoom({ title: 'Demo Room', hostUserId: user.id });
  const b = db.createRoom({ title: 'Demo Room', hostUserId: user.id });
  assert.equal(a.slug, 'demo-room');
  assert.equal(b.slug, 'demo-room-1');
});
