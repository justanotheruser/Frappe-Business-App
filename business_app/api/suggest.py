from __future__ import annotations

import logging

import frappe
from dadata import Dadata
from frappe.rate_limiter import rate_limit
from httpx import HTTPStatusError

logger = logging.getLogger("api.suggest")
if not any(isinstance(h, logging.StreamHandler) for h in logger.handlers):
    sh = logging.StreamHandler()  # goes to bench start console
    sh.setFormatter(logging.Formatter("[%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)

logger.setLevel(logging.DEBUG if frappe.conf.get(
    "developer_mode") else logging.INFO)


def create_dadata_client() -> Dadata | None:
    token = frappe.conf.get("dadata_token")
    if not token:
        frappe.log_error("DaData credentials are not configured on this site.")
        return None
    return Dadata(token)  # type: ignore


dadata = create_dadata_client()


@frappe.whitelist()
@rate_limit(limit=60, seconds=60)
def by_inn(query: str) -> dict[str, list[dict[str, str]]]:
    """
    Proxy to DaData clean address API.
    Returns: {"hints": [{"name": ..., "inn": ..., "kpp": ...}, ...]}

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
    Returns: {"hints": [{"name": ..., "inn": ..., "kpp": ...}, ...]}

    Called from browser via:
        /api/method/business_app.api.suggest.by_name
        POST data: {"query": "<partial company/person name>"}
    """
    return suggest(query)


def suggest(query: str) -> dict[str, list[dict[str, str]]]:
    if not dadata:
        return {"hints": []}
    query = (query or "").strip()
    if not query:
        return {"hints": []}

    try:
        suggestions = dadata.suggest("party", query)
    except HTTPStatusError:
        logger.error(frappe.get_traceback(), "DaData API error")
        # Fail soft: no hints, UI keeps working
        return {"hints": []}

    hints: list[dict[str, str]] = []
    for item in suggestions:
        name = item.get("value")
        inn = item.get("data", {}).get("inn")
        kpp = item.get("data", {}).get("kpp")
        if name and inn and kpp:
            hints.append({"name": name, "inn": inn, "kpp": kpp})
        else:
            logger.warning(
                f"Some values are missing from suggestion: {query=}, {name=}, {inn=}, {kpp=}")
        if len(hints) >= 10:
            break

    return {"hints": hints}
