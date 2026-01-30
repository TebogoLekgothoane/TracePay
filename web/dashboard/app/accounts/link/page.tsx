"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LinkAccountPage() {
  const router = useRouter();

  useEffect(() => {
    // Stakeholder Portal: User-level linking is disabled
    router.replace("/dashboard");
  }, [router]);

  return null;
}

