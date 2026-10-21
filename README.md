# Test Me — e2e tests (Cypress)

Автотести навчального магазину <https://test-me.vzl.one>: API через
`cypress-plugin-api` (`cy.api()`), UI — Cypress e2e на Page Object Model на
двох вьюпортах (desktop і телефон), звіт — Allure (історія публікується на
GitHub Pages). Джерело очікуваної поведінки — бізнес-вимоги до магазину, контракт — `openapi.json`.

Сайт містить навмисні баги. Тести написані за **очікуваною** поведінкою;
тести, що падають через баг, позначені `KNOWN BUG` у коді, тегом `known-bug`
в Allure і залишені червоними — це правильний результат.

## Запуск

```bash
npm install
npm run cy:smoke         # @smoke — happy-path API + UI-покупка
npm run cy:api           # @api — 92 API-тести (86 ✓, 6 = відомі баги)
npm run cy:ui            # @ui без @visual — 34 UI-сценарії на desktop + mobile
npm run cy:mobile        # лише телефонний вьюпорт (390×844)
npm run cy:regression    # усе, крім @visual (те саме, що ганяє CI)
npm run cy:known-bugs    # лише тести з відомими багами
npm run cy:visual        # візуальні знімки (локально, див. нижче)
npm run cy:e2e:run       # clear → regression → Allure-звіт у браузері
npm run report           # allure generate + open
npm run cy:open          # інтерактивний режим
```

Фільтрація за тегами — `@bahmutov/cy-grep`: `npx cypress run --expose grepTags=@checkout`,
`grepTags=@ui+-@known-bug` (AND / NOT), `grepTags=@mobile`, `--expose grep="coupon"` за назвою.

## Локальний запуск і налагодження

### 1. Підготовка

```bash
git clone <repo> && cd NAIS
npm install            # ставить Cypress 16 і плагіни; бінарник Cypress завантажується в ~/Library/Caches/Cypress
npx cypress verify     # перевірка, що бінарник запускається
```

Нічого налаштовувати не потрібно: `baseUrl` уже `https://test-me.vzl.one`,
токени workspace тести створюють самі. Потрібен лише доступ до інтернету.

### 2. Headless-прогін (як у CI)

```bash
npm run cy:smoke        # ~10 с, перевірка «чи все живе»
npm run cy:regression   # ~2 хв, повний набір без візуальних
npm run cy:api          # лише API
npm run cy:ui           # лише UI (desktop + mobile)
```

Підсумок друкується таблицею за спеками; для тестів, що впали,
`cypress-terminal-report` додатково виводить команди та консоль браузера:

```
  Running:  api.cy.js                                                 (1 of 7)
    1) пошук ігнорує регістр
      cy:command ✔  GET	/api/products?q=орбіта
      cy:command ✔  assert	response time (ms): expected 80 to be below 5000
  86 passing (38s)
  6 failing

  │ ✖  api.cy.js            00:37    92    86    6   │
  │ ✔  smoke.cy.js          00:01     5     5    -   │
  │ ✔  ui/catalog.cy.js     00:19    18    18    -   │
```

Шість червоних в `api.cy.js` і два в `ui/known-bugs.cy.js` (desktop + mobile) —
це відомі баги (див. таблицю нижче). Будь-яке **інше** падіння — регресія.

Скріншоти тестів, що впали: `reports/screenshots/<spec>/<test> (failed).png`.

### 3. Інтерактивний режим — основний спосіб налагодження

```bash
npm run cy:open
```

Відкриється Launchpad: оберіть **E2E Testing** → браузер → спеку.



Electron позначений як deprecated, але для налагодження він найшвидший; для
відтворення CI обирайте Chrome. У ранері ліворуч — командний лог, праворуч —
застосунок. Що робити з тестом, що впав:

1. **Time-travel**: наведіть на будь-яку команду в лозі — праворуч покажеться
   DOM на момент її виконання; клік «пінить» знімок. Так видно, що насправді
   було на сторінці, коли `should()` не дочекався.
2. **`cy.api()`** (cypress-plugin-api) малює під кожним API-викликом панель із
   запитом, заголовками, тілом відповіді та статусом — токен, `detail` і
   `fields` з 422 читаються прямо там, без curl.
3. **DevTools** ранера (`⌥⌘I`): вкладка Console показує `cy.log`, помилки
   застосунку та мережеві запити; `cy.intercept` видно у вкладці Network.
