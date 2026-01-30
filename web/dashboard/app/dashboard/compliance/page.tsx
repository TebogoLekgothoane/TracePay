"use client";

import { ShieldCheck, FileText, Lock, Users, CheckCircle2, AlertCircle, BookOpen, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function CompliancePage() {
    return (
        <div className="p-8">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <ShieldCheck className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Compliance (SARB)</h1>
                </div>
                <p className="text-muted-foreground">
                    TracePay's compliance with South African Reserve Bank regulations and Open Banking standards
                </p>
            </div>

            <div className="space-y-6">
                {/* SARB Directive No. 2 of 2024 */}
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            SARB Directive No. 2 of 2024
                        </CardTitle>
                        <CardDescription>
                            Compliance with South African Reserve Bank Open Banking regulations
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            TracePay is fully compliant with SARB Directive No. 2 of 2024, which governs Open Banking
                            and third-party access to financial data in South Africa.
                        </p>

                        <div className="space-y-3">
                            <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold">Secure API-Only Access</p>
                                    <p className="text-xs text-muted-foreground">
                                        TracePay uses only official Open Banking APIs. We do not use screen scraping, credential
                                        storage, or password sharing. All data access is through secure, standardized APIs.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold">Explicit User Consent</p>
                                    <p className="text-xs text-muted-foreground">
                                        All data access requires explicit, informed consent from users. Consent is granular,
                                        revocable, and time-limited (default: 90 days). Users can see exactly what data is
                                        accessed and withdraw consent at any time.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold">Read-Only Access</p>
                                    <p className="text-xs text-muted-foreground">
                                        TracePay has read-only access to transaction data. We cannot initiate payments, transfer
                                        funds, or modify account settings. We can only read transaction history for analysis.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold">Token-Based Authentication</p>
                                    <p className="text-xs text-muted-foreground">
                                        Access is granted through short-lived, expiring OAuth tokens. Tokens are automatically
                                        refreshed when needed and revoked when consent is withdrawn.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* FSCA Consumer Protection */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            FSCA Consumer Protection
                        </CardTitle>
                        <CardDescription>
                            Alignment with Financial Sector Conduct Authority principles
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            TracePay's ethical framework aligns with FSCA consumer protection principles, ensuring fair
                            treatment of consumers and transparent financial services.
                        </p>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="p-3 bg-secondary/50 rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Fair Treatment</p>
                                <p className="text-xs text-muted-foreground">
                                    All insights are presented in plain language, without manipulation or coercion. Users
                                    maintain full control over their data and decisions.
                                </p>
                            </div>
                            <div className="p-3 bg-secondary/50 rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Transparency</p>
                                <p className="text-xs text-muted-foreground">
                                    Every detection can be traced to specific transactions. No "black box" algorithms—everything
                                    is explainable and verifiable.
                                </p>
                            </div>
                            <div className="p-3 bg-secondary/50 rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">No Harm</p>
                                <p className="text-xs text-muted-foreground">
                                    TracePay does not use data for credit denial, profiling, or discriminatory practices.
                                    We only identify leaks to help users save money.
                                </p>
                            </div>
                            <div className="p-3 bg-secondary/50 rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">User Control</p>
                                <p className="text-xs text-muted-foreground">
                                    The Freeze button provides instant revocation of all data access. Users can withdraw
                                    consent at any time without penalty.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* POPIA Compliance */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5 text-primary" />
                            POPIA Compliance
                        </CardTitle>
                        <CardDescription>
                            Protection of Personal Information Act (POPIA) compliance
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            TracePay complies with the Protection of Personal Information Act (POPIA), South Africa's
                            data protection legislation.
                        </p>

                        <div className="space-y-3">
                            <div className="p-4 border rounded-lg">
                                <p className="text-sm font-semibold mb-2">Data Minimization</p>
                                <p className="text-xs text-muted-foreground">
                                    We only collect transaction data necessary for leak detection. We do not collect contacts,
                                    messages, location data, or any information beyond what's needed for financial analysis.
                                </p>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <p className="text-sm font-semibold mb-2">Purpose Limitation</p>
                                <p className="text-xs text-muted-foreground">
                                    Personal financial data is used solely for identifying money leaks and providing insights.
                                    We do not sell, share, or use data for advertising, profiling, or any other purpose.
                                </p>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <p className="text-sm font-semibold mb-2">Data Security</p>
                                <p className="text-xs text-muted-foreground">
                                    All data is encrypted in transit (TLS) and at rest. Access is logged and auditable.
                                    Short-lived tokens minimize exposure windows.
                                </p>
                            </div>

                            <div className="p-4 border rounded-lg">
                                <p className="text-sm font-semibold mb-2">User Rights</p>
                                <p className="text-xs text-muted-foreground">
                                    Users have the right to access their data, request corrections, withdraw consent, and
                                    request deletion. The Freeze button provides instant data deletion and access revocation.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Security Architecture */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5 text-primary" />
                            Security Architecture
                        </CardTitle>
                        <CardDescription>
                            Technical security measures and data protection
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-3">
                                <div className="p-3 bg-secondary/50 rounded-lg">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Encryption</p>
                                    <p className="text-xs text-muted-foreground">
                                        TLS 1.3 for data in transit, AES-256 for data at rest
                                    </p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Authentication</p>
                                    <p className="text-xs text-muted-foreground">
                                        OAuth 2.0 with PKCE, short-lived access tokens, automatic token rotation
                                    </p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Access Control</p>
                                    <p className="text-xs text-muted-foreground">
                                        Read-only API permissions, no write or payment initiation capabilities
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="p-3 bg-secondary/50 rounded-lg">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Audit Logging</p>
                                    <p className="text-xs text-muted-foreground">
                                        All API access is logged with timestamps, user IDs, and data accessed
                                    </p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Token Expiration</p>
                                    <p className="text-xs text-muted-foreground">
                                        Access tokens expire automatically and require user re-authentication
                                    </p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Data Retention</p>
                                    <p className="text-xs text-muted-foreground">
                                        Data is retained only for the consent period. Immediate deletion on consent withdrawal
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Consent Management */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                            Consent Management
                        </CardTitle>
                        <CardDescription>
                            How user consent is obtained, managed, and revoked
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3">
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">1</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Informed Consent</p>
                                    <p className="text-xs text-muted-foreground">
                                        Before accessing any data, users are presented with clear, plain-language explanations
                                        of what data will be accessed, how it will be used, and for how long.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">2</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Granular Control</p>
                                    <p className="text-xs text-muted-foreground">
                                        Users can choose which data sources to connect (bank accounts, MNO wallets) and can
                                        connect or disconnect sources independently.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">3</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Time-Limited Access</p>
                                    <p className="text-xs text-muted-foreground">
                                        Default consent period is 90 days. Users are notified before expiration and can renew
                                        or withdraw consent.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-primary">4</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Instant Revocation</p>
                                    <p className="text-xs text-muted-foreground">
                                        The Freeze button provides instant revocation of all API access, deletion of cached
                                        data, and halting of all analysis. No waiting periods or delays.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Data Flow Controls */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-primary" />
                            Data Flow Controls
                        </CardTitle>
                        <CardDescription>
                            How data moves through the system and is protected
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 text-xs">
                            <div className="flex items-start gap-2">
                                <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">API-to-API Communication</p>
                                    <p className="text-muted-foreground">
                                        All data flows through secure API endpoints. No intermediate storage or processing
                                        outside of encrypted, controlled environments.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">No Third-Party Sharing</p>
                                    <p className="text-muted-foreground">
                                        Data is never shared with third parties, advertisers, or data brokers. All processing
                                        happens within TracePay's controlled infrastructure.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <Database className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-semibold">Anonymized Aggregation</p>
                                    <p className="text-muted-foreground">
                                        Regional trend data is fully anonymized before aggregation. Individual transaction
                                        details are never exposed in regional views.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Governance & Accountability */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-primary" />
                            Governance & Accountability
                        </CardTitle>
                        <CardDescription>
                            Internal controls and accountability measures
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="p-3 border rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Regular Audits</p>
                                <p className="text-xs text-muted-foreground">
                                    Internal data audits are conducted regularly to ensure compliance and identify areas
                                    for improvement.
                                </p>
                            </div>
                            <div className="p-3 border rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Breach Response</p>
                                <p className="text-xs text-muted-foreground">
                                    Clear procedures for data breach response, including notification requirements and
                                    remediation steps.
                                </p>
                            </div>
                            <div className="p-3 border rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Ethics Reviews</p>
                                <p className="text-xs text-muted-foreground">
                                    New features undergo ethics-first design reviews to ensure they align with our
                                    commitment to user control and transparency.
                                </p>
                            </div>
                            <div className="p-3 border rounded-lg">
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">No Data Monetization</p>
                                <p className="text-xs text-muted-foreground">
                                    TracePay does not monetize personal financial data. Our business model does not
                                    depend on selling or sharing user data.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Compliance Status */}
                <Card className="border-green-500/20 bg-green-500/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            Compliance Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <span className="text-sm">SARB Directive No. 2 of 2024: Compliant</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <span className="text-sm">FSCA Consumer Protection: Aligned</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <span className="text-sm">POPIA: Compliant</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <span className="text-sm">Open Banking Standards: Adherent</span>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">
                            Last updated: January 2026. TracePay maintains ongoing compliance monitoring and updates
                            its practices as regulations evolve.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

