# TracePay leak engine benchmark: noisy, independent data

Customers: 11. Expected findings are defined in `tests/benchmark/noisy_customers.py` before the engine runs and are not adjusted to its output. Findings are scored as the customer sees them; 0 finding(s) kept internally as explained by another finding are not counted.

## Summary

| Metric | Result |
|---|---|
| True positives | 7 |
| False positives | 1 |
| False negatives | 0 |
| Precision | 87.5% |
| Recall | 100.0% |
| Monthly amount accuracy | 7/7 |
| Observed-total accuracy | 0/0 |
| Evidence-status accuracy | 0/0 |
| Deduplicated total correct | 0/0 |
| Double-counting rate (total above expected) | 0/0 |
| Idempotent runs | 11/11 |
| Classification accuracy (gold set) | 20/22 |
| Processing time (all customers, twice each) | 0.26s |

## Results by leak category

| Leak type | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| bank_fee_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| duplicate_payment_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| subscription_leak | 4 | 0 | 0 | 100.0% | 100.0% |
| transport_spending_leak | 0 | 1 | 0 | 0.0% | n/a |
| unknown_recurring_payment | 1 | 0 | 0 | 100.0% | 100.0% |

## Customers

### N01-noisy-subscription-descriptors (Merchant normalisation across descriptors)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R199.00, likely)

### N02-missing-month (Missing statement month)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R80.00, likely)

### N03-two-accounts (Multiple accounts)

One subscription that moved cards is one subscription, not a duplicate.

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R199.00, likely)

### N04-unfamiliar-merchant (Unfamiliar merchant)

Expected: unknown_recurring_payment/*
Actual: unknown_recurring_payment/unidentified_recurring_merchant (R250.00, possible)

### N05-two-orders-same-day (Different order references)

Expected: no findings
Actual: no findings

### N06-same-order-charged-twice (True duplicate with noisy description)

Expected: duplicate_payment_leak/duplicate_merchant_payment
Actual: duplicate_payment_leak/duplicate_merchant_payment (R349.00, possible)

### N07-promotional-price-ends (Introductory price)

The finding is the R99 subscription, not a R70 'price rise'.

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R99.00, likely)

### N08-reversed-and-repurchased (Reversal with noisy description)

Expected: no findings
Actual: no findings

### N09-fee-wordings (Fee descriptor variants)

Expected: bank_fee_leak/immediate_payment_fee
Actual: bank_fee_leak/immediate_payment_fee (R60.00, confirmed)

### N10-ordinary-spending (Realistic month-to-month variation)

Intended as ordinary variation. On inspection after the first run its amounts rise every month (restaurants +69%, fuel +31%), so the two category findings are defensible and this customer is not a clean false-positive measure. Kept unchanged.

Expected: no findings
Actual: transport_spending_leak/* (R102.50, possible)
- UNEXPECTED: transport_spending_leak/* R102.50

### N11-stationary-spending (Trendless month-to-month variation)

Spending that moves up and down around a level is not a leak.

Expected: no findings
Actual: no findings

## Classification misses

- 'UBER *TRIP': got spending/Ride Hailing, expected spending/Transport
- 'WOOLWORTHS REFUND': got unknown/None, expected income/None
