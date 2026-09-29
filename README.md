# دیدار — Telegram Mini App MVP

«دیدار» یک Mini App واقعی برای رویدادها و مهمانی‌های کاری است. هر رویداد یک Room با لینک دعوت دارد؛ مهمان‌ها با هویت تلگرام وارد می‌شوند، پروفایل و لینک‌های اجتماعی‌شان را می‌سازند و در گفت‌وگوی عمومی زنده شرکت می‌کنند.

## امکانات آماده

- ورود امن با `Telegram.WebApp.initData` و اعتبارسنجی HMAC در سرور
- ساخت Room از داخل وب‌اپ یا با دستور `/newroom` در بات
- لینک دعوت مستقیم به Mini App با `startapp=<room-slug>`
- پروفایل عضو شامل نام، عنوان شغلی، معرفی، تصویر، Instagram، Story و LinkedIn
- کارت‌های دایره‌ای اعضا و دکمه `+` برای اضافه شدن
- Public Chat زنده با Socket.IO؛ فقط اعضای همان Room امکان خواندن/نوشتن دارند
- رابط کاملاً فارسی، RTL، واکنش‌گرا و مناسب WebView تلگرام
- نسخه پیش‌نمایش مرورگری برای توسعه، بدون ایجاد رخنه در محیط production
- دیتابیس SQLite با WAL و فایل پایدار؛ بدون سرویس دیتابیس جداگانه برای MVP
- Docker، Render Blueprint، health check و تست خودکار

## معماری MVP

```text
Telegram Client / Browser
          │
          ├── Static RTL UI (HTML/CSS/JS)
          ├── REST API (auth, rooms, profiles)
          └── Socket.IO (public room chat)
                         │
                  Express + grammY
                         │
                  SQLite persistent file
```

تمام اجزا در یک سرویس Node.js اجرا می‌شوند. این مدل برای شروع، کم‌هزینه و قابل نگهداری است. برای رشد بعدی می‌توان لایه دیتابیس را به PostgreSQL و چت را به Redis Adapter منتقل و چند instance اجرا کرد.

## اجرای محلی

نیازمندی: Node.js 22.5 یا جدیدتر.

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

سپس آدرس زیر را باز کنید:

```text
http://localhost:3000/r/shab-didar
```

در `.env` محلی، `ALLOW_DEV_AUTH=true` است و داده نمونه ساخته می‌شود. در production این مقدار باید حتماً `false` باشد و برنامه نیز اجازه روشن بودن آن را نمی‌دهد.

## متغیرهای محیطی

| متغیر | کاربرد | نمونه |
|---|---|---|
| `APP_URL` | آدرس عمومی HTTPS | `https://didar.example.com` |
| `BOT_TOKEN` | توکن دریافتی از BotFather | محرمانه |
| `BOT_USERNAME` | نام کاربری بات بدون `@` | `didar_app_bot` |
| `SESSION_SECRET` | امضای نشست، حداقل ۳۲ کاراکتر | مقدار تصادفی و محرمانه |
| `SQLITE_PATH` | مسیر فایل دیتابیس | `/var/data/didar.db` |
| `BOT_MODE` | `webhook` در production، `polling` در توسعه، یا `disabled` | `webhook` |
| `TELEGRAM_WEBHOOK_SECRET` | بخش غیرقابل حدس URL وب‌هوک | مقدار تصادفی |
| `ALLOW_DEV_AUTH` | فقط پیش‌نمایش محلی | `false` در production |

## راه‌اندازی BotFather و Mini App

