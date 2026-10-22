# IBRAHI8M EDU STUDIO — iOS (مصدر للبناء، وليس تطبيقًا جاهزًا)

هذا المجلد **مشروع Xcode** يغلّف تطبيق الويب نفسه في WebView عبر Capacitor 6.
أُنشئ على Linux. **لم يُبنَ ولم يُشغَّل على iPhone أو على محاكي iOS**، لأن ذلك يحتاج macOS وXcode.
**لا توجد حزمة IPA.**

## المتطلبات

- جهاز Mac عليه Xcode 15 أو أحدث، وCocoaPods (`sudo gem install cocoapods`).
- Node.js 18 أو أحدث.
- حساب Apple Developer للتثبيت على جهاز حقيقي أو للنشر. التشغيل على المحاكي لا يحتاجه.

## البناء

```bash
# من جذر المشروع: ابنِ نسخة الويب أولًا
npm ci && npm run build
cd ios
npm ci
npx cap sync ios          # ينسخ dist/ إلى ios/App/App/public ويشغّل pod install
npx cap open ios          # يفتح المشروع في Xcode
```

ثم في Xcode:

1. اختر فريق التوقيع (Signing & Capabilities ← Team).
2. اختر جهازًا أو محاكيًا.
3. اضغط Run.

للنشر: Product ← Archive.

## الإصدار

- **رقم الإصدار:** `MARKETING_VERSION = 1.6.0`.
- **رقم البناء:** `CURRENT_PROJECT_VERSION = 10600`.
- **معرّف التطبيق:** `app.ibrahi8m.edustudio`.

## حدود معروفة على iOS

- **التنزيلات** (TXT وPNG والنسخ الاحتياطية) لا تعمل كما هي داخل WebView على iOS. الجسر الموجود مخصص لـ Android. تحتاج إضافة Capacitor مثل `@capacitor/filesystem` و`@capacitor/share` وربطها، ولم يُنفَّذ ذلك ولم يُختبر.
- **الطباعة وحفظ PDF** من «صفحتي» غير مضمونين داخل WebView.
- **بديل يعمل الآن على iPhone:** افتح https://ibrahi8m.github.io/edu-studio/ في Safari، ثم «مشاركة» ← «إضافة إلى الشاشة الرئيسية».
