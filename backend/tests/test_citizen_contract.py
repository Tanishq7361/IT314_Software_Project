"""Contract tests against the OpenAPI document for the citizen routes (S2-14). No database needed."""

import pytest

from main import app

SPEC = app.openapi()
PATHS = SPEC["paths"]


@pytest.mark.parametrize(
    "path,method",
    [
        ("/api/v1/auth/register", "post"),
        ("/api/v1/auth/login", "post"),
        ("/api/v1/incidents", "post"),
        ("/api/v1/me/incidents", "get"),
        ("/api/v1/me/incidents/{incident_id}", "get"),
        ("/api/v1/me/incidents/{incident_id}/information-response", "post"),
        ("/api/v1/me/incidents/{incident_id}/attachments", "post"),
        ("/api/v1/me/incidents/{incident_id}/attachments", "get"),
        ("/api/v1/me/incidents/{incident_id}/attachments/{evidence_id}", "get"),
        ("/api/v1/me/incidents/{incident_id}/attachments/{evidence_id}", "delete"),
        ("/api/v1/me/notifications", "get"),
    ],
)
def test_citizen_routes_are_documented(path, method):
    assert method in PATHS[path]


def test_report_submission_documents_the_idempotency_key_header():
    params = PATHS["/api/v1/incidents"]["post"].get("parameters", [])
    assert any(p["name"] == "Idempotency-Key" and p["in"] == "header" for p in params)


def test_no_legacy_or_header_identity_routes_remain():
    assert not [p for p in PATHS if p.startswith("/api/citizen")]
    for path, methods in PATHS.items():
        for operation in methods.values():
            names = {p["name"].lower() for p in operation.get("parameters", [])}
            assert "x-user-id" not in names, path


def test_information_response_accepts_text_or_corrected_location():
    ref = PATHS["/api/v1/me/incidents/{incident_id}/information-response"]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"]["$ref"]
    schema = SPEC["components"]["schemas"][ref.rsplit("/", 1)[1]]
    assert {"message", "latitude", "longitude", "address_text"} <= set(schema["properties"])
    assert not schema.get("required")  # either text or a corrected location; checked by the model validator


def test_register_request_schema_lists_the_contract_fields():
    ref = PATHS["/api/v1/auth/register"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"]
    schema = SPEC["components"]["schemas"][ref.rsplit("/", 1)[1]]
    assert {"email", "password", "full_name", "phone"} <= set(schema["properties"])
    assert set(schema["required"]) == {"email", "password", "full_name"}
