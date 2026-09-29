import { Bot, InlineKeyboard, webhookCallback } from 'grammy';

export function buildInviteLinks(config, slug) {
  return {
    web: `${config.appUrl}/r/${encodeURIComponent(slug)}`,
    telegram: config.botUsername
      ? `https://t.me/${config.botUsername}?startapp=${encodeURIComponent(slug)}`
      : `${config.appUrl}/r/${encodeURIComponent(slug)}`,
  };
}

export function createDidarBot({ config, db }) {
  if (!config.botToken) return null;
  const bot = new Bot(config.botToken);

  bot.command('start', async (ctx) => {
    const slug = String(ctx.match || '').trim();
    const target = slug ? `${config.appUrl}/r/${encodeURIComponent(slug)}` : config.appUrl;
    const keyboard = new InlineKeyboard().webApp(slug ? 'ورود به روم' : 'باز کردن دیدار', target);
    await ctx.reply(
      slug
        ? 'دعوت‌نامه آماده است؛ برای ورود به روم روی دکمه بزنید.'
        : 'به دیدار خوش آمدید؛ جایی برای پیدا کردن آدم‌های یک رویداد و گفت‌وگو با آن‌ها.',
      { reply_markup: keyboard },
    );
  });

  bot.command('newroom', async (ctx) => {
    const title = String(ctx.match || '').trim();
    if (title.length < 2) {
      await ctx.reply('بعد از دستور، نام روم را بنویسید. مثال:\n/newroom شب دیدار');
      return;
    }
    const from = ctx.from;
    const user = db.upsertUser({
      telegramId: String(from.id), firstName: from.first_name,
      lastName: from.last_name || '', username: from.username || '', photoUrl: '',
    });
    const room = db.createRoom({ title: title.slice(0, 70), hostUserId: user.id });
    const links = buildInviteLinks(config, room.slug);
    const keyboard = new InlineKeyboard().webApp('ورود به روم', links.web).url('اشتراک دعوت‌نامه', links.telegram);
    await ctx.reply(`روم «${room.title}» ساخته شد.\n\nلینک دعوت:\n${links.telegram}`, {
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('help', (ctx) => ctx.reply(
    'دستورها:\n/start — باز کردن دیدار\n/newroom نام روم — ساخت روم تازه\n/help — راهنما',
  ));
  bot.catch((error) => console.error('Telegram bot error:', error.error));

  return {
    bot,
    webhook: webhookCallback(bot, 'express'),
  };
}
