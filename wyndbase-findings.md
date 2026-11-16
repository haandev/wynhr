# WyndBase Findings

## Özet
| Kategori | Sayı | Duvar |
|---|---|---|
| Bug | 12 | 1 kısmi (schedule trigger, webhook ile aşıldı) |
| Eksik özellik | 11 | 0 |
| Keşfedilebilirlik | 14 | 0 |
| **Toplam** | **37** | **0 tam + 1 kısmi** |

Durum (2026-11-16): Backend (base `wynhr`: 4 space, şema, 300+ erişim kuralı, 20+ named query, 4 flow) kuruldu ve rol bazlı test edildi. Uygulama (`app/`, React + `@wyndbase/sdk` + typegen): self-servis profil/izin, onay inbox'ı (kanal push + toast), org şeması, raporlar (CSV/XLSX/PDF, her export audit log'da), HR yönetimi (org yapısı + `auth.teams` ile hibrit departman ağacı, PTO politikaları/türleri, tatiller, tahakkuk/yıl sonu, bakiye düzeltme, işe alım), yönetici onay yetkisinin süreli devri (authority delegation, Inbox ekranından ver/geri al/reddet). Tümü tarayıcıda rol bazlı denendi. Canlı: https://wynhr.pages.dev (Cloudflare Pages).

---

## Choice options require `_id`, `color`, `icon` on every item
- **Görev:** `core.employees` tablosunda `employmentType` / `workSchedule` choice kolonlarını inline seçeneklerle oluşturmak.
- **Kategori:** Eksik özellik
- **İlk deneme:** `design_table` içinde `metadata: { type: "choice", choices: [{ key: "permanent", label: "Permanent" }, ...] }`. Beklenti: bir enum için `key` + `label` yeterli olur, `_id` sunucu tarafından üretilir, `color`/`icon` opsiyonel olur (UI süsü).
- **Sonuç:** `INVALID_PARAMS — Invalid column metadata for type "choice"`; her seçenek için `_id`, `color`, `icon` eksik diye 12 issue. Hata mesajı iyi (expectedSchema + issue listesi), sorun ne olduğu net.
- **Sonraki denemeler:** Her seçeneğe istemci tarafında UUID, `color: "gray"`, `icon: ""` üretip tekrar denemek.
- **Çözüm / Workaround:** İstemci tarafında `_id` (uuid), varsayılan `color`/`icon` doldurmak.
- **Durum:** Workaround ile çözüldü
- **Öneri:** `_id`, `color`, `icon` opsiyonel olsun; `_id` sunucuda üretilsin, `color`/`icon` için varsayılan atansın. Bir LLM'in (ve insanın) enum tanımlarken yazacağı en doğal şekil `{key,label}`; `_id`'yi istemcinin uydurması da tutarsızlık riski taşıyor (hangi format? uuid v7 mi?). `describe_column_type` çıktısı da tek seferde ~75k karakter — tek tip için bile okunamayacak kadar büyük (bkz. ayrı bulgu).

## Choice `defaultValue` must be the option's `_id` (uuid), not its `key`
- **Görev:** `pto.policies.onTermination` choice kolonuna varsayılan değer olarak `forfeit` vermek.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** `metadata.defaultValue: "forfeit"`. Seçenekler `key` ile tanımlanıyor ve WQL'de `$choice(key)` ile yazılıyor; bu yüzden varsayılanın da key olacağını bekledim. Şema açıklaması sadece "Default value for choice column. Must match the column's value schema" diyor.
- **Sonuç:** `INVALID_PARAMS — invalid input syntax for type uuid: "forfeit"` (Postgres hatası sızıyor, hangi kolonda olduğu söylenmiyor; tüm `design_table` geri alındı).
- **Sonraki denemeler:** `defaultValue` olarak ilgili seçeneğin `_id` uuid'sini verdim.
- **Çözüm / Workaround:** `defaultValue: "<option _id>"` çalıştı.
- **Durum:** Çözüldü
- **Öneri:** `defaultValue` key kabul etsin (ya da her ikisini); en azından şema açıklaması "choice'un `_id`'si (uuid) olmalı, key değil" desin. Hata mesajı da kolon adını ve "use the choice's _id; key 'forfeit' maps to <uuid>" gibi bir ipucu verebilir.

## `design_table`: a column rule can't reference a column declared later in the same call
- **Görev:** `pto.requests` tablosunu, `status` state kolonunda `stateInvariant['approved', 'decidedBy IS NOT NULL']` kuralıyla tek bir `design_table` çağrısında oluşturmak.
- **Kategori:** Bug
- **İlk deneme:** `columns` dizisinde `status` önce, `decidedBy` sonra geliyordu. `design_table` "atomically create a table + N columns" dediği için kolon sırasının önemli olmayacağını, kuralların tüm kolonlar oluştuktan sonra doğrulanacağını bekledim.
- **Sonuç:** `CONSTRAINT_VIOLATION — Unknown column in rule formula: decidedBy` (transaction geri alındı).
- **Sonraki denemeler:** `decidedBy`'ı `status`'tan önceye taşıdım.
- **Çözüm / Workaround:** Kural tarafından okunan kolonları dizide kural sahibi kolondan önce sıralamak.
- **Durum:** Workaround ile çözüldü
- **Öneri:** `design_table` kolon kurallarını tüm kolonlar yaratıldıktan sonra doğrulasın (tablo-seviyesi `constraints` zaten böyle çalışıyor gibi). Düzeltilmezse hata mesajı "rules are resolved in column order; declare `decidedBy` before `status`" demeli.

## A check constraint can't name a choice option by key
- **Görev:** `pto.ledger` için "`entryType` = adjustment ise `reason` zorunlu" check constraint'i yazmak (PRD: "Adjustments require reason entry").
- **Kategori:** Eksik özellik
- **İlk deneme:** `entryType != $choice(adjustment) OR length(trim(reason)) > 0`. Cheat sheet choice'ları `$choice(key)` ile yazmayı öğretiyor; aynı ifadenin check'te de çalışmasını bekledim.
- **Sonuç:** `Check expression refused: it cannot contain ChoiceRef`.
- **Sonraki denemeler:** (2) `entryType.key != 'adjustment'` → `it cannot contain a path inside column entryType`. (3) Seçeneğin uuid'sini literal olarak yazmak.
- **Çözüm / Workaround:** `entryType != 'b6f9032e-eabb-41d1-b411-274038103e7b' OR ...`, yani seçeneğin `_id`'sini sabit kodlamak. Okunaksız ve kırılgan: seçenek yeniden yaratılırsa kural sessizce anlamını yitirir.
- **Durum:** Workaround ile çözüldü
- **Öneri:** Check derlenirken `$choice(key)` sabit bir uuid'ye çözülebilir (choice listesi model verisi). Tasarım zamanında sabitlenip, seçenek silinirse check'i geçersiz sayan bir koruma yeterli olur. Desteklenmeyecekse hata mesajı uuid'yi önersin: "use the option id 'b6f9…' for key 'adjustment'".

## Two different `EFFECTIVE` write grammars, and `INSERT … EACH` doesn't support effective columns
- **Görev:** Departmanları (`name`, `active` effective kolonlarıyla) toplu ve geçmiş bir tarihten (2024-01-01) itibaren geçerli olarak eklemek.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** `INSERT EFFECTIVE FROM '2024-01-01' org.departments EACH $d { code, name, active }`. `dml-effective-writes` makalesi ve cheat sheet `INSERT EFFECTIVE FROM …` öğretiyor ve "a write takes FROM or ALL, never a bare moment" diyor.
- **Sonuç:** `INSERT EFFECTIVE FROM cannot write "org.departments": it is not an effective-dated table. Drop EFFECTIVE FROM.` İpucu sadece "Drop EFFECTIVE FROM" diyor; bu tarihi tamamen kaybettirecek bir öneri. Geçmiş tarihten effective **kolon** yazmanın yolunu söylemiyor.
- **Sonraki denemeler:** (2) Kolon yazma rehberindeki `INSERT EFFECTIVE '<start day>'` (çıplak moment) formu, `EACH` ile → `a write takes EFFECTIVE FROM <moment> [TO <moment>] or EFFECTIVE ALL, not a bare moment: write EFFECTIVE FROM <moment>`. Bu da birinci hatayla çelişiyor (birinci "FROM'u sil", ikinci "FROM yaz" diyor). (3) `foundations-effective-dated-tables-writing-a-column` makalesini baştan sona okudum: effective-dated **tablo** `EFFECTIVE FROM`, effective **kolon** `EFFECTIVE <moment>` alıyor ve `INSERT … EACH` effective kolon yazmayı hiç desteklemiyor (`EffectiveColumnWriteError`). Asıl sebep `EACH`'ti ama hata mesajı bunu değil grameri gösterdi.
- **Çözüm / Workaround:** Her satır için ayrı `INSERT EFFECTIVE '2024-01-01' org.departments { … }` deyimi (tek çağrıda `;` ile birden fazla).
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) `EACH` + effective kolon ve `EFFECTIVE` çıplak moment birlikte yazıldığında hata `EffectiveColumnWriteError: INSERT … EACH has no write plan for effective column "name"; write one INSERT EFFECTIVE '<m>' per row` olsun. (b) "Drop EFFECTIVE FROM" ipucu, tabloda effective kolon varsa "this table has effective columns; write `INSERT EFFECTIVE '<moment>'`" desin. (c) Cheat sheet'in "Writing" sayfasına effective kolon için çıplak moment örneği eklensin; şu an sadece tablo formu (`EFFECTIVE FROM`) ve `UPDATE EFFECTIVE '2026-06-01'` var ama ikisinin farklı nesneler için olduğu söylenmiyor. (d) `INSERT … EACH`'in effective kolonları desteklemesi (bulk hire/import için gerçek ihtiyaç) → aynı zamanda eksik özellik.