4. **Точковий перезапуск**: `it.only(...)` / `describe.only(...)` або фільтр за
   назвою в полі пошуку ранера. Файл пересохранили — спека перезапуститься сама.
5. **Пауза**: `cy.pause()` зупиняє виконання перед наступною командою, далі —
   кнопкою «Next» по одній команді; `cy.debug()` кладе поточний subject у
   `debugger`.
6. **Селектори**: кнопка «Selector Playground» (приціл над застосунком)
   підказує селектор за кліком; у цьому проєкті пріоритет —
   `findByLabelText`/`findByRole`, потім `data-testid`.
7. **Мобільний вьюпорт**: кожна UI-спека містить блоки `[desktop]` і
   `[mobile]`; щоб відтворити мобільний баг, запустіть блок `[mobile]` або в
   консолі ранера виконайте `cy.viewport(390, 844)`.
8. **Чекбокси тестів** (`cypress-plugin-grep-boxes`): у ранері біля кожного
   тесту є чекбокс і його теги; позначте потрібні й натисніть фільтр над
   списком — виконаються лише вони. `npm run cy:open:pick` відкриває спеку
   без автозапуску, щоб спочатку обрати.
9. **Лише ті, що впали** (`cypress-plugin-last-failed`): після будь-якого
   прогону перемикач ↻ у ранері перезапускає тільки тести з
   `test-results/last-run.json`; у терміналі те саме — `npm run cy:last-failed`.


Headed-прогін без Launchpad, вікно лишається відкритим після завершення:

```bash
npx cypress run --headed --no-exit --browser electron --spec cypress/e2e/ui/checkout.cy.js
```

### 4. Allure-звіт локально

```bash
npm run cy:e2e:run      # clear → regression → generate → open у браузері
# або покроково
npm run allure:generate # allure-results → allure-report
npm run allure:open     # піднімає локальний сервер і відкриває звіт
```

Огляд: дерево за спеками та `describe`, лічильники passed/failed, фільтри за
тегами (`known-bug`, `smoke`, `mobile`…), severity і категоріями.


Картка тесту: текст помилки, лейбли (`tag: known-bug`, `severity`), посилання
на дефект `BUG-…`, опис причини та покроковий лог команд із вкладеннями
(скріншот падіння).


Звіт у CI публікується на GitHub Pages з історією прогонів (вкладка History
у картці тесту показує, коли тест став червоним).

### 5. Типові проблеми

| Симптом | Причина / рішення |
|---|---|
| `Cypress.env() was removed` | Cypress 16: значення передаються через `--expose k=v` і читаються `Cypress.expose('k')`; у проєкті константи в `support/constants.js` |
| `cy.wait('@products')` ловить «не той» запит | Застосунок шле два запити каталогу на старті та по одному на кожен символ у пошуку. Alias матчить лише `limit=6`, введення — через `cy.setInput()` |
| `expected '2 400,00 ₴' to contain '2 400'` | Вузький нерозривний пробіл U+202F в `Intl`; порівнюйте через `money('2 400,00')` |
| `cy.wait('@products')` → «No request ever occurred» після `visit` | Soft rate limit 30 workspace/хв на IP: застосунок отримав 429 на `POST /workspaces` і не завантажив каталог. `cy.visitShop()` тому переиспользує один workspace на спеку; зачекайте хвилину або ганяйте за тегами |
| Візуальний тест червоний на іншій машині | Baseline знятий в Electron на macOS; `npm run cy:visual:update` перестворює його локально, у CI `@visual` виключений |
| Потрібно ганяти лише один блок API | `npx cypress run --expose grep="05 Quote"` або `grepTags=@api` + `it.only` |
| Докладний лог самого Cypress | `DEBUG=cypress:* npx cypress run ...` |

Для агентів і скриптів: при запущеному `cypress open` спеку можна ганяти без
GUI — `npx cypress tap run cypress/e2e/api.cy.js`, потім `npx cypress tap status --json`
і `npx cypress tap reporter` для читання результатів і командного логу.

## Структура

