export type AuthUser = {
  id: string;
  phone: string | null;
  fullName: string | null;
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
};