## Can't make an effective column required on create
- **Görev:** PRD "Enforce required fields upon creation": `status`, `jobTitle`, `department`, `legalEntity`, `location`, `employmentType`, `workSchedule` işe alımda zorunlu olmalı. Hepsi effective kolon.
- **Kategori:** Eksik özellik
- **İlk deneme:** Effective kolonlar `notNull` alamıyor (dokümanda yazıyor; boş period olabilir diye). Owner tabloda `judge: onWrite` check'i: `$old._id != null OR (status IS NOT NULL AND jobTitle IS NOT NULL …)`.
- **Sonuç:** `Check expression refused: column status has no stored value on this table`.
- **Sonraki denemeler:** Managed tabloları `HAS` ile okuyan, commit anında değerlendirilen bir `always` check: `core.employees_status HAS (owner == $row._id) AND core.employees_jobTitle HAS (owner == $row._id) AND …`.
- **Çözüm / Workaround:** Bu check kabul edildi ve test edildi. `jobTitle` dışındaki her şeyi atlayan bir INSERT `does not satisfy the rule employee_required_on_create` ile reddediliyor, tam kayıt geçiyor. Bedeli: managed tablo adlarını (`employees_status`) ve `owner` kolonunu bilmek gerekiyor; ayrıca kural "en az bir period var" diyor, "bugün değer var" demiyor.
- **Durum:** Workaround ile çözüldü
- **Öneri:** Effective kolon için `requiredOnCreate: true` (ya da `notNull: 'onCreate'`) gibi bir bayrak: INSERT'te değer (veya `EFFECTIVE <m>` ile period) yoksa reddet. Alternatif olarak owner check'lerinde `status IS NOT NULL` "statement'ın momentindeki değer" olarak okunabilir. Hata mesajı da workaround'ı önerebilir: "read its managed table: core.employees_status HAS (owner == $row._id)".

## `immutable` refusal is a raw Postgres message that doesn't name the column
- **Görev:** Sistem employee ID'sinin (`employeeNumber`, `immutable: true`) değiştirilemediğini doğrulamak.
- **Kategori:** Bug
- **İlk deneme:** `UPDATE core.employees [employeeNumber == 'E0004'] { employeeNumber: 'E9999' }`. Beklenti: anlamlı bir red, örn. `column "employeeNumber" is immutable`.
- **Sonuç:** Doğru şekilde reddedildi ama mesaj `new row for relation "employees" violates check constraint "immutable"`. Hangi kolon olduğu yok; birden fazla immutable kolonu olan bir tabloda kullanıcıya/uygulamaya gösterilemez.
- **Sonraki denemeler:** —
- **Çözüm / Workaround:** Davranış doğru; uygulamada mesajı kendim eşleyeceğim.
- **Durum:** Çözüldü (davranış), mesaj hatalı
- **Öneri:** Constraint adı `<table>_<column>_immutable` olsun ve API hatası `{ code: IMMUTABLE_COLUMN, column: "employeeNumber" }` dönsün (unique ihlallerinde zaten alan adı veriliyor).

## Set-based `INSERT … EACH (SELECT …)` can't write a computed decimal
- **Görev:** Pay period başına PTO accrual'ını tek bir named query'de hesaplayıp `pto.ledger.hours` (decimal 12,4) kolonuna yazmak (rate × FTE × proration, yıllık tavanla sınırlı).
- **Kategori:** Eksik özellik
- **İlk deneme:** `$rows := SELECT EFFECTIVE … { amt := round(least(...), 4) }; INSERT pto.ledger EACH $rows { hours: $item.amt, … }`. Beklenti: SQL'deki `INSERT … SELECT` gibi set-based çalışır, decimal doğrulaması (scale/precision) sunucuda yapılır.
- **Sonuç:** `Set-based INSERT into "pto.ledger" cannot write column "hours" (decimal): a decimal column validates more than its storage type does, this path applies no validation, and the source expression "amt" is not a plain source column…`
- **Sonraki denemeler:** (2) `hours: $item.amt::decimal(12,4)` cast → aynı hata (`the value is a CastExpr expression, and nothing on this path validates its result`). Hata mesajı alternatifleri net listeliyor: bound parametre, kaynaktaki decimal kolona düz referans, single-row INSERT ya da array EACH.
- **Çözüm / Workaround:** İşi ikiye böldüm: (a) `pto.accrualPreview(period)` read-only NQ satırları hesaplıyor; (b) `pto.postLedgerEntries(entries)` NQ parametre dizisini `INSERT … EACH $entries` ile yazıyor. Bir flow ikisini zincirliyor. Yan fayda: PRD'deki "recalculation with preview" ihtiyacı doğal olarak çıktı. Bedeli: tek transaction'lık işlem iki adıma ve istemci/flow round-trip'ine dönüştü.
- **Durum:** Workaround ile çözüldü
- **Ek:** Aynı kısıt `dateOnly` için de geçerli: tatilleri bir sonraki yıla kopyalayan `INSERT pto.holidays EACH (SELECT … { d := (holidayDate + make_interval(1))::date })` reddedildi. Üstelik DEFINE kabul edip hatayı ancak çağrıda verdi. Aynı preview + array-EACH ayrımıyla çözüldü (`pto.copyHolidaysPreview` + `pto.insertHolidayDrafts`). Ayrıca `make_interval(years => …)` named-arg sözdizimi ve `||` string birleştirme parser'da yok (ikincisi için `concat()`/positional argüman gerekiyor). Bunlar cheat sheet'in "Coming from SQL" tablosunda olmalı.
- **Öneri:** Set-based yolda decimal'ı DB tarafında doğrulamak: `numeric(p,s)`'e cast + `CHECK` ile scale/precision taşmasını reddetmek, ya da en azından `round(x, s)::decimal(p,s)` biçiminde açık bir cast'i "doğrulanmış" kabul etmek. Para/saat gibi hesaplanmış decimal değerleri set-based yazmak çok yaygın bir ihtiyaç.

## Schedule-triggered flows can't be published (server crashes in the cron parser)
- **Görev:** Her gün çalışan "PTO accrual posting" flow'unu `schedule` tetikleyicisiyle yayına almak (PRD: "Automated accrual posting").
- **Kategori:** Bug
- **İlk deneme:** `create_flow` ile `trigger: { type: "schedule", metadata: { cron: "0 2 * * *", start: null, end: null } }`, ardından `update_flow { isDraft: false }`. Taslak sorunsuz oluştu.
- **Sonuç:** Yayına alırken `import_cron_parser.default.parse is not a function. (In 'import_cron_parser.default.parse(flow.trigger.metadata?.cron,{currentDate:flow.trigger.metadata?.start||now})', 'import_cron_parser.default.parse' is undefined)`. Sunucu tarafında bir import/bundle hatası; girdiyle ilgisi yok.
- **Sonraki denemeler:** (2) 6 alanlı cron `0 0 2 * * *` + açık `start` → aynı hata. Girdiden bağımsız olduğu için başka varyasyon denemedim.
- **Çözüm / Workaround:** Tetikleyiciyi `webhook` yapıp yayınladım; backfill'i `fire_webhook` ile çalıştırdım. Günlük çalıştırma için bu webhook'u harici bir zamanlayıcı (cron/CI) çağırmalı. Flow idempotent olduğu için bu güvenli.
- **Durum:** Workaround ile çözüldü (zamanlanmış tetikleyicinin kendisi için **duvar**)
- **Öneri:** `cron-parser` import'unu düzeltin (muhtemelen `CronExpressionParser.parse` / default export uyumsuzluğu). `create_flow` taslağı kaydederken cron'u zaten doğrulasaydı hata yayın anında değil oluşturma anında ortaya çıkardı.

## Flow condition: decimals arrive as strings, and the error reads `[object Object]`
- **Görev:** Accrual flow'unda "pozitif saatli yeni satır var mı" kontrolü: `$count(nodes.preview.result[alreadyPosted = false and hours > 0]) > 0`.
- **Kategori:** Bug
- **İlk deneme:** `hours > 0`. WQL'de `hours` decimal; JSONata'da sayı gibi karşılaştırılabileceğini bekledim.
- **Sonuç:** Run `failed`; log `Condition could not be evaluated: [object Object]. Logic: …`. Asıl hata (JSONata T2010 tip hatası: string > number) mesaja `[object Object]` olarak düşmüş.
- **Sonraki denemeler:** Decimal'ların JSON'a string olarak (`"3.3333"`) serileştirildiğini fark edip `$number(hours) > 0` yazdım.
- **Çözüm / Workaround:** `$number(hours)`. Flow 68 periyodu sorunsuz işledi.
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) Hata nesnesinin `message`/`code` alanı loglansın (`[object Object]` yerine `T2010: The expressions either side of operator ">" must be of the same data type`). (b) `describe_node_type` çıktısındaki `traps` bölümüne "decimal/numeric kolonlar string olarak gelir, `$number()` kullanın" eklensin. Mevcut traps bölümü çok faydalı, bu da oraya ait.

