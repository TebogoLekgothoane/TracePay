# Payment Initiation Service (PIS) endpoint

## Assumptions

* Base URL: http://127.0.0.1:8000 (set BASE accordingly), https://open-banking-ais.onrender.com if deployment
* You’ve added the payments.read / payments.write scopes to your token service.
* mTLS is optional/disabled in your current code; if you enable it later, add the header noted below.

## Test cycle of obtaining consent then initiating a payment
### Set the base URL

``` bash
BASE=http://127.0.0.1:8000 # or https://open-banking-ais.onrender.com if deployed
```


### Get a client token (TPP)

The server issues a client_credentials token that lets the TPP call PIS endpoints.
Be sure to include the PIS scopes you’ll need.

* CLIENT_ID=demo-client
* CLIENT_SECRET=demo-secret

```bash 

# If you later enable mTLS, include:  -H "X-Client-Cert: enrolled"
curl -s -X POST "$BASE/connect/mtls/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET&scope=payments.write payments.read" \
  | tee /tmp/pis_token.json

PIS_TOKEN=$(jq -r .access_token /tmp/pis_token.json)
echo "PIS_TOKEN=$PIS_TOKEN"
```


If you get forbidden: Missing required scope: payments.write, your token didn’t include payments.write.

### Create a domestic payment consent (intent)

Server registers the TPP’s intent to make a payment and returns a ConsentId.
Use an existing debtor account from your seed (e. g., acc-001 belongs to PSU u1) and any plausible creditor.
```bash
# Adjust the instructed amount to something that fits the seeded balances
cat > /tmp/consent_body.json <<'JSON'
{
  "debtorAccount": { "schemeName": "ZA-BANK-ACCOUNT", "identification": "acc-001", "name": "U1 Current" },
  "creditorAccount": { "schemeName": "ZA-BANK-ACCOUNT", "identification": "9876543210", "name": "ACME LTD" },
  "instructedAmount": { "amount": "500.00", "currency": "ZAR" },
  "remittanceInformation": "Invoice 12345",
  "expirationDateTime": "2026-12-31T23:59:59Z"
}
JSON

curl -s -X POST "$BASE/domestic-payment-consents" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/consent_body.json \
  | tee /tmp/pis_consent.json

CONSENT_ID=$(jq -r .ConsentId /tmp/pis_consent.json)
echo "CONSENT_ID=$CONSENT_ID"
```

### (Optional) Check consent status

You can verify the consent exists and is AwaitingAuthorisation.

```bash
curl -s -X GET "$BASE/domestic-payment-consents/$CONSENT_ID" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  | jq '{ConsentId, Status, AuthorisationCode, PSUId}'
  ```


Expected Status: AwaitingAuthorisation.

### Authorise the consent (PSU action)

You have two options: UI (simulates bank login + approve) or a one-shot simulator endpoint.

#### Option 1 UI route (human-in-the-loop)

This simulates redirecting the PSU to a banking channel. PSU approves; server updates consent to Authorised and sets an AuthorisationCode.

Note this endpoint returns an empedable html string which can be embedded in your browser window. Open in a browser (e. g., choose PSU u1, which owns acc-001):

```bash
$BASE/psu/payment/authorize/ui?consentId=$CONSENT_ID&psu_id=u1
```


Click Approve.

Fetch the updated consent (to retrieve the AuthorisationCode):
```bash
curl -s -X GET "$BASE/domestic-payment-consents/$CONSENT_ID" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  | tee /tmp/pis_consent_authorised.json

AUTH_CODE=$(jq -r .AuthorisationCode /tmp/pis_consent_authorised.json)
echo "AUTH_CODE=$AUTH_CODE"
```

#### Option 2 Simulator route (no UI)

Instead of using the UI, this directly marks consent as authorised and returns the consent with the code.

```bash
curl -s -X POST "$BASE/_simulate/psu/authorize-payment" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "ConsentId=$CONSENT_ID&PSUId=u1" \
  | tee /tmp/pis_consent_authorised.json

AUTH_CODE=$(jq -r .AuthorisationCode /tmp/pis_consent_authorised.json)
echo "AUTH_CODE=$AUTH_CODE"
```


If you see 409 consent_locked or Expired, the consent’s status/time window blocked authorisation.

### (Optional) Re-check consent status

You can make sure the consent is indeed Authorised and the code is present.

```bash
curl -s -X GET "$BASE/domestic-payment-consents/$CONSENT_ID" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  | jq '{ConsentId, Status, AuthorisationCode, PSUId}'
  ```

### Funds confirmation (pre-flight check)

As a pre-check to see if funds are available. You as TPP verifies funds are available for the exact instructed amount in the consent.
Requires the Authorisation code as a header.

