/**
 * API regression suite for https://test-me.vzl.one — a 1:1 port of the Postman
 * collection (tests_with_validation.json). Every request goes through cy.api().
 *
 * Each describe block creates its own fresh workspace token in `before`, so
 * blocks are independent and can run in any order / in parallel workers.
 *
 * Tests assert the EXPECTED behaviour from spec.txt. Where the server is known
 * to deviate, the test is kept and marked `KNOWN BUG` — a red test there is the
 * correct outcome.
 */
import {
  HEALTH, WORKSPACE, PRODUCT, PRODUCTS, FAVORITES, REVIEW, TOTALS, ORDER, ORDERS, expectSchema,
} from '../support/schemas';
import {
  AUTH, STOCK, NOT_FOUND, BAD_FIELDS, TEST_DATA, CHECKOUT_OK, checkout, IN_STOCK_IDS, expectError, expectTotals,
} from '../support/api-helpers';
import { KNOWN_BUG, labels } from '../support/allure';

const quote = (token, body) => cy.apiAs(token, { method: 'POST', url: '/api/quote', body });
const placeOrder = (token, body) => cy.apiAs(token, { method: 'POST', url: '/api/orders', body });
const products = (qs = '') => cy.apiAs(null, { url: `/api/products${qs}` });

// --------------------------------------------------------------- 01 Workspace
describe('01 Workspace', { tags: ['@api', '@regression'] }, () => {
  let token;
  let token2;
  let expiresAt;

  before(() => {
    cy.createWorkspace().then((t) => (token = t));
  });

  it('видає токен, що діє 24 години', () => {
    cy.api({ method: 'POST', url: '/api/workspaces' }).then((res) => {
      expect(res.status).to.eq(201);
      expectSchema(res.body, WORKSPACE);
      const hours = (new Date(res.body.expires_at).getTime() - Date.now()) / 3600000;
      expect(hours, 'lifetime in hours').to.be.within(23.9, 24.1);
      token2 = res.body.token;
      expiresAt = res.body.expires_at;
      expect(token2).to.not.eq(token);
    });
  });

  it('зберігає чинність попереднього токена після створення нового середовища', () => {
    cy.apiAs(token, { url: '/api/favorites' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.product_ids).to.deep.eq([]);
    });
  });

  it('GET /api/workspaces → 405 (перехід у браузері — не POST)', () => {
    cy.apiAs(null, { url: '/api/workspaces' }).then((res) => expectError(res, 405, { detail: 'Not Allowed' }));
  });

  it('відхиляє запит без токена → 401', () => {
    cy.apiAs(null, { url: '/api/favorites' }).then((res) => expectError(res, 401, { detail: AUTH }));
  });

  it('відхиляє вигаданий токен → 401', () => {
    cy.apiAs('definitely-not-a-token', { url: '/api/orders' }).then((res) => expectError(res, 401, { detail: AUTH }));
  });

  it('відхиляє порожній X-Workspace-Token → 401', () => {
    cy.apiAs('', { url: '/api/favorites' }).then((res) => expectError(res, 401, { detail: AUTH }));
  });

  it('ігнорує заголовок Bearer: лише Authorization → 401', () => {
    cy.apiAs(null, { url: '/api/favorites', headers: { Authorization: `Bearer ${token}` } }).then((res) =>
      expectError(res, 401, { detail: AUTH }),
    );
  });

  it('перевіряє автентифікацію до валідації тіла (без токена + порожній кошик → 401)', () => {
    quote(null, { items: [] }).then((res) => expectError(res, 401, { detail: AUTH }));
  });

  it('перевіряє автентифікацію до пошуку (без токена + невідоме замовлення → 401)', () => {
    cy.apiAs(null, { url: '/api/orders/does-not-exist' }).then((res) => expectError(res, 401, { detail: AUTH }));
  });
});

