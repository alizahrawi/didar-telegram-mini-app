# دیدار — Telegram Mini App سرورلس

«دیدار» یک Mini App فارسی برای رویدادها و مهمانی‌های کاری است. هر رویداد یک Room و لینک دعوت دارد؛ مهمان‌ها با هویت تلگرام وارد می‌شوند، پروفایل و لینک‌های اجتماعی خود را اضافه می‌کنند و افراد حاضر را می‌بینند.

## وضعیت MVP

- ورود امن با `Telegram.WebApp.initData`
- ساخت Room از داخل Mini App یا دستور `/newroom` بات
- دعوت مستقیم با `https://t.me/BOT_USERNAME?startapp=ROOM_SLUG`
- پروفایل عضو، عنوان شغلی، معرفی، تصویر، Instagram، Story و LinkedIn
- رابط مدرن فارسی RTL و واکنش‌گرا
- اجرای کاملاً serverless روی Cloudflare Workers
- دیتابیس پایدار Cloudflare D1
- چت عمومی در UI با برچسب «به‌زودی»؛ زیرساخت real-time در این نسخه وجود ندارد

## معماری

```text
Telegram Mini App / Browser
        │
        ├── Static Assets ───── Cloudflare Workers Assets
        ├── REST API ────────── Cloudflare Worker
        ├── Telegram Webhook ── Cloudflare Worker
        └── Rooms & Profiles ── Cloudflare D1
```

Worker و فایل‌های رابط با یک deploy روی شبکه Cloudflare منتشر می‌شوند. هیچ VPS، پردازش همیشه‌روشن، Docker، Socket.IO یا دیسک سروری لازم نیست.

## اجرای محلی

نیازمندی: Node.js جدید و npm.

```bash
npm install
copy .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

سپس `http://localhost:8787/r/shab-didar` را باز کنید. حالت توسعه با `ALLOW_DEV_AUTH=true` یک Room نمونه می‌سازد. این متغیر در production همیشه `false` می‌ماند.

## استقرار Cloudflare

### ۱. ورود

```bash
npx wrangler login
```

مرورگر برای ورود یا ساخت حساب Cloudflare باز می‌شود.

### ۲. ساخت D1

```bash
npx wrangler d1 create didar-db --location=weur
```

شناسه `database_id` خروجی را جایگزین مقدار صفر در `wrangler.jsonc` کنید.

### ۳. اجرای migration

```bash
npm run db:migrate
```

### ۴. ثبت secretها

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put BOT_USERNAME
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

`SESSION_SECRET` باید حداقل ۳۲ کاراکتر تصادفی باشد. `TELEGRAM_WEBHOOK_SECRET` نیز یک مقدار تصادفی و غیرقابل حدس است. secretها هرگز در Git ذخیره نمی‌شوند.

### ۵. انتشار

```bash
npm run deploy
```

خروجی، آدرسی شبیه زیر خواهد بود:

```text
https://didar-mini-app.YOUR_SUBDOMAIN.workers.dev
```

اگر دامنه اختصاصی ندارید همان `workers.dev` برای Telegram Mini App قابل استفاده است.

## اتصال بات و BotFather

بعد از deploy، `.env.example` را به `.env` کپی و `APP_URL`، `BOT_TOKEN`، `BOT_USERNAME` و `TELEGRAM_WEBHOOK_SECRET` را فقط روی سیستم محلی مقداردهی کنید. سپس:

```bash
npm run bot:setup
```

این دستور commandهای بات، دکمه منو و webhook را تنظیم می‌کند.

در [@BotFather](https://t.me/BotFather):

1. از **Bot Settings → Configure Mini App**، آدرس `workers.dev` را به‌عنوان Main Mini App ثبت کنید.
2. اگر short name خواسته شد، `didar` را انتخاب کنید.
3. برای تست `/start` و برای ساخت Room دستور `/newroom شب دیدار` را بفرستید.

## متغیرهای Worker

| متغیر | نوع | کاربرد |
|---|---|---|
| `BOT_TOKEN` | Secret | توکن بات |
| `BOT_USERNAME` | Secret | username بات بدون `@` |
| `SESSION_SECRET` | Secret | امضای نشست‌های دیدار |
| `TELEGRAM_WEBHOOK_SECRET` | Secret | محافظت از مسیر webhook |
| `APP_URL` | اختیاری | دامنه اختصاصی؛ در حالت عادی origin خود Worker استفاده می‌شود |
| `ALLOW_DEV_AUTH` | عادی | فقط توسعه محلی؛ production برابر `false` |

## محدودیت Instagram Story

Instagram اجازه دریافت خودکار Story همه کاربران را صرفاً با username نمی‌دهد و Story نیز معمولاً موقت است. در MVP کاربر لینک Profile یا Story را خودش وارد می‌کند. دیدار لینک را ذخیره و با لمس تصویر در Instagram باز می‌کند؛ هیچ scraping انجام نمی‌شود.

## چت

نسخه فعلی هیچ پیام چتی ذخیره یا پردازش نمی‌کند و پنل آن با عبارت «به‌زودی» نمایش داده می‌شود. در نسخه بعد می‌توان چت real-time را با Cloudflare Durable Objects اضافه کرد، بدون بازگرداندن سرور سنتی.

## امنیت

- رشته خام `initData` در Worker با HMAC رسمی تلگرام اعتبارسنجی می‌شود.
- نشست‌ها امضاشده و دارای انقضای هفت‌روزه‌اند.
- URLهای Instagram و LinkedIn محدود به دامنه‌های مربوطه‌اند.
- D1 با binding داخلی Worker در دسترس است و credential دیتابیس در مرورگر قرار نمی‌گیرد.
- `BOT_TOKEN` و secretها نباید در Git یا گفتگوها قرار گیرند.

## تست

```bash
npm test
```

تست‌ها اعتبارسنجی Telegram، رد داده دستکاری‌شده یا منقضی، نشست و slug امن برای deep link را پوشش می‌دهند.
