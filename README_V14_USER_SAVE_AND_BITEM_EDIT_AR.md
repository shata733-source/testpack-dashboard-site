# V14 User Save + B Item Single Row Edit Fix

## التعديلات

1. إصلاح خطأ:
   `NOT NULL constraint failed: users.password_plain`

   السبب أن قاعدة D1 عندك فيها جدول users قديم فيه العمود `password_plain` معمول NOT NULL. الكود الجديد كان بيخزن الباسورد Hash فقط وبيترك `password_plain` فاضي/NULL، فـ D1 كان بيرفض إضافة اليوزر.

   الحل في V14: نخزن قيمة فاضية آمنة `''` في `password_plain` مع استمرار الاعتماد على `password_hash/password_salt` في تسجيل الدخول.

2. السماح بالـ username كإيميل مثل:
   `MShata@ccc.net`

3. إصلاح B Item Control:
   - التعديل لا يفتح إلا من زر Edit في الصف المختار.
   - الضغط على خلية التاريخ في أي صف تاني لا يفتح Edit.
   - لا يوجد إلا صف واحد في وضع Edit في نفس الوقت.
   - زر X يلغي التعديل ويعيد القيمة القديمة.

## ارفع

- `functions/`
- `bitem.html`
- `users.html`

## لا تعمل

- SQL Reset
- D1 Reset
- Delete لأي جدول