```bash
curl -s -X GET "$BASE/domestic-payment-consents/$CONSENT_ID/funds-confirmation" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  -H "X-Authorisation-Code: $AUTH_CODE" \
  | tee /tmp/pis_funds.json

jq . /tmp/pis_funds.json
```


You’ll get:
```bash
{
  "Data": {
    "FundsAvailable": true,
    "FundsAvailableDateTime": "..."
  }
}
```


* If FundsAvailable: false, either lower the consent amount or re-seed with higher balances.
* If you get 401 Missing/invalid X-Authorisation-Code, ensure you’re using the code from the authorization step (UI from PSU option 1 or headless option 2).
* If you get 403 Consent not Authorised, repeat authorization step (option 1 or option 2)

### Initiate the payment (must use the SAME PIS_TOKEN you created with payments.write)

```bash
# Step 5:
PAY_JSON=$(curl -s -X POST "$BASE/domestic-payments" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  -H "X-Authorisation-Code: $AUTH_CODE" \
  -H "Content-Type: application/json" \
  -d "{\"consentId\":\"$CONSENT_ID\",\"idempotencyKey\":\"demo-$(date +%s)\"}") \
  || { echo "curl failed"; exit 1; }

echo "$PAY_JSON" | jq .
PAY_ID=$(jq -r .DomesticPaymentId <<<"$PAY_JSON")
echo "PAY_ID=$PAY_ID"
```


Note that you pass: 
* Header Authorization: Bearer … with payments.write the $PIS_TOKEN
* Header X-Authorisation-Code: <code from PSU authorization step>
* Body { "consentId": "<CONSENT_ID>", "idempotencyKey": "<optional>" }

### Check payment status (needs payments.read)

* If your PIS_TOKEN only had payments.write, mint a token that includes both:
* scope=payments.write payments.read

```bash
curl -s -X GET "$BASE/domestic-payments/$PAY_ID" \
  -H "Authorization: Bearer $PIS_TOKEN" \
  | jq .
  ```

## Common pitfalls

* 403 missing scope → Token lacks payments.write/payments.read
* 403 consent not authorised → Do Step 4 first
* 401 missing X-Authorisation-Code → Include header with the exact code from Step 4
* 200 FundsAvailable=false → Lower amount or re-seed balances
* 422 → Wrong content-type or malformed body/params
* 404 → Wrong IDs (Consent/Payment)
* 409 → Authorising an already terminal consent, or idempotency collision
* 500 → Enum/status mismatch or datetime bugs in server code
* PSU authorise UI: GET /psu/payment/authorize/ui?consentId=<id>&psu_id=<psu> (Note lowercase consentId and psu_id.)

### 401 Unauthorized
| Code / Shape                            | Example payload                                                                                    | When it happens                                                                                                               | Fix                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `mtls_required`                         | `{"detail":{"error":{"code":"mtls_required","message":"Client certificate not enrolled/valid"}}}`  | `POST /connect/mtls/token` without required mTLS header (if you re-enable it)                                                 | Include `-H "X-Client-Cert: enrolled"` (or whatever value you enforce).           |
| `unauthorized` (missing/invalid bearer) | `{"detail":{"error":{"code":"unauthorized","message":"Missing or invalid Authorization header"}}}` | Any protected endpoint without `Authorization: Bearer …`                                                                      | Mint a token and send `-H "Authorization: Bearer $TOKEN"`.                        |
| `unauthorized` (expired token)          | `{"detail":{"error":{"code":"unauthorized","message":"Access token expired"}}}`                    | Bearer JWT is past `exp`                                                                                                      | Use refresh token or request a new access token.                                  |
| `unauthorized` (invalid token)          | `{"detail":{"error":{"code":"unauthorized","message":"Invalid access token"}}}`                    | Bad JWT / wrong secret / corrupt token                                                                                        | Get a fresh token; verify `JWT_SECRET`.                                           |
| header missing/invalid auth code        | `{"detail":"Missing/invalid X-Authorisation-Code"}`                                                | `GET /domestic-payment-consents/{id}/funds-confirmation` or `POST /domestic-payments` without matching `X-Authorisation-Code` | Read the code from consent status, then send `-H "X-Authorisation-Code: <code>"`. |


### 403 Forbidden

