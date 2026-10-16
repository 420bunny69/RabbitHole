import json

import httpx
import pytest

from app.config import Settings
from app.services.llm import LLMError, LLMOutputError, get_llm_provider
from app.services.llm.groq import GroqProvider
from app.services.llm.ollama import OllamaProvider


def groq(handler, key="test-key") -> GroqProvider:
    return GroqProvider(key, "test-model", httpx.MockTransport(handler))


def ollama(handler) -> OllamaProvider:
    return OllamaProvider("http://localhost:11434/", "test-model", httpx.MockTransport(handler))


def groq_ok(content: str = '{"summary": "x"}') -> dict:
    return {"choices": [{"message": {"content": content}}]}


# ---- Groq -------------------------------------------------------------------------------------
def test_groq_sends_the_expected_request_and_returns_the_reply():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=groq_ok('{"summary": "hello"}'))

    assert groq(handler).complete_json("SYSTEM", "USER") == '{"summary": "hello"}'
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert seen["auth"] == "Bearer test-key"
    body = seen["body"]
    assert body["model"] == "test-model"
    assert body["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    assert [m["content"] for m in body["messages"]] == ["SYSTEM", "USER"]


def test_groq_without_a_key_fails_before_any_request():
    def handler(request):
        raise AssertionError("no request should be made")

    with pytest.raises(LLMError, match="GROQ_API_KEY"):
        groq(handler, key="").complete_json("s", "u")


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (429, "busy"),
        (401, "API key"),
        (403, "API key"),
        (500, "returned an error"),
        (400, "returned an error"),
    ],
)
def test_groq_errors_become_friendly_messages(status, expected):
    with pytest.raises(LLMError, match=expected) as info:
        groq(lambda r: httpx.Response(status, text="details: test-key leaked?")).complete_json("s", "u")
    assert "test-key" not in str(info.value)  # nothing from the provider's reply reaches the visitor
    assert not isinstance(info.value, LLMOutputError)


def test_groq_broken_json_is_reported_as_an_output_problem():
    body = {"error": {"message": "Failed to generate JSON", "code": "json_validate_failed"}}
    with pytest.raises(LLMOutputError):
        groq(lambda r: httpx.Response(400, json=body)).complete_json("s", "u")


def test_groq_timeout_and_connection_errors():
    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)

    def down(request):
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(LLMError, match="too long"):
        groq(slow).complete_json("s", "u")
    with pytest.raises(LLMError, match="Could not reach"):
        groq(down).complete_json("s", "u")


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json={"nope": 1}),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, text="<html>not json</html>"),
    ],
)
def test_groq_unexpected_reply_shapes(response):
    with pytest.raises(LLMError, match="unexpected response"):
        groq(lambda r: response).complete_json("s", "u")


# ---- Ollama -----------------------------------------------------------------------------------
def test_ollama_sends_the_expected_request_and_returns_the_reply():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"message": {"role": "assistant", "content": '{"a": 1}'}})

    assert ollama(handler).complete_json("SYSTEM", "USER") == '{"a": 1}'
    assert seen["url"] == "http://localhost:11434/api/chat"  # trailing slash in the setting is fine
    assert seen["body"]["model"] == "test-model"
    assert seen["body"]["stream"] is False
    assert seen["body"]["format"] == "json"


def test_ollama_missing_model_tells_you_how_to_fix_it():
    with pytest.raises(LLMError, match="ollama pull test-model"):
        ollama(lambda r: httpx.Response(404, json={"error": "model not found"})).complete_json("s", "u")


def test_ollama_not_running():
    def down(request):
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(LLMError, match="Is Ollama running"):
        ollama(down).complete_json("s", "u")


def test_ollama_server_error_and_odd_reply():
    with pytest.raises(LLMError, match="returned an error"):
        ollama(lambda r: httpx.Response(500, text="boom")).complete_json("s", "u")
    with pytest.raises(LLMError, match="unexpected response"):
        ollama(lambda r: httpx.Response(200, json={"nope": 1})).complete_json("s", "u")


# ---- choosing a provider ----------------------------------------------------------------------
def test_factory_builds_the_provider_named_in_settings():
    groq_provider = get_llm_provider(
        Settings(llm_provider="GROQ", groq_api_key="k", groq_model="m")  # case does not matter
    )
    assert isinstance(groq_provider, GroqProvider)
    assert (groq_provider.api_key, groq_provider.model) == ("k", "m")

    ollama_provider = get_llm_provider(
        Settings(llm_provider="ollama", ollama_base_url="http://x:1", ollama_model="llama")
    )
    assert isinstance(ollama_provider, OllamaProvider)
    assert (ollama_provider.base_url, ollama_provider.model) == ("http://x:1", "llama")


def test_factory_rejects_unknown_providers():
    with pytest.raises(LLMError, match="not configured correctly"):
        get_llm_provider(Settings(llm_provider="skynet"))
