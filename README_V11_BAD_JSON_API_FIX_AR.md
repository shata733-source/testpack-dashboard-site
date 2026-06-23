# V11 Bad JSON / API Functions Fix

سبب Bad JSON غالباً إن بعض ملفات Functions أو shared modules غير موجودة في الـ preview deployment، خصوصاً:
- functions/_shared/bitem.js
- functions/api/users/*.js

ارفع محتويات الباتش كما هي على branch التجربة.

ارفع:
- functions/ بالكامل
- assets/portal.js
- users.html
- projects.html
- login.html

لا تعمل SQL Reset ولا D1 Reset.
بعد الرفع اعمل Redeploy و Ctrl+F5.
اختبر:
- /api/auth/me
- /api/users/list
- /api/bitem/state