// ----------------------------------------------------------------- 02 Catalog
describe('02 Catalog', { tags: ['@api', '@regression'] }, () => {
  let catalog; // all 16 products, from ?limit=20

  before(() => {
    products('?limit=20').then((res) => (catalog = res.body));
  });

  it('ендпоїнт health відповідає ok', () => {
    cy.api({ url: '/api/health' }).then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, HEALTH);
    });
  });

  it('показує 6 товарів на сторінці за замовчуванням і має більше однієї сторінки', () => {
    products().then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, PRODUCTS);
      expect(res.body.limit).to.eq(6);
      expect(res.body.items).to.have.length(6);
      expect(res.body.page).to.eq(1);
      expect(res.body.total).to.be.above(6);
      expect(res.body.items.map((p) => p.id), 'p01 on the first page').to.include('p01');
    });
  });

  it('повертає деталі товару p01 (2 400 грн)', () => {
    products('/p01').then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, PRODUCT);
      expect(res.body.name).to.include('Орбіта');
      expect(res.body.price).to.eq(240000);
      expect(res.body.category).to.eq('Audio');
      expect(res.body.description).to.not.be.empty;
      expect(Object.keys(res.body.specs)).to.have.length.above(0);
    });
  });

  it('невідомий id товару → 404', () => {
    products('/p999').then((res) => expectError(res, 404, { detail: NOT_FOUND }));
  });

  it('пошук ігнорує крайні пробіли', () => {
    products('?q=%20Орбіта%20').then((res) => {
      expect(res.body.items.map((p) => p.id)).to.include('p01');
      res.body.items.forEach((p) => expect(p.name).to.include('Орбіта'));
    });
  });

  it('пошук ігнорує регістр', { tags: '@known-bug', retries: 0 }, () => {
    // KNOWN BUG: spec says search is case-insensitive, server returns [] for lowercase.
    KNOWN_BUG(1, 'Search is case-sensitive: `q=орбіта` → 0 results while `q=Орбіта` finds p01.');
    products('?q=орбіта').then((res) => {
      expect(res.body.items.map((p) => p.id)).to.include('p01');
    });
  });

  it('пошук знаходить кілька товарів за спільним фрагментом', () => {
    products('?q=Бездротов').then((res) => {
      expect(res.body.items.map((p) => p.id).sort()).to.deep.eq(['p01', 'p09']);
      expect(res.body.total).to.eq(2);
    });
  });

  it('пошук шукає лише в назві (не в характеристиках / описі)', () => {
    products('?q=Bluetooth').then((res) => expect(res.body.items).to.deep.eq([]));
    products('?q=звучання').then((res) => expect(res.body.items).to.deep.eq([]));
  });

  it('пошук і категорія поєднуються як AND', () => {
    products('?q=Орбіта&category=Lifestyle').then((res) => {
      expect(res.body.items).to.deep.eq([]);
      expect(res.body.total).to.eq(0);
    });
  });

  it('фільтрує за категорією', () => {
    products('?category=Audio&limit=20').then((res) => {
      expect(res.body.items).to.have.length.above(0);
      res.body.items.forEach((p) => expect(p.category).to.eq('Audio'));
    });
  });

  it('межі ціни включні, а зсув на 1 копійку виключає товар', () => {
    products('?min_price=240000&max_price=240000&limit=20').then((res) => {
      expect(res.body.items.map((p) => p.id)).to.include('p01');
      res.body.items.forEach((p) => expect(p.price).to.eq(240000));
    });
    products('?max_price=239999&limit=20').then((res) => expect(res.body.items.map((p) => p.id)).to.not.include('p01'));
    products('?min_price=240001&limit=20').then((res) => expect(res.body.items.map((p) => p.id)).to.not.include('p01'));
  });

  it('min_price > max_price → 422', () => {
    products('?min_price=500&max_price=100').then((res) => expectError(res, 422, { detail: 'перевищує максимальну' }));
  });

  it('in_stock=true виключає stock=0 і зменшує total', () => {
    products('?in_stock=true&limit=20').then((res) => {
      res.body.items.forEach((p) => expect(p.stock, p.id).to.be.above(0));
      expect(res.body.total).to.be.below(catalog.total);
    });
  });

  it('сортує за ціною числово (asc і desc)', () => {
    products('?sort=price_asc&limit=20').then((res) => {
      const prices = res.body.items.map((p) => p.price);
      for (let i = 1; i < prices.length; i++) expect(prices[i]).to.be.at.least(prices[i - 1]);
    });
    products('?sort=price_desc&limit=20').then((res) => {
      const prices = res.body.items.map((p) => p.price);
      for (let i = 1; i < prices.length; i++) expect(prices[i]).to.be.at.most(prices[i - 1]);
    });
  });

  it('поєднує категорію + in_stock + ціну + сортування', () => {
    products('?category=Workspace&in_stock=true&min_price=50000&max_price=200000&sort=price_asc&limit=20').then((res) => {
      const items = res.body.items;
      expect(items).to.have.length.above(0);
      items.forEach((p) => {
        expect(p.category).to.eq('Workspace');
        expect(p.stock).to.be.above(0);
        expect(p.price).to.be.within(50000, 200000);
      });
      for (let i = 1; i < items.length; i++) expect(items[i].price).to.be.at.least(items[i - 1].price);
    });
  });

  it('пагінація: сума сторінок дорівнює total, без перетинів, остання сторінка містить залишок', () => {
    const pages = Math.ceil(catalog.total / 6);
    const ids = [];
    Cypress._.range(1, pages + 1).forEach((page) => {
      products(`?page=${page}&limit=6`).then((res) => {
        expect(res.body.page).to.eq(page);
        if (page === pages) expect(res.body.items).to.have.length(catalog.total - 6 * (pages - 1));
        ids.push(...res.body.items.map((p) => p.id));
      });
    });
    cy.then(() => {
      expect(ids).to.have.length(catalog.total);
      expect(new Set(ids).size).to.eq(ids.length);
    });
  });

  it('пагінація враховує фільтр (Audio, сторінка 2 порожня, total = 3)', () => {
    products('?category=Audio&page=2').then((res) => {
      expect(res.body.items).to.deep.eq([]);
      expect(res.body.total).to.eq(3);
    });
  });

  it('межі: limit 1 / 20, page 100, q зі 100 символів', () => {
    products('?limit=1').then((res) => {
      expect(res.body.items).to.have.length(1);
      expect(res.body.total).to.eq(catalog.total);
    });
    products('?limit=20').then((res) => expect(res.body.items).to.have.length(res.body.total));
    products('?page=100').then((res) => {
      expect(res.body.items).to.deep.eq([]);
      expect(res.body.total).to.eq(catalog.total);
    });
    products(`?q=${'x'.repeat(100)}`).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.items).to.deep.eq([]);
    });
  });

  it('порядок featured стабільний між викликами', () => {
    products('?sort=featured&limit=20').then((first) => {
      products('?sort=featured&limit=20').then((second) => {
        expect(second.body.items.map((p) => p.id)).to.deep.eq(first.body.items.map((p) => p.id));
      });
    });
  });

  it('деталі кожного товару збігаються з карткою в каталозі', () => {
    catalog.items.forEach((card) => {
      products(`/${card.id}`).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body, card.id).to.deep.eq(card);
      });
    });
  });

  it('невалідні query-параметри → 422 із зазначенням поля', () => {
    products('?limit=21').then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['query', 'limit'] }));
    products('?page=0').then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['query', 'page'] }));
    products('?sort=cheapest').then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['query', 'sort'] }));
  });
});

