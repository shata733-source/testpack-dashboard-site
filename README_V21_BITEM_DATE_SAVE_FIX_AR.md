# V21 B Item Date Save + User Cleared Name Fix

التعديل ده يعالج آخر مشاكل B Item Control:

1. حفظ Punch Cleared Date فعليًا في D1.
2. تحديث Final Status إلى CLEARED بعد حفظ التاريخ.
3. تثبيت USER CLEARED على اسم اليوزر فقط، وعدم ظهور التاريخ في هذا العمود.
4. تحديث الصف مباشرة بعد الحفظ بدون Reload كامل.
5. إضافة API واضح للحفظ: /api/bitem/save مع بقاء /api/bitem/edit و /api/bitem/state?op=edit كـ fallback.

ارفع:
- bitem.html
- functions/ بالكامل

لا تعمل SQL Reset ولا D1 Reset.
