const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmac(key, value) {
  const rawKey = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
}

function hex(bytes) { return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

export async function validateTelegramInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!initData || !botToken) throw new Error('Telegram authentication is unavailable.');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !authDate) throw new Error('Telegram init data is incomplete.');
  if (nowSeconds - authDate > 86400 || authDate > nowSeconds + 60) throw new Error('Telegram init data has expired.');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await hmac('WebAppData', botToken);
  const calculated = hex(await hmac(secret, check));
  if (!safeEqual(calculated, receivedHash)) throw new Error('Telegram signature is invalid.');
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { throw new Error('Telegram user payload is invalid.'); }
  if (!user?.id || !user?.first_name) throw new Error('Telegram user payload is missing.');
  return {
    telegramId: String(user.id), firstName: user.first_name, lastName: user.last_name || '',
    username: user.username || '', photoUrl: user.photo_url || '', languageCode: user.language_code || 'fa',
  };
}

export async function createSessionToken(user, secret, ttlSeconds = 604800) {
  const body = base64url(encoder.encode(JSON.stringify({ sub: user.id, tid: user.telegram_id, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  return `${body}.${base64url(await hmac(secret, body))}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || !token.includes('.')) throw new Error('Missing session.');
  const [body, signature] = token.split('.');
  const expected = base64url(await hmac(secret, body));
  if (!safeEqual(expected, signature)) throw new Error('Invalid session.');
  const payload = JSON.parse(decoder.decode(fromBase64url(body)));
  if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Expired session.');
  return payload;
}

export function slugify(value) {
  const ascii = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34);
  return ascii || `room-${crypto.randomUUID().slice(0, 8)}`;
}

function text(value, max) { return String(value || '').trim().slice(0, max); }
function validUrl(value, domains = []) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('لینک معتبر وارد کنید.');
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (domains.length && !domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) throw new Error('دامنه لینک معتبر نیست.');
  return url.toString().slice(0, 500);
}

async function upsertUser(env, profile) {
  const current = await env.DB.prepare('SELECT id FROM users WHERE telegram_id=?').bind(profile.telegramId).first();
  const id = current?.id || crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO users (id,telegram_id,first_name,last_name,username,photo_url)
    VALUES (?,?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,
    username=excluded.username,photo_url=excluded.photo_url,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, profile.telegramId, profile.firstName, profile.lastName || '', profile.username || '', profile.photoUrl || '').run();
  return env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(profile.telegramId).first();
}

async function uniqueSlug(env, title) {
  const base = slugify(title);
  let slug = base;
  let counter = 0;
  while (await env.DB.prepare('SELECT 1 FROM rooms WHERE slug=?').bind(slug).first()) {
    counter += 1; slug = `${base.slice(0, 29)}-${counter}`;
  }
  return slug;
}

async function createRoom(env, { title, description = '', hostUserId }) {
  const roomTitle = text(title, 70);
  if (roomTitle.length < 2) throw new Error('نام روم حداقل ۲ حرف باشد.');
  const room = { id: crypto.randomUUID(), slug: await uniqueSlug(env, roomTitle), title: roomTitle, description: text(description, 180), host_user_id: hostUserId };
  await env.DB.prepare('INSERT INTO rooms (id,slug,title,description,host_user_id) VALUES (?,?,?,?,?)')
    .bind(room.id, room.slug, room.title, room.description, room.host_user_id).run();
  return room;
}

async function getRoom(env, slug, viewerId) {
  const room = await env.DB.prepare('SELECT * FROM rooms WHERE slug=?').bind(slug).first();
  if (!room) return null;
  const { results: members } = await env.DB.prepare(`SELECT m.*,u.username AS telegram_username FROM members m
    JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.joined_at ASC`).bind(room.id).all();
  const me = viewerId ? await env.DB.prepare('SELECT * FROM members WHERE room_id=? AND user_id=?').bind(room.id, viewerId).first() : null;
  return { ...room, members, me: me || null };
}

async function saveMember(env, roomId, userId, input) {
  const displayName = text(input.displayName, 60);
  if (displayName.length < 2) throw new Error('نام حداقل ۲ حرف باشد.');
  const values = {
    displayName, roleTitle: text(input.roleTitle, 80), bio: text(input.bio, 180),
    avatarUrl: validUrl(input.avatarUrl),
    instagramUrl: validUrl(input.instagramUrl, ['instagram.com']),
    storyUrl: validUrl(input.storyUrl, ['instagram.com']),
    linkedinUrl: validUrl(input.linkedinUrl, ['linkedin.com', 'lnkd.in']),
  };
  await env.DB.prepare(`INSERT INTO members (room_id,user_id,display_name,role_title,bio,avatar_url,instagram_url,story_url,linkedin_url)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET display_name=excluded.display_name,
    role_title=excluded.role_title,bio=excluded.bio,avatar_url=excluded.avatar_url,instagram_url=excluded.instagram_url,
    story_url=excluded.story_url,linkedin_url=excluded.linkedin_url,updated_at=CURRENT_TIMESTAMP`)
    .bind(roomId, userId, values.displayName, values.roleTitle, values.bio, values.avatarUrl, values.instagramUrl, values.storyUrl, values.linkedinUrl).run();
  return env.DB.prepare('SELECT * FROM members WHERE room_id=? AND user_id=?').bind(roomId, userId).first();
}

function inviteLinks(env, origin, slug) {
  const appUrl = (env.APP_URL || origin).replace(/\/$/, '');
  return {
    webUrl: `${appUrl}/r/${encodeURIComponent(slug)}`,
    inviteUrl: env.BOT_USERNAME ? `https://t.me/${env.BOT_USERNAME.replace(/^@/, '')}?startapp=${encodeURIComponent(slug)}` : `${appUrl}/r/${encodeURIComponent(slug)}`,
  };
}

async function requireAuth(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return verifySessionToken(token, env.SESSION_SECRET);
}

async function ensureDevRoom(env, user) {
  if (env.ALLOW_DEV_AUTH !== 'true') return;
  let room = await env.DB.prepare("SELECT * FROM rooms WHERE slug='shab-didar'").first();
  if (!room) {
    room = { id: crypto.randomUUID(), slug: 'shab-didar', title: 'شب دیدار', description: 'شب شبکه‌سازی، آشنایی و گفت‌وگو' };
    await env.DB.prepare('INSERT INTO rooms (id,slug,title,description,host_user_id) VALUES (?,?,?,?,?)').bind(room.id, room.slug, room.title, room.description, user.id).run();
  }
  const member = await env.DB.prepare('SELECT 1 FROM members WHERE room_id=? AND user_id=?').bind(room.id, user.id).first();
  if (!member) await saveMember(env, room.id, user.id, { displayName: `${user.first_name} ${user.last_name}`.trim(), roleTitle: 'عضو دیدار' });
}

async function telegramCall(env, method, payload) {
  if (!env.BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
}

async function handleTelegram(request, env, origin, secret) {
  if (!env.BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) return json({ error: 'Not found' }, 404);
  const update = await request.json();
  const message = update.message;
  if (!message?.text || !message?.from?.id) return json({ ok: true });
  const start = message.text.match(/^\/start(?:@\w+)?(?:\s+([\w-]+))?/);
  const create = message.text.match(/^\/newroom(?:@\w+)?(?:\s+(.+))?/s);
  if (start) {
    const slug = start[1] || '';
    const target = slug ? `${origin}/r/${slug}` : origin;
    await telegramCall(env, 'sendMessage', { chat_id: message.chat.id, text: slug ? 'دعوت‌نامه آماده است؛ برای ورود به روم روی دکمه بزنید.' : 'به دیدار خوش آمدید؛ آدم‌های رویدادت را راحت‌تر پیدا کن.', reply_markup: { inline_keyboard: [[{ text: slug ? 'ورود به روم' : 'باز کردن دیدار', web_app: { url: target } }]] } });
  } else if (create) {
    const title = text(create[1], 70);
    if (title.length < 2) {
      await telegramCall(env, 'sendMessage', { chat_id: message.chat.id, text: 'مثال ساخت روم:\n/newroom شب دیدار' });
    } else {
      const user = await upsertUser(env, { telegramId: String(message.from.id), firstName: message.from.first_name, lastName: message.from.last_name || '', username: message.from.username || '', photoUrl: '' });
      const room = await createRoom(env, { title, hostUserId: user.id });
      const links = inviteLinks(env, origin, room.slug);
      await telegramCall(env, 'sendMessage', { chat_id: message.chat.id, text: `روم «${room.title}» ساخته شد.\n\nلینک دعوت:\n${links.inviteUrl}`, link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: 'ورود به روم', web_app: { url: links.webUrl } }]] } });
    }
  }
  return json({ ok: true });
}