// --------------------------------------------------------------- 03 Favorites
describe('03 Favorites', { tags: ['@api', '@regression'] }, () => {
  let token;
  let token2;
  const fav = (t, body) => cy.apiAs(t, body ? { method: 'PUT', url: '/api/favorites', body } : { url: '/api/favorites' });

  before(() => {
    cy.createWorkspace().then((t) => (token = t));
    cy.createWorkspace().then((t) => (token2 = t));
  });

  it('порожнє в новому середовищі', () => {
    fav(token).then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, FAVORITES);
      expect(res.body.product_ids).to.deep.eq([]);
    });
  });

  it('прибирає дублікати при збереженні та зберігається при повторному читанні', () => {
    fav(token, { product_ids: ['p01', 'p02', 'p01'] }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.product_ids).to.deep.eq(['p01', 'p02']);
    });
    fav(token).then((res) => expect(res.body.product_ids).to.deep.eq(['p01', 'p02']));
  });

  it('не видиме іншому середовищу', () => {
    fav(token2).then((res) => expect(res.body.product_ids).to.deep.eq([]));
  });

  it('повторне натискання видаляє товар', () => {
    fav(token, { product_ids: ['p01'] }).then((res) => expect(res.body.product_ids).to.deep.eq(['p01']));
  });

  it('приймає рівно 16 id (верхня межа, включно з відсутнім p06)', () => {
    const all = Array.from({ length: 16 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
    fav(token, { product_ids: all }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.product_ids).to.deep.eq(all);
    });
    fav(token, { product_ids: ['p01'] });
  });

  it('невідомий id товару → 422', () => {
    fav(token, { product_ids: ['p999'] }).then((res) => expectError(res, 422, { detail: 'Невідомий товар' }));
  });

  it('більше 16 id → 422', () => {
    const ids = Array.from({ length: 17 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
    fav(token, { product_ids: ids }).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'product_ids'] }));
  });

  it('без токена → 401', () => {
    fav(null, { product_ids: ['p01'] }).then((res) => expectError(res, 401, { detail: AUTH }));
  });
});

