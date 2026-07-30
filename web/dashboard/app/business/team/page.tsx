"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Lock, Trash2, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Member = Awaited<ReturnType<typeof apiClient.listBusinessMembers>>[number];

export default function BusinessTeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null);

  async function load() {
    try {
      setError(null);
      setMembers(await apiClient.listBusinessMembers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.isBusinessMember) {
      setLoading(false);
      return;
    }
    void load();
  }, [user?.isBusinessMember]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInvited(null);
    try {
      const member = await apiClient.inviteBusinessMember(email.trim().toLowerCase());
      setInvited(member.invited_email);
      setEmail("");
      await load();
      setInviteModalOpen(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Could not invite that person.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: number) {
    setBusyMemberId(memberId);
    setError(null);
    try {
      await apiClient.removeBusinessMember(memberId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that team member.");
    } finally {
      setBusyMemberId(null);
    }
  }

  if (user?.isBusinessMember) {
    return (
      <div className="p-2 md:p-4">
        <EmptyState
          icon={Lock}
          title="Owner only"
          description="Only the business account owner can manage the team. Ask them to add or remove people."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Staff you invite see the same business dashboard you do -- same accounts, same leaks, same
            health score.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setInviteModalOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      </div>

      <Dialog
        open={inviteModalOpen}
        onOpenChange={(open) => {
          if (inviting) return;
          setInviteModalOpen(open);
          if (!open) {
            setEmail("");
            setInviteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>
              They’ll be able to view this business’s dashboard once they accept the invitation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="member_email">Email</Label>
              <Input
                id="member_email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="staff@example.com"
                autoFocus
                required
              />
            </div>
            {inviteError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {inviteError}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={inviting}
                onClick={() => setInviteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviting || !email.trim()}>
                <UserPlus className="mr-2 h-4 w-4" />
                {inviting ? "Inviting..." : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {invited && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Invited {invited}. They'll get an email with a magic link to set their password.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Loading your team...
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Invite staff to give them access to this business's dashboard."
        />
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{member.invited_email}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(member.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyMemberId === member.id}
                  onClick={() => handleRemove(member.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
