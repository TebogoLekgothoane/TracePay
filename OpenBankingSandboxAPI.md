# OB sandbox for AISPs

## Consent types

Three “layers” of lifetime/authorization:
* Consent lifetime (business object)
* Access token (short-lived bearer JWT)
* Refresh token (long-lived handle to mint new access tokens)

### Client token (no consent_id)

How: `POST /connect/mtls/token with grant_type=client_credentials` (no `consent_id`).

Use: manage consents (e.g., `POST /account-access-consents, GET /account-access-consents/{id}`).

Cannot: call AIS data (`/accounts`, `/balances`, `/transactions`, `/beneficiaries`) because it doesn’t carry a `consent_id` nor the required scopes for data.

Lifetime: 600s (`config: ACCESS_TOKEN_TTL_SECONDS`).

Refresh: you also receive a refresh token; refreshing returns another client token (still no `consent_id`).

### Data access token (bound to consent)

How: same endpoint, but include `consent_id=<ConsentId>` and ask for scopes you need (e.g., `accounts.read` `balances.read` ...).

Use: call AIS data endpoints for the accounts that PSU authorised on that consent.

Lifetime: 600s (config).

Refresh: yes—refresh returns a new access token with the same `consent_id` and scopes.

NOTE: Both client tokens and data tokens are JWTs with fields like: `sub`, `scope`, `consent_id`, `user_id`, `exp`. They’re signed with `JWT_SECRET` and require `X-Client-Cert: enrolled` at the token endpoint.

### Refresh token

How: returned by the token endpoint alongside every access token.

Use: `grant_type=refresh_token` to obtain a new access token (and a rotated refresh token).

Lifetime: 30 days (config: `REFRESH_TOKEN_TTL_DAYS`).

Scope/consent_id: inherited from the original token that produced it—unchanged by refresh.


### Consent vs token lifetimes (how they interplay)
* Authorisation window (server-side rule): PSU must approve within 90 seconds of creation.
  * Config: `AUTHORISATION_WINDOW_SECONDS=90`.
  * If elapsed while AwaitingAuthorisation → consent becomes effectively Expired (locked).
* Consent ExpirationDateTime: absolute expiry for using that consent after it’s Authorised. If passed → data endpoints return 403 consent_expired, even if your access token is still valid.
* Access token TTL (600s): governs API call authorization only. When it expires you’ll see 401 unauthorized: Access token expired → use refresh.
* Refresh token TTL (30d): after this you must start a new consent/token flow. Key point: Tokens do not keep a consent “alive.” Even a freshly refreshed data token will get 403 if the underlying consent is Rejected / Revoked / Expire


## Test cycle of obtaining consent then retrieving the authorized accounts

### 0 Assumptions

* API running at `http://localhost:8000` or substitute curl commands with `https://open-banking-ais.onrender.com` 
* You have curl and jq installed (on mac install using brew)
* Endpoints `/connect/mtls/token`, `/account-access-consents`, `/psu/authorize`, `/accounts` are available
* You have an authorized <CLIENT_ID> and <CLIENT_SECRET> required for steps 1 and 4


### 1 Get a client token (not bound to any consent)

This token lets the TPP create/read consents. (Simulated mTLS header required.)
```bash
curl -s -X POST https://open-banking-ais.onrender.com/connect/mtls/token \
  -H "X-Client-Cert: enrolled" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>" \
  | tee /tmp/client_token.json

CLIENT_TOKEN=$(jq -r .access_token /tmp/client_token.json)
```

If you don’t have jq, just read the JSON and copy the access_token manually.

### 2 Create the consent (intent)

Minimal permissions for account listing = ReadAccountsBasic.

```bash
curl -s -X POST https://open-banking-ais.onrender.com/account-access-consents \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": ["ReadAccountsBasic"],
    "expirationDateTime": "2026-12-31T23:59:59Z"
  }' | tee /tmp/consent.json

CONSENT_ID=$(jq -r .ConsentId /tmp/consent.json)
echo "CONSENT_ID=$CONSENT_ID"
```

(Optional) check status (should be AwaitingAuthorisation):

```bash
curl -s https://open-banking-ais.onrender.com/account-access-consents/$CONSENT_ID \
  -H "Authorization: Bearer $CLIENT_TOKEN"
```

#### Permissions
This is the full set of `permissions` which you can pass to obtain consent for accessing different endpoints:
```
[
    "ReadAccountsBasic",
    "ReadBalances",
    "ReadTransactionsBasic",
    "ReadTransactionsCredits",
    "ReadTransactionsDebits",
    "ReadBeneficiariesBasic"
  ]
```

