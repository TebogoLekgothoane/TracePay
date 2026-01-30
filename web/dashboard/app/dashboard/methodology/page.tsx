"use client";

import { BookOpen, Brain, Database, Search, TrendingUp, Shield, Zap, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function MethodologyPage() {
    return (
        <div className="p-8">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <BookOpen className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Methodology Guide</h1>
                </div>
                <p className="text-muted-foreground">
                    Understanding how TracePay's Forensic Engine identifies money leaks and financial patterns
                </p>
            </div>

            <div className="space-y-6">
                {/* Overview */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            Overview
                        </CardTitle>
                        <CardDescription>
                            How the Money Autopsy Forensic Engine works
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            TracePay's Forensic Engine is a transparent, explainable system designed to identify hidden financial
                            leaks in your transaction data. Built using Pandas and Python, it analyzes bank and mobile wallet
                            transactions to surface patterns that drain money without your awareness.
                        </p>
                        <div className="grid gap-4 md:grid-cols-3 mt-4">
                            <div className="p-4 bg-secondary/50 rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Data Sources</p>
                                <p className="text-sm">Open Banking APIs, MNO Wallets</p>
                            </div>
                            <div className="p-4 bg-secondary/50 rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Processing</p>
                                <p className="text-sm">Pandas-based pattern detection</p>
                            </div>
                            <div className="p-4 bg-secondary/50 rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Output</p>
                                <p className="text-sm">Plain-language leak reports</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Data Ingestion Pipeline */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-primary" />
                            Data Ingestion Pipeline
                        </CardTitle>
                        <CardDescription>
                            How transaction data flows into the system
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3">
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">1</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">API Connection</p>
                                    <p className="text-xs text-muted-foreground">
                                        Secure Open Banking APIs (SARB Directive No. 2 of 2024 compliant) retrieve transaction
                                        data with explicit user consent. No screen scraping or credential storage.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">2</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Data Normalization</p>
                                    <p className="text-xs text-muted-foreground">
                                        Transactions are normalized into a standardized format: amount, timestamp, description,
                                        merchant, category, counterparty, direction (debit/credit), and channel.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">3</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Dataframe Processing</p>
                                    <p className="text-xs text-muted-foreground">
                                        Using Pandas, transactions are converted into a structured dataframe with inferred fields
                                        (direction from amount sign, absolute amounts, standardized timestamps).
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">4</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Forensic Analysis</p>
                                    <p className="text-xs text-muted-foreground">
                                        Multiple specialized detectors scan the normalized data for leak patterns, each focusing
                                        on specific financial behaviors.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Detection Algorithms */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5 text-primary" />
                            Detection Algorithms
                        </CardTitle>
                        <CardDescription>
                            Specialized detectors that identify different types of money leaks
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4">
                            <div className="p-4 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">Airtime Drains</h3>
                                        <Badge variant="outline" className="text-[9px] mt-1">Frequency-based</Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Identifies repeated small telco-related purchases (airtime, data bundles) that accumulate
                                    over time. Flags when frequency exceeds 5 purchases or monthly cost exceeds R150.
                                </p>
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold">Detection Logic:</p>
                                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-muted-foreground">
                                        <li>Matches telco keywords (Vodacom, MTN, Cell C, airtime, data, bundle)</li>
                                        <li>Filters debits between R0-R50</li>
                                        <li>Analyzes last 30 days of transactions</li>
                                        <li>Severity: High if monthly cost ≥ R300 or frequency ≥ 12</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">Debit Orders</h3>
                                        <Badge variant="outline" className="text-[9px] mt-1">Recurring Pattern</Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Detects recurring automatic debits that may be forgotten subscriptions or unwanted services.
                                    Identifies patterns of same-amount, same-merchant debits.
                                </p>
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold">Detection Logic:</p>
                                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-muted-foreground">
                                        <li>Groups transactions by merchant and amount</li>
                                        <li>Identifies recurring patterns (monthly, weekly)</li>
                                        <li>Flags when total monthly cost exceeds thresholds</li>
                                        <li>Provides plain-language explanation of each recurring charge</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">Subscription Traps</h3>
                                        <Badge variant="outline" className="text-[9px] mt-1">Behavioral Pattern</Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Identifies subscription services that may be forgotten or unwanted, especially those with
                                    free trial periods that convert to paid subscriptions.
                                </p>
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold">Detection Logic:</p>
                                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-muted-foreground">
                                        <li>Matches known subscription merchant patterns</li>
                                        <li>Detects trial-to-paid conversion patterns</li>
                                        <li>Flags recurring charges that may be forgotten</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">VAS Charges</h3>
                                        <Badge variant="outline" className="text-[9px] mt-1">Value-Added Services</Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Detects Value-Added Services (VAS) charges from mobile network operators that may be
                                    unauthorized or forgotten subscriptions.
                                </p>
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold">Detection Logic:</p>
                                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-muted-foreground">
                                        <li>Identifies MNO-related charges (MTN, Vodacom, etc.)</li>
                                        <li>Flags small recurring charges that accumulate</li>
                                        <li>Highlights potential unauthorized subscriptions</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">Informal Loan Ratios</h3>
                                        <Badge variant="outline" className="text-[9px] mt-1">P2P Analysis</Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Detects when a high percentage of spending goes to person-to-person transfers, which may
                                    indicate informal borrowing pressure (Mashonisa loans).
                                </p>
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold">Detection Logic:</p>
                                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-muted-foreground">
                                        <li>Calculates P2P transfer ratio vs total spending</li>
                                        <li>Estimates potential interest payments (15% of P2P total)</li>
                                        <li>Flags when ratio ≥ 25% or estimated interest ≥ R50</li>
                                        <li>Severity: High if ratio ≥ 45% or interest ≥ R200</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">Mailbox Effect</h3>
                                        <Badge variant="outline" className="text-[9px] mt-1">Eastern Cape Focus</Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Detects when large credits (salaries, grants) are immediately withdrawn in full or large part,
                                    indicating potential financial pressure or lack of savings capacity.
                                </p>
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold">Detection Logic:</p>
                                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-muted-foreground">
                                        <li>Identifies large credits (≥ R500)</li>
                                        <li>Analyzes withdrawals within 48 hours of credit</li>
                                        <li>Flags when withdrawal ratio exceeds thresholds</li>
                                        <li>Provides context about financial behavior patterns</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">Weekend Spending</h3>
                                        <Badge variant="outline" className="text-[9px] mt-1">Temporal Pattern</Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Identifies elevated spending patterns on weekends, which may indicate impulse purchases or
                                    social spending pressure.
                                </p>
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold">Detection Logic:</p>
                                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-muted-foreground">
                                        <li>Groups transactions by day of week</li>
                                        <li>Compares weekend vs weekday spending</li>
                                        <li>Flags when weekend spending significantly exceeds weekday average</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Health Score Calculation */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            Financial Health Score
                        </CardTitle>
                        <CardDescription>
                            How we calculate your financial health score (0-100)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            The Financial Health Score is a composite metric that reflects the overall financial stability
                            based on detected leaks and spending patterns.
                        </p>
                        <div className="grid gap-4 md:grid-cols-2 mt-4">
                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <p className="text-xs font-bold uppercase text-green-500 mb-1">High Score (70-100)</p>
                                <p className="text-xs text-muted-foreground">
                                    Few or no detected leaks, stable spending patterns, good financial control
                                </p>
                            </div>
                            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                <p className="text-xs font-bold uppercase text-yellow-500 mb-1">Medium Score (40-69)</p>
                                <p className="text-xs text-muted-foreground">
                                    Some leaks detected, moderate financial pressure, areas for improvement
                                </p>
                            </div>
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <p className="text-xs font-bold uppercase text-red-500 mb-1">Low Score (0-39)</p>
                                <p className="text-xs text-muted-foreground">
                                    Multiple high-severity leaks, significant financial pressure, immediate action recommended
                                </p>
                            </div>
                            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                                <p className="text-xs font-bold uppercase text-primary mb-1">Inclusion Delta</p>
                                <p className="text-xs text-muted-foreground">
                                    Additional points added when using alternative data sources (MNO wallets) that traditional
                                    credit scoring doesn't consider
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Regional Trends */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-primary" />
                            Regional Trends & Aggregation
                        </CardTitle>
                        <CardDescription>
                            How regional data is aggregated and visualized
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Regional trend analysis aggregates anonymized data across the Eastern Cape to identify geographic
                            patterns in financial behavior and leak prevalence.
                        </p>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-start gap-2">
                                <Shield className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">Privacy-First Aggregation</p>
                                    <p className="text-muted-foreground">
                                        All regional data is anonymized and aggregated. Individual transaction details are never
                                        exposed in regional views.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <Database className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">Geographic Mapping</p>
                                    <p className="text-muted-foreground">
                                        Data is mapped to Eastern Cape regions using GeoJSON boundaries, allowing visualization
                                        of leak hotspots and financial health by area.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">Temporal Analysis</p>
                                    <p className="text-muted-foreground">
                                        Trends are tracked over time to identify seasonal patterns, improvements, or emerging
                                        financial challenges in specific regions.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Machine Learning */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Brain className="h-5 w-5 text-primary" />
                            Machine Learning & Anomaly Detection
                        </CardTitle>
                        <CardDescription>
                            Advanced pattern recognition for unusual financial behaviors
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Beyond rule-based detectors, TracePay uses machine learning models to identify anomalous patterns
                            that may not be captured by standard detectors.
                        </p>
                        <div className="space-y-2 text-xs">
                            <div className="p-3 bg-secondary/50 rounded">
                                <p className="font-semibold mb-1">Anomaly Detection</p>
                                <p className="text-muted-foreground">
                                    ML models analyze transaction sequences to identify unusual spending patterns, unexpected
                                    fee structures, or behavioral changes that may indicate financial stress.
                                </p>
                            </div>
                            <div className="p-3 bg-secondary/50 rounded">
                                <p className="font-semibold mb-1">Explainability</p>
                                <p className="text-muted-foreground">
                                    All ML findings are explained in plain language, with links back to the underlying transactions
                                    that triggered the anomaly detection.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Transparency */}
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-primary" />
                            Transparency & Explainability
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Every leak detection can be traced back to specific transactions. The Forensic Engine is designed
                            to be transparent and explainable, not a "black box." Users can always see:
                        </p>
                        <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                            <li>The specific transactions that triggered each leak detection</li>
                            <li>The reasoning behind each detection in plain language</li>
                            <li>The estimated monthly cost of each leak</li>
                            <li>The severity classification (low, medium, high)</li>
                            <li>Evidence data showing the pattern that was detected</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

