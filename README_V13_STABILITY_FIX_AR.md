# V13 Stability Fix

التعديل يعالج:

1. السماح بإضافة Username بصيغة Email مثل MShata@ccc.net.
2. منع الخروج التلقائي من Dashboard بسبب Bad JSON مؤقت من auth/me.
3. إصلاح Login API بحيث يرجع JSON واضح بدل Bad JSON إذا حصل خطأ.
4. إصلاح B Item Edit بحيث يفتح الصف المختار فقط.
5. زر X في Inline Edit يلغي التعديل ويرجع الخلية كما كانت بدون إعادة فتح التعديل.
6. حفظ B Item يعتمد على fingerprint كـ unique key حتى لو B Item ID متكرر.
7. الحفاظ على Page Permissions Matrix كما هي.

ارفع الباتش على multipage-preview، واعمل Redeploy و Ctrl+F5.
بدون SQL Reset وبدون حذف D1.
