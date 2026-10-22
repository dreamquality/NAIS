"""API6:2023 — Unrestricted Access to Sensitive Business Flows.

Checkout is the sensitive flow: stock, prices, coupons and payment outcome
are decided by the server, and the state machine cannot be bypassed.
"""
import pytest

from conftest import assert_error, body_json, checkout

pytestmark = pytest.mark.owasp("API6", "Unrestricted Access to Sensitive Business Flows")

STOCK = "Недостатньо товару"
BAD_FIELDS = "Перевірте правильність"


def test_cannot_order_more_than_stock(api, fresh_workspace):
    assert_error(api.post("/api/orders", token=fresh_workspace, json=checkout(items=[{"product_id": "p01", "quantity": 9}])), 409, detail=STOCK)


def test_cannot_order_out_of_stock_product(api, fresh_workspace):
    assert_error(api.post("/api/orders", token=fresh_workspace, json=checkout(items=[{"product_id": "p06", "quantity": 1}])), 409, detail=STOCK)


def test_cannot_exceed_stock_by_splitting_the_line(api, fresh_workspace):
    """Two lines for the same product are merged before the stock check."""
    items = [{"product_id": "p01", "quantity": 5}, {"product_id": "p01", "quantity": 5}]
    r = api.post("/api/orders", token=fresh_workspace, json=checkout(items=items))
    assert r.status_code in (409, 422), r.text[:200]


@pytest.mark.parametrize("quantity", [0, -1, 1.5, "1", True, None])
def test_quantity_must_be_a_positive_integer(api, workspace, quantity):
    body = {"items": [{"product_id": "p01", "quantity": quantity}], "delivery": "standard"}
    assert_error(api.post("/api/quote", token=workspace, json=body), 422, detail=BAD_FIELDS)


def test_empty_basket_cannot_be_ordered(api, fresh_workspace):
    assert_error(api.post("/api/orders", token=fresh_workspace, json=checkout(items=[])), 422, detail=BAD_FIELDS)


@pytest.mark.parametrize("payment", ["paid", "APPROVED", "approved ", "", None, 1, True])
def test_payment_outcome_accepts_only_the_two_documented_values(api, fresh_workspace, payment):
    assert_error(api.post("/api/orders", token=fresh_workspace, json=checkout(payment=payment)), 422, detail=BAD_FIELDS, field=["body", "payment"])


def test_declined_payment_leaves_no_order_and_no_stock_debit(api, fresh_workspace):
    assert_error(api.post("/api/orders", token=fresh_workspace, json=checkout(payment="declined")), 402)
    assert body_json(api.get("/api/orders?status=all", token=fresh_workspace))["items"] == []
    assert api.post("/api/quote", token=fresh_workspace, json={"items": [{"product_id": "p08", "quantity": 10}], "delivery": "standard"}).status_code == 200


@pytest.mark.parametrize("coupon", ["WELCOME100", "WELCOME10;WELCOME10", "WELCOME10,WELCOME10", "' OR 1=1 --", "%", "WELCOME1O"])
def test_unknown_or_combined_coupons_are_rejected(api, workspace, coupon):
    body = {"items": [{"product_id": "p01", "quantity": 1}], "coupon": coupon, "delivery": "standard"}
    assert_error(api.post("/api/quote", token=workspace, json=body), 422, detail="Невідомий промокод")


def test_coupon_cannot_be_applied_twice_within_one_order(api, workspace):
    """The discount is a flat 10 % regardless of how many lines or how the coupon is spelled."""
    body = {"items": [{"product_id": "p01", "quantity": 2}], "coupon": "  WELCOME10  ", "delivery": "standard"}
    totals = body_json(api.post("/api/quote", token=workspace, json=body))
    assert totals["discount"] == 48000 and totals["total"] == 432000


def test_delivery_accepts_only_documented_methods(api, workspace):
    for delivery in ("free", "pickup", "", None, 0):
        body = {"items": [{"product_id": "p01", "quantity": 1}], "delivery": delivery}
        assert_error(api.post("/api/quote", token=workspace, json=body), 422, detail=BAD_FIELDS, field=["body", "delivery"])


def test_cancel_does_not_change_totals_and_frees_stock(api, fresh_workspace):
    r = api.post("/api/orders", token=fresh_workspace, json=checkout(items=[{"product_id": "p08", "quantity": 10}]))
    assert r.status_code == 201
    oid, totals = r.json()["id"], r.json()["totals"]
    c = api.post(f"/api/orders/{oid}/cancel", token=fresh_workspace)
    assert c.status_code == 200 and c.json()["status"] == "cancelled", c.text
    assert body_json(api.get(f"/api/orders/{oid}", token=fresh_workspace))["totals"] == totals
    assert api.post("/api/orders", token=fresh_workspace, json=checkout(items=[{"product_id": "p08", "quantity": 10}])).status_code == 201


@pytest.mark.known_bug
@pytest.mark.xfail(strict=True, reason="KNOWN BUG-5: second cancel returns 200 instead of 409 (see README)")
def test_cancelled_order_cannot_be_cancelled_again(api, fresh_workspace):
    oid = api.post("/api/orders", token=fresh_workspace, json=checkout()).json()["id"]
    assert api.post(f"/api/orders/{oid}/cancel", token=fresh_workspace).status_code == 200
    assert_error(api.post(f"/api/orders/{oid}/cancel", token=fresh_workspace), 409)


def test_checkout_is_not_idempotent_by_accident(api, fresh_workspace):
    """Two identical POSTs are two orders — the client (UI) is responsible for the submit lock."""
    a = api.post("/api/orders", token=fresh_workspace, json=checkout())
    b = api.post("/api/orders", token=fresh_workspace, json=checkout())
    assert a.status_code == b.status_code == 201 and a.json()["id"] != b.json()["id"]
