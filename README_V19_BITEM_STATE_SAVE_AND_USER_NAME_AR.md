V19 B Item State Save + User Cleared Stable Name

الغرض:
- إصلاح استمرار رسالة Save failed: <!DOCTYPE html> عند الضغط على ✓.
- تحويل حفظ B Item من endpoint /api/bitem/edit إلى endpoint /api/bitem/state?op=edit لأن state endpoint هو المستخدم فعليًا في تحميل الصفوف.
- إضافة POST handler داخل functions/api/bitem/state.js لتنفيذ نفس عملية الحفظ وتحديث D1.
- تثبيت عمود USER CLEARED ليعرض اسم اليوزر فقط ولا يتبدل بين التاريخ واسم اليوزر.

طريقة الرفع:
- ارفع محتويات الباتش كما هي على multipage-preview.
- مهم جدًا رفع bitem.html و functions/api/bitem/state.js.
- لا تعمل SQL Reset.
- لا تعمل D1 Reset.

بعد الرفع:
1. Redeploy
2. Ctrl + F5 أو InPrivate
3. افتح B Item Control
4. اضغط Edit ثم اختر التاريخ ثم ✓

المفروض يحفظ بدون رسالة HTML، ويظهر التاريخ في Punch Cleared Date واسم اليوزر في USER CLEARED.
