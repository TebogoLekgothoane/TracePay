"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

type Redemptions = Awaited<ReturnType<typeof apiClient.getPartnerRedemptions>>;

export default function PartnerRedemptionsPage() {
  const [redemptions, setRedemptions] = useState<Redemptions>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRedemptions(await apiClient.getPartnerRedemptions());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load redemptions.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Redemptions</h1>
        <p className="text-sm text-muted-foreground">
          Every redemption of your offer. No customer identity is shown here — only the transaction facts.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading redemptions...</p>
      ) : redemptions.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No redemptions yet.</p>
      ) : (
        <div className="space-y-3">
          {redemptions.map((redemption) => (
            <Card key={redemption.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <Gift className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{redemption.points_spent.toLocaleString()} pts redeemed</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(redemption.redeemed_at).toLocaleString()} &middot; {redemption.status}
                    </p>
                  </div>
                </div>
                <p className="font-medium">R{redemption.commission_amount.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
