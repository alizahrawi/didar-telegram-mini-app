import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { createDatabase } from './database.js';
import { authMiddleware, createSessionToken, validateTelegramInitData, verifySessionToken } from './auth.js';
import { createDidarBot, buildInviteLinks } from './bot.js';
import { messageSchema, profileSchema, roomSchema, validationError } from './validation.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(dirname, '../public');
const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { serveClient: true });
const db = createDatabase(config.sqlitePath);
const requireAuth = authMiddleware(config.sessionSecret);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://telegram.org'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      frameAncestors: ["'self'", 'https://web.telegram.org'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'didar', time: new Date().toISOString() }));

app.post('/api/auth', (req, res) => {
  try {
    let telegramUser;
    if (req.body?.initData) {
      telegramUser = validateTelegramInitData(req.body.initData, config.botToken);
    } else if (config.allowDevAuth) {
      const supplied = req.body?.devUser || {};
      telegramUser = {
        telegramId: String(supplied.telegramId || 'dev-1001'),
        firstName: String(supplied.firstName || 'زهرا').slice(0, 50),
        lastName: String(supplied.lastName || 'محمدی').slice(0, 50),
        username: 'didar_preview', photoUrl: '', languageCode: 'fa',
      };
    } else {
      return res.status(401).json({ error: 'این صفحه را داخل تلگرام باز کنید.' });
    }
    const user = db.upsertUser(telegramUser);
    const token = createSessionToken(user, config.sessionSecret);
    return res.json({
      token,
      user: { id: user.id, firstName: user.first_name, lastName: user.last_name, photoUrl: user.photo_url },
      botUsername: config.botUsername,
      devMode: config.allowDevAuth && !req.body?.initData,
    });
  } catch (error) {
    return res.status(401).json({ error: error.message || 'ورود ناموفق بود.' });
  }
});

app.get('/api/rooms/:slug', requireAuth, (req, res) => {
  const room = db.getRoom(req.params.slug, req.auth.sub);
  if (!room) return res.status(404).json({ error: 'این روم پیدا نشد یا لینک آن نادرست است.' });
  const links = buildInviteLinks(config, room.slug);
  return res.json({ ...room, inviteUrl: links.telegram, webUrl: links.web });
});

app.post('/api/rooms', requireAuth, (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationError(parsed.error) });
  try {
    const room = db.createRoom({ ...parsed.data, hostUserId: req.auth.sub });
    return res.status(201).json({ ...room, ...buildInviteLinks(config, room.slug) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'ساخت روم انجام نشد.' });
  }
});

app.put('/api/rooms/:slug/me', requireAuth, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationError(parsed.error) });
  const room = db.getRoom(req.params.slug, req.auth.sub);
  if (!room) return res.status(404).json({ error: 'روم پیدا نشد.' });
  const member = db.saveMember(room.id, req.auth.sub, parsed.data);
  io.to(`room:${room.id}`).emit('member:updated', member);
  return res.json(member);
});

app.get('/api/rooms/:slug/messages', requireAuth, (req, res) => {
  const room = db.getRoom(req.params.slug, req.auth.sub);
  if (!room) return res.status(404).json({ error: 'روم پیدا نشد.' });
  if (!room.me) return res.status(403).json({ error: 'ابتدا پروفایل خود را به روم اضافه کنید.' });
  return res.json({ messages: db.listMessages(room.id) });
});

app.get('/api/config', (_req, res) => res.json({
  botUsername: config.botUsername,
  allowDevAuth: config.allowDevAuth,
}));

const botService = createDidarBot({ config, db });
if (botService && config.botMode === 'webhook') {
  app.post(`/api/telegram/webhook/${config.webhookSecret}`, botService.webhook);
}

io.use((socket, next) => {
  try {
    socket.auth = verifySessionToken(socket.handshake.auth?.token, config.sessionSecret);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.on('room:join', ({ slug }, reply = () => {}) => {
    const room = db.getRoom(String(slug || ''), socket.auth.sub);
    if (!room || !room.me) return reply({ error: 'ابتدا پروفایل خود را به روم اضافه کنید.' });
    socket.join(`room:${room.id}`);
    return reply({ ok: true, messages: db.listMessages(room.id) });
  });

  socket.on('message:send', ({ slug, body }, reply = () => {}) => {
    const parsed = messageSchema.safeParse({ body });
    if (!parsed.success) return reply({ error: validationError(parsed.error) });
    const room = db.getRoom(String(slug || ''), socket.auth.sub);
    if (!room || !room.me) return reply({ error: 'عضویت در روم لازم است.' });
    const message = db.createMessage(room.id, socket.auth.sub, parsed.data.body);
    io.to(`room:${room.id}`).emit('message:new', message);
    return reply({ ok: true });
  });
});

app.use(express.static(publicDir, { maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(publicDir, 'index.html'));
  return next();
});

if (config.allowDevAuth) db.ensureDemoData();

server.listen(config.port, () => {
  console.log(`Didar is running at ${config.appUrl}`);
  if (config.allowDevAuth) console.log(`Preview room: ${config.appUrl}/r/shab-didar`);
  if (botService && config.botMode === 'polling') {
    botService.bot.start({ onStart: () => console.log('Telegram bot polling started.') });
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
