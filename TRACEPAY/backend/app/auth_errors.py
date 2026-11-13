class AuthError(Exception):
    """User-safe auth failure. The message is returned to the app as {"error": message}."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