// ----------------------------------------------------------------- 04 Reviews
describe('04 Reviews', { tags: ['@api', '@regression'] }, () => {
  let token;
  let token2;
  let expiresAt;
  const review = (t, id, body) =>
    cy.apiAs(t, body ? { method: 'POST', url: `/api/products/${id}/review`, body } : { url: `/api/products/${id}/review` });
  const TEXT = '<b>Чудові</b> навушники, рекомендую!';

  before(() => {
    cy.api({ method: 'POST', url: '/api/workspaces' }).then((res) => {
      token = res.body.token;
      expiresAt = res.body.expires_at;
    });
    cy.createWorkspace().then((t) => (token2 = t));
  });

  it('не має відгуку на p01 у новому середовищі', () => {
    review(token, 'p01').then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, REVIEW);
      expect(res.body.review).to.be.null;
    });
  });

  it('створює відгук: текст обрізається і зберігається як текст (HTML не виконується)', () => {
    review(token, 'p01', { rating: 5, text: `  ${TEXT}  ` }).then((res) => {
      expect(res.status).to.eq(201);
      expectSchema(res.body, REVIEW);
      expect(res.body.review.rating).to.eq(5);
      expect(res.body.review.text).to.eq(TEXT);
    });
  });

  it('другий відгук на той самий товар → 409', () => {
    review(token, 'p01', { rating: 4, text: 'Ще один відгук про той самий товар' }).then((res) =>
      expectError(res, 409, { detail: 'вже залишили відгук' }),
    );
  });

  it('зберігається при повторному читанні й спливає разом із середовищем', () => {
    review(token, 'p01').then((res) => {
      expect(res.body.review.rating).to.eq(5);
      expect(res.body.review.text).to.eq(TEXT);
      const ws = new Date(expiresAt).getTime();
      expect(Math.abs(res.body.review.expire_at * 1000 - ws), 'expire_at vs workspace').to.be.below(5 * 60000);
    });
  });

  it('ізольований у межах середовища (читання та запис)', () => {
    review(token2, 'p01').then((res) => expect(res.body.review).to.be.null);
    review(token2, 'p01', { rating: 2, text: 'Відгук з іншого середовища' }).then((res) => expect(res.status).to.eq(201));
    review(token, 'p01').then((res) => {
      expect(res.body.review.rating).to.eq(5);
      expect(res.body.review.text).to.eq(TEXT);
    });
  });

  it('приймає нижні межі: оцінка 1, текст із 10 символів після trim', () => {
    review(token, 'p02', { rating: 1, text: `   ${'а'.repeat(10)}   ` }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.review.rating).to.eq(1);
      expect(res.body.review.text).to.have.length(10);
    });
  });

  it('приймає верхні межі: оцінка 5, текст із 500 символів', () => {
    review(token, 'p03', { rating: 5, text: 'б'.repeat(500) }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.review.text).to.have.length(500);
    });
  });

  it('дозволяє відгук на товар без наявності (p06)', () => {
    review(token, 'p06', { rating: 3, text: 'Відгук на товар без наявності' }).then((res) => expect(res.status).to.eq(201));
  });

  it('оцінка поза межами 1–5 → 422', () => {
    review(token, 'p04', { rating: 6, text: 'Достатньо довгий текст відгуку' }).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'rating'] }),
    );
    review(token, 'p04', { rating: 0, text: 'Достатньо довгий текст відгуку' }).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'rating'] }),
    );
  });

  it('текст коротший за 10 символів після trim → 422', () => {
    review(token, 'p04', { rating: 5, text: '  коротко   ' }).then((res) => expectError(res, 422, { detail: 'щонайменше 10 символів' }));
  });

  it('текст довший за 500 символів → 422', () => {
    review(token, 'p04', { rating: 5, text: 'а'.repeat(501) }).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'text'] }),
    );
  });

  it('відгук на невідомий товар → 404', () => {
    review(token, 'p999', { rating: 5, text: 'Достатньо довгий текст відгуку' }).then((res) => expectError(res, 404, { detail: NOT_FOUND }));
  });

  it('без токена → 401', () => {
    review(null, 'p04', { rating: 5, text: 'Достатньо довгий текст відгуку' }).then((res) => expectError(res, 401, { detail: AUTH }));
  });
});

