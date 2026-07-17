# TracePay — System Diagrams

---

## 1. Overall System Architecture

```mermaid
graph TB
    subgraph Clients["Client Layer"]
        Mobile["📱 React Native Mobile App\n(Expo / Expo Router)"]
        Dashboard["🖥️ Next.js Web Dashboard\n(Admin & Stakeholder)"]
    end

    subgraph Backend["Backend — FastAPI (Port 8001)"]
        Auth["Auth Router\n/auth"]
        Accounts["Accounts Router\n/accounts"]
        Analysis["Analysis Engine\n/analyze"]
        AdminAPI["Admin Router\n/admin"]
        MobileAPI["Mobile Router\n/mobile"]
        VoiceAPI["Voice Router\n/voice"]
        MLAPI["ML Router\n/ml"]
        OBRouter["Open Banking Router\n/open-banking"]
        MoMoRouter["MTN MoMo Router\n/mtn-momo"]

        ForensicEngine["🔬 Forensic Engine\n8+ Leak Detectors"]
        MLEngine["🤖 ML Engine\nIsolation Forest / KMeans"]
        Scheduler["⏱️ APScheduler\nBackground Sync Jobs"]
    end

    subgraph DataLayer["Data Layer"]
        DB[("🗄️ SQLite → PostgreSQL\nSQLAlchemy 2.0 / Alembic")]
        Supabase[("☁️ Supabase\nMobile App State")]
    end

    subgraph External["External Services"]
        OBSandbox["🏦 UCT FinHub / Stitch Money\nOpen Banking AISP Sandbox"]
        MoMoAPI["📲 MTN MoMo Developer API\n(Simulated → Real)"]
        TTS["🔊 gTTS / Google Cloud TTS\nIsiXhosa Voice"]
    end

    Mobile -->|"JWT Bearer"| Auth
    Mobile -->|"REST API"| Accounts
    Mobile -->|"REST API"| Analysis
    Mobile -->|"REST API"| MobileAPI
    Mobile -->|"REST API"| VoiceAPI
    Mobile <-->|"App State"| Supabase

    Dashboard -->|"JWT Bearer"| Auth
    Dashboard -->|"REST API"| AdminAPI
    Dashboard -->|"REST API"| MLAPI

    Analysis --> ForensicEngine
    Analysis --> MLEngine
    MLAPI --> MLEngine
    Scheduler --> DB

    ForensicEngine --> DB
    MLEngine --> DB
    Auth --> DB
    Accounts --> DB
    AdminAPI --> DB
    MobileAPI --> DB

    OBRouter -->|"Consent + Token Flow"| OBSandbox
    MoMoRouter -->|"OAuth + Transactions"| MoMoAPI
    VoiceAPI -->|"Text → Audio"| TTS

    OBSandbox -->|"Transactions"| ForensicEngine
    MoMoAPI -->|"MoMo Transactions"| ForensicEngine
```

---

## 2. Mobile App — Screen Flow & Navigation