"ReadTransactionsBasic", "ReadTransactionsCredits" and "ReadTransactionsDebits" are all required to give access to the scope "transactions.read", we have not enforced direction - forthcoming. 

### 3 PSU authorises the consent (select accounts)

You can use the HTML page in a browser:

`https://open-banking-ais.onrender.com/psu/authorize/ui?consentId=<$CONSENT_ID>`


Or do it headless via a form POST (approve acc-001 and acc-002):

```bash
curl -s -X POST https://open-banking-ais.onrender.com/psu/authorize \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "consentId=$CONSENT_ID&selected_accounts=acc-001&selected_accounts=acc-002"
```

Note: this is a dummy implementation of the PSU aproval page where the user simply has to consent and give access. In practice, this is where an OTP from an authentication device applies.

(Optional) verify status is now Authorised and shows the selected accounts:

```bash
curl -s https://open-banking-ais.onrender.com/account-access-consents/<$CONSENT_ID> \
  -H "Authorization: Bearer $CLIENT_TOKEN"
```

### 4 Get a data access token bound to the consent

Now request a token with the consent_id and the scope you’ll use (accounts.read). Other scopes are: "accounts.read", "balances.read", "transactions.read", "beneficiaries.read" which map from the permissions above. For multiple scopes, separante the scopes with a space when passing them.

```bash
curl -s -X POST https://open-banking-ais.onrender.com/connect/mtls/token \
  -H "X-Client-Cert: enrolled" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&consent_id=$CONSENT_ID&scope=accounts.read" \
  | tee /tmp/data_token.json

ACCESS_TOKEN=$(jq -r .access_token /tmp/data_token.json)
```

