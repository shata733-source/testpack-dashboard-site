# V29 Dashboard B Item Source Fix

هذا الباتش يربط Dashboard B Punch / B Item KPIs مباشرة مع جدول D1 `bitem_registry` بدلاً من B Item القديمة داخل Excel snapshot.

- B Item Control أصبح مصدر Punch B للداش بورد.
- Save / Clear في صفحة B Item ينعكس على Balance في الداش بورد بعد Refresh / filter change.
- فلتر Contractor = CCC يستخدم نفس اللوجيك النهائي:
  - CCC فقط إذا كان الصف CCC وبه واحدة من المناطق: A211, A212, A222, A231, A232, A233.
  - أي CCC خارج هذه المناطق يتحول إلى JGC Direct MP.

ارفع:
- dashboard.html
- functions/ بالكامل

لا تعمل SQL Reset ولا D1 Reset.
