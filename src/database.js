import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const adjectives = ['روشن', 'آبی', 'نو', 'سبز', 'گرم', 'پویا'];

function slugify(value) {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34);
  // Telegram startapp parameters must stay URL/deep-link friendly.
  return ascii || `room-${crypto.randomBytes(4).toString('hex')}`;
}

export function createDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      photo_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      host_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(host_user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS members (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role_title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      instagram_url TEXT NOT NULL DEFAULT '',
      story_url TEXT NOT NULL DEFAULT '',
      linkedin_url TEXT NOT NULL DEFAULT '',
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(room_id, user_id),
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);
  `);

  const q = {
    upsertUser: db.prepare(`
      INSERT INTO users (id, telegram_id, first_name, last_name, username, photo_url)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        first_name=excluded.first_name, last_name=excluded.last_name,
        username=excluded.username, photo_url=excluded.photo_url, updated_at=CURRENT_TIMESTAMP
      RETURNING *
    `),
    getUser: db.prepare('SELECT * FROM users WHERE id = ?'),
    roomBySlug: db.prepare('SELECT * FROM rooms WHERE slug = ?'),
    insertRoom: db.prepare('INSERT INTO rooms (id, slug, title, description, host_user_id) VALUES (?, ?, ?, ?, ?) RETURNING *'),
    memberByUser: db.prepare('SELECT * FROM members WHERE room_id = ? AND user_id = ?'),
    upsertMember: db.prepare(`
      INSERT INTO members (room_id, user_id, display_name, role_title, bio, avatar_url, instagram_url, story_url, linkedin_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, user_id) DO UPDATE SET
        display_name=excluded.display_name, role_title=excluded.role_title,
        bio=excluded.bio, avatar_url=excluded.avatar_url,
        instagram_url=excluded.instagram_url, story_url=excluded.story_url,
        linkedin_url=excluded.linkedin_url, updated_at=CURRENT_TIMESTAMP
      RETURNING *
    `),
    insertMessage: db.prepare('INSERT INTO messages (id, room_id, user_id, body) VALUES (?, ?, ?, ?) RETURNING *'),
  };

  function uniqueSlug(title) {
    const base = slugify(title);
    let slug = base;
    let i = 0;
    while (q.roomBySlug.get(slug)) {
      i += 1;
      slug = `${base}-${i}`;
    }
    return slug;
  }

  return {
    raw: db,
    close: () => db.close(),
    upsertUser(profile) {
      const current = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(profile.telegramId);
      return q.upsertUser.get(
        current?.id || crypto.randomUUID(), profile.telegramId, profile.firstName,
        profile.lastName || '', profile.username || '', profile.photoUrl || '',
      );
    },
    getUser: (id) => q.getUser.get(id),
    createRoom({ title, description = '', hostUserId, slug }) {
      return q.insertRoom.get(crypto.randomUUID(), slug ? uniqueSlug(slug) : uniqueSlug(title), title, description, hostUserId);
    },
    getRoom(slug, viewerId) {
      const room = q.roomBySlug.get(slug);
      if (!room) return null;
      const members = db.prepare(`
        SELECT m.*, u.username AS telegram_username
        FROM members m JOIN users u ON u.id=m.user_id
        WHERE m.room_id=? ORDER BY m.joined_at ASC
      `).all(room.id);
      return { ...room, members, me: viewerId ? q.memberByUser.get(room.id, viewerId) || null : null };
    },
    saveMember(roomId, userId, profile) {
      return q.upsertMember.get(
        roomId, userId, profile.displayName, profile.roleTitle || '', profile.bio || '',
        profile.avatarUrl || '', profile.instagramUrl || '', profile.storyUrl || '', profile.linkedinUrl || '',
      );
    },
    getMember: (roomId, userId) => q.memberByUser.get(roomId, userId),
    listMessages(roomId, limit = 60) {
      return db.prepare(`
        SELECT x.* FROM (
          SELECT msg.id, msg.body, msg.created_at, msg.user_id,
                 m.display_name, m.avatar_url
          FROM messages msg
          JOIN members m ON m.room_id=msg.room_id AND m.user_id=msg.user_id
          WHERE msg.room_id=? ORDER BY msg.created_at DESC LIMIT ?
        ) x ORDER BY x.created_at ASC
      `).all(roomId, limit);
    },
    createMessage(roomId, userId, body) {
      const message = q.insertMessage.get(crypto.randomUUID(), roomId, userId, body);
      const member = q.memberByUser.get(roomId, userId);
      return { ...message, display_name: member.display_name, avatar_url: member.avatar_url };
    },
    ensureDemoData() {
      let host = db.prepare("SELECT * FROM users WHERE telegram_id='dev-1001'").get();
      if (!host) host = this.upsertUser({ telegramId: 'dev-1001', firstName: 'زهرا', lastName: 'محمدی', username: 'zahra_demo', photoUrl: '' });
      let room = q.roomBySlug.get('shab-didar');
      if (!room) room = q.insertRoom.get(crypto.randomUUID(), 'shab-didar', 'شب دیدار', 'شب شبکه‌سازی، آشنایی و گفت‌وگو', host.id);
      if (!q.memberByUser.get(room.id, host.id)) {
        this.saveMember(room.id, host.id, { displayName: 'زهرا محمدی', roleTitle: 'طراح محصول', bio: 'عاشق ساختن تجربه‌های انسانی', instagramUrl: 'https://instagram.com/', linkedinUrl: 'https://linkedin.com/' });
      }
      const samples = [
        ['dev-1002', 'علی رضایی', 'بنیان‌گذار استارتاپ'],
        ['dev-1003', 'سارا احمدی', 'مدیر مارکتینگ'],
        ['dev-1004', 'امیر نوری', 'توسعه‌دهنده محصول'],
        ['dev-1005', 'نازنین شریفی', 'استراتژیست برند'],
      ];
      for (const [telegramId, name, roleTitle] of samples) {
        let user = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(telegramId);
        if (!user) user = this.upsertUser({ telegramId, firstName: name.split(' ')[0], lastName: name.split(' ')[1], username: '', photoUrl: '' });
        if (!q.memberByUser.get(room.id, user.id)) {
          this.saveMember(room.id, user.id, { displayName: name, roleTitle, instagramUrl: 'https://instagram.com/', linkedinUrl: 'https://linkedin.com/' });
        }
      }
      if (this.listMessages(room.id, 1).length === 0) {
        this.createMessage(room.id, host.id, 'سلام! خوش اومدین به شب دیدار 👋');
      }
      return room;
    },
    randomRoomTitle() {
      return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${Date.now().toString().slice(-4)}`;
    },
  };
}
