import { useCallback, useState } from "react";

import { AuthError } from "../features/auth/auth.errors";
import {
  changePassword,
  deleteCurrentUser,
  requestPasswordReset,
  resendPhoneOtp,
  resetPassword,
  signIn,
  signUp,
  verifyPhoneOtp,
} from "../features/auth/auth.service";
import type { SignInInput, SignInResult, SignUpInput } from "../features/auth/auth.types";

export function useAuth() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setSubmitting(true);
    setError(null);

    try {
      return await action();
    } catch (caught) {
      const message =
        caught instanceof AuthError
          ? caught.message
          : "Something went wrong. Please try again.";
      setError(message);
      throw caught;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const register = useCallback(
    (input: SignUpInput) => run(() => signUp(input)),
    [run],
  );

  const login = useCallback(
    (input: SignInInput) => run(() => signIn(input)),
    [run],
  );

  const verifyPhone = useCallback(
    (code: string, phone?: string) => run(() => verifyPhoneOtp(code, phone)),
    [run],
  );

  const resendPhone = useCallback(
    (phone?: string) => run(() => resendPhoneOtp(phone)),
    [run],
  );

  const requestReset = useCallback(
    (phone: string) => run(() => requestPasswordReset(phone)),
    [run],
  );

  const updatePassword = useCallback(
    (password: string, phone?: string) => run(() => resetPassword(password, phone)),
    [run],
  );

  const updateAccountPassword = useCallback(
    (currentPassword: string, newPassword: string) =>
      run(() => changePassword(currentPassword, newPassword)),
    [run],
  );

  const deleteAccount = useCallback(
    (password: string) => run(() => deleteCurrentUser(password)),
    [run],
  );

  return {
    submitting,
    error,
    setError,
    signUp: register,
    signIn: login,
    verifyPhone,
    resendPhone,
    requestReset,
    updatePassword,
    changePassword: updateAccountPassword,
    deleteAccount,
  };
}

export type { SignInResult };
