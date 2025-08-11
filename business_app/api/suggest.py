from __future__ import annotations

import logging

import frappe
from frappe.rate_limiter import rate_limit
from httpx import HTTPStatusError

from business_app.clients import get_dadata

logger = logging.getLogger("api.suggest")
logger.setLevel(logging.DEBUG if frappe.conf.get("developer_mode") else logging.INFO)


@frappe.whitelist()
@rate_limit(limit=60, seconds=60)
def by_inn(query: str) -> dict[str, list[dict[str, str]]]:
    """
    Proxy to DaData clean address API.
    Returns: {"suggestions": [{"name": ..., "inn": ..., "kpp": ...}, ...]}

    Called from browser via:
        /api/method/business_app.api.suggest.by_inn
        POST data: {"query": "<partial inn>"}
    """
    return suggest(query)


@frappe.whitelist()
@rate_limit(limit=60, seconds=60)
def by_name(query: str) -> dict[str, list[dict[str, str]]]:
    """
    Proxy to DaData clean address API.
    Returns: {"suggestions": [{"name": ..., "inn": ..., "kpp": ...}, ...]}

    Called from browser via:
        /api/method/business_app.api.suggest.by_name
        POST data: {"query": "<partial company/person name>"}
    """
    return suggest(query)


def suggest(query: str) -> dict[str, list[dict[str, str]]]:
    if (dadata := get_dadata()) is None:
        return {"suggestions": []}
    query = (query or "").strip()
    if not query:
        return {"suggestions": []}

    try:
        response = dadata.suggest("party", query)
    except HTTPStatusError:
        logger.error(frappe.get_traceback(), "DaData API error")
        # Fail soft: no suggestions, UI keeps working
        return {"suggestions": []}

    suggestions: list[dict[str, str]] = []
    for item in response:
        name = item.get("value")
        inn = item.get("data", {}).get("inn")
        kpp = item.get("data", {}).get("kpp")
        if name and inn and kpp:
            suggestions.append({"name": name, "inn": inn, "kpp": kpp})
        else:
            logger.warning(f"Some values are missing from suggestion: {query=}, {name=}, {inn=}, {kpp=}")
        if len(suggestions) >= 10:
            break

    return {"suggestions": suggestions}
