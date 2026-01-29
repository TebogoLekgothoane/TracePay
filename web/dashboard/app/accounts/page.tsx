"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Account {
  id: number;
  bank_name: string;
  account_id: string;
  status: string;
  last_synced_at: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

export default function AccountsPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Stakeholder Portal: User-level linking is disabled
    router.replace("/dashboard");
  }, []);

  return null;
}

