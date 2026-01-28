import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">About Money Autopsy</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Money Autopsy is a forensic engine for your everyday finances. We turn
        complicated transaction data into plain-language Money Leaks, so people
        in the Eastern Cape can see exactly where cash is slipping away.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Why we built this</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Bank statements and wallet histories are noisy. We highlight
            airtime drains, fee leakage and informal loan pressure in one
            simple view, so you can act fast.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">How it works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The Forensic Engine runs on FastAPI and Pandas, scanning wallet and
            bank transactions for risky patterns and surfacing them as
            Money Leaks on the dashboard.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

