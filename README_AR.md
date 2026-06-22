# TESTPACK_MULTI_PAGE_V1

هذه نسخة Phase 1 لبناء Structure جديد Multi-page بدون لمس Workflow الداتا.

## الهدف
تجربة تنقل صفحات حقيقية:
- /index.html
- /dashboard.html
- /bitem.html
- /bitem-monitoring.html
- /users.html
- /login.html

## مهم
هذه نسخة Preview وليست بديل نهائي للموقع الأساسي حتى تعتمدها.

## ما تم الحفاظ عليه
- Selenium workflow كما هو.
- dashboard_data.js كما هو.
- B Item D1 functions موجودة.
- User management functions موجودة.
- لا يوجد SQL ولا Reset.

## ملاحظات Phase 1
- dashboard.html و bitem.html يستخدمان النسخة المستقرة الحالية كـ bridge حتى لا نكسر الحسابات.
- users.html صفحة منفصلة حقيقية بالكامل، لا تتداخل مع Dashboard.
- Phase 2 سيكون استخراج Dashboard و B Item إلى JS modules منفصلة لتقليل الحمل فعليًا.

## طريقة التجربة الآمنة
ارفعها على Cloudflare Preview / Branch وليس على الموقع الأساسي في البداية.
