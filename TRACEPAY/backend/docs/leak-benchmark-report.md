# TracePay leak engine benchmark

Customers: 28. Expected findings are defined in `tests/benchmark/customers.py` before the engine runs and are not adjusted to its output. Findings are scored as the customer sees them; 4 finding(s) kept internally as explained by another finding are not counted.

## Summary

| Metric | Result |
|---|---|
| True positives | 25 |
| False positives | 0 |
| False negatives | 0 |
| Precision | 100.0% |
| Recall | 100.0% |
| Monthly amount accuracy | 23/23 |
| Observed-total accuracy | 7/7 |
| Evidence-status accuracy | 11/11 |
| Deduplicated total correct | 5/5 |
| Double-counting rate (total above expected) | 0/5 |
| Idempotent runs | 28/28 |
| Classification accuracy (gold set) | 20/22 |
| Processing time (all customers, twice each) | 0.36s |

## Results by leak category

| Leak type | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| bank_fee_leak | 3 | 0 | 0 | 100.0% | 100.0% |
| duplicate_debit_order_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| duplicate_payment_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| gambling_spending_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| high_cost_credit_leak | 2 | 0 | 0 | 100.0% | 100.0% |
| overlapping_cover_leak | 1 | 0 | 0 | 100.0% | 100.0% |
| penalty_fee_leak | 2 | 0 | 0 | 100.0% | 100.0% |
| recurring_payment_leak | 6 | 0 | 0 | 100.0% | 100.0% |
| subscription_leak | 7 | 0 | 0 | 100.0% | 100.0% |
| unknown_recurring_payment | 1 | 0 | 0 | 100.0% | 100.0% |

## Customers

### 01-subscription-price-increase (1 Subscription price increase)

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R100.00, likely)
- Recurring monthly total: R100.00 after overlaps (R100.00 before), expected R100.00

### 02-two-insurance-policies (2 Two separate insurance policies)

Two policies are a combined commitment, not unnecessary spending.

Expected: no findings
Actual: no findings
- Recurring monthly total: R0.00 after overlaps (R0.00 before), expected R0.00

### 03-duplicate-debit-order (3 Duplicate debit order)

Expected: duplicate_debit_order_leak/duplicate_debit_order
Actual: duplicate_debit_order_leak/duplicate_debit_order (R450.00, possible)

### 04-free-trial-conversion (4 Free trial conversion)

The trial finding and the subscription it became describe one cost.

Expected: subscription_leak/trial_conversion; subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R99.00, likely); subscription_leak/trial_conversion (R99.00, likely)
- Recurring monthly total: R99.00 after overlaps (R198.00 before), expected R99.00

### 05-unknown-recurring-merchant (5 Unknown recurring merchant)

Expected: unknown_recurring_payment/unidentified_recurring_merchant
Actual: unknown_recurring_payment/unidentified_recurring_merchant (R89.00, possible)

### 06-legitimate-identical-purchases (6 Legitimate identical purchases)

Expected: no findings
Actual: no findings

### 07-duplicate-statement-import (7 Duplicate statement import)

Re-importing a statement must not change or double the findings.

Expected: subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R199.00, likely)

### 08-irregular-interest-charges (8 Irregular interest charges)

Expected: bank_fee_leak/interest_charges
Actual: bank_fee_leak/interest_charges (R191.67, confirmed)

### 09-monthly-bank-fees (9 Monthly bank fees)

A flat monthly account fee is ordinary banking, not a leak.

Expected: no findings
Actual: no findings

### 10-one-off-bank-fees (10 One-off bank fees)

Expected: no findings
Actual: no findings

### 11-refunds-and-reversals (11 Refunds and reversals)

Expected: no findings
Actual: no findings

### 12-own-account-transfers (12 Own-account transfers)

Expected: no findings
Actual: no findings

### 13-multiple-subscriptions (13 Multiple subscriptions)

Expected: subscription_leak/subscription_review; subscription_leak/subscription_review; subscription_leak/subscription_review
Actual: subscription_leak/subscription_review (R199.00, likely); subscription_leak/subscription_review (R150.00, likely); subscription_leak/subscription_review (R80.00, likely)
- Recurring monthly total: R429.00 after overlaps (R429.00 before), expected R429.00

### 14-irregular-recurring-payments (14 Irregular recurring payments)

Payments at unpredictable intervals are not a recurring commitment.

Expected: no findings
Actual: no findings

### 15-insufficient-history (15 Insufficient transaction history)

Expected: no findings
Actual: no findings

### 16-duplicate-card-charge (Extra: duplicate card charge)

Expected: duplicate_payment_leak/duplicate_merchant_payment
Actual: duplicate_payment_leak/duplicate_merchant_payment (R349.00, possible)

### 17-immediate-payment-fees (Extra: repeated immediate payment fees)

Expected: bank_fee_leak/immediate_payment_fee
Actual: bank_fee_leak/immediate_payment_fee (R60.00, confirmed)

### 18-international-fees (Extra: international transaction fees)

Expected: bank_fee_leak/foreign_transaction_fee
Actual: bank_fee_leak/foreign_transaction_fee (R35.00, confirmed)

### 19-overlapping-funeral-cover (Extra: funeral cover with two providers)

The combined finding and each policy describe the same premiums.

Expected: overlapping_cover_leak/overlapping_cover; recurring_payment_leak/*; recurring_payment_leak/*
Actual: recurring_payment_leak/* (R180.00, likely); recurring_payment_leak/* (R120.00, likely); overlapping_cover_leak/overlapping_cover (R300.00, likely)
- Recurring monthly total: R300.00 after overlaps (R600.00 before), expected R300.00

### 20-single-funeral-policy (Extra: one funeral policy)

Expected: recurring_payment_leak/*
Actual: recurring_payment_leak/* (R180.00, likely)

### 21-regular-betting (Extra: regular betting payments)

Expected: gambling_spending_leak/gambling_spending
Actual: gambling_spending_leak/gambling_spending (R516.67, possible)

### 22-occasional-betting (Extra: occasional small bets)

Expected: no findings
Actual: no findings

### 23-credit-stacking (Extra: two credit providers repaid together)

Expected: high_cost_credit_leak/credit_stacking
Actual: high_cost_credit_leak/credit_stacking (R650.00, likely)

### 24-short-term-lender (Extra: repayments to a short-term lender)

Expected: high_cost_credit_leak/high_cost_lender_repayments
Actual: high_cost_credit_leak/high_cost_lender_repayments (R520.00, possible)

### 25-utility-bill-rise (Extra: utility bill price rise)

Expected: recurring_payment_leak/debit_order_review
Actual: recurring_payment_leak/debit_order_review (R150.00, likely)

### 26-school-fee-rise (Extra: school fee price rise)

Expected: recurring_payment_leak/*
Actual: recurring_payment_leak/* (R300.00, likely)

### 27-single-late-fee (Extra: one late-payment fee)

The late fee is a separate one-off charge on top of the contract payment.

Expected: penalty_fee_leak/penalty_fees; recurring_payment_leak/*
Actual: recurring_payment_leak/* (R699.00, likely); penalty_fee_leak/penalty_fees (R125.00, confirmed)

### 28-repeated-penalties-not-bank-fee (Extra: repeated provider penalties, one bank fee)

Expected: penalty_fee_leak/penalty_fees
Actual: penalty_fee_leak/penalty_fees (R360.00, confirmed)

## Classification misses

- 'UBER *TRIP': got spending/Ride Hailing, expected spending/Transport
- 'WOOLWORTHS REFUND': got unknown/None, expected income/None