## `INSERT … EACH` over a scalar list fails with a detail-free "Validation error"
- **Görev:** `auth.roles`'a üç rol eklemek: `hr_admin`, `hr_manager`, `employee`.
- **Kategori:** Bug
- **İlk deneme:** `INSERT auth.roles EACH $r { name: $item } -> { _id, name }` ve `$r = ["hr_admin","hr_manager","employee"]`. Cheat sheet'teki `EACH $rows { firstName: $item.firstName }` örneğinin skalar dizi karşılığı olarak yazdım.
- **Sonuç:** `{"code":"WQL_SYNTAX","message":"Validation error"}`. Hangi parametre, hangi kural, hangi alan; hiçbiri yok. Ekli ipucu da genel "spec'te arayın" metni.
- **Sonraki denemeler:** Tek satırlık `INSERT auth.roles { name: 'hr_admin' }` → çalıştı. Kalanları ayrı deyimlerle ekledim.
- **Çözüm / Workaround:** Satır başına ayrı `INSERT` (ya da `[{ "name": "…" }]` biçiminde nesne dizisi).
- **Durum:** Workaround ile çözüldü
- **Öneri:** Ya skalar `$item`'ı destekleyin, ya da hata "EACH expects an array of objects; got string at $r[0]" desin. Kodun `WQL_SYNTAX` olması da yanıltıcı; bu bir parametre doğrulama hatası.

## First role-scoped `GRANT` fails: `decision_matrix_locked_rule_design_role`, with no next step
- **Görev:** `hr_admin` / `hr_manager` rollerine `core.employees` için GRANT yazmak.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** `INSERT auth.roles { name: 'hr_admin' }` ile rolü yarattım, ardından `GRANT insert ON core.employees TO hr_admin`. Cheat sheet ve identity makalesi tam olarak bu sırayı öneriyor ("if it does not exist, INSERT auth.roles … then submit the GRANT").
- **Sonuç:** `CONSTRAINT_VIOLATION — A row of auth.decision_matrix does not satisfy the rule decision_matrix_locked_rule_design_role.` Ne yapılması gerektiği yazmıyor.
- **Sonraki denemeler:** Tool açıklamasında geçen "A locked rule scoped to a role needs a role in the design (`lock: true` on the role)" cümlesini hatırlayıp rollerde `lock: true` yaptım (`UPDATE auth.roles [...] { lock: true }`). Alternatif olarak her GRANT'e `{ lock: false }` verilebilirdi.
- **Çözüm / Workaround:** Rolleri `lock: true` yapınca tüm GRANT'ler geçti.
- **Durum:** Çözüldü
- **Öneri:** (a) Hata mesajı: "rule is locked (you hold design authority) but role 'hr_admin' is a runtime role; set `lock: true` on the role (`UPDATE auth.roles [name == 'hr_admin'] { lock: true }`) or write the rule with `{ lock: false }`". (b) identity-profile makalesinin "INSERT auth.roles" adımı `{ name, lock: true }` örneği versin. Tasarımcı tarafından yaratılan rolün varsayılanı zaten design role olabilir.

## Effective columns: each managed table needs its own grant for every operation (204 GRANTs)
- **Görev:** HR rollerinin `core.employees`'in effective kolonlarını (status, jobTitle, department, manager, location… toplam 11) ve org tablolarının effective kolonlarını (6) bugünden/geçmişten yazabilmesi ve herkesin geçmişi okuyabilmesi.
- **Kategori:** Eksik özellik
- **İlk deneme:** Owner tabloya (`core.employees`) `GRANT insert/update ... TO hr_admin`. Beklenti: owner'ın kuralı effective kolonlara da geçer (kolon da bir kolondur).
- **Sonuç:** Doküman açıkça diyor ki owner kuralları gerekli ama yetmiyor: "The managed table is then written under the grant of the form… a role without it gets PolicyCapabilityError naming the managed table". Yani her managed tablo için `read`, `readEffective`, `insert`, `insertEffective`, `update`, `updateEffective`, `deleteEffective` ayrı ayrı yazılmalı.
- **Sonraki denemeler:** Python ile 17 managed tablo × 7 işlem × (2 rol + ALL) = 204 GRANT deyimi ürettim ve tek `run_wql` çağrısıyla çalıştırdım. Office-scoped HR manager için filtre `member(owner.location.officeTeam)`; managed tablonun `owner` kolonu üzerinden çalıştı.
- **Çözüm / Workaround:** Toplu üretilmiş GRANT'ler. Yeni bir effective kolon eklenince aynı 12 GRANT'i elle tekrarlamak gerekecek; unutulursa kolon sessizce yazılamaz/okunamaz olur.
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) Managed tablo varsayılan olarak owner'ın row kurallarını miras alsın (`insert/update` owner'da varsa `insert/update` + effective eşdeğerleri, ve `read`), sadece *daraltma* için ayrı kural yazılsın. (b) Ya da bir kısaltma: `GRANT write, writeEffective ON core.employees.* TO hr_admin` (tüm effective kolonların managed tabloları). (c) En azından `structure` resource'u veya `add_column(effective)` yanıtı "this column's managed table core.employees_status has no grants yet" uyarısı versin.

## Optional parameter `$p IS NULL` fails with "The database could not run this statement."
- **Görev:** `pto.balances` named query'sine opsiyonel bir `$employee` filtresi koymak (null → herkes).
- **Kategori:** Bug
- **İlk deneme:** `FILTER ($employee IS NULL OR employee._id == $employee)`. SQL'deki yaygın kalıp; WQL'in parametre tipini ikinci kullanımdan (`uuid` kolonla karşılaştırma) çıkarmasını bekledim.
- **Sonuç:** DEFINE başarıyla kaydedildi, ama her çağrıda (null da olsa geçerli uuid de olsa) `INVALID_REQUEST — The database could not run this statement.` döndü. Hiçbir ayrıntı yok. Muhtemelen Postgres'in `could not determine data type of parameter $1` hatası.
- **Sonraki denemeler:** Projeksiyonu parça parça çalıştırıp (bisection) sorunu FILTER'a indirdim; `$employee::uuid IS NULL OR employee._id == $employee::uuid` ile çalıştı. Toplam ~5 ek çağrı.
- **Çözüm / Workaround:** Parametreyi açıkça cast etmek.
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) Derleyici aynı parametrenin başka bir kullanımından tip çıkarıp `IS NULL` kullanımına da uygulasın. (b) DB hatası opak "could not run" yerine en azından SQLSTATE ve mesajla dönsün (design authority çağırıyorsa). (c) DEFINE anında bir dry-compile + `EXPLAIN` yapılsaydı sorun kaydederken yakalanırdı. Benzer şekilde `IN [$choice(a), $choice(b)]` de DEFINE'da kabul edilip çalışırken `$choice needs a list` hatası verdi.

## No general-purpose user notification ("your request was approved")
- **Görev:** PRD "Notifications for submission and decision": PTO kararını talep sahibine bildirmek.
- **Kategori:** Eksik özellik
- **İlk deneme:** `system.emitUserNotification` named query'sini buldum, ama exposure'u `service` ve gövdesi `system.user_notifications`'a yazıyor. `kind: 'pto_decision'` ile denedim. Bu arada `targetTableId`, ardından `columnId` zorunlu çıktı; her biri ayrı bir hata turuyla öğrenildi.
- **Sonuç:** Insert kabul edildi ama `system.myInbox` sadece `kind == 'mention'` ve `kind == 'assignment'` satırlarını gösteriyor. Özel kind'lı bildirim hiçbir standart yüzeyde görünmüyor. Gönderim için bir e-posta sağlayıcısı da kurulu değil.
- **Sonraki denemeler:** Talep onayını zaten interaction (inbox) ile çözdüm; karar bildirimi için `kind: 'assignment'`, `targetRowId` = talep, `columnId` = `status` kolonu kullandım. Inbox'ta "assignments" kanalında görünüyor.
- **Çözüm / Workaround:** Karar bildirimini `assignment` türüyle göndermek. Semantik olarak yanlış ("sana bir şey atandı" ≠ "talebin onaylandı").
- **Durum:** Workaround ile çözüldü
- **Öneri:** `system.user_notifications`'a serbest bir `kind: 'app'` (başlık + metin + hedef satır) ve bunu gösteren bir inbox kanalı; flow'lar için bir `notify` node tipi (`sendEmail`/`sendSms` yanında). Zorunlu alanlar (`targetTableId`, `columnId`) tek seferde, hepsi birden raporlansın.

## Named result `$x := INSERT …` can't be read by a later statement (contradicts the cheat sheet)
- **Görev:** `core.hireEmployee` NQ'sunda yeni çalışanı ekleyip `_id`'sini sonraki `INSERT`'lerde (compensation, policy assignments) kullanmak.
- **Kategori:** Bug
- **İlk deneme:** `$emp := INSERT EFFECTIVE $hireDate core.employees {…} -> { _id }; INSERT … { employee: $emp._id }`. Cheat sheet "Several statements" bölümündeki `$acct := INSERT crm.accounts {…} -> { _id }; INSERT crm.contacts { account: $acct._id }` kalıbının birebir aynısı.
- **Sonuç:** DEFINE kabul edildi; çağrıda `"$emp" writes and is read by a later statement, which would perform the write twice`.
- **Sonraki denemeler:** Sonraki deyimlerde yeni satırı benzersiz anahtarla lookup'ladım: `employee: @! core.employees(employeeNumber == $employeeNumber)`.
- **Çözüm / Workaround:** Unique iş anahtarı üzerinden `@!` lookup.
- **Durum:** Workaround ile çözüldü
- **Öneri:** Muhtemelen effective kolonlu INSERT birden fazla SQL deyimine derlendiği için oluyor; yazma sonucunu bir kez materyalize edip sonraki deyimlere değer olarak geçirin. Olmuyorsa cheat sheet'e "effective kolon yazan bir INSERT'in sonucu sonraki deyimlerde okunamaz" notu ve hata mesajına lookup önerisi eklensin. DEFINE anında da yakalanmalı.

