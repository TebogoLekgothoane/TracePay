# TracePay leak engine benchmark: noisy, independent data

Customers: 53. Expected findings are defined in `tests/benchmark/noisy_customers.py` before the engine runs and are not adjusted to its output. Findings are scored as the customer sees them; 0 finding(s) kept internally as explained by another finding are not counted.

## Summary

| Metric | Result |
|---|---|
| True positives | 31 |
| False positives | 2 |
| False negatives | 1 |
| Precision | 93.9% |
| Recall | 96.9% |
| Monthly amount accuracy | 26/28 |
| Observed-total accuracy | 2/2 |
| Evidence-status accuracy | 0/0 |
| Deduplicated total correct | 0/0 |
| Double-counting rate (total above expected) | 0/0 |
| Idempotent runs | 53/53 |
| Classification accuracy (gold set) | 20/22 |
| Processing time (all customers, twice each) | 4.51s |

## Results by leak category

| Leak type | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| bank_fee_leak | 5 | 0 | 0 | 100.0% | 100.0% |
| cash_usage_leak | 0 | 1 | 0 | 0.0% | n/a |
| duplicate_debit_order_leak | 1 | 0 | 1 | 100.0% | 50.0% |
| duplicate_payment_leak | 3 | 0 | 0 | 100.0% | 100.0% |
| gambling_spending_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| high_cost_credit_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| penalty_fee_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| recurring_payment_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| subscription_leak | 15 | 0 | 0 | 100.0% | 100.0% |
| transport_spending_leak | 0 | 1 | 0 | 0.0% | n/a |
| unknown_recurring_payment | 3 | 0 | 0 | 100.0% | 100.0% |

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

### N12-spotify-in-lifestyle (Subscription among ordinary spending)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R70.00, likely)

### N13-youtube-premium (Subscription billed through Google)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R89.99, likely)

### N14-dstv (Pay-TV subscription)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R499.00, likely)

### N15-icloud-storage (App-store billing)

R14.99 is a real iCloud plan, so the finding is the recurring charge, small as it is.

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R14.99, likely)

### N16-microsoft-365 (Software subscription)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R159.00, likely)

### N17-disney-plus (Streaming subscription)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R99.00, likely)

### N18-prime-video (Streaming subscription)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R79.00, likely)

### N19-two-subscriptions (Two separate subscriptions)

Expected: subscription_leak/subscription_review; subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R199.00, likely); subscription_leak/subscription_review (R70.00, likely)

### N20-netflix-price-rise (Price rise mid-statement)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R40.00, likely)

### N21-weekend-billing-drift (Billing date drifts around weekends)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R199.00, likely)

### N22-subscription-two-months-only (Too little history for a subscription)

Two charges are not yet a pattern.

Expected: no findings
Actual: no findings

### N23-uber-eats-double-charge (Same meal charged twice a minute apart)

Expected: duplicate_payment_leak/duplicate_merchant_payment
Actual: duplicate_payment_leak/duplicate_merchant_payment (R189.00, possible)

### N24-sixty60-double-charge (Grocery order charged twice)

Expected: duplicate_payment_leak/duplicate_merchant_payment
Actual: duplicate_payment_leak/duplicate_merchant_payment (R312.45, possible)

### N25-two-coffees (Two identical small purchases hours apart)

Two coffees in one day is ordinary, not a duplicate charge.

Expected: no findings
Actual: no findings

### N26-double-debit-order (A premium taken twice in one month)

The statement row carries no 'DEBIT ORDER' wording, so the engine cannot tell this is a collection.

Expected: duplicate_debit_order_leak/duplicate_debit_order
Actual: no findings
- MISSED: duplicate_debit_order_leak/duplicate_debit_order

### N53-double-debit-order-marked (The same premium collected twice, worded as a debit order)

N26 has the same rows without the 'DEBIT ORDER' wording a bank prints on a collection.

Expected: duplicate_debit_order_leak/duplicate_debit_order
Actual: duplicate_debit_order_leak/duplicate_debit_order (R450.00, possible)

### N27-three-instant-payments-a-month (Repeated immediate payment fees)

Expected: bank_fee_leak/immediate_payment_fee
Actual: bank_fee_leak/immediate_payment_fee (R36.00, confirmed)

### N28-card-abroad-fees (Foreign transaction fee each month)