```mermaid
flowchart TD
    Launch(["🚀 App Launch"])
    AuthCheck{"Authenticated?\n(JWT in AsyncStorage)"}

    subgraph AuthFlow["Authentication"]
        AuthScreen["Auth Screen"]
        Register["Register\n(email + password)"]
        Login["Login\n(email + password)"]
    end

    subgraph MainApp["Main App (Tabs)"]
        Home["🏠 Home Screen\nHealth Score\nBank Account Summary\nSpend Smarter Tips"]

        subgraph Analysis["Analysis"]
            Autopsy["🔬 Autopsy Dashboard\nAll Detected Leaks\nBy Category + Severity"]
            LeakCard["Leak Detail Card\nEstimated Cost\nPlain Language\nExplanation"]
            VoicePlay["🔊 Voice Explanation\nIsiXhosa / English\n(Expo Speech)"]
        end

        subgraph Banking["Banking"]
            AddBank["➕ Add Bank Account\nOpen Banking Consent"]
            LinkedAccounts["🏦 Linked Accounts\nSync Status"]
            BankAutopsy["Bank-Specific Analysis\nPer Account Breakdown"]
        end

        subgraph Actions["Actions"]
            FreezeControl["❄️ Freeze Control\nFlag Suspicious Items\n(Simulated Consent Revocation)"]
            FrozenList["Frozen Items\nAudit List"]
        end

        subgraph History["History"]
            AnalysisHistory["📊 Analysis History\nHealth Score Over Time\nPast Reports"]
        end

        subgraph Settings["Settings"]
            SettingsScreen["⚙️ Settings\nLanguage Toggle EN/XH\nTheme Control\nLinked Banks"]
        end
    end

    Launch --> AuthCheck
    AuthCheck -->|"No"| AuthScreen
    AuthCheck -->|"Yes"| Home
    AuthScreen --> Register & Login
    Register --> Home
    Login --> Home

    Home --> Autopsy
    Home --> AddBank
    Home --> AnalysisHistory
    Home --> SettingsScreen

    Autopsy --> LeakCard
    LeakCard --> VoicePlay
    LeakCard --> FreezeControl

    AddBank --> ConsentFlow["Open Banking\nConsent Flow"]
    ConsentFlow --> LinkedAccounts
    LinkedAccounts --> BankAutopsy
    BankAutopsy --> Autopsy

    FreezeControl --> FrozenList
    FrozenList -->|"Unfreeze"| FreezeControl
```

---

## 3. Web Dashboard — Page Structure & Data Sources

```mermaid
flowchart TD
    DashLogin["🔐 Dashboard Login\n(Admin / Stakeholder JWT)"]

    subgraph Overview["Overview Page — /dashboard"]
        Stats["Platform Statistics\n• Total Users\n• Active Users\n• Linked Accounts\n• Total Transactions\n• Avg Health Score\n• Total Frozen Items\n• Capital Protected\n• ML Anomalies Detected\n• Mailbox Effect Prevalence\n• Retail Wealth Unlock"]
    end

    subgraph MLReports["ML Reports — /dashboard/ml-reports"]
        AnomalyDist["Anomaly Distribution\nHigh / Medium / Low Risk\n(ApexCharts)"]
        LeakCats["Top Leak Categories\n+ Growth Trends"]
        PredSavings["Predicted Savings\nOpportunities"]
        UserProfiles["User Cluster Profiles\nfrequent_small / high_value\nmoderate / infrequent"]
    end

    subgraph Regional["Regional Insights — /dashboard/regional"]
        HeatMap["🗺️ Leaflet Heat Map\nEC District Municipalities\nHealth Score Overlay"]
        LeakPrev["Leak Prevalence\nBy Region + Category"]
        UserDist["User Distribution\nGeographic Spread"]
        InclusionTax["MTN MoMo Inclusion Tax\nBy Region"]
    end

    subgraph UserMgmt["User Management — /dashboard/users"]
        UserList["Paginated User List\n(Admin View)"]
        UserDetail["User Analysis History\nHealth Score Timeline"]
        RoleView["User Roles\nuser / admin / stakeholder"]
    end

    subgraph DataLog["Data Log — /dashboard/data-log"]
        TxLog["Transaction Audit Trail"]
        AnalysisLog["Analysis Result Log"]
        ActivityLog["User Activity Log"]
        ComplianceDoc["Compliance Records"]
    end

    subgraph Compliance["Compliance — /dashboard/compliance"]
        SARB["SARB Directive No. 2 of 2024\nAlignment Statement"]
        POPIA["POPIA Compliance\nData Protection"]
        OBRules["Open Banking Rules\nThird-Party Access"]
        ConsentMgmt["Consent Management\nGDPR / POPIA Aligned"]
    end

    subgraph Methodology["Methodology — /dashboard/methodology"]
        DetectorDocs["Leak Detector\nAlgorithm Documentation"]
        ScoringDocs["Health Score\nCalculation Methodology"]
        RegionalDocs["Regional Analytics\nAggregation Method"]
    end

    DashLogin --> Overview
    Overview --> MLReports
    Overview --> Regional
    Overview --> UserMgmt
    Overview --> DataLog
    Overview --> Compliance
    Overview --> Methodology

    MLReports --> AnomalyDist & LeakCats & PredSavings & UserProfiles
    Regional --> HeatMap & LeakPrev & UserDist & InclusionTax
    UserMgmt --> UserList --> UserDetail
    UserMgmt --> RoleView
    DataLog --> TxLog & AnalysisLog & ActivityLog & ComplianceDoc
    Compliance --> SARB & POPIA & OBRules & ConsentMgmt
    Methodology --> DetectorDocs & ScoringDocs & RegionalDocs
```

