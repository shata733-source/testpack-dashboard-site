# V30 Dashboard B Item KPI Fix

هذا الباتش يعالج خطأ 503 في `/api/bitem/kpi` ويمنع الداش بورد من إرسال طلبات KPI متكررة بشكل سريع.

## الملفات
- `dashboard.html`
- `functions/api/bitem/kpi.js`
- `functions/_shared/auth.js`

## المطلوب بعد الرفع
- Redeploy
- Ctrl + F5
- فتح الداش بورد بعد Login

## ملاحظات
- لا تعمل SQL Reset.
- لا تعمل D1 Reset.
- لا تعمل Clear Deltas.