## An optional effective column can't carry a reason (null + `.reason` is refused)
- **Görev:** İşe alımda opsiyonel `manager` / `productTeam` effective kolonlarını, her period'un `reason` zorunluluğunu bozmadan yazmak.
- **Kategori:** Eksik özellik
- **İlk deneme:** `manager: $manager, manager.reason: 'Hire'` (`$manager` null olabilir).
- **Sonuç:** Doküman ve motor reddediyor: `"location.reason" stands beside "location", whose value is null, and a null opens no period to carry it` (zorunlu `location` testinde aynı hata). Yani aynı NQ hem dolu hem boş değerle çağrılamıyor.
- **Sonraki denemeler:** `?=` effective kolonda yasak. `INSERT { value: $m, reason: … }` de null'da reddediliyor.
- **Çözüm / Workaround:** O iki managed tablonun `reason` kolonuna `defaultValue: 'Hire'` verip NQ'da reason'ı hiç yazmamak. Yan etki: sonradan reason'sız yazılan bir değişiklik de sessizce "Hire" etiketi alır.
- **Durum:** Workaround ile çözüldü
- **Öneri:** Değer null ise yanındaki managed kolonları sessizce yok saymayı seçen bir mod (örn. `manager.reason ?= 'Hire'` ya da `INSERT { value: $m, reason: 'Hire' } IF NOT NULL`).

## Setting up an SMTP email provider: `providerType` and `config` fields are undocumented
- **Görev:** Kullanıcının verdiği SMTP ayarlarıyla (host 192.168.1.31, port 25, secure=false, from wyndb@developertools.com) bir e-posta sağlayıcısı kurmak, ardından test kullanıcılarına şifre belirleme linki göndermek.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** `system.insertEmailProvider`'ın gövdesini okudum. `foundations-base-environment` makalesi "SMTP host gibi ayarlar env key olarak verilir" diyor; SMTP için `providerType` değerini ve `config` alanlarını hiçbir makale vermiyor. Tahminle `providerType: "smtp"`, `config: { host: "SMTP_HOST", port: "SMTP_PORT", secure: "SMTP_SECURE" }` verdim, yani **hepsini** env key adı olarak. Insert sorunsuz kabul edildi.
- **Sonuç:** İlk gerçek gönderimde (`auth.sendPasswordReset`) job 3 denemede `failed`: `connect ECONNREFUSED 192.168.1.31:587`. Host env'den doğru okunmuş. `port` ise env key adı olarak verildiği için okunamamış ve sessizce varsayılan 587'ye düşmüş. Kayıtta hiçbir doğrulama yok, hata ancak gönderim anında ve dolaylı olarak görünüyor.
- **Sonraki denemeler:** (1) SDK paketindeki `shared/src/email-providers.d.ts`'te SMTP admin formunun alan tiplerini buldum: host = `env: true` metin, port = `number` (literal), secure = `boolean` (literal), dördüncü alan opsiyonel env metni. Alan adları JS'de yok. (2) `system.setEmailProvider { target, config, …null }` → detaysız `Validation error`. (3) `UPDATE system.email_providers [slug == 'smtp'] { config: { host: "SMTP_HOST", port: 25, secure: false } }` → oldu; tekrar gönderim `completed`. Ayrıca `auth.sendPasswordReset` design authority ile çağrılınca "The account has no primary email address the caller may read" dedi; `auth.emails` okuma kuralı olan `hr_admin` (ayse.hr) olarak çalıştırınca geçti.
- **Çözüm / Workaround:** `config: { host: <env key>, port: 25, secure: false }`. 6 kullanıcıya şifre belirleme maili başarıyla gönderildi.
- **Durum:** Çözüldü
- **Öneri:** (a) `insertEmailProvider` `config`'i provider tipinin descriptor'una göre doğrulasın: bilinmeyen anahtar, number beklenen yerde string ve eksik zorunlu alan reddedilsin. (b) Descriptor'ları bir `system.describeEmailProvider('smtp')` NQ'su ya da bilgi bankası sayfasıyla açın. (c) Bir `system.testEmailProvider(slug, to)` olsun. (d) `setEmailProvider`'ın `Validation error`'ı hangi parametrenin geçersiz olduğunu söylesin.

## Flows: shaping an array parameter with JSONata, and seeing what was actually sent
- **Görev:** Termination flow'unda bakiyeleri sıfırlayan ledger satırlarını `INSERT … EACH $entries` ile yazmak; her satırın saati ve gerekçesi JSONata'da hesaplanıyor.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** `entries: "{{ $map(nodes.balances.result[], function($b) { { 'employee': $b.employee, 'hours': $string(-$number($b.remaining)), … } }) }}"`.
- **Sonuç:** `EACH parameter must be a non-empty array`. (1) Tek elemanlı `$map` sonucu nesneye "unwrap" oluyor; dokümandaki `[]` ipucu path'ler için, `$map` için değil. (2) `$append([], $map(...))` ile sarınca da aynı hata. Run log'u node'un **değerlendirilmiş parametrelerini** göstermediği için JSONata'nın ne ürettiğini göremedim; deneme-yanılmaya kaldım.
- **Sonraki denemeler:** Hesabı WQL tarafına taşıdım: `pto.balances` NQ'suna `closingHours := remaining * -1` ekledim ve flow'da `entries: "{{ nodes.balances.result[] }}"` ile satırları olduğu gibi geçirdim. Gerekçe metni `CASE(...)` ile INSERT içinde üretiliyor.
- **Çözüm / Workaround:** Dönüşümü JSONata yerine WQL'de yapmak. Çalıştı (termination → `-8.0000 Termination: balance paid out`).
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) Run log'unda her `wql` node'unun resolve edilmiş `parameters`'ı gösterilsin (secret'lar maskeli). (b) Template alanları için "her zaman dizi" bir yardımcı ya da `parameters` için `asArray: true`. (c) `traps` bölümüne `$map` tek eleman davranışı eklensin.

## Finding the WyndBase server address (and so the SDK/CLI registry) is hard
- **Görev:** HR uygulamasını `sdk-building-an-application` makalesinin kuralına göre kurmak: `wyndbase` CLI ile typegen + `@wyndbase/sdk` typed client. Adım 1: `@wyndbase:registry=https://<your wyndbase server>/npm/`.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** Sunucu adresini tool'lardan bulmaya çalıştım. MCP server instructions, `auth.getMe`, `system.getClientMetadataDocuments` adres vermiyor. Makale "the server is the one you are connected to" diyor ama MCP bağlantısı bir claude.ai connector'ı üzerinden; URL görünmüyor.
- **Sonuç:** Adresi bilmediğim için makinedeki dinleyen portları taradım ve ilgisiz yerel WyndBase derlemelerine denk geldim. `:3191`/`:4599` paketsiz derlenmişti ("built without the client packages"). `:3911`/`:3912` ise eski bir SDK sunuyordu: CLI yok, tarball URL'leri `localhost:3000`, `browserSession` yok. Bunları sırayla "paket yok → duvar", ardından üç ayrı bug olarak kaydettim; hepsi yanlış sunucudan kaynaklanıyordu.
- **Sonraki denemeler:** Kullanıcı gerçek sunucunun `dev.wyndbase.dev` olduğunu söyledi. Orada `@wyndbase/sdk`, `@wyndbase/wql`, `@wyndbase/cli` (`0.1.3-preview.gf8a697ca`) doğru tarball URL'leriyle mevcut ve SDK rehberle uyumlu (`session/browser` var).
- **Çözüm / Workaround:** `.npmrc`: `@wyndbase:registry=https://dev.wyndbase.dev/npm/`. Kurulum sorunsuz.
- **Durum:** Çözüldü (kullanıcı yardımıyla)
- **Öneri:** Bu turun en pahalı keşfedilebilirlik sorunu. Adres bilinmeyince agent makul ama yanlış bir yola sapıp ~10 çağrı ve 3 hatalı bulgu üretti. (a) MCP server instructions'a sunucunun public URL'si, npm registry adresi ve `wyndbase://dev.wyndbase.dev/<base>` biçiminde base adresi yazılsın. (b) Ya da bir `system.getServerInfo` NQ'su (`publicUrl`, `npmRegistry`, `version`). (c) SDK makalesindeki `<your wyndbase server>` yer tutucusu, agent'a adresi nereden okuyacağını söylesin.