---

## 4. Forensic Engine — Transaction Analysis Pipeline

```mermaid
flowchart LR
    subgraph Input["Input"]
        RawTx["📥 Raw Transactions\n(Open Banking / MoMo)\nmerchant, amount,\ndate, type"]
    end

    subgraph PreProcess["Pre-Processing\n(Pandas / NumPy)"]
        Clean["Clean & Normalise\nMerchant Names"]
        Categorise["Keyword Categorisation\nLowercase Match"]
        TimeIndex["Time Indexing\nDay-of-week, Month Windows"]
    end

    subgraph Detectors["8 Leak Detectors (Parallel)"]
        D1["📱 Airtime Drain\n>5 purchases / 30d\nor >R150/month\nKeywords: airtime, data,\nbundle, vodacom, mtn"]
        D2["💸 Fee Leakage\n>R40/month\nor >3 fee transactions\nKeywords: service fee,\ncash-out, transfer fee"]
        D3["🔄 Subscription Trap\nSame merchant + amount\nfor 3+ consecutive months"]
        D4["📲 VAS Charges\n>R20/month or >3 charges\nKeywords: vas, premium sms,\nopt-in, in-app"]
        D5["🎉 Weekend Spike\nWeekend spend\n50%+ above weekday avg"]
        D6["🏦 Debit Orders\nHigh-value recurring\ndeductions analysis"]
        D7["🤝 Mashonisa Detection\nP2P cycle detection\n>25% spend is P2P\nor interest >R50"]
        D8["📬 Mailbox Effect\nLarge credit ≥R500\nfollowed by rapid\nlarge debit"]
    end

    subgraph MLLayer["ML Layer (Parallel)"]
        ISO["Isolation Forest\nAnomaly Detection\n(Unusual amounts/timing)"]
        KM["KMeans Clustering\nUser Spending Profile\n4 clusters"]
        PRED["Leak Prediction\nTrending Pattern\nIdentification"]
    end

    subgraph Scoring["Health Score Calculator"]
        Base["Baseline: 100"]
        Deduct["Deduct per leak:\nHigh severity: −20 to −30\nMedium severity: −10 to −20\nWeighted by monthly cost"]
        Score["Final Score: 0–100\nCritical: 0–33\nAt Risk: 34–66\nHealthy: 67–100"]
    end

    subgraph Summariser["Plain Language Summariser"]
        EN["English Summary\nLeak descriptions +\nActionable advice"]
        XH["IsiXhosa Summary\ngTTS Audio Generation"]
    end

    subgraph Output["Output — AnalysisResult"]
        Result["✅ AnalysisResult\n• financial_health_score\n• health_band\n• money_leaks[]\n• summary_english\n• summary_isixhosa\n• anomalies[]\n• user_cluster\n• predicted_leaks[]"]
    end

    RawTx --> Clean --> Categorise --> TimeIndex
    TimeIndex --> D1 & D2 & D3 & D4 & D5 & D6 & D7 & D8
    TimeIndex --> ISO & KM & PRED

    D1 & D2 & D3 & D4 & D5 & D6 & D7 & D8 --> Base --> Deduct --> Score
    ISO & KM & PRED --> Result
    Score --> Summariser
    EN & XH --> Result
```

---

## 5. Open Banking — Consent & Data Access Flow

