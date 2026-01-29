"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

const BANKS = [
  "Standard Bank",
  "FNB",
  "Absa",
  "Nedbank",
  "Capitec",
  "Discovery Bank",
];

export default function LinkAccountPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Stakeholder Portal: User-level linking is disabled
    router.replace("/dashboard");
  }, []);

  return null;
}

