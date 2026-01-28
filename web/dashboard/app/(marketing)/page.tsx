"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

export default function LandingPage() {
    return (
        <main className="mx-auto flex max-w-7xl flex-col gap-16 px-4 pb-20 pt-12 md:pt-20">
            <section className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
                <div className="space-y-8">
                    <Badge className="bg-primary/10 text-primary ring-1 ring-primary/30">
                        Your finances, fully investigated
                    </Badge>
                    <div className="space-y-6">
                        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                            Accelerate Your Edge with{" "}
                            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                                Next-Gen
                            </span>
                            <br />
                            <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
                                Money Autopsy
                            </span>
                        </h1>
                        <p className="max-w-xl text-base text-muted-foreground md:text-lg">
                            See the truth behind airtime drains, bank fees and informal
                            loans. Money Autopsy turns raw transactions into clear{" "}
                            <span className="text-foreground font-medium">Money Leaks</span> you can
                            freeze in one click.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <Link href="/register">
                            <Button size="lg" className="gap-2 rounded-full shadow-lg shadow-primary/30">
                                Start Now
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href="/dashboard">
                            <Button size="lg" variant="outline" className="rounded-full border-border/70">
                                Learn More
                            </Button>
                        </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            <span>Read-only analysis. Your consent, your data.</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-accent" />
                            <span>Optimised for Eastern Cape money patterns.</span>
                        </div>
                    </div>
                </div>

                <div className="relative space-y-6">
                    <Card className="relative border-primary/30 bg-gradient-to-br from-primary/10 via-background/95 to-background/95 shadow-glow-card backdrop-blur-sm">
                        <CardHeader>
                            <CardDescription className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                                Finance Overview
                            </CardDescription>
                            <CardTitle className="text-xl">Household Health Check</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-6 pt-2">
                            <div className="flex flex-col justify-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                    Current Money Health
                                </p>
                                <p className="text-5xl font-bold tracking-tight text-primary">24%</p>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    High airtime usage and informal loans detected this month.
                                </p>
                            </div>
                            <div className="flex flex-col gap-4">
                                <div className="rounded-xl bg-gradient-to-br from-primary/10 to-background/80 p-4 ring-1 ring-primary/50">
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                        Money Leaks
                                    </p>
                                    <p className="mt-2 text-base font-semibold">Airtime Drains</p>
                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                        R410 leaking every month on small top-ups.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg bg-background/90 p-3 ring-1 ring-border/70 backdrop-blur">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                            Fees
                                        </p>
                                        <p className="mt-1.5 text-base font-bold">R192</p>
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                            Cash-out & service fees
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-background/90 p-3 ring-1 ring-border/70 backdrop-blur">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                            Informal Loans
                                        </p>
                                        <p className="mt-1.5 text-base font-bold">38%</p>
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                            Of spending sent P2P this month
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="border-border/70 bg-background/60 shadow-glow-card backdrop-blur">
                            <CardHeader>
                                <CardTitle className="text-base">Freeze Money Leaks</CardTitle>
                                <CardDescription className="text-sm">
                                    Simulate revoking consent on high-risk merchants and
                                    transfers.
                                </CardDescription>
                            </CardHeader>
                        </Card>
                        <Card className="border-border/70 bg-background/60 shadow-glow-card backdrop-blur">
                            <CardHeader>
                                <CardTitle className="text-base">Built for FinTech School</CardTitle>
                                <CardDescription className="text-sm">
                                    Powered by FastAPI + Next.js + Pandas on real-world MoMo
                                    patterns.
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </div>
                </div>
            </section>

            <section className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-background/90 to-background/60 px-8 py-12 backdrop-blur-xl md:px-12">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
                <div className="relative grid gap-8 md:grid-cols-[2fr_3fr]">
                    <div className="flex flex-col justify-center">
                        <p className="text-lg font-light leading-relaxed text-muted-foreground md:text-xl">
                            We give individuals the tools to grow their financial future.
                        </p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                                Signal
                            </p>
                            <p className="mt-3 text-4xl font-bold md:text-5xl">98%</p>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                Clients Satisfaction
                            </p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                                Coverage
                            </p>
                            <p className="mt-3 text-4xl font-bold md:text-5xl">65M+</p>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                Revenue Total
                            </p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                                Control
                            </p>
                            <p className="mt-3 text-4xl font-bold md:text-5xl">100%</p>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                Customer Loyalty Rate
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

