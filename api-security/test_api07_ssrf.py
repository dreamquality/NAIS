"""API7:2023 — Server Side Request Forgery.

The contract has no field that is fetched by the server (no URLs, no
webhooks, no image upload). The tests pin that down: URL-shaped values in
every free-text field are treated as plain text and never trigger a fetch.
"""
import pytest

from conftest import assert_error, checkout

pytestmark = pytest.mark.owasp("API7", "Server Side Request Forgery")

URLS = [
    "http://127.0.0.1:80/",
    "http://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd",
    "http://localhost:6379/",
]


@pytest.mark.parametrize("url", URLS)
def test_url_in_review_text_is_stored_as_text(api, fresh_workspace, url):
    text = f"Дивіться тут: {url} — чудово"
    r = api.post("/api/products/p05/review", token=fresh_workspace, json={"rating": 3, "text": text})
    assert r.status_code == 201, r.text
    assert r.json()["review"]["text"] == text
    assert r.elapsed.total_seconds() < 5, "a slow 201 suggests the server tried to fetch the URL"


@pytest.mark.parametrize("url", URLS)
def test_url_in_contact_fields_does_not_change_validation(api, workspace, url):
    """A URL is just an invalid email / a valid address; the response is instant either way."""
    r = api.post("/api/orders", token=workspace, json=checkout(email=url))
    assert_error(r, 422, detail="електронну пошту")
    assert r.elapsed.total_seconds() < 5


def test_product_images_are_same_origin(api):
    """Image URLs come from the catalog, never from clients, and stay on the site."""
    items = api.get("/api/products?limit=20").json()["items"]
    for p in items:
        assert not p["image"].startswith(("http://", "//")), p["image"]
        assert p["image"].startswith(("/", "assets/", "https://test-me.vzl.one/")), p["image"]
