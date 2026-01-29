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
  const [selectedType, setSelectedType] = useState<"bank" | "momo" | null>(null);
  const [bankName, setBankName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLinkBank() {
    if (!bankName) {
      setError("Please select a bank");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiClient.linkAccount({
        bank_name: bankName,
        metadata: { type: "bank" },
      });
      router.push("/accounts");
    } catch (err: any) {
      setError(err.message || "Failed to link account");
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkMoMo() {
    if (!phoneNumber) {
      setError("Please enter your phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // In production, this would call the MTN MoMo API
      await apiClient.linkAccount({
        bank_name: "MTN MoMo",
        account_id: `momo_${phoneNumber}`,
        metadata: { type: "momo", phone_number: phoneNumber },
      });
      router.push("/accounts");
    } catch (err: any) {
      setError(err.message || "Failed to link MTN MoMo account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold">Link Account</h1>
        <p className="mb-8 text-muted-foreground">Connect your bank or mobile money account</p>

        {!selectedType ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card
              className="cursor-pointer transition-colors hover:bg-secondary/50"
              onClick={() => setSelectedType("bank")}
            >
              <CardHeader>
                <Building2 className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Bank Account</CardTitle>
                <CardDescription>Link your bank account via Open Banking</CardDescription>
              </CardHeader>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-secondary/50"
              onClick={() => setSelectedType("momo")}
            >
              <CardHeader>
                <Smartphone className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>MTN MoMo</CardTitle>
                <CardDescription>Link your MTN Mobile Money account</CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : selectedType === "bank" ? (
          <Card>
            <CardHeader>
              <CardTitle>Link Bank Account</CardTitle>
              <CardDescription>Select your bank to begin the Open Banking consent flow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="bank">Bank</Label>
                <select
                  id="bank"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                >
                  <option value="">Select a bank</option>
                  {BANKS.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedType(null)}>
                  Back
                </Button>
                <Button onClick={handleLinkBank} disabled={loading || !bankName}>
                  {loading ? "Linking..." : "Link Account"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Link MTN MoMo Account</CardTitle>
              <CardDescription>Enter your MTN MoMo phone number</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0821234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedType(null)}>
                  Back
                </Button>
                <Button onClick={handleLinkMoMo} disabled={loading || !phoneNumber}>
                  {loading ? "Linking..." : "Link Account"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

