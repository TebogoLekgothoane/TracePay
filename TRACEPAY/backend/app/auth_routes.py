"""/auth/* HTTP routes for the mobile app. Paths and {error} response bodies match the former Node server."""

import re

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import auth_service
from app.auth_errors import AuthError
from app.rate_limit import allow_request

router = APIRouter(prefix="/auth")

MINUTE = 60
LIMIT_MESSAGE = "Too many attempts. Wait a few minutes and try again."


class SignUpBody(BaseModel):
    fullName: str = ""
    phone: str = ""
    password: str = ""


class SignInBody(BaseModel):
    phone: str = ""
    password: str = ""


class VerifyOtpBody(BaseModel):
    phone: str = ""
    code: str = ""
    password: str = ""
    purpose: str = ""


class ForgotPasswordBody(BaseModel):
    phone: str = ""


class ResetPasswordBody(BaseModel):
    phone: str = ""
    password: str = ""
    resetToken: str = ""


class ResendOtpBody(BaseModel):
    phone: str = ""


class ChangePasswordBody(BaseModel):
    currentPassword: str = ""
    newPassword: str = ""


class DeleteAccountBody(BaseModel):
    password: str = ""


def _limit(key: str, max_requests: int, window_seconds: int) -> None:
    if not allow_request(key, max_requests, window_seconds):
        raise AuthError(429, LIMIT_MESSAGE)


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _phone_key(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)[-9:]
    return digits or "none"


@router.post("/register", status_code=201)
def register_route(body: SignUpBody, request: Request) -> dict[str, bool]:
    _limit(f"register:{_ip(request)}", 5, 15 * MINUTE)
    auth_service.register(body.fullName, body.phone, body.password)
    return {"ok": True}


@router.post("/login")
def login_route(body: SignInBody, request: Request) -> dict:
    _limit(f"login:{_ip(request)}", 10, 10 * MINUTE)
    return auth_service.login(body.phone, body.password)


@router.post("/verify-otp")
def verify_otp_route(body: VerifyOtpBody, request: Request) -> dict:
    _limit(f"verify-otp:{_ip(request)}:{_phone_key(body.phone)}", 15, 10 * MINUTE)
    purpose = "reset" if body.purpose == "reset" else ""
    return auth_service.verify_otp(body.phone, body.code, body.password, purpose)


@router.post("/resend-otp")
def resend_otp_route(body: ResendOtpBody, request: Request) -> dict[str, bool]:
    _limit(f"resend-otp:{_ip(request)}:{_phone_key(body.phone)}", 5, 15 * MINUTE)
    auth_service.resend_otp(body.phone)
    return {"ok": True}


@router.post("/forgot-password")
def forgot_password_route(body: ForgotPasswordBody, request: Request) -> dict[str, bool]:
    _limit(f"forgot-password:{_ip(request)}:{_phone_key(body.phone)}", 5, 15 * MINUTE)
    auth_service.forgot_password(body.phone)
    return {"ok": True}


@router.post("/reset-password")
def reset_password_route(body: ResetPasswordBody, request: Request) -> dict:
    _limit(f"reset-password:{_ip(request)}:{_phone_key(body.phone)}", 10, 10 * MINUTE)
    return auth_service.reset_password(body.phone, body.password, body.resetToken)


@router.post("/change-password")
def change_password_route(body: ChangePasswordBody, request: Request) -> dict:
    _limit(f"change-password:{_ip(request)}", 10, 10 * MINUTE)
    return auth_service.change_password(
        request.headers.get("Authorization"),
        body.currentPassword,
        body.newPassword,
    )


@router.post("/delete-account")
def delete_account_route(body: DeleteAccountBody, request: Request) -> dict[str, bool]:
    _limit(f"delete-account:{_ip(request)}", 5, 15 * MINUTE)
    return auth_service.delete_account(
        request.headers.get("Authorization"),
        body.password,
    )


def register_auth_routes(app: FastAPI) -> None:
    app.include_router(router)

    @app.exception_handler(AuthError)
    async def _auth_error_handler(_request: Request, error: AuthError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={"error": error.message})