async function api(request, env, url) {
  const path = url.pathname;
  if (path === '/health') return json({ ok: true, service: 'didar-worker', time: new Date().toISOString() });
  if (path === '/api/config') return json({ botUsername: env.BOT_USERNAME || '', allowDevAuth: env.ALLOW_DEV_AUTH === 'true', chatStatus: 'coming_soon' });
  if (request.method === 'POST' && path === '/api/auth') {
    try {
      const body = await request.json();
      let profile;
      if (body.initData) profile = await validateTelegramInitData(body.initData, env.BOT_TOKEN);
      else if (env.ALLOW_DEV_AUTH === 'true') profile = { telegramId: String(body.devUser?.telegramId || 'dev-1001'), firstName: text(body.devUser?.firstName || 'زهرا', 50), lastName: text(body.devUser?.lastName || 'محمدی', 50), username: 'didar_preview', photoUrl: '' };
      else return json({ error: 'این صفحه را داخل تلگرام باز کنید.' }, 401);
      const user = await upsertUser(env, profile);
      await ensureDevRoom(env, user);
      return json({ token: await createSessionToken(user, env.SESSION_SECRET), user: { id: user.id, firstName: user.first_name, lastName: user.last_name, photoUrl: user.photo_url }, botUsername: env.BOT_USERNAME || '', devMode: env.ALLOW_DEV_AUTH === 'true' && !body.initData });
    } catch (error) { return json({ error: error.message || 'ورود ناموفق بود.' }, 401); }
  }
  const webhook = path.match(/^\/api\/telegram\/webhook\/([^/]+)$/);
  if (request.method === 'POST' && webhook) return handleTelegram(request, env, url.origin, decodeURIComponent(webhook[1]));
  let auth;
  try { auth = await requireAuth(request, env); } catch { return json({ error: 'برای ادامه دوباره از تلگرام وارد شوید.' }, 401); }
  if (request.method === 'POST' && path === '/api/rooms') {
    try { const input = await request.json(); const room = await createRoom(env, { ...input, hostUserId: auth.sub }); return json({ ...room, ...inviteLinks(env, url.origin, room.slug) }, 201); }
    catch (error) { return json({ error: error.message || 'ساخت روم انجام نشد.' }, 400); }
  }
  const roomMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (request.method === 'GET' && roomMatch) {
    const room = await getRoom(env, decodeURIComponent(roomMatch[1]), auth.sub);
    return room ? json({ ...room, ...inviteLinks(env, url.origin, room.slug), chatStatus: 'coming_soon' }) : json({ error: 'این روم پیدا نشد یا لینک آن نادرست است.' }, 404);
  }
  const profileMatch = path.match(/^\/api\/rooms\/([^/]+)\/me$/);
  if (request.method === 'PUT' && profileMatch) {
    try {
      const room = await getRoom(env, decodeURIComponent(profileMatch[1]), auth.sub);
      if (!room) return json({ error: 'روم پیدا نشد.' }, 404);
      return json(await saveMember(env, room.id, auth.sub, await request.json()));
    } catch (error) { return json({ error: error.message || 'اطلاعات معتبر نیست.' }, 400); }
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname.startsWith('/api/')) return api(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
