# sticky-not (my work note)

تطبيق نوتس بالعربي — نفس التطبيق القديم (html + localStorage) دلوقتي موجود على:

- **React 18 (Vite)** — الواجهة
- **Node.js + Express** — الـ API
- **Supabase (Postgres)** — التخزين

اللي بيتخزن في Supabase: اليوزرات، الصور الشخصية، المجلدات، والنوتس (checklist + كتابة).

## البنية

```
├── api/         Express app — شغال محلياً كسيرفر، وعلى Vercel كـ serverless function
├── src/         كومبوننتات الواجهة (React)
├── supabase/    schema.sql (جداول + RLS)
├── vite.config.js / index.html / package.json
└── .env         إعدادات الاتصال (مبتتكتبش في git)
```

الـ API بتاعه ملف واحد `api/index.js` بيشتغل في الاتنين:
- محلي: `node api/index.js` (سيرفر على البورت 4000)
- Vercel: أي request على `/api/*` بيوصله مباشرة كـ function

## إعداد Supabase

1. اعمل project في Supabase (https://supabase.com)
2. من **SQL Editor** شغّل ملف `supabase/schema.sql`
3. انسخ `.env.example` لـ `.env` وعبّي القيم:
   - `SUPABASE_URL` — من Settings → Project
   - `SUPABASE_SERVICE_ROLE_KEY` — من Settings → API (service_role)
   - `JWT_SECRET` — أي كلمة طويلة عشوائية

## التشغيل محلياً

```bash
npm install
npm run dev
```

- الواجهة: http://localhost:5173
- الـ API: http://localhost:4000

## النشر على Vercel

1. من [vercel.com](https://vercel.com) → **Add New → Project** → اختار repo `Blood-Boy/sticky-not`
2. Vercel هتكتشف Vite تلقائياً — تقدر تسيب الإعدادات افتراضية (Build Command: `npm run build`، Output: `dist`)
3. في **Environment Variables** ضيف الاتلات:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
4. **Deploy** — الموقع هيخرج على `https://<name>.vercel.app`

كل الـ API على نفس الدومين (`/api/...`) فعلش CORS.

## الإنتاج على جهازك (بدون Vercel)

```bash
npm run build   # يبني الواجهة في dist/
npm start       # السيرفير بيقدّم الواجهة + الـ API على http://localhost:4000
```

## حسابات قديمة (اتعملت قبل الباسورد)

لو عندك حساب قديم من غير باسورد، شغّل مرة واحدة السطر ده في الـ SQL Editor عشان العمود يتضاف (لو الجدول متعمل قبل كده):

```sql
alter table public.profiles add column if not exists password_hash text;
```

وبعدين حط له باسورد من جهازك (من غير ما تمسح حاجة):

```bash
NEW_PASSWORD='باسوردك' node server/set-password.js اسم_اليوزر
```

## ملاحظات

- الدخول باليوزر والباسورد (6 حروف على الأقل). الباسورد بيتخزن مشفّر (scrypt) في `profiles.password_hash`، والجلسة بتتم بـ JWT.
- لازم تضبط `JWT_SECRET` في الإنتاج، السيرفر مش هيشتغل من غيره.
- `SUPABASE_SERVICE_ROLE_KEY` لازم تبقى في السيرفر/الـ function بس، مش في المتصفح. الجداول محمية بـ RLS من أي وصول مباشر.
- `.env` في الـ `.gitignore` عشان كده مكتبتش في git.
