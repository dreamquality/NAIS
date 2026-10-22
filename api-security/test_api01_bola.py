"""API1:2023 — Broken Object Level Authorization.

Every object (order, review, favorites) belongs to a workspace. Another
workspace must get the same 404 as for a non-existent id, so the response
cannot be used as an existence oracle.
"""
import pytest

from conftest import assert_error, body_json, checkout

pytestmark = pytest.mark.owasp("API1", "Broken Object Level Authorization")

NOT_FOUND = "не знайдено"


def test_order_detail_is_invisible_to_another_workspace(api, order, other_workspace):
    assert_error(api.get(f"/api/orders/{order['id']}", token=other_workspace), 404, detail=NOT_FOUND)


def test_order_cannot_be_cancelled_by_another_workspace(api, order, other_workspace, workspace):
    assert_error(api.post(f"/api/orders/{order['id']}/cancel", token=other_workspace), 404, detail=NOT_FOUND)
    # ... and it is still confirmed for its owner.
    assert body_json(api.get(f"/api/orders/{order['id']}", token=workspace))["status"] == "confirmed"


def test_foreign_and_nonexistent_ids_are_indistinguishable(api, order, other_workspace):
    foreign = api.get(f"/api/orders/{order['id']}", token=other_workspace)
    missing = api.get("/api/orders/000000000000000000000000", token=other_workspace)
    assert (foreign.status_code, foreign.json()) == (missing.status_code, missing.json())


def test_order_list_contains_only_own_orders(api, order, other_workspace):
    items = body_json(api.get("/api/orders?status=all", token=other_workspace))["items"]
    assert order["id"] not in {o["id"] for o in items}


@pytest.mark.parametrize(
    "order_id",
    [
        "../../health",
        "..%2F..%2Fhealth",
        "p01' OR '1'='1",
        '{"$ne": null}',
        "*",
        "a" * 300,
        "%E2%80%8B",  # zero-width space
    ],
)
def test_malformed_order_ids_are_404_not_5xx(api, workspace, order_id):
    r = api.get(f"/api/orders/{order_id}", token=workspace)
    assert r.status_code == 404, r.text[:200]
    assert "application/json" in r.headers.get("content-type", "")


def test_neighbouring_order_id_is_not_guessable(api, order, workspace):
    """Flipping the last hex digit of a real id must not open someone else's order."""
    last = order["id"][-1]
    flipped = order["id"][:-1] + ("0" if last != "0" else "1")
    assert_error(api.get(f"/api/orders/{flipped}", token=workspace), 404, detail=NOT_FOUND)


def test_review_is_isolated_per_workspace(api, fresh_workspace, other_workspace):
    r = api.post("/api/products/p02/review", token=fresh_workspace, json={"rating": 5, "text": "Ізольований відгук для тесту"})
    assert r.status_code == 201, r.text
    assert body_json(api.get("/api/products/p02/review", token=other_workspace))["review"] is None


def test_favorites_are_isolated_per_workspace(api, fresh_workspace, other_workspace):
    assert api.put("/api/favorites", token=fresh_workspace, json={"product_ids": ["p01", "p02"]}).status_code == 200
    assert "p01" not in body_json(api.get("/api/favorites", token=other_workspace))["product_ids"]


def test_stock_is_not_shared_between_workspaces(api, fresh_workspace, other_workspace):
    """Buying the whole per-order stock in one workspace must not starve another."""
    assert api.post("/api/orders", token=fresh_workspace, json=checkout(items=[{"product_id": "p08", "quantity": 10}])).status_code == 201
    assert api.post("/api/quote", token=other_workspace, json={"items": [{"product_id": "p08", "quantity": 10}], "delivery": "standard"}).status_code == 200