```
cypress/
  e2e/
    api.cy.js            API-регрес (@api): Workspace, Catalog, Favorites, Reviews, Quote, Checkout, Cancel, Reorder & stock
    smoke.cy.js          @smoke: health → workspace → каталог → quote → checkout → detail → cancel
    pages/               Page Objects (класи з геттерами-локаторами та методами-діями, експорт синглтона)
      shopPage.js        каталог: пошук, категорії, ціна, сортування, пагінація, картки, кнопка кошика
      cartPage.js        діалог кошика: рядки, промокод, доставка, totals, форма оформлення
      comparePage.js     панель і таблиця порівняння
      ordersPage.js      «Мої замовлення»: картки, статус, деталі
    ui/                  кожна спека виконується на desktop (1366×900) і mobile (390×844) через describeOnViewports()
      catalog.cy.js      пошук, ціновий фільтр, комбінації, скидання, повернення на стор. 1, in-stock, сортування, адаптивна сітка
      compare.cy.js      2 товари → таблиця, «—» для відсутніх характеристик, ліміт 3, persist після reload, очищення
      checkout.cy.js     TM-CHECKOUT-001 (токен через cy.api → localStorage['test-me:v2']) + declined (402) + невідомий промокод (422)
      known-bugs.cy.js   @known-bug: UI-дефекти, падають навмисно, retries: 0
      visual.cy.js       @visual: знімки картки p01 і таблиці порівняння на обох вьюпортах
  support/
    e2e.js               реєстрація плагінів
    commands.js          cy.createWorkspace, cy.apiAs, cy.visitWithToken, cy.visitShop, cy.setInput, cy.waitForOrderCount, cy.expectToast
    viewports.js         VIEWPORTS, describeOnViewports(), isMobile()
    schemas.js           Ajv-схеми реальних відповідей (в OpenAPI для всіх 2xx стоїть schema: {})
    api-helpers.js       expectError(res, status, {detail, field}), expectTotals(), тестові дані checkout
    allure.js            KNOWN_BUG(id, summary), labels({epic, feature, story})
    constants.js         STORAGE_KEY, COUPON, CATALOG_URL, RESPONSE_SLA_MS, money(), priceOf()
  snapshots/             baseline-знімки для @visual
docs/
  Test-plan-and-cases.docx   план тестування (обсяг, підхід, пріоритети, ризики, критерії, відомі дефекти) і 18 тест-кейсів
.github/workflows/allure-reporter.yml   CI: 3 шарди → Allure з історією → GitHub Pages
```

## План тестування та тест-кейси

`docs/Test-plan-and-cases.docx` — короткий план із пріоритетами (P1–P3) і
ризиками та 18 тест-кейсів у форматі зразка із завдання: ідентифікатор, назва,
пріоритет, тип, адреса, передумови, тестові дані, кроки з очікуваними
результатами, післяумова, посилання на автотест. Кейси, що зачіпають відомі
дефекти, мають примітку з номером бага.

### Мобільні тести

`describeOnViewports(title, options, fn)` створює по одному `describe` на
вьюпорт (`… [desktop]`, `… [mobile]`), ставить `cy.viewport()` перед хуками
спеки та додає теги `@desktop` / `@mobile`. Сценарії ті самі, що й на desktop,
бо адаптивна верстка (`@media (max-width: 650px)`) змінює лише розкладку:
header переноситься, сітка каталогу стає 2-колонковою, кнопки картки — у
стовпчик, у рядку кошика ховається лише зображення. Селектори не змінюються.
Окремо перевіряється кількість карток у рядку (2 на телефоні, більше на desktop).

## Плагіни і де вони використовуються