| Code / Shape                           | Example payload                                                                                                            | When it happens                                                     | Fix                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `forbidden` (missing scope)            | `{"detail":{"error":{"code":"forbidden","message":"Missing required scope: payments.write"}}}`                             | Using PIS endpoints without required scope(s)                       | Request token with `scope="payments.write payments.read"` (write for create/authorise; read for status/funds). |
| `consent_not_authorised`               | `{"detail":{"error":{"code":"consent_not_authorised","message":"Consent not Authorised (status=AwaitingAuthorisation)"}}}` | Funds confirmation / payment creation before PSU authorises consent | Perform PSU authorisation (UI or sim) first.                                                                   |
| `consent_expired`                      | `{"detail":{"error":{"code":"consent_expired","message":"Consent has expired"}}}`                                          | AIS or PIS flow on an expired consent                               | Create a new consent (or extend times).                                                                        |
| `forbidden` (account not permitted)    | `{"detail":{"error":{"code":"forbidden","message":"Account not permitted by consent"}}}`                                   | AIS: reading an account that wasn’t approved                        | Select that account during PSU approval or recreate consent.                                                   |
| `psu_account_mismatch` *(if enforced)* | `{"detail":{"error":{"code":"psu_account_mismatch","message":"Debtor account not owned by PSU"}}}`                         | PIS: debtor account doesn’t belong to the PSU who authorised        | Use a debtor account owned by that PSU (seed example: `acc-001` → PSU `u1`).                                   |

### 404 Not Found

| Code / Shape | Example payload                                                           | When it happens             | Fix                                                 |
| ------------ | ------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| `not_found`  | `{"detail":{"error":{"code":"not_found","message":"Consent not found"}}}` | Unknown `ConsentId`         | Use the ID returned by consent creation.            |
| —            | `{"detail":"Payment not found"}`                                          | Unknown `DomesticPaymentId` | Use the ID from `POST /domestic-payments` response. |


### 409 Conflict

| Code / Shape           | Example payload                                                                                                | When it happens                                             | Fix                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `consent_locked`       | `{"detail":{"error":{"code":"consent_locked","message":"Consent is Authorised; no further changes allowed"}}}` | Trying to modify a consent in a terminal/non-editable state | Create a new consent.                                       |
| `insufficient_funds`   | `{"detail":{"error":{"code":"insufficient_funds","message":"Insufficient funds for payment"}}}`                | `POST /domestic-payments` when available balance < amount   | Reduce amount / re-seed balances / top up account.          |
| `idempotency_conflict` | `{"detail":{"error":{"code":"idempotency_conflict","message":"Conflicting request for same IdempotencyKey"}}}` | Reusing an `idempotencyKey` with different payload          | Reuse the key **with the same** payload, or pick a new key. |


### 412 Precondition Failed (optional, if you add gateway preconditions)

| Code / Shape          | Example payload                                                                      | When it happens                                | Fix                                          |
| --------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------- |
| `precondition_failed` | `{"detail":{"error":{"code":"precondition_failed","message":"Nonce already used"}}}` | Replayed nonce / gateway precondition failures | Use a fresh nonce per request; don’t replay. |


### 422 Unprocessable Entity

| Code / Shape        | Example payload                                                                      | When it happens                                          | Fix                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pydantic validation | Standard FastAPI 422 with field errors                                               | Malformed body, wrong types, missing required JSON keys  | Match schema; use `Content-Type: application/json` where required.                                      |
| Wrong content type  | 422 with body parse errors                                                           | Sending form data to JSON endpoints (or vice versa)      | Use `application/json` for JSON endpoints; `application/x-www-form-urlencoded` for token/sim endpoints. |
| Wrong param casing  | `{"detail":[{"type":"missing","loc":["query","consentId"],"msg":"Field required"}]}` | Using `ConsentId` instead of `consentId` (or wrong name) | Use lowercase `consentId` and `psu_id` consistently in UI routes.                                       |


### 429 Too Many Requests (if you add limits)

| Code / Shape        | Example payload                    | When it happens      | Fix                                         |
| ------------------- | ---------------------------------- | -------------------- | ------------------------------------------- |
| — (+ `Retry-After`) | HTTP 429 with `Retry-After` header | Exceeded rate limits | Back off and retry after indicated seconds. |


### 500 Internal Server Error

| Code / Shape         | Example payload                                                                                                               | When it happens                                                                                       | Fix                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Enum/status mismatch | FastAPI response validation error like: `Input should be 'Pending', 'AcceptedSettlementInProcess', 'Rejected' or 'Completed'` | Returning a status string your Pydantic `Literal` doesn’t allow (e.g., `AcceptedSettlementCompleted`) | Align your response model or returned value.                        |
| Datetime naive/aware | Python traceback: `TypeError: can't compare offset-naive and offset-aware datetimes`                                          | Comparing naive and aware datetimes during expiry checks                                              | Normalize with `as_aware_utc(...)`; always store/compare aware UTC. |
| Uncaught exceptions  | Varies                                                                                                                        | Unexpected `None`, bad casts, DB hiccups                                                              | Check server logs; add guards; keep schemas/DB in sync.             |
