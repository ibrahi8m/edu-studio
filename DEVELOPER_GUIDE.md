# دليل المطوّر — IBRAHI8M EDU STUDIO 1.5.0

## التقنيات

- **الواجهة:** React 18 وTypeScript وVite 5، بتوجيه HashRouter.
- **البيانات:** Dexie (IndexedDB)، والمخطط v8.
- **العمل دون إنترنت:** PWA عبر vite-plugin-pwa (Service Worker).
- **Windows:** Electron 38 وelectron-builder (NSIS + Portable).
- **Android:** غلاف WebView بلغة Java، يُبنى بأدوات Android الأساسية دون Gradle.
- **iOS:** Capacitor 6 (مشروع Xcode).
- **الاختبارات:** Vitest للوحدات، وPlaywright للمتصفح (5 مقاسات) ولتطبيق Electron.

## بنية المجلدات

| المجلد | المحتوى |
| --- | --- |
| `src/` | التطبيق: الصفحات والمكوّنات والبيانات |
| `src/aistudio/` | AI Design Studio: `engine.ts` المحرك، و`catalog.ts` الخيارات، و`brandSpec.ts` **المرجع الوحيد لمواصفات الشعار والهويات** |
| `public/brand/` | ملفات الشعار الأصلية (SVG وPNG) |
| `electron/` | غلاف سطح المكتب |
| `android/` | غلاف Android: `MainActivity.java` والموارد و`build-apk.sh` |
| `ios/` | مشروع iOS (Capacitor) و`README.md` |
| `tests/unit` و`tests/e2e` و`tests/desktop` | الاختبارات |
| `scripts/` | بناء الدليل PDF، والنشر على Pages، وبناء الإصدارات القديمة لاختبار الترقية |

## الأوامر

```bash
npm ci
npm run dev                 # تطوير
npm run build               # بناء الويب + فحص الروابط الخارجية → dist/
npm test                    # اختبارات الوحدة
npm run test:e2e            # اختبارات المتصفح (حوالي 1.5 ساعة)
xvfb-run -a npm run test:desktop
npx electron-builder --win nsis --x64       # ملف التثبيت (على Linux يحتاج Wine)
npx electron-builder --win portable --x64   # النسخة المحمولة
android/build-apk.sh        # APK (بعد npm run build)
cd ios && npm ci && npx cap sync ios        # على Mac، ثم npx cap open ios
scripts/publish-pages.sh    # نشر dist/ على GitHub Pages
```

## تعديل الشعار أو الهوية

1. استبدل ملفات `public/brand/`.
2. حدّث `src/aistudio/brandSpec.ts`: الألوان والقياسات والوصف.
3. شغّل `npm test`. الاختبار «specification matches the real logo file» يفشل إذا اختلف المرجع عن ملف SVG.

## الحسابات والصلاحيات (1.5.0)

| الملف | الدور |
| --- | --- |
| `src/auth/types.ts` | الأدوار، و`canAccess(role, path)` لقواعد المسارات، و`homeFor` |
| `src/auth/local.ts` | الحسابات المحلية: PBKDF2-SHA-256 (210 ألف تكرار)، والجلسة، والقفل بعد 5 محاولات، ورمز الاستعادة، وعمليات الأدمن. كل عملية تتحقق من الدور |
| `src/auth/cloud.ts` | Supabase عبر REST: الرابط والمفتاح المنشور فقط |
| `src/auth/session.ts` | الحالة الموحّدة: `useAuth`، `signIn`، `signOut`، `revalidate` |
| `src/auth/access.ts` | من يرى أي محتوى ومن يعدّله (`ownerId`). تستدعيه دوال الحفظ في `db/projects.ts` و`db/quizzes.ts` و`db/lessonDocs.ts` و`db/designs.ts` |
| `src/auth/AuthPages.tsx`، `UsersPages.tsx` | الدخول، وأول تشغيل، والاستعادة، والتسجيل السحابي، والحارس `RequireAuth`، و«حسابي»، و«المستخدمون» |
| `supabase/schema.sql` | جدول `profiles` وقواعد RLS والمشغّلات |

**الاختبارات:**
- `tests/e2e/auth-setup.ts` ينشئ حساب أدمن اختباريًا ويبدأ به كل اختبار، وكلمة مروره داخل ملف الاختبار فقط.
- `tests/e2e/auth.spec.ts` يبدأ دون أي حساب.
- اختبار Supabase يستخدم خادمًا وهميًا (`page.route`).

**CSP:** `connect-src` يسمح بنطاق مشروع Supabase وحده، والسكربت `scripts/check-offline.mjs` يسمح به وحده كذلك.

## مفاتيح التوقيع

**لا توجد مفاتيح في المستودع.**

- **Android:** `build-apk.sh` ينشئ مفتاح اختبار محليًا في `android/.keys/` (مستثنى من Git). لمفتاحك الخاص اضبط `ANDROID_KEYSTORE` و`ANDROID_KEYSTORE_PASS` و`ANDROID_KEY_ALIAS`.
- **Windows:** يُبنى دون توقيع.
