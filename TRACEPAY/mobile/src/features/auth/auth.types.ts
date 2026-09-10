export type AuthUser = {
  id: string;
  phone: string | null;
  fullName: string | null;
};

export type AuthProfile = {
  id: string;
  fullName: string;
  phone: string | null;
  currency: string;
};

export type SignUpInput = {
  fullName: string;
  phone: string;
  password: string;
};

export type SignInInput = {
  phone: string;
  password: string;
};

export type SignInResult = {
  requiresOtp: boolean;
  resetAllowed?: boolean;
  session: {
    accessToken: string;
    refreshToken: string;
  } | null;
};
