"""API2:2023 — Broken Authentication.

The only credential is the X-Workspace-Token header. Every protected
endpoint must answer 401 for a missing, malformed or mutated token, and
must do so BEFORE validating the body (no information for anonymous callers).
"""
import re

import pytest

from conftest import AUTH_HEADER, assert_error, body_json

pytestmark = pytest.mark.owasp("API2", "Broken Authentication")

PROTECTED = [
    ("GET", "/api/favorites", None),
    ("PUT", "/api/favorites", {"product_ids": ["p01"]}),
    ("GET", "/api/products/p01/review", None),
    ("POST", "/api/products/p01/review", {"rating": 5, "text": "Достатньо довгий текст відгуку"}),
    ("POST", "/api/quote", {"items": [{"product_id": "p01", "quantity": 1}], "delivery": "standard"}),
    ("GET", "/api/orders", None),
    ("POST", "/api/orders", {"items": [{"product_id": "p01", "quantity": 1}]}),
    ("GET", "/api/orders/000000000000000000000000", None),
    ("POST", "/api/orders/000000000000000000000000/cancel", None),
]


def mutate(token):
    return token[:-1] + ("0" if token[-1] != "0" else "1")


@pytest.mark.parametrize("method,path,body", PROTECTED, ids=[f"{m} {p}" for m, p, _ in PROTECTED])
@pytest.mark.parametrize(
    "variant",
    ["missing", "empty", "garbage", "bearer-prefix", "mutated", "uppercased", "query-param", "cookie"],
)
def test_protected_endpoints_reject_bad_credentials(api, workspace, method, path, body, variant):
    headers, cookies, params, token = {}, {}, {}, None
    if variant == "empty":
        headers[AUTH_HEADER] = ""
    elif variant == "garbage":
        headers[AUTH_HEADER] = "not-a-token"
    elif variant == "bearer-prefix":
        headers["Authorization"] = f"Bearer {workspace}"
    elif variant == "mutated":
        headers[AUTH_HEADER] = mutate(workspace)
    elif variant == "uppercased":
        headers[AUTH_HEADER] = workspace.upper()
    elif variant == "query-param":
        params["token"] = workspace
    elif variant == "cookie":
        cookies[AUTH_HEADER] = workspace

    r = api.request(method, path, token=token, headers=headers, cookies=cookies, params=params, json=body)
    # A well-formed but unknown token is reported as «expired» rather than «missing»;
    # both are 401 and neither confirms that a workspace exists, so only the status is pinned.
    assert_error(r, 401, detail=None if variant == "mutated" else AUTH_HEADER)


def test_401_wins_over_validation_and_404(api):
    """An anonymous caller must not learn whether the body is valid or the id exists."""
    assert_error(api.post("/api/quote", json={"items": "garbage"}), 401, detail=AUTH_HEADER)
    assert_error(api.get("/api/orders/does-not-exist"), 401, detail=AUTH_HEADER)
    assert_error(api.get("/api/products/p999/review"), 401, detail=AUTH_HEADER)


def test_tokens_are_long_random_and_unique(api):
    tokens = [api.create_workspace() for _ in range(3)]
    for t in tokens:
        assert len(t) >= 32, t
        assert re.fullmatch(r"[0-9a-f]+", t), "token is not lowercase hex"
    assert len(set(tokens)) == 3, "two workspaces got the same token"


def test_workspace_response_exposes_only_expected_fields(api):
    data = body_json(api.post("/api/workspaces"))
    assert set(data) <= {"token", "expires_at", "seed"}, data
    assert data["expires_at"]  # ISO timestamp; the Cypress suite checks the 24 h horizon


def test_workspace_is_not_enumerable(api, workspace):
    """There is no endpoint to list or look up workspaces by token."""
    assert api.get("/api/workspaces").status_code == 405
    assert api.get(f"/api/workspaces/{workspace}").status_code == 404


def test_token_is_never_echoed_in_responses(api, workspace, order):
    for path in ("/api/orders?status=all", f"/api/orders/{order['id']}", "/api/favorites"):
        r = api.get(path, token=workspace)
        assert workspace not in r.text, path