1. در [@BotFather](https://t.me/BotFather) دستور `/newbot` را اجرا کنید، نام و username بدهید و `BOT_TOKEN` را ذخیره کنید.
2. از مسیر **Bot Settings → Configure Mini App → Enable Mini App**، آدرس HTTPS استقرار را به‌عنوان Main Mini App ثبت کنید. اگر BotFather از شما short name خواست، مثلاً `didar` را انتخاب کنید.
3. دامنه باید HTTPS معتبر داشته باشد؛ `localhost` داخل تلگرام باز نمی‌شود.
4. متغیرهای production را تنظیم و سرویس را deploy کنید.
5. بعد از بالا آمدن سرویس، یک بار فرمان زیر را با همان متغیرهای محیطی اجرا کنید:

   ```bash
   npm run bot:setup
   ```

   این اسکریپت commandها، دکمه منو و webhook را تنظیم می‌کند. تنظیم Main Mini App در BotFather یک مرحله دستی است.

6. برای تست، بات را باز کنید و `/start` بزنید. ساخت روم از طریق `/newroom شب دیدار` یا دکمه `+` بالای وب‌اپ ممکن است.

لینک دعوت تولیدشده این الگو را دارد:

```text
https://t.me/BOT_USERNAME?startapp=ROOM_SLUG
```

تلگرام `ROOM_SLUG` را در `start_param` به Mini App می‌دهد و همان Room بارگذاری می‌شود.
شناسه Room فقط از حروف لاتین، عدد و خط تیره ساخته می‌شود تا با محدودیت deep link تلگرام سازگار بماند؛ عنوان فارسی Room بدون تغییر نمایش داده می‌شود.

## استقرار روی Render

فایل `render.yaml` سرویس، persistent disk و متغیرها را تعریف کرده است:

1. این پوشه را در یک repository خصوصی Git قرار دهید.
2. در Render گزینه **New Blueprint** را انتخاب و repository را متصل کنید.
3. برای `APP_URL` آدرس نهایی Render و برای `BOT_TOKEN` و `BOT_USERNAME` مقادیر بات را وارد کنید.
4. deploy را انجام دهید؛ سپس در Shell سرویس `npm run bot:setup` را یک بار اجرا کنید.
5. همان `APP_URL` را در BotFather برای Main Mini App وارد کنید.

دیسک persistent در Render برای نگهداری SQLite لازم است. سرویس باید یک instance داشته باشد. اگر چند instance یا ترافیک بالاتر لازم شد، مهاجرت به PostgreSQL توصیه می‌شود.

اجرای مستقل با Docker نیز آماده است:

```bash
docker compose up -d --build
```

برای production پشت reverse proxy با TLS قرار دهید.

## محدودیت واقعی Instagram Story

Instagram API اجازه نمی‌دهد یک اپ عمومی، استوری هر کاربر را صرفاً با username دریافت کند. دسترسی رسمی به محتوای Instagram نیازمند حساب‌ها و مجوزهای Meta و سناریوهای محدود است؛ ضمن اینکه Story معمولاً پس از ۲۴ ساعت منقضی می‌شود.

راهکار MVP دیدار این است که خود کاربر لینک Profile یا Story را paste کند. دیدار آن لینک را ذخیره و با لمس عکس در Instagram باز می‌کند. اگر Story حذف یا منقضی شده باشد، خود Instagram خطا نشان می‌دهد؛ کاربر می‌تواند لینک را از ویرایش پروفایل پاک یا جایگزین کند. هیچ scraping یا دور زدن API انجام نمی‌شود.

## امنیت و حریم خصوصی

- داده `initDataUnsafe` برای احراز هویت استفاده نمی‌شود؛ رشته خام `initData` با توکن بات در سرور اعتبارسنجی می‌شود.
- نشست‌ها امضاشده و دارای انقضای ۷ روزه‌اند.
- متن پیام و داده پروفایل محدودیت طول و URLها محدودیت دامنه دارند.
- چت تنها پس از عضویت در Room قابل دسترسی است.
- توکن بات و secretها نباید وارد Git شوند.
- لینک‌های اجتماعی برای هر کاربری که لینک دعوت Room را دارد و با تلگرام وارد شده قابل مشاهده‌اند؛ این موضوع باید در سیاست حریم خصوصی نسخه عمومی ذکر شود.

## تست و پایش

```bash
npm test
curl https://YOUR-DOMAIN/health
```

تست‌ها امضای Telegram، دستکاری و انقضای init data، نشست، ساخت Room، عضویت و پیام را پوشش می‌دهند.
