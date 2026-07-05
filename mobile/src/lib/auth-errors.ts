export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

type AuthLikeError = {
  message?: string;
  code?: string | number;
  status?: number;
};

function readMessage(error: AuthLikeError): string {
  return (error.message ?? "Something went wrong. Please try again.").toLowerCase();
}

export function mapSupabaseAuthError(error: AuthLikeError): AuthError {
  const msg = readMessage(error);
  const code = typeof error.code === "string" ? error.code : "";

  if (msg.includes("invalid phone") || code === "phone_not_found") {
    return new AuthError("Enter a valid SA mobile number.");
  }
  if (
    code === "otp_expired" ||
    (msg.includes("otp") && msg.includes("expired")) ||
    (msg.includes("token") && msg.includes("expired"))
  ) {
    return new AuthError("That code has expired. Request a new one.");
  }
  if (
    code === "otp_disabled" ||
    code === "invalid_otp" ||
    msg.includes("invalid otp") ||
    msg.includes("token is invalid") ||
    msg.includes("invalid token")
  ) {
    return new AuthError("Invalid verification code. Please try again.");
  }
  if (
    code === "sms_send_failed" &&
    (msg.includes("invalid from number") ||
      msg.includes("caller id") ||
      msg.includes("21212") ||
      msg.includes("va"))
  ) {
    return new AuthError(
      "Supabase is using the wrong Twilio sender. Do not use a Verify Service ID (VA…). Use a Twilio phone number (+27…) or a Messaging Service SID (MG…) in Supabase → Authentication → Phone.",
    );
  }
  if (
    code === "sms_send_failed" &&
    (msg.includes("invalid username") ||
      msg.includes("authentication error") ||
      msg.includes("20003"))
  ) {
    return new AuthError(
      "Twilio rejected the SMS credentials. In Supabase → Authentication → Phone, check your Twilio Account SID and Auth Token (no extra spaces). Use the main Account SID, not an API Key SID.",
    );
  }
  if (
    msg.includes("sms") ||
    msg.includes("twilio") ||
    code === "sms_send_failed"
  ) {
    return new AuthError(
      "Could not send the verification SMS. Check Phone auth and Twilio settings in the Supabase dashboard.",
    );
  }
  if (
    error.status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    msg.includes("rate limit")
  ) {
    return new AuthError("Too many attempts. Please wait a moment and try again.");
  }
  if (msg.includes("supabase") && (msg.includes("url") || msg.includes("key"))) {
    return new AuthError(
      "Supabase is not configured correctly. Check mobile/.env and restart Expo.",
    );
  }

  return new AuthError(error.message ?? "Something went wrong. Please try again.");
}
