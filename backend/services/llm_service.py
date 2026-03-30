"""LLM service — manages providers and orchestrates LLM calls."""
from __future__ import annotations

from typing import AsyncIterator

from config import load_config
from llm_providers.openai_compatible import OpenAICompatibleProvider


def _get_provider(provider_id: str | None = None) -> OpenAICompatibleProvider:
    config = load_config()
    providers = config.get("llm_providers", [])
    if not providers:
        raise ValueError("No LLM providers configured. Please add one in Settings.")

    provider_cfg = None
    if provider_id:
        for p in providers:
            if p["id"] == provider_id:
                provider_cfg = p
                break
    if not provider_cfg:
        # Use default
        for p in providers:
            if p.get("is_default"):
                provider_cfg = p
                break
    if not provider_cfg:
        provider_cfg = providers[0]

    return OpenAICompatibleProvider(
        base_url=provider_cfg["base_url"],
        api_key=provider_cfg["api_key"],
        model=provider_cfg["model"],
        max_tokens=provider_cfg.get("max_tokens", 4096),
        temperature=provider_cfg.get("temperature", 0.7),
    )


async def chat_completion(messages: list[dict], provider_id: str | None = None) -> str:
    provider = _get_provider(provider_id)
    return await provider.chat(messages, stream=False)


async def chat_stream(messages: list[dict], provider_id: str | None = None) -> AsyncIterator[str]:
    provider = _get_provider(provider_id)
    async for chunk in await provider.chat(messages, stream=True):
        yield chunk
