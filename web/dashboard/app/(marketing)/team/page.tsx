import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const team = [
  { name: "Forensic Lead", role: "Patterns & Money Leaks", initials: "FL" },
  { name: "Data Engineer", role: "Pandas & Pipelines", initials: "DE" },
  { name: "UX Storyteller", role: "Plain Language & UI", initials: "UX" },
];

export default function TeamPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">The Team</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Money Autopsy is crafted by a small team of builders obsessed with
        financial dignity, behavioural insights and clear storytelling.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {team.map((member) => (
          <Card key={member.name}>
            <CardHeader className="flex flex-col items-center gap-2 text-center">
              <Avatar initials={member.initials} />
              <CardTitle className="text-sm">{member.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-center text-muted-foreground">
              {member.role}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

