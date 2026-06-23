# V31 Dashboard Punch B Stable Source

- يمنع تبديل Punch B بين الرقم القديم من Snapshot ورقم B Item Registry.
- يجعل كارت Punch B في Overview و Punch Page يقرأ من D1 bitem_registry فقط.
- يقلل طلبات /api/bitem/kpi المتكررة ويستخدم آخر نتيجة صحيحة فورًا بعد أي إعادة رسم.
- لا يغير D1 ولا يحتاج SQL Reset.
