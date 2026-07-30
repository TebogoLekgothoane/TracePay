"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Gift, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

type Partner = Awaited<ReturnType<typeof apiClient.adminListPartners>>[number];

const emptyForm = {
  id: "",
  name: "",
  offer_description: "",
  points_cost: "",
  estimated_value_rand: "",
  commission_rate: "0.025",
  owner_user_id: "",
};

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyPartnerId, setBusyPartnerId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    try {
      setError(null);
      setPartners(await apiClient.adminListPartners());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load partners.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.adminCreatePartner({
        id: form.id.trim(),
        name: form.name.trim(),
        offer_description: form.offer_description.trim(),
        points_cost: Number(form.points_cost),
        estimated_value_rand: Number(form.estimated_value_rand),
        commission_rate: Number(form.commission_rate),
        owner_user_id: form.owner_user_id.trim() || null,
      });
      setForm(emptyForm);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that partner.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(partner: Partner) {
    setBusyPartnerId(partner.id);
    setError(null);
    try {
      await apiClient.adminUpdatePartner(partner.id, { is_active: !partner.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that partner.");
    } finally {
      setBusyPartnerId(null);
    }
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reward Partners</h1>
          <p className="text-sm text-muted-foreground">
            Onboard commission partners and link the account that logs in as their owner. There is no
            self-service signup — provisioning is admin-only.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add a partner
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a partner</DialogTitle>
              <DialogDescription>
                owner_user_id is the Supabase auth UUID of the account that should see this partner&apos;s view
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="id">Partner id</Label>
                <Input
                  id="id"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="checkers"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Checkers"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="offer_description">Offer</Label>
                <Input
                  id="offer_description"
                  value={form.offer_description}
                  onChange={(e) => setForm({ ...form, offer_description: e.target.value })}
                  placeholder="3% cashback"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="points_cost">Points cost</Label>
                <Input
                  id="points_cost"
                  type="number"
                  value={form.points_cost}
                  onChange={(e) => setForm({ ...form, points_cost: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimated_value_rand">Estimated value (R)</Label>
                <Input
                  id="estimated_value_rand"
                  type="number"
                  value={form.estimated_value_rand}
                  onChange={(e) => setForm({ ...form, estimated_value_rand: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commission_rate">Commission rate</Label>
                <Input
                  id="commission_rate"
                  type="number"
                  step="0.001"
                  value={form.commission_rate}
                  onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner_user_id">Owner user id (optional)</Label>
                <Input
                  id="owner_user_id"
                  value={form.owner_user_id}
                  onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}
                  placeholder="Supabase auth UUID"
                />
              </div>
              <Button type="submit" disabled={submitting} className="sm:col-span-2 sm:justify-self-start">
                {submitting ? "Creating..." : "Create partner"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading partners...</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">No partners yet.</p>
      ) : (
        <div className="space-y-3">
          {partners.map((partner) => (
            <Card key={partner.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <Gift className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {partner.name}{" "}
                      {!partner.is_active && (
                        <span className="text-xs font-normal text-muted-foreground">(inactive)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {partner.offer_description} &middot; {partner.points_cost} pts &middot;{" "}
                      {partner.total_redemptions} redemptions &middot; R
                      {partner.total_commission_owed.toLocaleString()} owed
                    </p>
                    {!partner.owner_user_id && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        No owner linked — this partner can&apos;t sign in to see their view yet.
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyPartnerId === partner.id}
                  onClick={() => toggleActive(partner)}
                >
                  {partner.is_active ? "Deactivate" : "Activate"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