### 5 Retrieve the authorised accounts
List all authorised accounts the PSU approved in step 3
```bash
curl -s "https://open-banking-ais.onrender.com/accounts?limit=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# (Optional) Get one account by id
curl -s "https://open-banking-ais.onrender.com/accounts/acc-001" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

You should only see the accounts the PSU selected (e.g., acc-001, acc-002). If you try an account that wasn’t approved, you’ll get 403 Account not permitted by consent.

## Common gotchas and error codes


* 400 invalid_request: Missing refresh_token → pass refresh_token= field.
* 400 invalid_grant: Unknown refresh token → token was never issued, already rotated and discarded, or typo.
* 400 invalid_grant: Refresh token expired → 30-day TTL passed; you must re-run the full consent/token flow.
* 401 `"mtls_required"` on token calls → ensure `-H "X-Client-Cert: enrolled"` is present.
* 401 `"Access token expired"` → tokens last 600s; repeat step 4 (or use the refresh flow).
* 403 `"consent_not_authorised"` or `"consent_expired on data calls"` on /accounts → make sure you ran step 3 and that you’re using a token with consent_id (step 4), not the client token from step 1.

We list all the error codes for completeness below

### 401 Unauthorized

| Code                                    | Example payload                                                                                    | When it happens                                                      | Fix                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `mtls_required`                         | `{"detail":{"error":{"code":"mtls_required","message":"Client certificate not enrolled/valid"}}}`  | Calling `POST /connect/mtls/token` without `X-Client-Cert: enrolled` | Include header `-H "X-Client-Cert: enrolled"` (or set the env to match whatever value you require). |
| `unauthorized` (missing/invalid bearer) | `{"detail":{"error":{"code":"unauthorized","message":"Missing or invalid Authorization header"}}}` | Any protected endpoint without `Authorization: Bearer ...`           | Send a valid bearer token.                                                                          |
| `unauthorized` (expired token)          | `{"detail":{"error":{"code":"unauthorized","message":"Access token expired"}}}`                    | Bearer JWT is past `exp`                                             | Use the **refresh flow** or mint a new token.                                                       |
| `unauthorized` (invalid token)          | `{"detail":{"error":{"code":"unauthorized","message":"Invalid access token"}}}`                    | Bad/garbled JWT, wrong secret, etc.                                  | Request a fresh token; verify `JWT_SECRET` alignment.                                               |

### 403 Forbidden

| Code                                 | Example payload                                                                                                            | When it happens                                       | Fix                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `forbidden` (missing scope)          | `{"detail":{"error":{"code":"forbidden","message":"Missing required scope: accounts.read"}}}`                              | Calling a data endpoint without the needed scope      | Ask for the needed scope when getting the token (e.g., `accounts.read`).              |
| `forbidden` (account not in consent) | `{"detail":{"error":{"code":"forbidden","message":"Account not permitted by consent"}}}`                                   | Requesting an account the PSU didn’t select           | Use only accounts in `AuthorisedAccounts`, or re-authorise consent with that account. |
| `consent_not_authorised`             | `{"detail":{"error":{"code":"consent_not_authorised","message":"Consent not Authorised (status=AwaitingAuthorisation)"}}}` | Data endpoint called while consent not yet Authorised | Complete PSU authorisation first.                                                     |
| `consent_expired`                    | `{"detail":{"error":{"code":"consent_expired","message":"Consent has expired"}}}`                                          | Data endpoint called after consent lifetime           | Create a new consent.                                                                 |


### 404 Not Found
| Code                  | Example payload                                                                | When it happens                                    | Fix                                             |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------- |
| `not_found` (consent) | `{"detail":{"error":{"code":"not_found","message":"Consent not found"}}}`      | Bad/unknown `ConsentId`                            | Use a valid `ConsentId`.                        |
| `not_found` (account) | `{"detail":{"error":{"code":"not_found","message":"Account not found"}}}`      | Unknown `accountId`                                | Use a valid account id.                         |
| `not_found` (balance) | `{"detail":{"error":{"code":"not_found","message":"Balance not found"}}}`      | No balance doc for that account                    | Seed data or ensure balance record exists.      |
| `not_found` (audit)   | `{"detail":{"error":{"code":"not_found","message":"Audit record not found"}}}` | `/support/auditlog/referenceid/{id}` with no match | Use a valid reference id from `X-Reference-Id`. |


### 409 Conflict (state locked / immutable)

| Code             | Example payload                                                                                              | When it happens                                                                                                            | Fix                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `consent_locked` | `{"detail":{"error":{"code":"consent_locked","message":"Consent is Rejected; no further changes allowed"}}}` | Attempt to Approve/Reject when consent is already `Authorised`, `Rejected`, `Revoked`, or `Expired`, or racing two actions | Don’t reuse terminal consents. Create a new consent; ensure only one action is performed. |


### 400 Bad Request

| Code                                         | Example payload                                                                                                                                    | When it happens                                                             | Fix                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `invalid_request` (token params)             | `{"detail":{"error":{"code":"invalid_request","message":"Missing required params"}}}`                                                              | Token call missing `grant_type`, `client_id`, `client_secret`               | Provide all required form fields.                                                    |
| `invalid_request` (missing `consent_id`)     | `{"detail":{"error":{"code":"invalid_request","message":"consent_id is required"}}}`                                                               | Client-credentials token **for data access** without `consent_id`           | Include `consent_id` (client tokens **without** consent are only for consents mgmt). |
| `invalid_request` (at least one account)     | `{"detail":{"error":{"code":"invalid_request","message":"At least one account must be selected"}}}`                                                | Submitting PSU Approve without any checkbox selected                        | Select ≥1 account.                                                                   |
| `invalid_permissions`                        | `{"detail":{"error":{"code":"invalid_permissions","message":"permissions array must not be empty"}}}`                                              | POST `/account-access-consents` with empty array                            | Include at least `ReadAccountsBasic` or `ReadAccountsDetail`.                        |
| `invalid_permissions` (unsupported code)     | `{"detail":{"error":{"code":"invalid_permissions","message":"unsupported permission(s): ['ReadFooBar']"}}}`                                        | Permissions include codes the ASPSP doesn’t support                         | Remove unsupported codes.                                                            |
| `invalid_permissions` (transactions pairing) | `{"detail":{"error":{"code":"invalid_permissions","message":"ReadTransactionsBasic requires ReadTransactionsCredits or ReadTransactionsDebits"}}}` | Any of the required credit/debit pair rules not satisfied                   | Add the missing counterpart (see rules below).                                       |
| `consent_unavailable`                        | `{"detail":{"error":{"code":"consent_unavailable","message":"Authorisation window elapsed"}}}`                                                     | Approve/Reject after the 90s authorisation window (or after overall expiry) | Start a new consent; approve within the window.                                      |
| `invalid_grant` (unknown refresh token)      | `{"detail":{"error":{"code":"invalid_grant","message":"Unknown refresh token"}}}`                                                                  | Refresh token not found (typo/rotated)                                      | Use the latest refresh token you received.                                           |
| `invalid_grant` (expired refresh token)      | `{"detail":{"error":{"code":"invalid_grant","message":"Refresh token expired"}}}`                                                                  | Past the 30-day refresh TTL                                                 | Re-run the full consent+token flow.                                                  |


### 422 Unprocessable Entity (FastAPI validation)

Comes from Pydantic/validation (e.g., bad datetime format in JSON).

Send properly formatted ISO-8601 datetimes: `YYYY-MM-DDTHH:MM:SSZ`.

### 500 Internal Server Error (unexpected)

Unhandled exceptions (e.g., malformed fromDate/toDate that blow up fromisoformat).