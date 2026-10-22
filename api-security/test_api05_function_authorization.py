"""API5:2023 — Broken Function Level Authorization.

There is no admin role, so the only "privileged" functions are HTTP methods
and routes that must not exist: writes on the catalog, listing workspaces,
admin / debug paths. Each must be 404 or 405 and never partially work.
"""
import pytest

from conftest import assert_error, assert_no_stack_trace

pytestmark = pytest.mark.owasp("API5", "Broken Function Level Authorization")

FORBIDDEN_METHODS = [
    ("DELETE", "/api/products"),
    ("POST", "/api/products"),
    ("PUT", "/api/products/p01"),
    ("PATCH", "/api/products/p01"),
    ("DELETE", "/api/products/p01"),
    ("GET", "/api/workspaces"),
    ("DELETE", "/api/workspaces"),
    ("DELETE", "/api/favorites"),
    ("DELETE", "/api/products/p01/review"),
    ("PUT", "/api/products/p01/review"),
    ("DELETE", "/api/orders"),
    ("PUT", "/api/orders"),
    ("GET", "/api/quote"),
    ("DELETE", "/api/health"),
]


@pytest.mark.parametrize("method,path", FORBIDDEN_METHODS, ids=[f"{m} {p}" for m, p in FORBIDDEN_METHODS])
def test_unsupported_methods_are_405(api, workspace, method, path):
    assert_error(api.request(method, path, token=workspace), 405)


def test_catalog_is_unchanged_after_write_attempts(api, workspace):
    before = api.get("/api/products/p01").json()
    api.request("PUT", "/api/products/p01", token=workspace, json={**before, "price": 1})
    api.request("PATCH", "/api/products/p01", token=workspace, json={"price": 1})
    api.request("DELETE", "/api/products/p01", token=workspace)
    assert api.get("/api/products/p01").json() == before


HIDDEN_PATHS = [
    "/api/admin",
    "/api/admin/orders",
    "/api/users",
    "/api/debug",
    "/api/internal",
    "/api/config",
    "/api/metrics",
    "/api/orders/all",
    "/api/products/p01/reviews",
    "/admin",
    "/.git/config",
    "/.env",
    "/server-status",
]


@pytest.mark.parametrize("path", HIDDEN_PATHS)
def test_privileged_or_debug_paths_do_not_exist(api, workspace, path):
    r = api.get(path, token=workspace)
    assert r.status_code in (403, 404, 405), f"{path} → {r.status_code}"
    assert_no_stack_trace(r)


def test_cancel_is_the_only_state_transition(api, workspace, order):
    """No endpoint lets a client confirm, pay or edit an order."""
    for verb in ("confirm", "pay", "approve", "refund", "edit", "delete"):
        r = api.post(f"/api/orders/{order['id']}/{verb}", token=workspace)
        assert r.status_code in (404, 405), f"{verb} → {r.status_code}"
    for method in ("PUT", "PATCH", "DELETE"):
        r = api.request(method, f"/api/orders/{order['id']}", token=workspace, json={"status": "cancelled"})
        assert r.status_code in (404, 405), f"{method} → {r.status_code}"
    assert api.get(f"/api/orders/{order['id']}", token=workspace).json()["status"] == "confirmed"
