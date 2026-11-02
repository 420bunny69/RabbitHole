import json
import time
from types import SimpleNamespace
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jwt import PyJWKClient

from app import deps

ISSUER = "https://rabbithole-test.supabase.co/auth/v1"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"
AUDIENCE = "authenticated"
SUBJECT = UUID("46049394-cbe3-45b9-8745-fa24c5d196a2")


def make_jwk(private_key, kid):
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": kid, "alg": "RS256", "use": "sig"})
    return jwk


def make_claims(**overrides):
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": str(SUBJECT),
        "iat": now,
        "exp": now + 300,
    }
    claims.update(overrides)
    return claims


def make_rsa_token(private_key, kid="test-key", claims=None, headers=None):
    token_headers = {"kid": kid}
    token_headers.update(headers or {})
    return jwt.encode(
        claims if claims is not None else make_claims(),
        private_key,
        algorithm="RS256",
        headers=token_headers,
    )


@pytest.fixture
def auth_context(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    rotated_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwks_state = {"keys": [make_jwk(private_key, "test-key")]}
    fetches = []
    jwks_client = PyJWKClient(
        JWKS_URL,
        cache_jwk_set=True,
        lifespan=300,
        cooldown_duration=0,
        timeout=1,
    )

    def fake_fetch_data():
        fetches.append(jwks_client.uri)
        return {"keys": list(jwks_state["keys"])}

    monkeypatch.setattr(jwks_client, "fetch_data", fake_fetch_data)
    monkeypatch.setattr(deps, "_get_jwks_client", lambda issuer: jwks_client)
    settings = SimpleNamespace(
        supabase_jwt_issuer=ISSUER,
        supabase_jwt_audience=AUDIENCE,
        supabase_jwt_algorithm="RS256",
        supabase_jwt_secret="",
    )
    monkeypatch.setattr(deps, "get_settings", lambda: settings)

    app = FastAPI()

    @app.get("/whoami")
    def whoami(user_id: deps.SupabaseUserId) -> dict[str, str]:
        return {"user_id": str(user_id)}

    return {
        "client": TestClient(app),
        "private_key": private_key,
        "rotated_private_key": rotated_private_key,
        "jwks_state": jwks_state,
        "fetches": fetches,
        "jwks_client": jwks_client,
        "settings": settings,
    }


def test_missing_bearer_token_returns_401(auth_context):
    response = auth_context["client"].get("/whoami")
    assert response.status_code == 401


def test_malformed_jwt_returns_401(auth_context):
    response = auth_context["client"].get("/whoami", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


def test_invalid_signature_returns_401(auth_context):
    another_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = make_rsa_token(another_key)

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_expired_token_returns_401(auth_context):
    token = make_rsa_token(auth_context["private_key"], claims=make_claims(exp=int(time.time()) - 60))

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_wrong_issuer_returns_401(auth_context):
    token = make_rsa_token(auth_context["private_key"], claims=make_claims(iss="https://wrong.example/auth/v1"))

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_wrong_audience_returns_401(auth_context):
    token = make_rsa_token(auth_context["private_key"], claims=make_claims(aud="other-audience"))

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_missing_subject_returns_401(auth_context):
    claims = make_claims()
    del claims["sub"]
    token = make_rsa_token(auth_context["private_key"], claims=claims)

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_invalid_subject_returns_401(auth_context):
    token = make_rsa_token(auth_context["private_key"], claims=make_claims(sub="not-a-uuid"))

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_valid_token_returns_verified_subject_uuid(auth_context):
    token = make_rsa_token(auth_context["private_key"])

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert UUID(response.json()["user_id"]) == SUBJECT
    assert auth_context["fetches"] == [JWKS_URL]


def test_future_not_before_claim_returns_401(auth_context):
    token = make_rsa_token(
        auth_context["private_key"], claims=make_claims(nbf=int(time.time()) + 300)
    )

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_untrusted_algorithm_is_rejected_without_fetching_jwks(auth_context):
    token = jwt.encode(
        make_claims(), "untrusted-test-key-with-at-least-32-bytes", algorithm="HS256"
    )

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert auth_context["fetches"] == []


def test_token_jku_header_does_not_change_trusted_jwks_url(auth_context):
    token = make_rsa_token(
        auth_context["private_key"], headers={"jku": "https://attacker.example/jwks.json"}
    )

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert auth_context["jwks_client"].uri == JWKS_URL
    assert auth_context["fetches"] == [JWKS_URL]


def test_configured_hs256_algorithm_uses_configured_secret(auth_context):
    auth_context["settings"].supabase_jwt_algorithm = "HS256"
    secret = "local-test-signing-secret-with-32-bytes-minimum"
    auth_context["settings"].supabase_jwt_secret = secret
    token = jwt.encode(make_claims(), secret, algorithm="HS256")

    response = auth_context["client"].get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert UUID(response.json()["user_id"]) == SUBJECT
    assert auth_context["fetches"] == []


def test_jwks_refresh_accepts_a_rotated_key(auth_context):
    first_token = make_rsa_token(auth_context["private_key"])
    first_response = auth_context["client"].get(
        "/whoami", headers={"Authorization": f"Bearer {first_token}"}
    )
    assert first_response.status_code == 200
    assert len(auth_context["fetches"]) == 1

    auth_context["jwks_state"]["keys"] = [
        make_jwk(auth_context["rotated_private_key"], "rotated-key")
    ]
    rotated_token = make_rsa_token(
        auth_context["rotated_private_key"], kid="rotated-key"
    )
    rotated_response = auth_context["client"].get(
        "/whoami", headers={"Authorization": f"Bearer {rotated_token}"}
    )

    assert rotated_response.status_code == 200
    assert auth_context["fetches"] == [JWKS_URL, JWKS_URL]