## CLI typegen rejects a query the server compiles and runs (`SELECT EFFECTIVE ALL <effective column>` nested read)
- **Görev:** `bunx wyndbase pull` ile tipleri üretmek; `core.employeeHistory` NQ'su her effective kolonun tüm period'larını `(SELECT EFFECTIVE ALL status { value, reason, … })` ile döndürüyor (cheat sheet'teki `history := (SELECT EFFECTIVE ALL title { … })` kalıbı).
- **Kategori:** Bug
- **İlk deneme:** NQ sunucuda kaydedildi ve hem design authority hem de `targetUserId: mert.hrm` ile doğru sonuç döndü. `wyndbase pull` sonrası typegen'in de geçmesini bekledim.
- **Sonuç:** `✗ core.employeeHistory — EFFECTIVE ALL cannot read the nested subquery source "status" on table "employees": … "status" is not one. Name an effective column, or drop EFFECTIVE ALL.` `status` effective bir kolon; sunucu derleyicisi bunu kabul ediyor.
- **Sonraki denemeler:** Alias'ları kolon adından farklılaştırdım (`statusHistory := …`), sorun gölgeleme sanmıştım → aynı hata. NQ sunucuda hâlâ çalışıyor (`jobTitleHistory` iki period döndü).
- **Çözüm / Workaround:** Bu tek NQ tipsiz kaldı; uygulamada sonucu `unknown` olarak alıp daraltacağım. Diğer tüm NQ'ların tipleri üretildi.
- **Durum:** Workaround ile çözüldü
- **Öneri:** CLI'ın pull ettiği model JSON'u effective kolonları taşımıyor gibi (ya da CLI'daki derleyici sunucudakinden eski); `wynhr.json`'da `effective`/`effectiveTable` metadata'sı kontrol edilmeli. CLI ve sunucu derleyici sürümleri eşleşmezse `pull` bunu uyarmalı.

## Published SDK imports `@wyndbase/wql/rows`, which `@wyndbase/wql` doesn't export
- **Görev:** Uygulamayı Vite ile çalıştırmak (`@wyndbase/sdk@0.1.3-preview.gf8a697ca`, dev.wyndbase.dev registry'sinden).
- **Kategori:** Bug (paketleme)
- **İlk deneme:** `vite` dev server.
- **Sonuç:** `✘ [ERROR] Missing "./rows" specifier in "@wyndbase/wql" package`. SDK'nın `chunk-aq9hnyrn.js` dosyası `import { isTaggedWqlRows, tagWqlRows, wqlRowsMeta, isArrayMember } from "@wyndbase/wql/rows"` yapıyor. Yayınlanan `@wyndbase/wql`'in `exports`'u sadece `.`, `./codemirror`, `./formatter`, `./lint`, `./monaco`. Ana giriş de `isArrayMember`'ı export etmiyor. `tsc` bunu yakalamıyor; hata ancak bundler'da çıkıyor.
- **Sonraki denemeler:** Fonksiyonları `wql/main/src/index.js`'te (`// src/rows.ts`) buldum.
- **Çözüm / Workaround:** Dört saf fonksiyonu `src/shims/wql-rows.ts`'e kopyaladım ve `vite.config.ts`'te `resolve.alias` ile `@wyndbase/wql/rows` → shim yaptım. Dev server açıldı.
- **Durum:** Workaround ile çözüldü
- **Öneri:** `@wyndbase/wql`'e `"./rows"` export'u eklensin (ya da SDK bunu bundle etsin). Yayın pipeline'ına "SDK'yı temiz bir projede bundle et" smoke testi eklensin.

## `browserSession({ autoRegister: true })` fails with a bare `access_denied`: client registration is off by default
- **Görev:** Rehberdeki gibi `browserSession({ autoRegister: true })` ile tarayıcıdan oturum açmak.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** Rehberdeki `src/wyndbase.ts` kurulumu birebir; "Sign in" → `session.authorize({ redirect: true })`.
- **Sonuç:** Konsolda `404` + `403`, ardından `Uncaught (in promise) HttpError: access_denied at ClientRegistration.resolveClientRegistration`. Sayfa hiçbir şey göstermiyor (promise reddi yakalanmamış). Rehber `autoRegister`'ı "lets the base mint the client on first use" diye anlatıyor; base'de dynamic client registration'ın açılması gerektiğinden söz etmiyor.
- **Sonraki denemeler:** `system.getClientRegistration` → `{ enabled: false }`. `system.setClientRegistration { enabled: true }` var ama auth ayarı olduğu için kullanıcı onayı bekliyor.
- **Çözüm / Workaround:** Kullanıcı onayıyla `system.setClientRegistration { enabled: true }` çalıştırıldı. Ardından "Sign in" dev.wyndbase.dev'deki `Sign in to wynhr` ekranına yönlendirdi.
- **Durum:** Çözüldü
- **Öneri:** (a) Rehberin `autoRegister` paragrafına "requires `system.setClientRegistration { enabled: true }` on the base, or register the client yourself" eklensin. (b) Hata `access_denied` yerine `client_registration_disabled: this base does not allow dynamic client registration` desin. (c) `authorize()` reddi `signIn()`'in döndürdüğü `failed` durumuna bağlansın; yakalanmamış promise ile sessizce kalmasın.

## The Inbox plugin (channel push) wasn't discovered; I built a live query instead
- **Görev:** Yöneticinin onay talepleri ve çalışanın karar bildirimleri inbox'a anında düşsün; kullanıcı hangi sayfadaysa toast çıksın.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** `system.myInbox` NQ'sunu (MCP'den `listNamedQueries` ile bulmuştum) önce düz sorguyla okudum. "Anında gelecek mi" sorusu üzerine `wyndbase.query.system.myInbox(...).live()` + `QueryObserver` ile live query'ye çevirdim. Bu çalıştı (yeni talep ~4 sn'de göründü) ama doğru araç değildi.
- **Sonuç:** Kullanıcı/maintainer: "inbox için channel ile iletim mevcut, live query gerekmez". SDK'da `@wyndbase/sdk/plugins/inbox` → `sdk.use(Inbox)`; `sdk.inbox.all|unread.options()` (kanal takibini başlatır) ve `sdk.inbox.subscribe({ onNew, onCount })` (yeni öğeleri iter) var. Hiçbir MCP yüzeyinde bundan söz edilmiyor: `sdk-building-an-application` makalesi sadece live query ve `channel` handle'ını anlatıyor; interaction makalesi "the request reaches the inbox" diyor ama istemcinin inbox'ı nasıl dinleyeceğini söylemiyor.
- **Sonraki denemeler:** `plugins/inbox/handle.d.ts`, `contract.d.ts` okuyup `Inbox` plugin'ine geçtim. Toast'ı `inbox.subscribe({ onNew })` ile uygulama kabuğuna bağladım. Test: Lena ana sayfadayken Jonas talep gönderdi → 3 sn içinde "New request waiting for you" toast'ı.
- **Çözüm / Workaround:** `Inbox` plugin'i + `subscribe`.
- **Durum:** Çözüldü (kullanıcı yönlendirmesiyle)
- **Öneri:** (a) `sdk-building-an-application` makalesine "Inbox and notifications" bölümü (`sdk.use(Inbox)`, `subscribe({ onNew })`). (b) `system.myInbox` NQ açıklaması "UI'da `@wyndbase/sdk/plugins/inbox` ile kullanın" desin. (c) `create_flow`'un interaction açıklaması, isteğin istemcide nasıl görüneceğine bu plugin'le bağlantı versin.

## SDK realtime worker fails under Vite's default dependency pre-bundling
- **Görev:** Inbox kanal push'unun tarayıcıda çalışması.
- **Kategori:** Bug (paketleme/entegrasyon)
- **İlk deneme:** Varsayılan Vite (6.x) yapılandırması.
- **Sonuç:** Konsolda `Failed to fetch a worker script`; istek `/node_modules/.vite/deps/realtime/realtime.worker.js` (404). Vite SDK'yı `.vite/deps`'e pre-bundle ettiğinde worker'ın göreli yolu kırılıyor; liste ilk yüklemede geliyor ama push kanalı açılamıyor. Hata sessiz, UI'da belirti yok.
- **Sonraki denemeler:** `vite.config.ts` → `optimizeDeps: { exclude: ['@wyndbase/sdk'] }`. Worker `/node_modules/@wyndbase/sdk/realtime/realtime.worker.js`'ten yüklendi, push çalıştı.
- **Çözüm / Workaround:** SDK'yı pre-bundling'den hariç tutmak.
- **Durum:** Workaround ile çözüldü
- **Öneri:** Worker'ı `new Worker(new URL('./realtime.worker.js', import.meta.url))` kalıbıyla bundler-uyumlu hale getirin ya da inline edin. Yapılamıyorsa SDK rehberine Vite için `optimizeDeps.exclude` notu eklensin. Realtime bağlantısı kurulamadığında SDK bir `status`/uyarı yayınlasın.

## `LOOP … USING` (hierarchy walk) can't follow an effective link
- **Görev:** Profilde org şeması: kişinin yukarı (yönetici zinciri) ve aşağı (bağlıları, onların bağlıları) hiyerarşisi. `manager` effective bir self-link (yönetici değişiklikleri tarihli tutulsun diye).
- **Kategori:** Eksik özellik
- **İlk deneme:** Cheat sheet'teki kalıp: `LOOP (_id == $employee) USING (manager -> _id) SELECT core.employees { … }`.
- **Sonuç:** `LOOP USING cannot follow "manager": it is an effective column, whose value lives in its managed table, not as a key on the row. Follow a stored link instead.` Hata net, ama effective dating ile hiyerarşi gezme birbirini dışlıyor. Org şeması geçmişi PRD'nin açık gereksinimi ("Preserve historical org chart changes", "org chart history queries").
- **Sonraki denemeler:** `SELECT EFFECTIVE $asOf core.employees { _id, managerId := manager._id }` (mevcut `core.orgChart` NQ'su) ile o tarihteki tüm düzlemi alıp ağacı istemcide kurmak.
- **Çözüm / Workaround:** İstemci tarafında ağaç. Küçük bir şirkette sorun değil, binlerce çalışanda tüm org'u çekmek gerekir. Yan kazanç: tarih seçiciyle "o gün org nasıldı" görünümü.
- **Durum:** Workaround ile çözüldü
- **Öneri:** `LOOP … USING` effective x:1 linkleri statement momentinde (`EFFECTIVE $m LOOP …`) takip edebilsin; managed tablo zaten `owner → value` çiftleri, bu bir recursive CTE'ye doğal olarak dönüşür. Aynısı policy'lerdeki `manager* HAS (…)` için de değerli olur ("yöneticimin yöneticisi de görebilsin").

## Optional choice parameters: `$choice(null)` is refused, and identical enums in two tables can't be compared
- **Görev:** HR'ın PTO politikası formu: "employment type" boşsa politika her tipe uygulanır. Yeni politikayı uygun çalışanlara atarken politikanın tipini çalışanın tipiyle karşılaştırmak.
- **Kategori:** Eksik özellik
- **İlk deneme:** (1) `employmentType: CASE($employmentType::text IS NULL, NULL, $choice($employmentType))` → `$choice needs a list — … use it in a choice-column assignment … so the list is inferred` (CASE içinde liste çıkarılamıyor). (2) `employmentType: $choice($employmentType)` ve `$employmentType = null` → `Choice "<dynamic>" not found in list "$01a1e41e-….01a1e424-….01a1e424-…"` (hata mesajında kolon adı yerine iç kimlikler var).
- **Sonuç:** Aynı NQ ile hem "bir tip" hem "herhangi" kaydedilemiyor. Ayrıca `core.employees.employmentType` ile `pto.policies.employmentType` aynı anahtarlara sahip ama iki ayrı inline choice listesi; saklanan değer seçeneğin `_id`'si olduğu için iki kolon asla eşit çıkmıyor. "Politika tipi = çalışan tipi" filtresi yazılamıyor.
- **Sonraki denemeler:** `pto.savePolicy` tipi yazmıyor; `pto.setPolicyEmploymentType` (`$choice`) ve `pto.clearPolicyEmploymentType` (`null`) ayrı NQ'lar ve istemci hangisini çağıracağını seçiyor. Atama NQ'su tip eşleştirmesini yapmıyor (açıklamada not edildi). Doğru çözüm iki kolonun ortak bir `listName` paylaşmasıydı; bunu baştan bilseydim öyle tasarlardım. `listName`/`system.insertChoice` hiçbir rehberde "enum'u tablolar arasında paylaş" bağlamında geçmiyor.
- **Çözüm / Workaround:** Ayrı set/clear NQ'ları; atamada tip filtresi yok.
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) `$choice($p)` null'ı null'a çevirsin. (b) Choice karşılaştırması key üzerinden yapılabilsin (`employmentType.key == other.employmentType.key` ya da `$choiceKey(col)`). (c) `describe_column_type('choice')` ve cheat sheet "aynı enum birden çok tabloda kullanılacaksa `listName` ile paylaşın" desin. (d) Hata mesajı iç kimlikler yerine `pto.policies.employmentType` yazsın.

## Compiler: a projection alias that shadows a column hijacks the FILTER, and `date + interval` compiles to string concatenation
- **Görev:** `pto.copyHolidaysPreview(country, fromYear, toYear)`: bir yılın tatillerini aynı gün/ay ile sonraki yıla taşıyan önizleme. HR ekranındaki "Copy from 2026" butonu.
- **Kategori:** Bug
- **İlk deneme:** `SELECT pto.holidays { country, name, hours, holidayDate := (holidayDate + make_interval($toYear::int - $fromYear::int))::date, calendarYear := $toYear::int } FILTER country == $country AND calendarYear == $fromYear::int`. NQ kaydedildi, çağrıda hata yok.
- **Sonuç:** Her zaman **0 satır**, hem Ayşe hem design authority olarak. UI "No TR holidays in 2026 to copy" dedi. `run_wql_dry` iki ayrı hata gösterdi: (1) FILTER'daki `calendarYear` tablo kolonu yerine projeksiyondaki `calendarYear := $toYear::int` alias'ına çözülmüş: `WHERE … AND ($1::int = $2::int)` (2027 = 2026 → her zaman false). (2) `holidayDate + make_interval(...)` şuna derlenmiş: `(to_char("holidayDate", 'YYYY-MM-DD') || make_interval(...))::date`. Tarih + interval, metin birleştirmeye dönüşmüş. SQL'deki semantikte FILTER (WHERE) projeksiyon alias'larını görmez; burada sessizce tam tersi oluyor ve hiçbir uyarı yok.
- **Sonraki denemeler:** Alias'ları kolon adlarından farklı yaptım (`newDate`, `newYear`) ve tarihi `make_date($toYear::int, date_part('month', holidayDate)::int, date_part('day', holidayDate)::int)` ile kurdum.
- **Çözüm / Workaround:** Çalıştı: 7 TR tatili 2027'ye taslak olarak kopyalandı (UI'da doğrulandı).
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) FILTER bir tablo kolonu ile aynı adlı projeksiyon alias'ını gördüğünde ya kolonu tercih etsin ya da derlemede hata versin (`ambiguous name "calendarYear": a column and a projected alias`). (b) `date`/`dateOnly` + `interval` aritmetiği tarih olarak kalmalı; `to_char` ile metne çevrilip `||` ile birleştirilmesi açık bir hata. Bu, "sessizce yanlış sonuç" türünden olduğu için en tehlikeli bulgu türü.

## A policied table-level `HAS` over a rule-protected table fails with "The database could not run this statement."
- **Görev:** HR'ın "Pay periods" listesinde her dönem için tahakkuk kaydedildi mi bilgisini göstermek: `posted := pto.ledger HAS (payPeriod._id == $row._id AND entryType == $choice(accrual))`.
- **Kategori:** Bug
- **İlk deneme:** NQ'yu normal (`authenticated`, policied) tanımladım. Design authority olarak 72 satırı doğru döndürdü.
- **Sonuç:** Uygulamada Ayşe (`hr_admin`) olarak liste "Loading…"de kaldı. Aynı NQ `targetUserId: ayse.hr` ile `INVALID_REQUEST — The database could not run this statement.` döndürdü, ayrıntısız.
- **Sonraki denemeler:** Parça parça daralttım: `pto.ledger HAS (payPeriod._id == $row._id)` tek başına da, `pto.ledger HAS (entryType == $choice(accrual))` de policied olarak aynı hatayı veriyor. Tamamen başka bir sorgu `SELECT core.employees { onLedger := pto.ledger HAS (employee._id == $row._id) }` `can.dev` olarak da aynı hata. Yani `pto.ledger`'ın read kuralı (`policy('ptoVisible')`: `self(employee.person) OR self(employee.manager.person) OR policy(...) …`) bir tablo-seviyesi `HAS` içine enjekte edilince bozuk SQL üretiyor. Buna karşılık reverse link üzerinden aggregate (`employee.ptoLedger[sum(hours) …]`) policied olarak çalışıyor (`pto.balances`).
- **Çözüm / Workaround:** `pto.payPeriodsList`'i `elevated` yaptım; içine `ASSERT 'hr_admin' IN $context.role OR 'hr_manager' IN $context.role` koydum. Ledger tutarı döndürmüyor, sadece "posted" boolean'ı.
- **Durum:** Workaround ile çözüldü
- **Öneri:** `<table> HAS (…)` içindeki policy enjeksiyonunu reverse-link yolundakiyle aynı derleyiciden geçirin. Hata, design authority çağıranlara ya da `run_wql_dry` ile `targetUserId` verildiğinde en azından Postgres mesajını ve derlenen SQL'i göstersin; şu an tek yol bisection.

## Built-in teams (`auth.teams`) vs an effective-dated org: discovered, used late, and two worlds that can't be combined
- **Görev:** Departman hiyerarşisini, departman başkanı/üst yönetici görünürlüğünü ve onay yedeklemesini kurmak. PRD: "Manage departments… Assign heads… Preserve historical org chart changes… Manager reassignment updates approval routing automatically".
- **Kategori:** Eksik özellik (keşfedilebilirlik değil: `dcl-built-in-teams` makalesini işin başında okudum ve makale departmanlar için teams'i açıkça öneriyor)
- **İlk deneme:** Departmanları kendi `org.departments` tabloma, effective kolonlarla (`name`, `active`, `head`) kurdum ve teams'i sadece ofislerde (HR Manager kapsamı) kullandım. Gerekçe: PRD tarihli org geçmişi istiyor; `auth.team_memberships` ise versiyonlu (`AS OF` = kayıt zamanı) ama effective-dated değil (iş zamanı). Bu yüzden "1 Mart'tan itibaren Sales'e geçti" gibi geriye/ileriye tarihli bir transfer, ve gerekçe kolonu ifade edilemiyor. Ayrıca team yazmak base admin yetkisi; HR rolü departman açamıyor. Teams'in getireceklerini (transitif `oversees`/`below`, iç içe departman, sunucu tarafı org ağacı) o an tartmadım.
- **Sonuç:** Bu karar sonradan iki yerde pahalıya patladı: (1) `LOOP` effective `manager` linkini takip edemediği için "yöneticimin yöneticisi" ya da "departman başkanı alt departmanları görsün" kuralları yazılamadı. (2) Org ağacı istemcide kuruluyor. Kullanıcı sorunca hibrit modele geçtim.
- **Sonraki denemeler (hibrit model):**
  1. `org.departments.team` (team kolonu, unique) + `auth.teams` ağacı: "WynHR (company)" kökü (lead: CEO), her departman bir alt team (`leadScope: subtree`, `externalId: dept:<code>`).
  2. `org.syncDepartmentTeams`: `elevated` NQ (team üyeliği yazmak base administration; `ASSERT` ile sadece HR ve sistem). Aktif çalışanlar mevcut departman team'inin `member`'ı, departman başkanı `lead`'i oluyor; ayrılan ya da departman değiştiren çıkarılıyor. Set-tabanlı ve idempotent; ilk denemede çalıştı.
  3. Üç flow: çalışan `department`/`status` UPDATE (dönem yürürlüğe girdiğinde tetikleniyor), işe alım INSERT, departman `head`/`team` UPDATE → sync. Test: Zeynep'i bugünden Sales'e taşıdım; flow üyeliği taşıdı. Dönemi silince geri taşıdı.
  4. `org.createDepartment` / `org.renameDepartment` / `org.setDepartmentParent`: elevated + HR kontrolü; team'i birlikte yaratıyor, adlandırıyor ve ağaçta taşıyor. UI'dan "Platform Engineering" (Engineering altında) yaratıldı, Finance People altına taşındı.
  5. Erişim: `ALTER POLICY 'ptoVisible'` += `leads(employee.department.team) OR oversees(employee.department.team)`. Sonuç: Can (Platform lead) Jonas'ın PTO'sunu görüyor, Deniz (kök lead) herkesi, Zeynep sadece kendini. Onay: interaction'a `deptTeam` parametresi + `GRANT answer … TO ALL FILTER deptTeam IN $context.teamIdsLed`. Jonas'ın talebi Lena (yönetici), Can (departman lead), Deniz (kök) ve Mert'e (Berlin HR) düştü; Zeynep'e düşmedi.
- **Çözüm / Workaround:** Hibrit: tarihli geçmiş ve gerekçeler effective tablolarda, "şu an kim kimi görür" team ağacında, aralarında flow ile senkronizasyon.
- **Durum:** Workaround ile çözüldü
- **Kalan bedel:** İki doğruluk kaynağı. İleri tarihli bir transfer team'e ancak yürürlüğe girince yansıyor. Departman ağacının (`parent`) geçmişi effective değil, sadece `AS OF` ile okunabiliyor; "geçen yıl Platform hangi departmanın altındaydı" iş tarihine göre sorulamıyor.
- **Öneri:** (a) Effective-dated team membership ve team parent (`team_memberships` için `effectiveDating`), ya da bir effective team kolonunun (`core.employees.department.team`) `$context.teamIds*` kümelerine doğrudan girebilmesi; böylece ikinci kaynağa ve senkron flow'a gerek kalmaz. (b) `dcl-built-in-teams` makalesindeki "Prefer this, or walk your own hierarchy?" bölümü effective-dated org senaryosunu da ele alsın (hibrit önerisi + senkron kalıbı). (c) Team yaratma/taşıma için base admin dışında devredilebilir bir yetki (örn. `GRANT insert ON auth.teams TO hr_admin FILTER …`); şu an tek yol elevated NQ.

## Authority delegation: only role-scoped, filter-based answer rules can be lent
- **Görev:** Yöneticinin izindeyken PTO onay yetkisini belirli bir tarih aralığı için bir meslektaşına devretmesi (PRD: onay yönlendirmesi; kullanıcı "authority delegation" istedi).
- **Kategori:** Eksik özellik
- **İlk deneme:** Mevcut onay kurallarını (`GRANT answer … TO ALL FILTER deptTeam IN $context.teamIdsLed`, ve interaction'ın doğrudan atanana gitmesi) olduğu gibi bırakıp `auth.createDelegation` ile anahtar `pto.request_approval.interaction.ask.answer` ödünç verdim. Beklenti: ödünç alan, ödünç verenin göreceği onayları görür.
- **Sonuç:** Lena'nın devrettiği anahtar kullanılamadı: devredilebilir anahtar listesi (`auth.getUserDelegatableKeys`) boştu. `TO ALL` kuralları ödünç verilemiyor; atanan (assignee) yolu da devredilebilir değil.
- **Sonraki denemeler:** (1) `manager` rolü (`lock: true`) açtım; `org.syncDepartmentTeams` departman başkanlarına ve doğrudan raporu olanlara bu rolü atıyor. (2) Onay kurallarını `TO manager {delegatable: true}` ile yeniden yazdım: biri `managerUser == $context.userId`, biri `deptTeam IN $context.teamIdsLed`. Ödünç alanda `$context.userId` ödünç verene çevriliyor, filtreler de ona göre çalışıyor. (3) Kendi talebini onaylamayı `PREVENT answer … TO ALL FILTER requesterUser == $context.userId` ile engelledim; `PREVENT` ödünç alanın kendi kimliğine uygulanıyor.
- **Çözüm / Workaround:** Lena → Selin (16–30 Kas 2026): Selin, Zeynep'in talebini gördü ve onayladı. Can, Lena'dan devir alsa bile kendi talebini ne gördü ne onaylayabildi. Uygulamada Inbox'ta "Delegate my approvals" kartı var: kişi + tarih seç, aktif/planlı/bitmiş/iptal listesi, Revoke; alıcı tarafında "Approvals delegated to me" + Decline. Tarayıcıda Ayşe → Selin oluşturma ve geri alma denendi.
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) Interaction'ın atanan yolu (assignee) da devredilebilir olsun: "bana gelen işler" en doğal devir konusu. (b) `TO ALL` bir kuralın neden devredilemediği `createDelegation` hatasında ya da `getUserDelegatableKeys` açıklamasında söylensin ("bu anahtarı veren kurallar rol kapsamlı değil"). (c) Delegasyon makalesine "onay devri" uçtan uca örneği: rol + `delegatable` + `PREVENT` ile kendi kendini onaylamayı engelleme.

## `PREVENT … FILTER param == $context.userId` with a NULL param blocks the row (fail-closed), silently
- **Görev:** Kendi talebini onaylamayı engellemek (`requesterUser` interaction parametresi).
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** `PREVENT answer ON pto.request_approval.interaction.ask TO ALL FILTER requesterUser == $context.userId`.
- **Sonuç:** Yeni talepler doğru çalıştı. Ama `requesterUser` parametresi eklenmeden önce açılmış eski onaylar (parametre NULL) herkesin inbox'ından kayboldu. Deniz ve Can artık bunları göremiyordu. Hata yok, uyarı yok.
- **Sonraki denemeler:** Filtreyi `requesterUser IS NOT NULL AND requesterUser == $context.userId` yaptım.
- **Çözüm / Workaround:** Eski onaylar geri geldi; kendi kendini onaylama engeli sürüyor.
- **Durum:** Çözüldü
- **Öneri:** `PREVENT` filtresinin NULL'da "engelle" yönünde (fail-closed) değerlendirildiği belgelensin, ve `run_wql_dry`/diagnostic NULL olabilen bir parametre ile karşılaştıran `PREVENT` için uyarı versin ("param can be null; rows with null will be prevented — add IS NOT NULL").

## Delegation API is built in but not linked from the DCL articles; `delegateId` is a user id, while app data is keyed by employee
- **Görev:** Uygulamada devir ekranı.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** Devri kendi tablom + flow ile kurmayı düşünürken `auth.*Delegation` NQ'larını (`createDelegation`, `listGrantedDelegations`, `listReceivedDelegations`, `revokeMyDelegation`, `declineDelegation`, `getUserDelegatableKeys`) `system.searchArticles` yerine NQ listesinde buldum. `createDelegation`'a çalışan kaydının `_id`'sini verdim.
- **Sonuç:** Çalışan id'si ile devir anlamsızdı (`auth.users` id'si bekleniyor). Uygulamanın dizini ise çalışan `_id` döndürüyordu; kullanıcı id'si hiç yoktu.
- **Sonraki denemeler:** `core.directory`'ye `userId := person._id` ekledim; ekran seçimde kullanıcı id'sini gönderiyor, listelerde adları dizinden çözüyor.
- **Çözüm / Workaround:** Çalıştı.
- **Durum:** Workaround ile çözüldü
- **Öneri:** Rol/policy makaleleri delegasyon NQ'larına bağlansın. `delegateId`/`delegatorId` tipleri typegen'de branded olsun (`UserId`). `list*Delegations` delegator/delegate adlarını da döndürüyor, bunu dokümanda öne çıkarın; çağıranın kendi id'sini istemek yerine varsayılan olarak `$context.userId` kullansın.

## Export audit: I built my own table without checking the built-in logs first
- **Görev:** PRD: "Exports logged: who, which report, when, with which filters."
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** Built-in seçenekleri aramadan doğrudan `audit.export_log` tablosunu (actor, reportName, format, filters, rowCount) ve `audit.logExport` NQ'sunu kurdum; uygulama dosyayı üretmeden önce bunu çağırıyor. Veri değişikliği denetimi için kendi mekanizmamı kurmadım: versiyonlu/effective tablolar + `system.change_log` (şu an 727 kayıt) + effective kolonların `reason` alanı kullanılıyor. Maaş (`compensation`) `sensitive` işaretli, okumaları `system.access_logs`'a düşüyor (7 kayıt).
- **Sonuç:** Kullanıcı sorunca built-in'leri sonradan karşılaştırdım (`dcl-policy-injection-assurance-logging-grants`). Built-in'lerle export denetimi tam karşılanmıyor: (1) Export istemcide üretiliyor; sunucu sıradan bir SELECT görüyor, "bu bir indirme" bilgisi, format ve satır sayısı hiçbir yerde yok. (2) `access_logs` yalnızca `sensitive` işaretli kolonların okumasını yazıyor; PTO bakiyesi ve dizin raporlarında böyle kolon yok, kayıt oluşmuyor. Rapor kolonlarını `always` yapmak her ekran görüntülemesini de loglar (gürültü) ve yine "export" ile "ekranda görme"yi ayırmaz. (3) `change_log` yazmaları tutuyor, okumaları değil.
- **Sonraki denemeler:** Kullanıcı onayıyla export'u sunucu tarafına taşıdım: her rapor için bir `audit.export*` named query (5 adet). Tek ifade: `$rows := SELECT <rapor NQ>(…)`; `$cnt := SUMMARIZE $rows { n := count() }`; `$log := INSERT audit.export_log EACH (SELECT $cnt { n }) { actor: $context.userId, … rowCount: $item.n, filters: jsonb_build_object(…) }`; `SELECT $rows {…}`. Yolda: (1) `@value (SUMMARIZE …)` INSERT değerinde parse edilmiyor; (2) `EACH (SUMMARIZE …)` kabul edilmiyor, araya `$cnt` CTE'si gerekti; (3) set-tabanlı INSERT `generatedAt: now()` (timestamptz) yazmayı reddetti; `_createdAt` zaten aynı bilgi olduğu için `generatedAt`'i opsiyonel yaptım; (4) `||` yok (ayrı bulgu), `concat()` kullandım.
- **Çözüm / Workaround:** Uygulama artık export satırlarını bu NQ'lardan alıyor; satır sayısı, filtreler (gerçek sorgu parametrelerinden) ve aktör sunucuda yazılıyor, okumayla aynı işlemde. Policied: Zeynep aynı export'ta sadece kendi 3 satırını aldı ve log `rowCount: 3` yazdı. İstemcinin çağırdığı `audit.logExport` silindi. Tarayıcıda dizin (XLSX, arama "engineer" → 4 satır) ve kullanım geçmişi (PDF) denendi. Kalan açık: kullanıcı ekranda gördüğü veriyi zaten okuyabildiği için normal rapor sorgusunu çağırıp kendisi dosya üretebilir; bunu hiçbir log engellemez. Ayrıca policied INSERT için `GRANT insert ON audit.export_log TO ALL FILTER self(actor)` kalması gerekiyor; ham WQL yazabilen bir istemci kendi adına sahte log satırı ekleyebilir.
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) "Audit" diye arayan birini `access_logs` / `change_log` / versiyon geçmişi üçlüsüne götüren bir genel bakış makalesi olsun ("Neyi hangi log tutar, neyi tutmaz"; örn. "uygulama düzeyinde olaylar: export, yazdırma → kendi tablonu kur ya da şunu kullan"). (b) Named query'ye `logAccess: true` gibi bir işaret: bir NQ'nun her çağrısı (sensitive kolon olmasa da) `access_logs`'a NQ adı ve parametreleriyle yazılsın; `pto.balancesExport` gibi export NQ'ları, istemciye güvenmeden kendiliğinden denetlenir.

## No `||` string concatenation; the lexer error gives no hint
- **Görev:** Export dizin sorgusunda isim araması: `name ILIKE '%' || $q || '%'`.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** SQL'deki gibi `||`.
- **Sonuç:** `[lexer] token recognition error at: '|'` her `|` için ayrı satır (~20 hata, ~17k karakter), ardından ilgisiz parser hataları (`expecting END`). "Bunun yerine `concat()` kullanın" ipucu yok; oysa aynı hata çıktısı CTE ayırıcısı için ipucu veriyor.
- **Sonraki denemeler:** `concat('%', $q::text, '%')`.
- **Çözüm / Workaround:** Çalıştı.
- **Durum:** Workaround ile çözüldü
- **Öneri:** `||`'yu destekleyin (SQL'den gelen herkes yazacak) ya da lexer bunu tanıyıp tek satırlık bir ipucu versin: "WQL has no `||`; use concat(a, b, …)". Aynı karakter için tekrarlanan lexer hatalarını tek bir hataya indirin.

## Moving the app to a new origin: self-registered client refuses the new callback (`invalid_client_metadata`)
- **Görev:** Uygulamayı Cloudflare Pages'e (`https://wynhr.pages.dev`) yayınlayıp aynı WyndBase client'ıyla (`wynhr-web`) giriş yapmak.
- **Kategori:** Keşfedilebilirlik
- **İlk deneme:** Yayından sonra `auth.clients` satırında `redirectUrls`'a `https://wynhr.pages.dev/`, `allowedOrigins`'e origin'i ekledim. Beklenti: yeni adresten giriş çalışır.
- **Sonuç:** "Sign in" tıklanınca hiçbir şey olmadı. Konsolda `404` (client-info), `400` ve yakalanmamış `invalid_client_metadata`. Neden: yeni tarayıcıda kalıcı client id yok, `autoRegister` client'ı ad + callback kümesiyle (`{https://wynhr.pages.dev/}`) yeniden kaydetmeye çalışıyor. Aynı ad farklı callback kümesiyle (`{localhost, pages.dev}`) zaten var, bu yüzden reddediliyor. `sdk-auth` makalesi bu davranışı anlatıyor; ama çözümü (bir tasarımcının client'ı "Clients whose redirects match may register as this client" ile işaretlemesi) alan adıyla değil konsol metniyle tarif ediyor. Alan `registersByRedirect`. Ek olarak `UPDATE … { redirectUrls: ['a','b'] }` literal listesi `jsonb but expression is of type text[]` ile reddedildi; parametre (`$urls`) olarak geçince çalıştı.
- **Sonraki denemeler:** `UPDATE auth.clients […] { registersByRedirect: true }`.
- **Çözüm / Workaround:** Çalıştı: canlı sitede authorize → callback → token akışı tamamlandı, Ayşe ana sayfayı verisiyle gördü.
- **Durum:** Workaround ile çözüldü
- **Öneri:** (a) `invalid_client_metadata` gövdesi nedeni söylesin: "client 'wynhr-web' exists with callbacks [...]; add this callback to it and enable registersByRedirect, or address the client by its id". (b) Makalede konsol metninin yanında alan adı (`registersByRedirect`) ve "uygulamayı yeni bir alan adına taşıma" tarifi olsun. (c) `jsonb` bir kolona WQL liste literal'i yazılabilsin. (d) SDK, `authorize()`'da kayıt hatasını yakalanmamış promise olarak bırakmasın; `onUnauthorized`/`onRegistrationError` yoluna düşsün. (Uygulama tarafında da butona hata gösterimi eklenmeli.)

