import crypto from 'node:crypto';

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function validateTelegramInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!initData || !botToken) throw new Error('Telegram authentication is unavailable.');

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !authDate) throw new Error('Telegram init data is incomplete.');
  if (nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS || authDate > nowSeconds + 60) {
    throw new Error('Telegram init data has expired.');
  }

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!safeEqual(calculatedHash, receivedHash)) throw new Error('Telegram signature is invalid.');

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    throw new Error('Telegram user payload is invalid.');
  }
  if (!user?.id || !user?.first_name) throw new Error('Telegram user payload is missing.');

  return {
    telegramId: String(user.id),
    firstName: user.first_name,
    lastName: user.last_name || '',
    username: user.username || '',
    photoUrl: user.photo_url || '',
    languageCode: user.language_code || 'fa',
  };
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(user, secret, ttlSeconds = 7 * 24 * 60 * 60) {
  const body = Buffer.from(JSON.stringify({
    sub: user.id,
    tid: user.telegram_id,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(token, secret) {
  if (!token || !token.includes('.')) throw new Error('Missing session.');
  const [body, signature] = token.split('.');
  if (!safeEqual(sign(body, secret), signature)) throw new Error('Invalid session.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Expired session.');
  return payload;
}

export function authMiddleware(secret) {
  return (req, res, next) => {
    try {
      const header = req.get('authorization') || '';
      req.auth = verifySessionToken(header.replace(/^Bearer\s+/i, ''), secret);
      next();
    } catch {
      res.status(401).json({ error: 'برای ادامه دوباره از تلگرام وارد شوید.' });
    }
  };
}