// ------------------------------------------------------------------- 05 Quote
describe('05 Quote (basket calculation)', { tags: ['@api', '@regression'] }, () => {
  let token;
  let catalog;

  before(() => {
    cy.createWorkspace().then((t) => (token = t));
    products('?limit=20').then((res) => (catalog = res.body.items));
  });

  it('TM-CHECKOUT-001 крок 3: p01 ×1 + WELCOME10 + стандартна → 2 160 грн', () => {
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }], coupon: 'WELCOME10', delivery: 'standard' }).then((res) => {
      expect(res.status).to.eq(200);
      expectTotals(res.body, { subtotal: 240000, discount: 24000, shipping: 0 });
    });
  });

  it('приймає промокод із крайніми пробілами', () => {
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }], coupon: '  WELCOME10  ' }).then((res) => {
      expect(res.status).to.eq(200);
      expectTotals(res.body, { subtotal: 240000, discount: 24000, shipping: 0 });
    });
  });

  it('приймає промокод у нижньому регістрі', { tags: '@known-bug', retries: 0 }, () => {
    // KNOWN BUG: spec says coupon case does not matter, server answers 422 «Невідомий промокод».
    KNOWN_BUG(2, 'Coupon is case-sensitive: `welcome10` → 422 «Невідомий промокод» (spaces are trimmed, case is not folded).');
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }], coupon: 'welcome10' }).then((res) => {
      expect(res.status).to.eq(200);
      expectTotals(res.body, { subtotal: 240000, discount: 24000, shipping: 0 });
    });
  });

  it('невідомий промокод → 422', () => {
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }], coupon: 'NOPE' }).then((res) =>
      expectError(res, 422, { detail: 'Невідомий промокод' }),
    );
  });

  it('стандартна доставка: безкоштовна від 1 500 грн включно, 80 грн нижче', () => {
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }] }).then((res) => expectTotals(res.body, { subtotal: 240000, discount: 0, shipping: 0 }));
    quote(token, { items: [{ product_id: 'p13', quantity: 1 }] }).then((res) => expectTotals(res.body, { subtotal: 165000, discount: 0, shipping: 0 }));
    quote(token, { items: [{ product_id: 'p04', quantity: 1 }] }).then((res) => expectTotals(res.body, { subtotal: 99900, discount: 0, shipping: 8000 }));
  });

  it('поріг безкоштовної доставки включний (subtotal = 150000)', { tags: '@known-bug', retries: 0 }, () => {
    // KNOWN BUG: spec says «від 1500 грн включно», server charges 80 грн at exactly 150000.
    KNOWN_BUG(3, 'Free-shipping threshold is exclusive: subtotal 150000 → shipping 8000 (165000 → 0).');
    quote(token, { items: [{ product_id: 'p02', quantity: 1 }], delivery: 'standard' }).then((res) =>
      expectTotals(res.body, { subtotal: 150000, discount: 0, shipping: 0 }),
    );
  });

  it('поріг оцінюється до знижки; знижка не поширюється на доставку', { tags: '@known-bug', retries: 0 }, () => {
    // KNOWN BUG: same inclusive-threshold defect as above (150000 before discount).
    KNOWN_BUG(3, 'Same exclusive-threshold defect, observed on the "threshold before discount" scenario.');
    quote(token, { items: [{ product_id: 'p02', quantity: 1 }], coupon: 'WELCOME10' }).then((res) =>
      expectTotals(res.body, { subtotal: 150000, discount: 15000, shipping: 0 }),
    );
  });

  it('експрес завжди коштує 150 грн (вище і нижче порога, з промокодом)', () => {
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }], coupon: 'WELCOME10', delivery: 'express' }).then((res) =>
      expectTotals(res.body, { subtotal: 240000, discount: 24000, shipping: 15000 }),
    );
    quote(token, { items: [{ product_id: 'p04', quantity: 1 }], delivery: 'express' }).then((res) =>
      expectTotals(res.body, { subtotal: 99900, discount: 0, shipping: 15000 }),
    );
    quote(token, { items: [{ product_id: 'p04', quantity: 1 }], coupon: 'WELCOME10', delivery: 'express' }).then((res) =>
      expectTotals(res.body, { subtotal: 99900, discount: 9990, shipping: 15000 }),
    );
  });

  it('багаторядковий кошик: subtotal = Σ ціна × кількість, знижка округлена вниз, детермінований', () => {
    const body = { items: [{ product_id: 'p01', quantity: 2 }, { product_id: 'p08', quantity: 3 }], coupon: 'WELCOME10' };
    quote(token, body).then((first) => {
      expectTotals(first.body, { subtotal: 555000, discount: 55500, shipping: 0 });
      expect(first.body.discount).to.eq(Math.floor(first.body.subtotal / 10));
      quote(token, body).then((second) => expect(second.body).to.deep.eq(first.body));
    });
  });

  it('усі наявні товари в одному кошику (15 позицій) → subtotal дорівнює сумі цін каталогу', () => {
    const expected = catalog.filter((p) => p.id !== 'p06').reduce((sum, p) => sum + p.price, 0);
    quote(token, { items: IN_STOCK_IDS.map((id) => ({ product_id: id, quantity: 1 })) }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.subtotal).to.eq(expected);
    });
  });

  it('межі кількості: 10 приймається, кількість = stock приймається', () => {
    quote(token, { items: [{ product_id: 'p08', quantity: 10 }] }).then((res) => expectTotals(res.body, { subtotal: 250000, discount: 0, shipping: 0 }));
    quote(token, { items: [{ product_id: 'p07', quantity: 3 }] }).then((res) => expectTotals(res.body, { subtotal: 225000, discount: 0, shipping: 0 }));
  });

  it('кількість 0 / 11 → 422 із зазначенням quantity', () => {
    quote(token, { items: [{ product_id: 'p05', quantity: 11 }] }).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'items', 0, 'quantity'] }),
    );
    quote(token, { items: [{ product_id: 'p05', quantity: 0 }] }).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'items', 0, 'quantity'] }),
    );
  });

  it('кількість понад stock / товар без наявності → 409', () => {
    quote(token, { items: [{ product_id: 'p07', quantity: 4 }] }).then((res) => expectError(res, 409, { detail: STOCK }));
    quote(token, { items: [{ product_id: 'p06', quantity: 1 }] }).then((res) => expectError(res, 409, { detail: STOCK }));
  });

  it('дубльований / невідомий товар, порожній кошик, невідома доставка → 422', () => {
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }, { product_id: 'p01', quantity: 1 }] }).then((res) =>
      expectError(res, 422, { detail: 'дубльована позиція' }),
    );
    quote(token, { items: [{ product_id: 'p999', quantity: 1 }] }).then((res) => expectError(res, 422, { detail: 'Невідомий товар' }));
    quote(token, { items: [] }).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'items'] }));
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }], delivery: 'drone' }).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'delivery'] }),
    );
  });

  it('пріоритет помилок: схема важливіша за stock, stock — за промокод', () => {
    quote(token, { items: [{ product_id: 'p06', quantity: 11 }] }).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'items', 0, 'quantity'] }),
    );
    quote(token, { items: [{ product_id: 'p01', quantity: 9 }], coupon: 'NOPE' }).then((res) => expectError(res, 409, { detail: STOCK }));
  });

  it('без токена → 401', () => {
    quote(null, { items: [{ product_id: 'p01', quantity: 1 }] }).then((res) => expectError(res, 401, { detail: AUTH }));
  });
});

