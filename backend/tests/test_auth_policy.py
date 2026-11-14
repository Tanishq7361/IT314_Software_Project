"""Citizen registration contract (s.2.1): password policy, duplicate email, rate limiting."""

import uuid

import pytest

pytestmark = pytest.mark.db


def _register(client, password="Str0ng!pass", email=None):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email or f"{uuid.uuid4().hex[:10]}@example.in", "password": password, "full_name": "Ramesh Patel"},
    )


def test_register_returns_contract_fields_and_a_session(client):
    r = _register(client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["role"] == "NORMAL_USER" and body["status"] == "ACTIVE" and body["user_id"] and body["access_token"]


@pytest.mark.parametrize("password", ["short1!", "nodigits!!", "nospecial12", "        "])
def test_weak_passwords_are_rejected(client, password):
    r = _register(client, password)
    assert r.status_code == 422 and r.json()["error"]["code"] == "WEAK_PASSWORD"


def test_duplicate_email_code(client):
    email = f"{uuid.uuid4().hex[:10]}@example.in"
    assert _register(client, email=email).status_code == 201
    r = _register(client, email=email)
    assert r.status_code == 409 and r.json()["error"]["code"] == "DUPLICATE_EMAIL"


def test_login_is_rate_limited(client, monkeypatch):
    from app import ratelimit

    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    ratelimit.reset()
    try:
        codes = [client.post("/api/v1/auth/login", json={"email": "nobody@example.in", "password": "x"}).status_code
                 for _ in range(22)]
    finally:
        ratelimit.reset()
    assert codes[:20] == [401] * 20 and codes[20:] == [429, 429]


def test_register_rate_limit_returns_429(client, monkeypatch):
    from app import ratelimit

    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    ratelimit.reset()
    try:
        codes = [_register(client).status_code for _ in range(12)]
    finally:
        ratelimit.reset()
    assert codes[:10] == [201] * 10 and codes[10:] == [429, 429]


def test_registered_citizen_can_log_in_but_cannot_reach_dm(client):
    email = f"{uuid.uuid4().hex[:10]}@example.in"
    assert _register(client, email=email).status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "Str0ng!pass"})
    assert login.status_code == 200 and login.json()["role"] == "NORMAL_USER"
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    denied = client.get("/api/v1/dm/incidents", headers=headers)
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "ROLE_REQUIRED"


def test_register_writes_an_audit_entry_and_stores_a_hashed_password(client, sql):
    email = f"{uuid.uuid4().hex[:10]}@example.in"
    user_id = _register(client, email=email).json()["user_id"]
    audit_row = sql.execute(
        "SELECT result FROM audit_logs WHERE entity_id = %s AND action = 'CITIZEN_REGISTERED'", (user_id,)
    ).fetchone()
    assert audit_row["result"] == "SUCCESS"
    stored = sql.execute("SELECT password_hash FROM user_auth WHERE user_id = %s", (user_id,)).fetchone()
    assert stored["password_hash"].startswith("$argon2id$")


@pytest.mark.parametrize("email", ["not-an-email", "a@b", "two words@example.in"])
def test_invalid_email_is_rejected(client, email):
    assert _register(client, email=email).status_code == 422


def test_invalid_phone_is_rejected_and_valid_phone_accepted(client):
    base = {"password": "Str0ng!pass", "full_name": "Ramesh Patel"}
    bad = client.post("/api/v1/auth/register", json={**base, "email": f"{uuid.uuid4().hex[:10]}@example.in", "phone": "abc"})
    good = client.post(
        "/api/v1/auth/register", json={**base, "email": f"{uuid.uuid4().hex[:10]}@example.in", "phone": "+919876543210"}
    )
    assert bad.status_code == 422 and good.status_code == 201


def test_verification_link_is_stubbed_to_the_outbox(client):
    from app.services import email as email_service

    email = f"{uuid.uuid4().hex[:10]}@example.in"
    assert _register(client, email=email).status_code == 201
    sent = [m for m in email_service.get_outbox() if m["to"] == email]
    assert sent and "verify-email" in sent[-1]["text"]


def test_verification_stub_never_emails_when_smtp_is_configured(monkeypatch):
    """There is no /verify-email page yet, so a real email would send new citizens to a dead link."""
    from app.config import get_settings
    from app.services import email as email_service

    monkeypatch.setenv("SMTP_HOST", "smtp.example.invalid")
    get_settings.cache_clear()
    try:
        before = len(email_service.get_outbox())
        assert email_service.send_verification_email("someone@example.in", "Someone") is False
        assert len(email_service.get_outbox()) == before
    finally:
        monkeypatch.delenv("SMTP_HOST")
        get_settings.cache_clear()
