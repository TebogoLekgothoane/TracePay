"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const EXHIBITS = [
    {
        id: "A",
        title: "Airtime Drains",
        body: "Small top-ups that feel like nothing on their own — and add up to real rand every month.",
    },
    {
        id: "B",
        title: "Cash-out Fees",
        body: "What ATMs quietly take for balance checks and cash-outs — before you even see your balance.",
    },
    {
        id: "C",
        title: "Informal Loans",
        body: "Mashonisa and P2P borrowing that never shows up as “debt” until it already is.",
    },
    {
        id: "D",
        title: "Zombie Subscriptions",
        body: "Free trials that quietly became paid subscriptions, and gym or insurance debit orders still running long after you needed them.",
    },
];

const PROOF_STATS = [
    {
        n: "01",
        stat: "59%",
        body: "of people we surveyed have no idea what they actually pay in fees.",
    },
    {
        n: "02",
        stat: "51%",
        body: "have had unrecognised charges show up on their account.",
    },
    {
        n: "03",
        stat: "81%",
        body: "want step-by-step help to actually stop a financial leak.",
    },
];

const STEPS = [
    {
        n: "01",
        title: "Connect, read-only",
        body: "Link your bank or mobile money account. We only ever read your history — we never move money.",
    },
    {
        n: "02",
        title: "We trace the leaks",
        body: "Every transaction gets sorted into what it actually was: a fee, a drain, a loan, or just spend.",
    },
    {
        n: "03",
        title: "You freeze what you want",
        body: "Cut off a leak in one tap — simulate revoking consent on the merchants draining you dry.",
    },
];

