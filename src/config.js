import 'dotenv/config';
import path from 'node:path';

function asBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export const config = {
  port: Number(process.env.PORT || 3000),
  appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, ''),
  botToken: process.env.BOT_TOKEN || '',
  botUsername: (process.env.BOT_USERNAME || '').replace(/^@/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-this-secret-immediately',
  sqlitePath: path.resolve(process.env.SQLITE_PATH || './data/didar.db'),
  allowDevAuth: asBoolean(process.env.ALLOW_DEV_AUTH, process.env.NODE_ENV !== 'production'),
  nodeEnv: process.env.NODE_ENV || 'development',
  botMode: process.env.BOT_MODE || 'disabled',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || 'telegram-webhook',
};

if (config.nodeEnv === 'production') {
  if (config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
  }
  if (config.allowDevAuth) {
    throw new Error('ALLOW_DEV_AUTH must be false in production.');
  }
}
