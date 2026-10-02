# sticky-not (my work note)

تطبيق نوتس بالعربي — نفس التطبيق القديم (html + localStorage) دلوقتي موجود على:

- **React 18 (Vite)** — الواجهة
- **Node.js + Express** — الـ API (server)
- **Supabase (Postgres)** — التخزين

اللي بيتخزن في Supabase دلوقتي: اليوزرات، الصور الشخصية، المجلدات، والنوتس (بلايك: checklist + كتابة).

## البنية

```
├── client/    React + Vite (الواجهة)
├── server/    Express API + Supabase
├── supabase/  schema.sql (جداول + RLS)
└── .env       إعدادات الاتصال (مبتتكتبش في git)
```

## الإعداد

1. اعمل project في Supabase (https://supabase.com)
2. من **SQL Editor** شغّل ملف `supabase/schema.sql`
3. انسخ `.env.example` لـ `.env` وعبّي القيم:
   - `SUPABASE_URL` — من Settings → Project
   - `SUPABASE_SERVICE_ROLE_KEY` — من Settings → API (service_role)
   - `JWT_SECRET` — أي كلمة طويلة عشوائية
4. ثبّت الـ dependencies:

```bash
npm run setup
```

## التشغيل

```bash
npm run dev
```

- الواجهة: http://localhost:5173
- الـ API: http://localhost:4000

## الإنتاج (production)

```bash
npm run build   # يبني الواجهة في client/dist
npm start       # السيرفير بيقدّم الواجهة نفسها على http://localhost:4000
```

## ملاحظات

- مفيش باسورد: الدخول باليوزرنيم بس (زي النسخة القديمة)، والجلسة بتتم بي JWT.
- `SUPABASE_SERVICE_ROLE_KEY` لازم تبقى في السيرفر بس، مبقاش في المتصفح. التابلز محمية بـ RLS من أي وصول مباشر.
- `.env` في الـ `.gitignore` عشان كده مكتبتش في git.
