"""API4:2023 — Unrestricted Resource Consumption.

Every list, array and string must have a server-enforced upper bound, and
oversized input must be rejected quickly with 422 — never 5xx, never a
timeout, never echoed back.
"""
import time

import pytest

from conftest import TIMEOUT, assert_error, assert_not_server_error, checkout

pytestmark = pytest.mark.owasp("API4", "Unrestricted Resource Consumption")

BAD_FIELDS = "Перевірте правильність"
SLA_SECONDS = 5


@pytest.mark.parametrize("limit", [21, 100, 1000, 10**9])
def test_catalog_page_size_is_capped(api, limit):
    assert_error(api.get(f"/api/products?limit={limit}"), 422, detail=BAD_FIELDS, field=["query", "limit"])


def test_catalog_largest_allowed_page_is_20(api):
    r = api.get("/api/products?limit=20")
    assert r.status_code == 200 and len(r.json()["items"]) <= 20


@pytest.mark.parametrize("page", [0, -1, 10**9])
def test_catalog_page_number_is_bounded(api, page):
    r = api.get(f"/api/products?page={page}")
    assert_not_server_error(r)
    assert r.status_code in (200, 422), r.text[:200]
    if r.status_code == 200:
        assert r.json()["items"] == []


def test_search_query_length_is_capped(api):
    assert_error(api.get("/api/products", params={"q": "а" * 5000}), 422, detail=BAD_FIELDS, field=["query", "q"])


def test_basket_line_count_is_capped(api, workspace):
    body = {"items": [{"product_id": "p01", "quantity": 1}] * 100, "delivery": "standard"}
    assert_error(api.post("/api/quote", token=workspace, json=body), 422, detail=BAD_FIELDS, field=["body", "items"])


@pytest.mark.parametrize("quantity", [11, 1000, 10**9, 10**18])
def test_line_quantity_is_capped(api, workspace, quantity):
    body = {"items": [{"product_id": "p08", "quantity": quantity}], "delivery": "standard"}
    r = api.post("/api/quote", token=workspace, json=body)
    assert_not_server_error(r)
    assert r.status_code in (409, 422), r.text[:200]  # 422 = schema cap, 409 = stock cap


def test_oversized_text_fields_are_rejected_and_not_echoed(api, workspace):
    big = "x" * 1_000_000
    t0 = time.monotonic()
    r = api.post("/api/orders", token=workspace, json=checkout(name=big, address=big, email=big + "@example.test"))
    assert time.monotonic() - t0 < TIMEOUT
    assert_error(r, 422, detail=BAD_FIELDS, field=["body", "name"])
    assert len(r.content) < 2000, "the oversized value is echoed back"


def test_oversized_review_text_is_rejected(api, workspace):
    r = api.post("/api/products/p04/review", token=workspace, json={"rating": 5, "text": "а" * 100_000})
    assert_error(r, 422, detail=BAD_FIELDS, field=["body", "text"])


def test_favorites_list_is_capped_at_catalog_size(api, workspace):
    ids = [f"p{i:02d}" for i in range(1, 18)]
    assert_error(api.put("/api/favorites", token=workspace, json={"product_ids": ids}), 422, detail=BAD_FIELDS)


def test_deeply_nested_json_is_rejected_quickly(api, workspace):
    nested = {"items": [{"product_id": "p01", "quantity": 1}], "delivery": "standard"}
    for _ in range(200):
        nested = {"nested": nested}
    t0 = time.monotonic()
    r = api.post("/api/quote", token=workspace, json=nested)
    assert time.monotonic() - t0 < SLA_SECONDS
    assert_not_server_error(r)
    assert r.status_code == 422


@pytest.mark.parametrize("path", ["/api/health", "/api/products?limit=20", "/api/products/p01"])
def test_public_endpoints_answer_within_sla(api, path):
    r = api.get(path)
    assert r.status_code == 200
    assert r.elapsed.total_seconds() < SLA_SECONDS


def test_workspace_creation_is_rate_limited_with_retry_after(api):
    """Documented: 30 workspaces/min per IP → 429 + Retry-After. Not triggered on purpose:
    doing so would starve the Cypress jobs that share the runner's egress IP.
    The create_workspace() helper honours Retry-After; this test only checks
    that a 429, if one happens to be returned, carries the header."""
    r = api.post("/api/workspaces")
    if r.status_code == 429:
        assert r.headers.get("Retry-After"), "429 without Retry-After"
    else:
        assert r.status_code == 201
