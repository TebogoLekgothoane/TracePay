-- Keep the persisted finding contract aligned with every deterministic detector output.
-- This is a forward-only repair for the original narrower allow-list.

alter table public.finding_registry
  drop constraint if exists finding_registry_leak_type_check;

alter table public.finding_registry
  add constraint finding_registry_leak_type_check check (
    leak_type in (
      'bank_fee_leak',
      'subscription_leak',
      'recurring_payment_leak',
      'spending_escalation_leak',
      'duplicate_payment_leak',
      'duplicate_debit_order_leak',
      'duplicate_streaming_leak',
      'irregular_transaction_leak',
      'inactive_recurring_payment_leak',
      'cash_usage_leak',
      'airtime_data_leak',
      'food_spending_leak',
      'transport_spending_leak',
      'coffee_spending_leak',
      'convenience_store_leak',
      'weekend_spending_leak',
      'payday_spending_leak',
      'unknown_recurring_payment'
    )
  );
