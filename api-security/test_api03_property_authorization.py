"""API3:2023 — Broken Object Property Level Authorization
(mass assignment + excessive data exposure).

Prices, discounts, totals, status and ids are server-owned: values sent by
the client must be ignored, and responses must not carry internal fields.
"""
import pytest

from conftest import body_json, checkout

pytestmark = pytest.mark.owasp("API3", "Broken Object Property Level Authorization")

QUOTE_ITEM = {"product_id": "p01", "quantity": 1}  # 2 400,00 ₴
ORDER_KEYS = {"id", "status", "items", "totals", "created_at"}


def test_client_cannot_set_price_or_discount_in_quote(api, workspace):
    body = {
        "items": [{**QUOTE_ITEM, "price": 1, "unit_price": 1}],
        "delivery": "standard",
        "discount": 999999,
        "shipping": 0,
        "total": 1,
    }
    totals = body_json(api.post("/api/quote", token=workspace, json=body))
    assert totals == {"subtotal": 240000, "discount": 0, "shipping": 0, "total": 240000, "currency": "UAH"}


def test_client_cannot_set_totals_status_or_id_on_checkout(api, fresh_workspace):
    body = checkout(
        totals={"subtotal": 1, "discount": 1, "shipping": 0, "total": 1, "currency": "UAH"},
        status="cancelled",
        id="000000000000000000000000",
        created_at="2000-01-01T00:00:00+00:00",
    )
    r = api.post("/api/orders", token=fresh_workspace, json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["id"] != body["id"]
    assert data["status"] == "confirmed"
    assert data["totals"] == {"subtotal": 25000, "discount": 0, "shipping": 8000, "total": 33000, "currency": "UAH"}
    assert data["created_at"].startswith("20") and not data["created_at"].startswith("2000-")


def test_review_ignores_foreign_properties(api, fresh_workspace):
    body = {"rating": 5, "text": "Відгук із зайвими полями", "author": "admin", "workspace": "other", "verified": True}
    r = api.post("/api/products/p03/review", token=fresh_workspace, json=body)
    assert r.status_code == 201, r.text
    assert set(r.json()["review"]) <= {"rating", "text", "expire_at", "created_at"}, r.json()


def test_order_responses_expose_only_the_documented_properties(api, workspace, order):
    assert set(order) == ORDER_KEYS, order
    listed = body_json(api.get("/api/orders?status=all", token=workspace))["items"]
    for o in listed:
        assert set(o) <= ORDER_KEYS, o
    # Contact details are write-only: name / email / address never come back.
    text = api.get(f"/api/orders/{order['id']}", token=workspace).text
    for secret in ("Олександр Тестовий", "test@example.test", "вул. Тестова"):
        assert secret not in text


def test_product_catalog_has_no_internal_fields(api):
    items = body_json(api.get("/api/products?limit=20"))["items"]
    forbidden = {"cost", "margin", "supplier", "internal_id", "_id", "password", "secret"}
    for p in items:
        assert not (set(p) & forbidden), p
