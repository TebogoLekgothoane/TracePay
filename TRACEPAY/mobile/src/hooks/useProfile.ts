import { useCallback, useEffect } from "react";

import { loadCurrentProfile } from "../features/auth/auth.service";
import { useProfileSnapshot } from "../features/auth/auth.store";

export function useProfile() {
  const snapshot = useProfileSnapshot();

  const retry = useCallback(() => {
    void loadCurrentProfile(true);
  }, []);

  useEffect(() => {
    void loadCurrentProfile(false);
  }, []);

  return {
    profile: snapshot.profile,
    loading: snapshot.loading,
    error: snapshot.error,
    retry,
  };
}
