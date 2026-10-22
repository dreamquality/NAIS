"""
Negative / hardening tests for the test-me.vzl.one API, organised by the
OWASP API Security Top 10 (2023). Each test asserts what a correctly hardened
server MUST do (reject, isolate, not leak); known deviations are marked
``xfail(strict=True)`` so the run stays green but flips loudly when fixed.

The API is a public training target with per-workspace isolation; every
request here is scoped to workspaces the run creates itself.
"""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("API_BASE_URL", "https://test-me.vzl.one").rstrip("/")
TIMEOUT = float(os.environ.get("API_TIMEOUT", "15"))
AUTH_HEADER = "X-Workspace-Token"

# Markers of a leaked stack trace / framework internals in an error body.
STACK_TRACE_MARKERS = ("Traceback", 'File "', "uvicorn", "starlette", "fastapi", "pydantic", "Exception", "at line")

CHECKOUT_OK = {
    "items": [{"product_id": "p08", "quantity": 1}],
    "coupon": "",
    "delivery": "standard",
    "name": "Олександр Тестовий",
    "email": "test@example.test",
    "address": "Київ, вул. Тестова, 12",
    "payment": "approved",
}


def checkout(**overrides):
    body = {**CHECKOUT_OK}
    body.update(overrides)
    return body


class Api:
    """Thin requests wrapper: base URL, timeout, optional workspace token, no redirects."""

    def __init__(self, session):
        self.session = session

    def request(self, method, path, token=None, headers=None, **kwargs):
        h = dict(headers or {})
        if token is not None:
            h[AUTH_HEADER] = token
        kwargs.setdefault("timeout", TIMEOUT)
        kwargs.setdefault("allow_redirects", False)
        url = path if path.startswith("http") else BASE_URL + path
        return self.session.request(method, url, headers=h, **kwargs)

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, **kw):
        return self.request("POST", path, **kw)

    def put(self, path, **kw):
        return self.request("PUT", path, **kw)

    def create_workspace(self, attempts=4):
        """POST /api/workspaces with Retry-After back-off on the 30/min soft limit."""
        for attempt in range(1, attempts + 1):
            r = self.post("/api/workspaces")
            if r.status_code == 429 and attempt < attempts:
                time.sleep(min(float(r.headers.get("Retry-After", 10)), 60))
                continue
            assert r.status_code == 201, f"workspace: {r.status_code} {r.text[:200]}"
            return r.json()["token"]
        raise AssertionError("workspace creation kept returning 429")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers["User-Agent"] = "test-me-api-security/1.0 (+pytest)"
    return Api(s)


@pytest.fixture(scope="session")
def workspace(api):
    """A token shared by read-mostly tests."""
    return api.create_workspace()


@pytest.fixture(scope="session")
def other_workspace(api):
    """A second, unrelated workspace used to probe isolation."""
    return api.create_workspace()


@pytest.fixture
def fresh_workspace(api):
    """A private token for tests that create orders / reviews."""
    return api.create_workspace()


@pytest.fixture(scope="session")
def order(api, workspace):
    """One confirmed order in ``workspace`` for object-level checks."""
    r = api.post("/api/orders", token=workspace, json=checkout())
    assert r.status_code == 201, r.text
    return r.json()


# ------------------------------------------------------------------ helpers
def body_json(r):
    assert "application/json" in r.headers.get("content-type", ""), f"not JSON: {r.headers.get('content-type')}"
    return r.json()


def assert_error(r, status, detail=None, field=None):
    """Status + JSON ``{detail}`` + optional reason / offending field, like the Cypress suite."""
    assert r.status_code == status, f"expected {status}, got {r.status_code}: {r.text[:300]}"
    data = body_json(r)
    assert isinstance(data.get("detail"), str) and data["detail"], data
    if detail:
        assert detail in data["detail"], data
    if field is not None:
        assert field in data.get("fields", []), data
    assert_no_stack_trace(r)


def assert_no_stack_trace(r):
    text = r.text
    for marker in STACK_TRACE_MARKERS:
        assert marker not in text, f"error body leaks internals ({marker!r}): {text[:300]}"


def assert_not_server_error(r):
    assert r.status_code < 500, f"server error {r.status_code}: {r.text[:300]}"
    assert_no_stack_trace(r)
