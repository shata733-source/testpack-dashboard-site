# V16 - User Cleared Name + No Browser Sync

يرفع هذا الباتش فقط:

- bitem.html
- functions/api/bitem/edit.js

التعديل:
- عمود USER CLEARED يعرض اسم المستخدم الذي قام بالتعديل بدلاً من التاريخ.
- حفظ B Item يسجل Display Name / Username في last_edited_by.
- زر Sync B Item في المتصفح لا يقوم بعمل sync ثقيل؛ يتحول إلى Reload فقط لأن الـ sync الحقيقي يتم من Selenium / workflow.

لا تعمل SQL Reset ولا D1 Reset.
