# V26 Clean B Item Control

نسخة نظيفة لصفحة B Item Control فقط.

## ما الذي تغيّر؟
- تم إلغاء السكريبتات المتراكمة التي كانت تسبب تكرار أزرار Refresh Table.
- لا يوجد Sync من المتصفح. Selenium / Workflow هو فقط المسؤول عن توريد B Items جديدة إلى D1.
- زر Refresh Table واحد فقط، ويعيد قراءة الصفحة الحالية من D1.
- جدول B Item أصبح Server-side paging: لا يحمل 12,500 صف مرة واحدة.
- USER CLEARED يعرض اسم الشخص فقط، وليس التاريخ.
- Save / Clear يحدثان الصف مباشرة بدون Reload كامل.
- Clear Date يشيل التاريخ ويترك اسم آخر شخص عدل.

## ارفع
- bitem.html
- functions/ بالكامل

## لا تعمل
- SQL Reset
- D1 Reset
- Clear Deltas