// ---------------------------------------------------------------- 06 Checkout
describe('06 Checkout (TM-CHECKOUT-001)', { tags: ['@api', '@regression'] }, () => {
  let token;
  let token2;
  let orderId;
  let quoteTotals;
  const orders = (t, qs = '') => cy.apiAs(t, { url: `/api/orders${qs}` });

  before(() => {
    cy.createWorkspace().then((t) => (token = t));
    cy.createWorkspace().then((t) => (token2 = t));
  });

  it('список замовлень порожній до оформлення', () => {
    orders(token, '?status=all').then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, ORDERS);
      expect(res.body.items).to.deep.eq([]);
    });
  });

  it('відхилений платіж → 402, замовлення не створено, stock не витрачено', () => {
    placeOrder(token, checkout({ payment: 'declined' })).then((res) => expectError(res, 402, { detail: 'відхилено' }));
    placeOrder(token, checkout({ items: [{ product_id: 'p07', quantity: 3 }], coupon: '', payment: 'declined' })).then((res) =>
      expectError(res, 402, { detail: 'відхилено' }),
    );
    orders(token, '?status=all').then((res) => expect(res.body.items).to.deep.eq([]));
    quote(token, { items: [{ product_id: 'p07', quantity: 3 }] }).then((res) => expect(res.status).to.eq(200));
  });

  it('крок 5: успішна оплата створює підтверджене замовлення на 2 160 грн, що дорівнює quote', () => {
    quote(token, { items: CHECKOUT_OK.items, coupon: CHECKOUT_OK.coupon, delivery: CHECKOUT_OK.delivery }).then((q) => (quoteTotals = q.body));
    placeOrder(token, CHECKOUT_OK).then((res) => {
      expect(res.status).to.eq(201);
      expectSchema(res.body, ORDER);
      orderId = res.body.id;
      expect(res.body.status).to.eq('confirmed');
      expect(res.body.items).to.deep.eq([{ product_id: 'p01', quantity: 1 }]);
      expectTotals(res.body.totals, { subtotal: 240000, discount: 24000, shipping: 0 });
      expect(res.body.totals).to.deep.eq(quoteTotals);
      const age = Date.now() - new Date(res.body.created_at).getTime();
      expect(age, 'ms since created_at').to.be.within(-60000, 10 * 60000);
    });
  });

  it('крок 6: деталі замовлення збігаються зі створеним', () => {
    cy.apiAs(token, { url: `/api/orders/${orderId}` }).then((res) => {
      expect(res.status).to.eq(200);
      expectSchema(res.body, ORDER);
      expect(res.body.id).to.eq(orderId);
      expect(res.body.status).to.eq('confirmed');
      expect(res.body.totals.total).to.eq(216000);
    });
  });

  it('крок 7: у списку рівно одне замовлення; фільтри статусу працюють', () => {
    orders(token, '?status=all').then((res) => {
      expect(res.body.items).to.have.length(1);
      expect(res.body.items[0].id).to.eq(orderId);
      expect(res.body.items[0].totals.total).to.eq(216000);
    });
    orders(token, '?status=confirmed').then((res) => expect(res.body.items.map((o) => o.id)).to.include(orderId));
    orders(token, '?status=cancelled').then((res) => expect(res.body.items).to.deep.eq([]));
    orders(token, '?status=shipped').then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['query', 'status'] }));
  });

  it('багаторядкове замовлення зберігає позиції, кількості та суми quote', () => {
    const items = [{ product_id: 'p01', quantity: 2 }, { product_id: 'p08', quantity: 3 }];
    quote(token, { items, coupon: 'WELCOME10' }).then((q) => {
      placeOrder(token, checkout({ items })).then((res) => {
        expect(res.status).to.eq(201);
        expect(res.body.items).to.deep.eq(items);
        expect(res.body.totals).to.deep.eq(q.body);
        cy.apiAs(token, { url: `/api/orders/${res.body.id}` }).then((d) => {
          expect(d.body.items).to.have.length(2);
          expect(d.body.totals.total).to.eq(499500);
        });
      });
    });
  });

  it('замовлення з усіма наявними товарами (15 позицій) → 201', () => {
    placeOrder(token, checkout({ items: IN_STOCK_IDS.map((id) => ({ product_id: id, quantity: 1 })), coupon: '' })).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.items).to.have.length(15);
    });
  });

  it('дефолти: payment/delivery/coupon пропущені → approved, standard, без знижки', () => {
    placeOrder(token, { items: [{ product_id: 'p08', quantity: 1 }], ...TEST_DATA }).then((res) => {
      expect(res.status).to.eq(201);
      expect(res.body.status).to.eq('confirmed');
      expect(res.body.totals.discount).to.eq(0);
      expect(res.body.totals.shipping).to.eq(8000);
    });
  });

  it('межі контактів: ім\'я 2/80, адреса 5/200, email 5/120, з trim', () => {
    const line = [{ product_id: 'p08', quantity: 1 }];
    placeOrder(token, checkout({ items: line, coupon: '', name: 'О'.repeat(80), address: 'К'.repeat(200), email: `${'a'.repeat(50)}@${'b'.repeat(65)}.com` })).then(
      (res) => expect(res.status).to.eq(201),
    );
    placeOrder(token, checkout({ items: line, coupon: '', email: 'a@b.c' })).then((res) => expect(res.status).to.eq(201));
    placeOrder(token, checkout({ items: line, coupon: '', name: '  Ян  ', address: '  Київ, 1  ' })).then((res) => expect(res.status).to.eq(201));
  });

  it('email: верхній регістр та IDN приймаються; без @, без домену, з пробілами всередині/ззовні → 422', () => {
    const line = [{ product_id: 'p08', quantity: 1 }];
    placeOrder(token, checkout({ items: line, coupon: '', email: 'TEST@EXAMPLE.TEST' })).then((res) => expect(res.status).to.eq(201));
    placeOrder(token, checkout({ items: line, coupon: '', email: 'тест@приклад.укр' })).then((res) => expect(res.status).to.eq(201));
    ['testexample.test', 'test@example', 'te st@example.test', ' test@example.test ', 'not-an-email'].forEach((email) => {
      placeOrder(token, checkout({ email })).then((res) => expectError(res, 422, { detail: 'електронну пошту' }));
    });
  });

  it('порушення довжини імені / адреси → 422 із зазначенням поля', () => {
    placeOrder(token, checkout({ name: 'A' })).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'name'] }));
    placeOrder(token, checkout({ name: 'О'.repeat(81) })).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'name'] }));
    placeOrder(token, checkout({ address: 'Київ' })).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'address'] }));
    placeOrder(token, checkout({ address: 'К'.repeat(201) })).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'address'] }));
    placeOrder(token, checkout({ address: '  Київ  ' })).then((res) => expectError(res, 422, { detail: 'адресу' }));
  });

  it('ім\'я коротше за 2 символи після trim → 422', { tags: '@known-bug', retries: 0 }, () => {
    // KNOWN BUG: spec says name is 2–80 chars after trim; server accepts "  A  " and creates an order.
    KNOWN_BUG(4, 'Name is not trimmed before the length check: "  A  " → 201 (address IS trimmed).');
    placeOrder(token, checkout({ name: '  A  ' })).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'name'] }));
  });

  it('422 перелічує всі невалідні поля; валідація полів важливіша за stock', () => {
    placeOrder(token, checkout({ name: 'A', address: 'Київ' })).then((res) => {
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'name'] });
      expect(res.body.fields.map((f) => JSON.stringify(f))).to.include(JSON.stringify(['body', 'address']));
    });
    placeOrder(token, checkout({ name: 'A', items: [{ product_id: 'p01', quantity: 9 }] })).then((res) =>
      expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'name'] }),
    );
  });

  it('кількість понад stock → 409, невідомий промокод → 422, відсутні поля → 422', () => {
    placeOrder(token, checkout({ items: [{ product_id: 'p01', quantity: 9 }] })).then((res) => expectError(res, 409, { detail: STOCK }));
    placeOrder(token, checkout({ coupon: 'NOPE' })).then((res) => expectError(res, 422, { detail: 'Невідомий промокод' }));
    placeOrder(token, { items: [{ product_id: 'p01', quantity: 1 }] }).then((res) => expectError(res, 422, { detail: BAD_FIELDS, field: ['body', 'name'] }));
  });

  it('без токена → 401 (оформлення і список)', () => {
    placeOrder(null, CHECKOUT_OK).then((res) => expectError(res, 401, { detail: AUTH }));
    orders(null).then((res) => expectError(res, 401, { detail: AUTH }));
  });

  it('інше середовище не бачить, не читає і не скасовує замовлення', () => {
    cy.apiAs(token2, { url: `/api/orders/${orderId}` }).then((res) => expectError(res, 404, { detail: NOT_FOUND }));
    cy.apiAs(token2, { method: 'POST', url: `/api/orders/${orderId}/cancel` }).then((res) => expectError(res, 404, { detail: NOT_FOUND }));
    orders(token2, '?status=all').then((res) => expect(res.body.items).to.deep.eq([]));
    cy.apiAs(token, { url: '/api/orders/does-not-exist' }).then((res) => expectError(res, 404, { detail: NOT_FOUND }));
  });
});

