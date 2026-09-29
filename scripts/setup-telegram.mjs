import 'dotenv/config';

const token = process.env.BOT_TOKEN;
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
const mode = process.env.BOT_MODE || 'webhook';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

if (!token || !appUrl) {
  console.error('BOT_TOKEN and APP_URL are required.');
  process.exit(1);
}
if (!appUrl.startsWith('https://')) {
  console.error('APP_URL must be a public HTTPS URL for Telegram.');
  process.exit(1);
}
if (mode === 'webhook' && !/^[A-Za-z0-9_-]{12,256}$/.test(secret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET must contain 12–256 letters, numbers, underscores, or hyphens.');
  process.exit(1);
}

const api = `https://api.telegram.org/bot${token}`;
async function call(method, body) {
  const response = await fetch(`${api}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(`${method}: ${result.description}`);
  console.log(`✓ ${method}`);
  return result.result;
}

await call('setMyCommands', { commands: [
  { command: 'start', description: 'باز کردن دیدااار' },
  { command: 'newroom', description: 'ساخت روم جدید' },
  { command: 'help', description: 'راهنما' },
] });
await call('setChatMenuButton', {
  menu_button: { type: 'web_app', text: 'باز کردن دیدااار', web_app: { url: appUrl } },
});

if (mode === 'webhook') {
  await call('setWebhook', {
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
} else {
  await call('deleteWebhook', { drop_pending_updates: false });
}

console.log('\nTelegram bot configuration completed.');
console.log('One manual step remains: configure the Main Mini App in @BotFather.');