```mermaid
sequenceDiagram
    actor User as 👤 User
    participant App as 📱 Mobile App
    participant API as ⚙️ TracePay Backend
    participant OB as 🏦 Open Banking<br/>(UCT FinHub / Stitch)
    participant Bank as 🏛️ User's Bank

    User->>App: Tap "Add Bank Account"
    App->>API: POST /open-banking/consent
    API->>OB: POST /oauth/token<br/>(client_credentials)
    OB-->>API: Access Token (TTL: 600s)
    API->>OB: POST /consents<br/>(ReadAccounts, ReadBalances,<br/>ReadTransactions, ReadBeneficiaries)
    OB-->>API: ConsentID + AuthorizationURL
    API-->>App: AuthorizationURL
    App->>User: Redirect to Bank Auth Screen

    User->>Bank: Login + Approve Consent
    Bank->>OB: PSU Authorization Code
    OB-->>App: Redirect with Auth Code
    App->>API: POST /open-banking/exchange-token<br/>(auth_code + consent_id)
    API->>OB: Exchange Code → Data Access Token
    OB-->>API: Data Token (bound to ConsentID)

    API->>OB: GET /accounts
    OB-->>API: Account list
    API->>OB: GET /transactions<br/>(per account, date range)
    OB-->>API: Transaction records

    API->>API: Run Forensic Engine
    API->>API: Run ML Engine
    API-->>App: AnalysisResult<br/>(health score + leaks)
    App->>User: Display Autopsy Dashboard
```

---

## 6. Authentication Flow — JWT Lifecycle

```mermaid
sequenceDiagram
    actor User as 👤 User
    participant App as 📱 App / Dashboard
    participant API as ⚙️ FastAPI Backend
    participant DB as 🗄️ PostgreSQL

    Note over User,DB: Registration
    User->>App: Enter email + password
    App->>API: POST /auth/register
    API->>API: bcrypt.hash(password)
    API->>DB: INSERT User (uuid, email, hashed_pw, role)
    DB-->>API: User created
    API-->>App: JWT Access Token + Refresh Token

    Note over User,DB: Login
    User->>App: Enter credentials
    App->>API: POST /auth/login
    API->>DB: SELECT user WHERE email=X
    API->>API: bcrypt.verify(password, hash)
    API-->>App: JWT Access Token (expires) +<br/>Refresh Token (30 days)
    App->>App: Store in AsyncStorage /<br/>localStorage

    Note over User,DB: Authenticated Request
    App->>API: GET /me<br/>Authorization: Bearer {token}
    API->>API: Decode + verify JWT signature
    API->>API: Check expiry + role
    API-->>App: User profile

    Note over User,DB: Token Refresh
    App->>API: POST /auth/refresh<br/>(Refresh Token)
    API->>API: Verify refresh token
    API-->>App: New Access Token

    Note over User,DB: Role-Based Access
    App->>API: GET /admin/stats<br/>(requires admin role)
    API->>API: Check JWT role claim
    alt role = admin or stakeholder
        API-->>App: Stats data
    else role = user
        API-->>App: 403 Forbidden
    end
```

---

## 7. Data Model — Entity Relationships

```mermaid
erDiagram
    USER {
        uuid id PK
        string email
        string hashed_password
        string role
        datetime created_at
    }

    LINKED_ACCOUNT {
        uuid id PK
        uuid user_id FK
        string bank_name
        string account_number
        string consent_id
        string data_token
        datetime last_synced
        boolean is_active
    }

    TRANSACTION {
        uuid id PK
        uuid linked_account_id FK
        uuid user_id FK
        string merchant
        float amount
        string type
        datetime date
        string category
        string source
    }

    ANALYSIS_RESULT {
        uuid id PK
        uuid user_id FK
        int financial_health_score
        string health_band
        json money_leaks
        string summary_english
        string summary_isixhosa
        json anomalies
        string user_cluster
        json predicted_leaks
        datetime created_at
    }

    FROZEN_ITEM {
        uuid id PK
        uuid user_id FK
        uuid analysis_result_id FK
        string leak_type
        string merchant
        float estimated_monthly_cost
        datetime frozen_at
        boolean is_active
    }

    REGIONAL_STAT {
        uuid id PK
        string region
        float avg_health_score
        float mailbox_effect_prevalence
        float avg_inclusion_tax
        float retail_wealth_unlock
        int user_count
        datetime computed_at
    }

    USER ||--o{ LINKED_ACCOUNT : "links"
    LINKED_ACCOUNT ||--o{ TRANSACTION : "has"
    USER ||--o{ TRANSACTION : "owns"
    USER ||--o{ ANALYSIS_RESULT : "receives"
    USER ||--o{ FROZEN_ITEM : "freezes"
    ANALYSIS_RESULT ||--o{ FROZEN_ITEM : "generates"
```