Expected: bank_fee_leak/foreign_transaction_fee
Actual: bank_fee_leak/foreign_transaction_fee (R14.00, confirmed)
- Mismatch on bank_fee_leak: amount R14.00 != expected R28.00

### N29-flat-account-fee (A fixed monthly account fee)

Ordinary banking, not a leak.

Expected: no findings
Actual: no findings

### N30-one-card-replacement (A single one-off fee)

Expected: no findings
Actual: no findings

### N31-card-interest (Interest on a credit card at irregular amounts)

Expected: bank_fee_leak/interest_charges
Actual: bank_fee_leak/interest_charges (R115.00, confirmed)

### N32-overdraft-fees (Overdraft fee every month)

Expected: bank_fee_leak/*
Actual: bank_fee_leak/overdraft_fee_pattern (R68.00, confirmed)
- Mismatch on bank_fee_leak: amount R68.00 != expected R85.00

### N33-atm-fees-normal-use (A cash withdrawal and its fee once a month)

One ordinary withdrawal a month is not fee stacking.

Expected: no findings
Actual: cash_usage_leak/* (R91.58, possible)
- UNEXPECTED: cash_usage_leak/* R91.58

### N34-vodacom-late-fee (Late fee on a contract)

Expected: penalty_fee_leak/penalty_fees; recurring_payment_leak/*
Actual: recurring_payment_leak/* (R549.00, likely); penalty_fee_leak/penalty_fees (R95.00, confirmed)

### N35-regular-betting (Weekly betting deposits)

Expected: gambling_spending_leak/gambling_spending
Actual: gambling_spending_leak/gambling_spending (R525.00, possible)

### N36-three-small-bets (A few small bets)

Expected: no findings
Actual: no findings

### N37-short-term-lender (Monthly short-term loan repayments)

Expected: high_cost_credit_leak/high_cost_lender_repayments
Actual: high_cost_credit_leak/high_cost_lender_repayments (R520.00, possible)

### N38-unknown-enterprises (Unfamiliar monthly debit)

Expected: unknown_recurring_payment/*
Actual: unknown_recurring_payment/unidentified_recurring_merchant (R340.00, possible)

### N39-unknown-solutions (Unfamiliar monthly debit, small)

Expected: unknown_recurring_payment/*
Actual: unknown_recurring_payment/unidentified_recurring_merchant (R120.00, possible)

### N40-ordinary-average-household (Trendless ordinary spending: average household)

Spending that moves around a level is not a leak.

Expected: no findings
Actual: no findings

### N41-ordinary-high-spender (Trendless ordinary spending: high spender)

Spending that moves around a level is not a leak.

Expected: no findings
Actual: no findings

### N42-ordinary-low-spender (Trendless ordinary spending: low spender)

Spending that moves around a level is not a leak.

Expected: no findings
Actual: no findings

### N43-ordinary-average-household-B (Trendless ordinary spending: average household B)

Spending that moves around a level is not a leak.

Expected: no findings
Actual: no findings

### N44-ordinary-above-average (Trendless ordinary spending: above average)

Spending that moves around a level is not a leak.

Expected: no findings
Actual: no findings

### N45-ordinary-below-average (Trendless ordinary spending: below average)

Spending that moves around a level is not a leak.

Expected: no findings
Actual: no findings

### N46-big-grocery-shop (One large grocery shop)

Groceries are essential spending; a big shop is not an unusual transaction.

Expected: no findings
Actual: no findings

### N47-rent-to-landlord (Rent paid by EFT to a person)

Rent is a housing cost the customer has to pay, not a leak.

Expected: no findings
Actual: no findings

### N48-monthly-savings-transfer (Money moved to savings each month)

Saving is not a leak.

Expected: no findings
Actual: no findings

### N49-purchase-then-refund (A refunded purchase)

Expected: no findings
Actual: no findings

### N50-occasional-rides (Irregular ride-hailing)

Rides at unpredictable intervals are not a recurring commitment.

Expected: no findings
Actual: no findings

### N51-three-fuel-stations (Fuel across several stations)

Expected: no findings
Actual: no findings

### N52-friend-payments-scattered (One-off payments to a friend)

Expected: no findings
Actual: no findings

## Classification misses

- 'UBER *TRIP': got spending/Ride Hailing, expected spending/Transport
- 'WOOLWORTHS REFUND': got unknown/None, expected income/None