export default function LandingPage() {
    return (
        <main className="mx-auto flex max-w-6xl flex-col gap-28 px-4 pb-28 pt-8 md:pt-16">
            {/* Hero */}
            <section className="grid gap-16 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-center">
                <div className="animate-fade-up space-y-8">
                    <div className="inline-flex -rotate-2 items-center gap-2 rounded-sm border border-dashed border-primary/50 bg-primary/5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
                        Money Autopsy — Case Intake
                    </div>

                    <h1 className="text-balance font-display text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                        Find out where your money{" "}
                        <span className="relative inline-block whitespace-nowrap italic text-primary">
                            actually went
                            <svg
                                viewBox="0 0 300 20"
                                className="absolute -bottom-2 left-0 h-4 w-full text-primary"
                                preserveAspectRatio="none"
                            >
                                <path
                                    d="M2 14C60 4 240 4 298 14"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    pathLength="1"
                                    className="animate-draw"
                                />
                            </svg>
                        </span>
                        .
                    </h1>

                    <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                        TracePay reads your bank and mobile money history like a forensic
                        report — every airtime top-up, cash-out fee, and informal loan,
                        laid out and traceable to the rand. Not another budgeting app.{" "}
                        <span className="text-foreground">A financial investigator.</span>
                    </p>

                    <div className="flex flex-wrap items-center gap-6">
                        <Link href="/register">
                            <Button size="lg" className="rounded-sm px-6">
                                Open Your Case File
                            </Button>
                        </Link>
                        <a
                            href="#exhibits"
                            className="font-mono text-sm uppercase tracking-wide text-muted-foreground underline decoration-dashed underline-offset-4 transition-colors hover:text-foreground"
                        >
                            See what we catch ↓
                        </a>
                    </div>

                    <div className="flex flex-col gap-2 border-l-2 border-border/60 pl-4 text-sm text-muted-foreground">
                        <p>Read-only. Nothing moves without your say-so.</p>
                        <p>Built on real Eastern Cape mobile-money patterns.</p>
                        <p>Available in all 11 official South African languages.</p>
                    </div>
                </div>

                {/* App preview */}
                <div className="animate-fade-up [animation-delay:150ms] relative mx-auto w-full max-w-xs md:mx-0 md:ml-auto">
                    <div
                        aria-hidden
                        className="absolute left-1/2 top-1/2 -z-10 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-[90px]"
                    />

                    <Image
                        src="/app-preview.png"
                        alt="TracePay app home screen showing a financial health score of 100 and no leaks detected"
                        width={339}
                        height={736}
                        priority
                        unoptimized
                        className="relative mx-auto w-full max-w-[260px] rotate-[2deg] drop-shadow-2xl"
                    />

                    <div className="absolute -left-6 top-16 hidden -rotate-3 flex-col gap-1 rounded-sm border border-border/70 bg-card px-3 py-2 font-mono text-[11px] text-muted-foreground shadow-glow-card lg:flex">
                        <span className="text-primary">Financial Health Score</span>
                        <span>Updated after every scan</span>
                    </div>

                    <div className="absolute -bottom-2 -right-2 rotate-[6deg] rounded-sm border-2 border-dashed border-primary/60 bg-primary/10 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-primary shadow-sm">
                        Real App Preview
                    </div>
                </div>
            </section>

            {/* Proof */}
            <section className="space-y-10">
                <div className="max-w-xl space-y-3">
                    <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                        The Evidence
                    </p>
                    <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
                        Money disappears. Most people don&apos;t know why.
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Small leaks. Repeated monthly. Big impact. From our own survey of
                        people just like you.
                    </p>
                </div>

                <div className="grid gap-8 sm:grid-cols-3">
                    {PROOF_STATS.map((s) => (
                        <div key={s.n} className="space-y-2">
                            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                {s.n}.
                            </span>
                            <p className="font-display text-5xl font-medium text-primary">
                                {s.stat}
                            </p>
                            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                                {s.body}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* What we catch */}
            <section id="exhibits" className="scroll-mt-24 space-y-10">
                <div className="max-w-xl space-y-3">
                    <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                        The Usual Suspects
                    </p>
                    <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
                        Four ways your money quietly disappears.
                    </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {EXHIBITS.map((exhibit) => (
                        <div
                            key={exhibit.id}
                            className="group relative rounded-sm border border-border/60 bg-card/60 p-6 transition-colors hover:border-primary/40"
                        >
                            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                Exhibit {exhibit.id}
                            </span>
                            <h3 className="mt-3 font-display text-xl font-medium">
                                {exhibit.title}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                {exhibit.body}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* How it works */}
            <section className="space-y-12">
                <div className="max-w-xl space-y-3">
                    <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                        The Process
                    </p>
                    <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
                        From bank statement to case closed.
                    </h2>
                </div>

                <div className="grid gap-10 md:grid-cols-3">
                    {STEPS.map((step, i) => (
                        <div key={step.n} className="relative space-y-3">
                            <span
                                aria-hidden
                                className="font-display text-6xl font-medium text-transparent [-webkit-text-stroke:1.5px_var(--border)]"
                            >
                                {step.n}
                            </span>
                            <h3 className="font-display text-xl font-medium">{step.title}</h3>
                            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                                {step.body}
                            </p>
                            {i < STEPS.length - 1 && (
                                <div
                                    aria-hidden
                                    className="absolute right-[-1.25rem] top-8 hidden h-px w-8 border-t border-dashed border-border/70 md:block"
                                />
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Closing CTA */}
            <section className="bg-grain relative overflow-hidden rounded-sm border border-border/60 bg-card/60 px-8 py-14 text-center md:px-16">
                <h2 className="mx-auto max-w-lg text-balance font-display text-3xl font-medium tracking-tight sm:text-4xl">
                    Your money has a story.
                    <br />
                    Let&apos;s read it.
                </h2>
                <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
                    Free for you, always. No card required — we only earn when we find
                    you real savings.
                </p>
                <div className="mt-8 flex justify-center">
                    <Link href="/register">
                        <Button size="lg" className="rounded-sm px-8">
                            Open Your Case File
                        </Button>
                    </Link>
                </div>
                <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Built for the 2026 FinTech Summer School Hackathon
                </p>
            </section>
        </main>
    );
}
