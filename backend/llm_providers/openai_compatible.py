"""LLM provider base and OpenAI-compatible implementation."""
from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator

import httpx

logger = logging.getLogger(__name__)


class BaseLLMProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict], stream: bool = False, **kwargs) -> str | AsyncIterator[str]:
        ...


def _normalize_base_url(base_url: str) -> str:
    """Ensure the base URL ends with /v1 (or similar versioned path).

    Many OpenAI-compatible providers expect the full path to be
    ``<base>/v1/chat/completions``.  If the user provides a bare host
    (e.g. ``https://api.example.com/``), we append ``/v1`` automatically.
    If the URL already contains a path segment like ``/v1``, we leave it
    as-is.
    """
    url = base_url.rstrip("/")
    # If the path already ends with a version segment, keep it
    from urllib.parse import urlparse
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    # Common versioned paths: /v1, /v2, etc.
    if path and path.split("/")[-1].startswith("v") and path.split("/")[-1][1:].isdigit():
        return url
    # If the path already contains /chat/completions, strip it so we don't double up
    if path.endswith("/chat/completions"):
        return url
    # Otherwise append /v1
    return url + "/v1"


class OpenAICompatibleProvider(BaseLLMProvider):
    def __init__(self, base_url: str, api_key: str, model: str, max_tokens: int = 4096, temperature: float = 0.7):
        self.base_url = _normalize_base_url(base_url)
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature

    async def chat(self, messages: list[dict], stream: bool = False, **kwargs) -> str | AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "temperature": kwargs.get("temperature", self.temperature),
            "stream": stream,
        }

        if stream:
            return self._stream_chat(url, headers, payload)
        else:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                try:
                    data = resp.json()
                except json.JSONDecodeError:
                    logger.error("LLM response is not valid JSON: %s", resp.text[:500])
                    raise ValueError(f"LLM 返回了无效的响应（非 JSON），HTTP {resp.status_code}")
                if "choices" not in data or not data["choices"]:
                    logger.error("LLM response missing choices: %s", json.dumps(data)[:500])
                    raise ValueError("LLM 返回了意外的响应格式（缺少 choices）")
                return data["choices"][0]["message"]["content"]

    async def _stream_chat(self, url: str, headers: dict, payload: dict) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.error("LLM stream HTTP %d: %s", resp.status_code, body[:500])
                    raise ValueError(f"LLM 请求失败，HTTP {resp.status_code}: {body[:200].decode(errors='replace')}")
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        logger.warning("Failed to parse SSE chunk: %s", data_str[:200])
                        continue
                    except (KeyError, IndexError):
                        continue