// ------------------------------------------------------------------ 08 Cancel
describe('08 Cancel order', { tags: ['@api', '@regression'] }, () => {
  let token;
  let orderId;
  const cancel = (t, id) => cy.apiAs(t, { method: 'POST', url: `/api/orders/${id}/cancel` });

  before(() => {
    cy.createWorkspace().then((t) => {
      token = t;
      placeOrder(token, CHECKOUT_OK).then((res) => (orderId = res.body.id));
    });
  });

  it('змінює статус на cancelled; суми не змінюються', () => {
    cancel(token, orderId).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.deep.include({ id: orderId, status: 'cancelled' });
    });
    cy.apiAs(token, { url: `/api/orders/${orderId}` }).then((res) => {
      expect(res.body.status).to.eq('cancelled');
      expect(res.body.totals.total).to.eq(216000);
    });
  });

  it('переміщує замовлення між фільтрами статусу', () => {
    cy.apiAs(token, { url: '/api/orders?status=cancelled' }).then((res) => expect(res.body.items.map((o) => o.id)).to.deep.eq([orderId]));
    cy.apiAs(token, { url: '/api/orders?status=confirmed' }).then((res) => expect(res.body.items.map((o) => o.id)).to.not.include(orderId));
  });

  it('повторне скасування → 409', { tags: '@known-bug', retries: 0 }, () => {
    // KNOWN BUG: spec says repeated cancel → 409; server answers 200 (idempotent).
    KNOWN_BUG(5, 'Second cancel returns 200 instead of 409.');
    cancel(token, orderId).then((res) => expectError(res, 409));
  });

  it('невідоме замовлення → 404, без токена → 401', () => {
    cancel(token, 'does-not-exist').then((res) => expectError(res, 404, { detail: NOT_FOUND }));
    cancel(null, orderId).then((res) => expectError(res, 401, { detail: AUTH }));
  });
});

