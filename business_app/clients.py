from __future__ import annotations

import logging
import threading

import frappe
from dadata import Dadata

_logger = logging.getLogger("business_app.clients")
_lock = threading.Lock()
_client: Dadata | None = None
_token_used: str | None = None


def get_dadata() -> Dadata | None:
    """
    Return a cached Dadata client (one per Python process).
    Recreate if the token changed in site config.
    """
    global _client, _token_used
    token = frappe.conf.get("dadata_token")

    if not token:
        _logger.error("dadata_token is missing in site_config.json")
        return None

    # Fast path
    if _client is not None and token == _token_used:
        return _client

    # Slow path: create or recreate
    with _lock:
        if _client is None or token != _token_used:
            _logger.info("Initializing Dadata client")
            _client = Dadata(token)
            _token_used = token
    return _client


def prime_clients() -> None:
    """Optionally called at app startup to warm-up the client."""
    get_dadata()
