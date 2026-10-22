"""API9:2023 — Improper Inventory Management.

The published contract (openapi.json) is the inventory: every documented
route must exist, and no undocumented versions, shadows or doc UIs may be
reachable.
"""
import pytest

from conftest import assert_no_stack_trace

pytestmark = pytest.mark.owasp("API9", "Improper Inventory Management")

DOCUMENTED = {
    ("get", "/api/health"),
    ("post", "/api/workspaces"),
    ("get", "/api/products"),
    ("get", "/api/products/{product_id}"),
    ("get", "/api/favorites"),
    ("put", "/api/favorites"),
    ("get", "/api/products/{product_id}/review"),
    ("post", "/api/products/{product_id}/review"),
    ("get", "/api/orders"),
    ("post", "/api/orders"),
    ("post", "/api/quote"),
    ("get", "/api/orders/{order_id}"),
    ("post", "/api/orders/{order_id}/cancel"),
}


@pytest.fixture(scope="module")
def published_contract(api):
    r = api.get("/openapi.json")
    assert r.status_code == 200
    return r.json()


def test_published_contract_matches_the_known_inventory(published_contract):
    live = {(m.lower(), p) for p, ops in published_contract["paths"].items() for m in ops}
    assert live == DOCUMENTED, f"contract drift: +{live - DOCUMENTED} -{DOCUMENTED - live}"


def test_every_documented_route_is_served(api, workspace, order):
    sample = {"{product_id}": "p01", "{order_id}": order["id"]}
    for method, path in sorted(DOCUMENTED):
        for k, v in sample.items():
            path = path.replace(k, v)
        r = api.request(method, path, token=workspace, json={} if method in ("post", "put") else None)
        assert r.status_code not in (404, 405), f"{method.upper()} {path} → {r.status_code}"


SHADOWS = [
    "/api/v1/products",
    "/api/v2/products",
    "/v1/api/products",
    "/API/products",
    "/api/Products",
    "/api/products.json",
    "/api/orders.json",
    "/api/beta/orders",
    "/api/old/orders",
    "/graphql",
    "/api/graphql",
    "/docs",
    "/redoc",
    "/swagger",
    "/swagger-ui",
    "/api/docs",
]


@pytest.mark.parametrize("path", SHADOWS)
def test_no_shadow_or_versioned_routes(api, workspace, path):
    r = api.get(path, token=workspace)
    assert r.status_code in (404, 405), f"{path} → {r.status_code}"
    assert_no_stack_trace(r)