| Пакет | Навіщо | Де |
|---|---|---|
| `cypress-plugin-api` | `cy.api()` з візуалізацією запиту/відповіді в ранері | усі API-тести (`cy.apiAs` — обгортка з токеном, SLA і content-type) |
| `allure-cypress` + `allure` (CLI) | Allure 3 звіт: epic/feature, теги, описи відомих багів, історія прогонів (`historyPath` в `allurerc.mjs`) | `cypress.config.js`, `support/allure.js`, `allurerc.mjs` |
| `@bahmutov/cy-grep` | теги `@smoke @api @ui @mobile @desktop @known-bug @visual @catalog @compare @checkout` і npm-скрипти; база для grep-boxes і last-failed | усі `describe`/`it` |
| `cypress-plugin-grep-boxes` | чекбокси біля тестів у ранері: обрати кілька тестів або тег і запустити лише їх (open mode) | `support/e2e.js`; `npm run cy:open:pick` відкриває без автозапуску |
| `cypress-plugin-last-failed` | перезапуск лише тестів, що впали в попередньому прогоні: `npm run cy:last-failed` (run mode) і перемикач ↻ у ранері (open mode); результати в `test-results/last-run.json` | `cypress.config.js` (`collectFailingTests`), `support/e2e.js`; у run mode — через `scripts/run-last-failed.js` + `cypress.last-failed.config.js`, бо штатний CLI плагіна передає фільтр через `CYPRESS_grep` (env), який Cypress 16 не віддає в браузер |
| `cypress-on-fix` | дозволяє кільком плагінам слухати одну подію (`after:run`, `after:spec`): без нього Cypress лишає лише останній обробник і last-failed не записує файл | `cypress.config.js` (`setupNodeEvents`) |
| `@testing-library/cypress` | локатори за доступним ім'ям (`findByLabelText`, `findByRole`) — стійкіші за CSS-id | `pages/shopPage.js`, `pages/cartPage.js` |
| `cypress-wait-until` | polling без фіксованого `cy.wait(ms)` | `cy.waitForOrderCount()` — крос-перевірка API після UI-покупки |
| `cypress-terminal-report` | консоль браузера та команди Cypress у терміналі для тестів, **що впали** (CI-логи без відео) | `cypress.config.js`, `support/e2e.js` |
| `cypress-split` | шардування спек по 3 машинах CI (`SPLIT`/`SPLIT_INDEX`), локально no-op | workflow matrix |
| `@simonsmith/cypress-image-snapshot` | візуальна регресія (`matchImageSnapshot`, поріг 2 %) | `ui/visual.cy.js` |
| `@faker-js/faker` | контактні дані покупця | `ui/checkout.cy.js` |
| `ajv` | валідація JSON-схем відповідей | `support/schemas.js` |

`cypress-image-snapshot` (оригінал) покинутий і не працює з Cypress ≥ 10 —
узято підтримуваний форк `@simonsmith/cypress-image-snapshot`.

### Візуальні тести

Baseline-знімки залежать від браузера та ОС, тому `@visual` виключений із CI
(`grepTags=-@visual`) і ганяється локально в Electron. Оновити baseline:
`npm run cy:visual:update`. Diff-зображення при розбіжності — `reports/snapshot-diffs/`.

## CI (GitHub Actions → Allure → GitHub Pages)

`.github/workflows/allure-reporter.yml` — за `push`/`pull_request` у `main`, щодня о 06:00 UTC і вручну:

1. **cypress** — матриця з 3 шардів (`cypress-split`), Chrome, `grepTags=-@visual`; крок `continue-on-error`, щоб відомі баги не блокували звіт. Артефакти: `allure-results-<shard>`, скріншоти падінь.
2. **report** — завантажує результати всіх шардів (`merge-multiple`), відновлює історію прогонів із `gh-pages/history/history.jsonl`, збирає звіт тим самим `allure` CLI, що й локально (`allurerc.mjs`, 20 останніх прогонів), кладе `history.jsonl` поруч зі звітом і публікує `peaceiris/actions-gh-pages` на `gh-pages` (на PR — лише артефакт). Docker-дій у pipeline немає — збірка не залежить від зовнішніх registry.

Щоб звіт відкривався за URL, у налаштуваннях репозиторію ввімкніть Pages → Source: branch `gh-pages`.
`dependabot.yml` оновлює npm (група `cypress*`/`allure*`) і actions щотижня.

## Покриття API