---

## 8. MTN MoMo — Integration Flow & Inclusion Tax Calculation

```mermaid
flowchart TD
    subgraph MoMoAuth["MoMo Authentication"]
        APIKey["MTN MoMo API Key\n(momodeveloper.mtn.com)"]
        Sandbox["Sandbox Token\nPOST /token"]
        ProdToken["Production Token\n(requires MTN partnership)"]
    end

    subgraph DataFetch["Transaction Fetch"]
        LinkAcc["Link MoMo Account\nPOST /mtn-momo/link"]
        SyncTx["Sync Transactions\nPOST /mtn-momo/sync"]
        TxList["List Transactions\nGET /mtn-momo/transactions"]
    end

    subgraph PatternDetection["Pattern Detection"]
        CashOut["Cash-Out Pattern\nFrequent small withdrawals\nHigh churn indicator"]
        Airtime["Airtime-to-Cash\nConversion detection"]
        HighTax["High Inclusion Tax\n>5% fees flagged"]
    end

    subgraph InclusionTaxCalc["Inclusion Tax Calculation"]
        Formula["Inclusion Tax % =\n(Total Cash-Out Fees ÷\nTotal MoMo Volume)\n× 100"]
        Benchmark["Benchmark: <2% healthy\n2–5% moderate\n>5% high inclusion tax"]
    end

    subgraph Output["Output to Forensic Engine"]
        MoMoLeaks["MoMo-Specific Leaks\nfed into main\nForensic Engine pipeline"]
        RegionalMetric["Regional Inclusion\nTax Metric\n(Stakeholder Dashboard)"]
    end

    APIKey --> Sandbox
    Sandbox -.->|"Production: requires\nMTN partnership"| ProdToken
    Sandbox --> LinkAcc --> SyncTx --> TxList

    TxList --> CashOut & Airtime & HighTax
    CashOut & Airtime & HighTax --> Formula --> Benchmark

    Benchmark --> MoMoLeaks & RegionalMetric
```

---

## 9. Deployment Architecture — Current vs Target

```mermaid
graph TB
    subgraph Current["🔴 Current State (Local Only)"]
        LocalMobile["Mobile App\nlocalhost / Expo Go"]
        LocalDash["Dashboard\nlocalhost:3000"]
        LocalAPI["FastAPI\nlocalhost:8001"]
        LocalDB["SQLite\n./tracepay.db"]

        LocalMobile -->|"http"| LocalAPI
        LocalDash -->|"http"| LocalAPI
        LocalAPI --- LocalDB
    end

    subgraph Target["🟢 Target State (3-Month MVP)"]
        ExpoBuild["Android APK\nExpo EAS Build\n(Internal Test Track)"]
        VercelDash["Dashboard\nVercel\n(Next.js)"]
        RailwayAPI["FastAPI\nRailway\n(Python + Uvicorn)"]
        PostgresDB[("PostgreSQL\nRailway Add-on")]
        SupabaseCloud["Supabase\n(Mobile App State)"]
        StitchMoney["Stitch Money\nOpen Banking Aggregator\n(Live SA Banks)"]
        MoMoSandbox["MTN MoMo\nSandbox API\n(Real API calls)"]

        ExpoBuild -->|"HTTPS"| RailwayAPI
        VercelDash -->|"HTTPS"| RailwayAPI
        RailwayAPI --- PostgresDB
        ExpoBuild <-->|"Real-time state"| SupabaseCloud
        RailwayAPI -->|"Open Banking"| StitchMoney
        RailwayAPI -->|"MoMo data"| MoMoSandbox
    end
```
