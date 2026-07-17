"""
Open Banking Sandbox (AISP) helper

Implements the token/consent flow described in `OpenBankingSandboxAPI.md`.
This is optional for the hackathon dashboard; the `/analyze` endpoint accepts
transactions directly. But this client gives you a ready path to pull data
from the sandbox later.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from .external_http import request_json_with_retries


@dataclass
class SandboxConfig:
    base_url: str = "https://open-banking-ais.onrender.com"
    client_id: str = ""
    client_secret: str = ""
    mtls_header_value: str = "enrolled"  # simulated mTLS


class OpenBankingSandboxClient:
    def __init__(self, cfg: SandboxConfig):
        self.cfg = cfg

    async def token_client_credentials(
        self, consent_id: Optional[str] = None, scope: Optional[str] = None
    ) -> Dict[str, Any]:
        data = {
            "grant_type": "client_credentials",
            "client_id": self.cfg.client_id,
            "client_secret": self.cfg.client_secret,
        }
        if consent_id:
            data["consent_id"] = consent_id
        if scope:
            data["scope"] = scope

        return await request_json_with_retries(
            "POST",
            f"{self.cfg.base_url}/connect/mtls/token",
            headers={
                "X-Client-Cert": self.cfg.mtls_header_value,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data=data,
        )

    async def create_consent(
        self, client_token: str, permissions: list[str], expirationDateTime: str
    ) -> Dict[str, Any]:
        payload = {"permissions": permissions, "expirationDateTime": expirationDateTime}
        return await request_json_with_retries(
            "POST",
            f"{self.cfg.base_url}/account-access-consents",
            headers={
                "Authorization": f"Bearer {client_token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    async def get_consent(self, client_token: str, consent_id: str) -> Dict[str, Any]:
        return await request_json_with_retries(
            "GET",
            f"{self.cfg.base_url}/account-access-consents/{consent_id}",
            headers={"Authorization": f"Bearer {client_token}"},
        )

    async def list_accounts(self, access_token: str, limit: int = 50) -> Dict[str, Any]:
        return await request_json_with_retries(
            "GET",
            f"{self.cfg.base_url}/accounts",
            params={"limit": limit},
            headers={"Authorization": f"Bearer {access_token}"},
        )

    async def list_transactions(
        self, access_token: str, account_id: str, limit: int = 100
    ) -> Dict[str, Any]:
        """Fetch transactions for a specific account from the OB Sandbox"""
        return await request_json_with_retries(
            "GET",
            f"{self.cfg.base_url}/accounts/{account_id}/transactions",
            params={"limit": limit},
            headers={"Authorization": f"Bearer {access_token}"},
        )
