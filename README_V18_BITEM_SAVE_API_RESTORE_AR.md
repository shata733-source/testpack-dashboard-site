V18 B Item Save API Restore

الغرض:
- إصلاح رسالة Save failed: <!DOCTYPE html> عند حفظ Punch Cleared Date.
- سبب الرسالة أن endpoint /api/bitem/edit يرجع صفحة HTML بدل JSON، غالباً لأن functions الخاصة بالـ B Item غير مرفوعة/غير متزامنة على الـ preview deployment.

محتوى الباتش:
- bitem.html من V17 بدون Auto Logout.
- functions/ كاملة اللازمة للـ auth + bitem + users، حتى يرجع /api/bitem/edit JSON صحيح.

طريقة الرفع:
- ارفع محتويات الباتش كما هي على multipage-preview.
- مهم جداً رفع فولدر functions بالكامل، وليس bitem.html فقط.
- لا تعمل SQL Reset.
- لا تعمل D1 Reset.

بعد الرفع:
1. Redeploy
2. Ctrl + F5 أو InPrivate
3. افتح /api/bitem/edit في المتصفح. ممكن يظهر 405/Method not allowed أو Not found للـ GET، لكن عند الحفظ من الصفحة يجب أن يرجع JSON وليس HTML.
4. جرّب Edit ثم Save.
