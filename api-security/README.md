# API security tests (pytest · OWASP API Security Top 10 2023)

Негативні перевірки API <https://test-me.vzl.one> за категоріями OWASP.
Кожен тест стверджує, що **має** робити захищений сервер: відхиляти, ізолювати,
не розкривати. Відомі відхилення позначені `xfail(strict=True)` — прогін
зелений, але щойно сервер виправлять, тест «несподівано пройде» і впаде червоним,
нагадуючи зняти позначку.

| Файл | Категорія | Що перевіряється |
|---|---|---|
| `test_api01_bola.py` | API1 Broken Object Level Authorization | чуже замовлення/відгук/обране → 404 як для неіснуючого; викривлені id; сусідній id не вгадується; stock ізольований |
| `test_api02_broken_authentication.py` | API2 Broken Authentication | 9 захищених ендпоінтів × 8 варіантів токена (порожній, Bearer, cookie, query, мутований…) → 401; 401 важливіше за 422/404; токени довгі, унікальні; токен не повертається у відповідях |
| `test_api03_property_authorization.py` | API3 Property Level Authorization | ціна/знижка/totals/status/id від клієнта ігноруються; контактні дані write-only; у каталозі немає службових полів |
| `test_api04_resource_consumption.py` | API4 Unrestricted Resource Consumption | ліміти limit/page/q/items/quantity/favorites; 1 МБ у полях → 422 без ехо; глибоко вкладений JSON; SLA |
| `test_api05_function_authorization.py` | API5 Function Level Authorization | 14 заборонених методів → 405; каталог незмінний після спроб запису; admin/debug-шляхи → 404; у замовлення лише один перехід стану |
| `test_api06_business_flows.py` | API6 Sensitive Business Flows | stock (у т.ч. через розбиття рядка), кількість, порожній кошик, payment/delivery лише документовані, комбіновані промокоди, скасування не змінює totals |
| `test_api07_ssrf.py` | API7 SSRF | URL у тексті/контактах — лише текст, без затримки; зображення каталогу same-origin |
| `test_api08_misconfiguration.py` | API8 Security Misconfiguration (+ Web A02/A05) | HTTP→HTTPS, HSTS (xfail), nosniff/X-Frame-Options/CSP/Referrer-Policy, no-store, без версій у заголовках, CORS, JSON-помилки без stack trace, неправильний content-type/битий JSON → 422, 422 не ехо-ить значення, версія в `/api/health` (xfail), редірект `/api/products/` на upstream (xfail) |
| `test_api09_inventory.py` | API9 Improper Inventory Management | `openapi.json` == відомий перелік; усі документовані маршрути живі; немає `/api/v1`, `/docs`, `/graphql` тощо |
| `test_api10_unsafe_consumption_injection.py` | API10 Unsafe Consumption (+ Web A03 Injection) | SQL/NoSQL/SSTI/XSS/null-byte/RTL у пошуку, id, відгуку, контактах — дані, не код; header injection в email → 422; типи чисел |

### Знайдені відхилення (xfail strict)

| Тест | Факт |
|---|---|
| `test_hsts_is_enabled` | заголовок `Strict-Transport-Security` не надсилається ні на `/`, ні на `/api/*` |
| `test_health_does_not_disclose_environment` | `GET /api/health` повертає `"version": "2.1.0"` — fingerprint застосунку |
| `test_trailing_slash_redirect_stays_on_site_and_on_https` | `GET /api/products/` → 307 на `http://…run.app/qa-lab/api/products`: розкриває upstream-хост і понижує до http |
| `test_cancelled_order_cannot_be_cancelled_again` | BUG-5 з основного README: повторне скасування → 200 |

Категорії Web Top 10, що не мають поверхні в цьому API (A07 Identification —
немає паролів, A08 Integrity — немає залежностей клієнта, A09 Logging —
немає доступу до логів), не мають окремих файлів.

## Запуск

```bash
cd api-security
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                      # ~1 хв, ≈170 перевірок
pytest -m "owasp" -k api02  # одна категорія
API_BASE_URL=https://test-me.vzl.one pytest --junitxml=reports/junit.xml
```

Тести створюють власні workspace (ліміт 30/хв на IP враховано: `create_workspace()`
чекає `Retry-After`). У CI набір ганяється окремим workflow
`.github/workflows/api-security.yml` і публікує лише JUnit-артефакт — без GitHub Pages.