## React app built on a hand-written `useLoad` hook instead of the SDK's TanStack Query binding (`WyndbaseProvider` + `useQuery`)
- **Görev:** React uygulamasında veri okuma/yazma.
- **Kategori:** Keşfedilebilirlik (bilinçli bir tercih değildi)
- **İlk deneme:** MCP talimatının işaret ettiği `sdk-building-an-application` makalesini okudum. Makale çatıdan bağımsız: `wyndbase.query.<space>.<name>()` çağrısı ve `QueryObserver` örneği var; `useQuery` tek bir cümlede geçiyor ("a `QueryObserver` is what `useQuery` does"), `sdk-getting-started` ve `sdk-queries` makalelerine link var. Linkleri açmadım; kendi `useLoad` hook'umu yazdım (promise + state + elle `reload()`); inbox için de `QueryObserver`'ı elle bağladım.
- **Sonuç:** Kullanıcı sorunca baktım: `sdk-getting-started` React için `WyndbaseProvider`'ı anlatıyor; altındaki `useQuery`/`useSuspenseQuery` SDK'nın kendi `queryClient` cache'ini `QueryClientProvider` gerekmeden okuyor. `sdk-queries`: `useQuery(sdk.query.shop.listOverdue({ days: 30 }))`, `useMutation(sdk.mutation.shop.shipOrder())`. `sdk-realtime`: `useQuery(sdk.query.x().live())`, yani sorgu sunucuda değişince kendiliğinden tazeleniyor. Kaçırdıklarım: (1) cache yok; aynı sorgu (ör. `core.directory`) her bileşende ayrı çekiliyor; (2) mutasyondan sonra ekranlar elle `reload()` ile tazeleniyor ve bir kısmı hiç tazelenmiyor (başka bir kullanıcının onayı Time off ekranına sayfa yenilenmeden yansımıyor); (3) live query hiç kullanılmadı; (4) yükleme/hata durumları her sayfada elle.
- **Sonraki denemeler:** Yok.
- **Çözüm / Workaround:** Uygulama çalışıyor, ama SDK'nın idiomatik yolu bu değil. Geçiş: `@tanstack/react-query` + `WyndbaseProvider`, `useLoad` → `useQuery(wyndbase.query…())`, değişebilen ekranlarda `.live()`, mutasyonlar `useMutation`.
- **Durum:** Workaround ile çözüldü (kullanıcı kararı bekliyor: geçiş yapılsın mı)
- **Öneri:** "Building an application with the SDK" makalesi (ajanlara gösterilen giriş noktası) çatı seçimini ilk adım yapsın: "React kullanıyorsan `WyndbaseProvider` + `useQuery(sdk.query…())` + `.live()`; çatısız kullanıyorsan `QueryObserver`". Şu an React yolu tek cümle ve iki link uzağında; doğrudan örnek olarak makalede olmalı. Ayrıca typegen bir React projesinde `@tanstack/react-query` eksikse bunu söyleyebilir.
