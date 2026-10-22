"""API10:2023 — Unsafe Consumption of APIs (+ OWASP Web A03 Injection).

The server consumes nothing but client input, so the category reduces to
injection resistance: every free-text field is either validated away or
stored and returned verbatim as data — never interpreted, never 5xx.
"""
import pytest

from conftest import assert_error, assert_not_server_error, body_json, checkout

pytestmark = pytest.mark.owasp("API10", "Unsafe Consumption of APIs / Injection")

PAYLOADS = [
    "' OR '1'='1",
    '" OR ""="',
    "1; DROP TABLE products; --",
    '{"$gt": ""}',
    "{{7*7}}",
    "${7*7}",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "%00",
    "\u0000",
    "../../../etc/passwd",
    "‮А",  # RTL override
    "🙂" * 20,
]


@pytest.mark.parametrize("q", PAYLOADS)
def test_search_treats_input_as_literal_text(api, q):
    r = api.get("/api/products", params={"q": q})
    assert_not_server_error(r)
    assert r.status_code in (200, 422), r.text[:200]
    if r.status_code == 200:
        data = body_json(r)
        assert set(data) == {"items", "total", "page", "limit"}
        assert data["total"] == 0 or all(q.lower() in p["name"].lower() for p in data["items"])


@pytest.mark.parametrize("product_id", PAYLOADS)
def test_product_id_injection_is_404(api, product_id):
    r = api.get(f"/api/products/{product_id}")
    assert_not_server_error(r)
    assert r.status_code in (400, 404), r.text[:200]


@pytest.mark.parametrize("value", [{"$ne": None}, ["p01"], 1, True, None])
def test_non_string_product_ids_are_rejected(api, workspace, value):
    assert_error(api.put("/api/favorites", token=workspace, json={"product_ids": [value]}), 422)
    body = {"items": [{"product_id": value, "quantity": 1}], "delivery": "standard"}
    assert_error(api.post("/api/quote", token=workspace, json=body), 422)


def test_review_text_is_stored_and_returned_verbatim(api, fresh_workspace):
    text = "<script>alert(1)</script> {{7*7}} ${7*7} ' OR 1=1 -- ‮текст"
    r = api.post("/api/products/p09/review", token=fresh_workspace, json={"rating": 5, "text": text})
    assert r.status_code == 201, r.text
    assert "application/json" in r.headers["content-type"]
    saved = body_json(api.get("/api/products/p09/review", token=fresh_workspace))["review"]["text"]
    assert saved == text, "text was transformed (escaped, evaluated or truncated)"
    assert "49" not in saved


@pytest.mark.parametrize("field", ["name", "address"])
@pytest.mark.parametrize("payload", ["' OR '1'='1 --", "<b>Ім'я</b> Тестовий", "{{7*7}} Тестовий", "Київ, вул. \u0000Тестова, 12"])
def test_injection_in_contact_fields_is_data_not_code(api, fresh_workspace, field, payload):
    r = api.post("/api/orders", token=fresh_workspace, json=checkout(**{field: payload}))
    assert_not_server_error(r)
    assert r.status_code in (201, 422), r.text[:200]
    if r.status_code == 201:
        assert r.json()["totals"]["total"] == 33000  # the order is otherwise untouched
        assert payload not in r.text  # contact data is never echoed back


@pytest.mark.parametrize("email", ["a@b.c\r\nBcc: victim@example.test", "a@b.c%0d%0aBcc:x@y.z", "@evil.example"])
def test_header_injection_in_email_is_rejected(api, workspace, email):
    assert_error(api.post("/api/orders", token=workspace, json=checkout(email=email)), 422, detail="електронну пошту")


def test_numeric_fields_reject_strings_and_booleans(api, workspace):
    for rating in ("5", True, [5], {"v": 5}, 5.5):
        assert_error(api.post("/api/products/p10/review", token=workspace, json={"rating": rating, "text": "Достатньо довгий текст відгуку"}), 422)
    for price in ("1", "1 OR 1", "-1"):
        r = api.get("/api/products", params={"min_price": price})
        assert_not_server_error(r)
        assert r.status_code in (200, 422)


def test_duplicate_json_keys_take_the_last_value_consistently(api, workspace):
    """Parsers differ on duplicate keys; the server must not end up with a mixed object."""
    raw = '{"items":[{"product_id":"p01","quantity":1}],"delivery":"express","delivery":"standard"}'
    r = api.post("/api/quote", token=workspace, headers={"Content-Type": "application/json"}, data=raw.encode())
    assert_not_server_error(r)
    assert r.status_code in (200, 422)
    if r.status_code == 200:
        assert r.json()["shipping"] in (0, 8000, 15000)
