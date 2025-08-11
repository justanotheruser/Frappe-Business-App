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
def find_by_id(query: str, kpp: str) -> dict[str, str | None | bool]:
    """
    Proxy to DaData clean address API.
    Returns: {"suggestions": [{"name": ..., "inn": ..., "kpp": ...}, ...]}

    Called from browser via:
        /api/method/business_app.api.company.find_by_id
        POST data: {"query": "<inn>", "kpp": "<kpp>"}
    """
    if (dadata := get_dadata()) is None:
        return {}
    query = (query or "").strip()
    if not query:
        return {}

    was_searched_without_kpp = False
    try:
        response = dadata.find_by_id("party", query, kpp=kpp)
        if not response:
            was_searched_without_kpp = True
            response = dadata.find_by_id("party", query, branch_type="MAIN")
    except HTTPStatusError:
        logger.error(frappe.get_traceback(), "DaData API error")
        return {}

    if not response:
        return {}
    company = response[0]
    return {
        "address": company.get("data", {}).get("address", {}).get("value", None),
        "was_searched_without_kpp": was_searched_without_kpp,
    }
