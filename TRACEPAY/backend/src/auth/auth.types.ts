export type SignUpBody = {
  fullName: string;
  phone: string;
  password: string;
};

export type SignInBody = {
  phone: string;
  password: string;
};

export type VerifyOtpBody = {
  phone: string;
  code: string;
  password?: string;
  purpose?: "signup" | "login" | "reset";
};

export type ResetPasswordBody = {
  phone: string;
  password: string;
};

export type PhoneBody = {
  phone: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
};

export type SignInResult = {
  requiresOtp: boolean;
  session: AuthSession | null;
  resetAllowed?: boolean;
};

export class AuthHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthHttpError";
  }
}