| Блок | Перевірки |
|---|---|
| Workspace | токен на 24 год, старий токен не відкликається, `GET /workspaces` → 405, Bearer/порожній/невірний токен → 401, пріоритет 401 над валідацією та 404 |
| Catalog | 6 на сторінці, деталь товару, 404, пошук (trim, регістр, лише за назвою, AND з категорією, фрагмент на 2 товари), категорія, включні межі ціни ±1 коп., min>max → 422, in_stock, числове сортування, комбінації, пагінація (сума сторінок = total, без дублів, з фільтром), межі limit/page/q, стабільність featured, деталь == картка для всіх 16 товарів, 422 із зазначенням поля |
| Favorites | порожньо → дедуплікація → персистентність → ізоляція → toggle; 16 id → 200, 17 → 422, unknown → 422, 401 |
| Reviews | null → 201 (trim, HTML як текст) → 409; `expire_at` = строк workspace; ізоляція читання й запису; межі rating 1/5, текст 10/500; відгук на товар без наявності; 422 з полем/причиною, 404, 401 |
| Quote | TM-CHECKOUT-001 крок 3; промокод із пробілами/регістр/unknown; поріг 1 500 грн (включно, до знижки), express завжди 150 грн; багаторядковий кошик, floor, детермінізм, 15 позицій; qty 10 і qty = stock; 422/409 з причиною; пріоритет помилок схема → stock → купон; 401 |
| Checkout | declined → 402 без замовлення і без витрати stock; approved → 201, `totals == quote`, свіжий `created_at`; detail; фільтри статусу; багаторядкове замовлення; 15 позицій; дефолти; межі імені/адреси/email; email upper-case/IDN ✓, без @/домену/з пробілами ✗; 422 перелічує всі поля; валідація раніше за stock; 409; 401; ізоляція 404 |
| Cancel | cancelled, totals без змін, фільтри, повторне скасування → 409, 404, 401 |
| Reorder & stock | промокод не переноситься; POST не ідемпотентний; stock — ліміт на замовлення і не зменшується в каталозі; скасування не чіпає сусіднє замовлення; cancelled-позиції квотуються знову; список від нових до старих, унікальні id, `all == confirmed + cancelled` |

Негативні тести перевіряють **причину** помилки (підрядок `detail` або поле у
`fields`), а не лише статус. Усі відповіді перевіряються на JSON-схему (Ajv),
`content-type: application/json` і SLA < 5 с.

## Відомі розбіжності зі спекою (KNOWN BUG, падають навмисно)

Станом на 2026-10-21 сервер і UI поводяться інакше, ніж вимагають бізнес-вимоги:

| # | Тест | Спека | Факт |
|---|---|---|---|
| 1 | API · пошук ігнорує регістр | пошук ігнорує регістр | `q=орбіта` → 0 результатів (`Орбіта` знаходить) |
| 2 | API · приймає промокод у нижньому регістрі | регістр коду не важливий | `welcome10` → 422 «Невідомий промокод» |
| 3 | API · поріг безкоштовної доставки включний (2 тести) | безкоштовно від 1 500 грн включно | subtotal 150 000 → доставка 8 000; 165 000 → 0 |
| 4 | API · ім'я коротше за 2 символи після trim | ім'я 2–80 символів після trim | `"  A  "` → 201 (адреса при цьому trim-иться коректно) |
| 5 | API · повторне скасування → 409 | повторне скасування → 409 | 200, статус лишається cancelled |
| UI-1 | UI · повторне додавання p07 (desktop і mobile) | одна позиція на product_id | `lab.js add()`: `if (existing && id !== 'p07')` — для p07 кожен клік додає новий рядок кошика |

Три з п'яти API-багів (1, 2, 4) — одна системна проблема: нормалізація введення
зроблена наполовину (trim без lowercase / не для всіх полів).

## Що не можна перевірити на поточних даних

- Округлення знижки вниз до копійки — усі ціни кратні 100, 10 % завжди ціле.
- Сортування при однакових цінах — усі 16 цін унікальні.
- Закінчення токена через 24 год — перевіряється лише `expires_at`.
- Пошук замовлення за частиною номера — є лише в UI, на API параметра немає.

## Обмеження API, враховані в прогонах

- Soft rate limit: 30 workspace/хв, 180 записів/хв; UI-спеки ділять один workspace на файл (`cy.visitShop()`), checkout створює власні; шарди CI розподіляють навантаження.
- Токен живе 24 год; кожен прогін створює свої workspace і не чіпає чужі дані.
- Токени не комітяться: живуть лише в пам'яті тесту (`cy.createWorkspace().as('token')`).

## Нюанси UI, враховані в тестах

- На старті застосунок робить два запити до `/api/products` (`limit=20` — кеш, `limit=6` — каталог); alias `@products` матчить лише другий, інакше `cy.wait` з'їжджає на один запит.
- `cy.type()` у пошуку шле запит на кожен символ → введення через `cy.setInput()` (одна подія `input`).
- Суми форматуються `Intl` з вузьким нерозривним пробілом (U+202F) → порівняння через regex `money('2 400,00')`.
- Cypress 16 прибрав `Cypress.env()` — константи в `support/constants.js`.