// ---------------------------------------------------------- 09 Reorder & stock
describe('09 Reorder & stock', { tags: ['@api', '@regression'] }, () => {
  let token;
  const ids = {};

  before(() => {
    cy.createWorkspace().then((t) => {
      token = t;
      placeOrder(token, CHECKOUT_OK).then((res) => (ids.first = res.body.id));
    });
  });

  it('попередній промокод не переноситься: quote без промокоду не має знижки', () => {
    quote(token, { items: [{ product_id: 'p01', quantity: 1 }], coupon: '', delivery: 'standard' }).then((res) =>
      expectTotals(res.body, { subtotal: 240000, discount: 0, shipping: 0 }),
    );
  });

  it('незалежні POST не дедуплікуються (API не ідемпотентний)', () => {
    const body = checkout({ coupon: '', delivery: 'express' });
    placeOrder(token, body).then((res) => {
      expect(res.status).to.eq(201);
      expectTotals(res.body.totals, { subtotal: 240000, discount: 0, shipping: 15000 });
      ids.second = res.body.id;
    });
    placeOrder(token, body).then((res) => {
      ids.third = res.body.id;
      expect(new Set([ids.first, ids.second, ids.third]).size).to.eq(3);
    });
  });

  it('stock — межа на одне замовлення, а не спільний склад', () => {
    const body = checkout({ items: [{ product_id: 'p07', quantity: 3 }], coupon: '' });
    placeOrder(token, body).then((res) => {
      expect(res.status).to.eq(201);
      ids.stockA = res.body.id;
    });
    placeOrder(token, body).then((res) => {
      expect(res.status).to.eq(201);
      ids.stockB = res.body.id;
    });
    products('/p07').then((res) => expect(res.body.stock, 'catalog stock unchanged').to.eq(3));
  });

  it('скасування одного замовлення не впливає на інше; скасовані позиції можна квотувати знову', () => {
    cy.apiAs(token, { method: 'POST', url: `/api/orders/${ids.stockA}/cancel` }).then((res) => expect(res.body.status).to.eq('cancelled'));
    cy.apiAs(token, { url: `/api/orders/${ids.stockB}` }).then((res) => expect(res.body.status).to.eq('confirmed'));
    quote(token, { items: [{ product_id: 'p07', quantity: 3 }] }).then((res) => expect(res.status).to.eq(200));
  });

  it('список містить усі замовлення, від нових до старих, унікальні id, all = confirmed + cancelled', () => {
    cy.apiAs(token, { url: '/api/orders?status=all' }).then((all) => {
      const listIds = all.body.items.map((o) => o.id);
      Object.values(ids).forEach((id) => expect(listIds).to.include(id));
      expect(new Set(listIds).size).to.eq(listIds.length);
      const ts = all.body.items.map((o) => new Date(o.created_at).getTime());
      for (let i = 1; i < ts.length; i++) expect(ts[i]).to.be.at.most(ts[i - 1]);
      cy.apiAs(token, { url: '/api/orders?status=confirmed' }).then((c) => {
        cy.apiAs(token, { url: '/api/orders?status=cancelled' }).then((x) => {
          expect(c.body.items.length + x.body.items.length).to.eq(listIds.length);
        });
      });
    });
  });
});
