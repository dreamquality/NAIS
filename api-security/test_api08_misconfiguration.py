"""API8:2023 — Security Misconfiguration (+ OWASP Web A02/A05).

Transport, response headers, error handling and CORS. Every API response
must be JSON (also on errors), must not leak internals, and must carry the
browser-hardening headers.
"""
import re

import pytest

from conftest import BASE_URL, assert_error, assert_no_stack_trace, body_json

pytestmark = pytest.mark.owasp("API8", "Security Misconfiguration")


# ---------------------------------------------------------------- transport
def test_http_redirects_to_https(api):
    r = api.get(BASE_URL.replace("https://", "http://") + "/api/health")
    assert r.status_code in (301, 308), r.status_code
    assert r.headers["location"].startswith("https://")


@pytest.mark.known_bug
@pytest.mark.xfail(strict=True, reason="HSTS header is not sent (neither on / nor on /api/*)")
def test_hsts_is_enabled(api):
    r = api.get("/api/health")
    hsts = r.headers.get("strict-transport-security", "")
    assert re.search(r"max-age=(\d+)", hsts) and int(re.search(r"max-age=(\d+)", hsts).group(1)) >= 15552000, hsts


# ------------------------------------------------------------------ headers
@pytest.mark.parametrize("path", ["/api/health", "/api/products/p01"])
def test_hardening_headers_on_api_responses(api, path):
    h = api.get(path).headers
    assert h.get("x-content-type-options", "").lower() == "nosniff"
    assert h.get("x-frame-options", "").upper() == "DENY" or "frame-ancestors 'none'" in h.get("content-security-policy", "")
    assert h.get("referrer-policy"), "missing Referrer-Policy"
    assert "default-src" in h.get("content-security-policy", ""), "missing CSP"


def test_authenticated_json_is_not_cacheable(api, workspace):
    h = api.get("/api/favorites", token=workspace).headers
    assert "no-store" in h.get("cache-control", "").lower(), h.get("cache-control")


def test_no_technology_fingerprint_in_headers(api):
    h = api.get("/api/health").headers
    assert "x-powered-by" not in {k.lower() for k in h}
    assert not re.search(r"\d+\.\d+", h.get("server", "")), f"server header reveals a version: {h.get('server')}"
    assert "x-aspnet-version" not in {k.lower() for k in h}


# --------------------------------------------------------------------- CORS
def test_cors_is_not_open_to_arbitrary_origins(api):
    r = api.get("/api/health", headers={"Origin": "https://evil.example"})
    acao = r.headers.get("access-control-allow-origin")
    assert acao in (None, BASE_URL), acao
    assert r.headers.get("access-control-allow-credentials", "").lower() != "true" or acao != "*"


def test_preflight_from_foreign_origin_is_not_granted(api):
    r = api.request(
        "OPTIONS",
        "/api/quote",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-workspace-token"},
    )
    assert r.headers.get("access-control-allow-origin") in (None, BASE_URL)
    assert "x-workspace-token" not in r.headers.get("access-control-allow-headers", "").lower() or r.headers.get("access-control-allow-origin") == BASE_URL


# ----------------------------------------------------------- error handling
def test_unknown_route_is_json_404_without_internals(api):
    r = api.get("/api/this-route-does-not-exist")
    assert r.status_code == 404
    assert isinstance(body_json(r).get("detail"), str)
    assert_no_stack_trace(r)


def test_method_not_allowed_is_json(api):
    assert_error(api.request("DELETE", "/api/products"), 405)


@pytest.mark.parametrize(
    "content_type,data",
    [
        ("text/plain", '{"items":[{"product_id":"p01","quantity":1}],"delivery":"standard"}'),
        ("application/x-www-form-urlencoded", "items=p01&delivery=standard"),
        ("application/xml", "<items><item>p01</item></items>"),
        ("application/json", '{"items":'),
        ("application/json", "null"),
        ("application/json", "[]"),
        ("application/json", '"string"'),
        ("application/json", ""),
    ],
)
def test_unparseable_or_wrong_typed_bodies_are_422_not_5xx(api, workspace, content_type, data):
    r = api.post("/api/quote", token=workspace, headers={"Content-Type": content_type}, data=data.encode())
    assert_error(r, 422)


def test_validation_errors_name_the_field_but_not_the_value(api, workspace):
    """422 must point at the field (so clients can fix it) without echoing what was sent."""
    secret = "Sup3r-S3cret-Value-That-Must-Not-Echo"
    body = {"items": [{"product_id": "p01", "quantity": 1}], "delivery": secret}
    r = api.post("/api/quote", token=workspace, json=body)
    assert_error(r, 422, field=["body", "delivery"])
    assert secret not in r.text


@pytest.mark.known_bug
@pytest.mark.xfail(strict=True, reason="GET /api/health discloses the application version (\"version\": \"2.1.0\")")
def test_health_does_not_disclose_environment(api):
    data = body_json(api.get("/api/health"))
    forbidden = {"env", "hostname", "version", "python", "database", "db", "secret", "debug"}
    assert not (set(k.lower() for k in data) & forbidden), data


@pytest.mark.known_bug
@pytest.mark.xfail(strict=True, reason="GET /api/products/ (trailing slash) → 307 to the backend origin over plain http://")
def test_trailing_slash_redirect_stays_on_site_and_on_https(api):
    """A framework-generated redirect must not reveal the upstream host nor downgrade to http."""
    r = api.get("/api/products/")
    assert r.status_code in (200, 404, 405) or (
        r.status_code in (301, 307, 308) and r.headers["location"].startswith(BASE_URL + "/")
    ), f"{r.status_code} → {r.headers.get('location')}"
