-- Adds the short_term_lender business type (online and payday cash-loan lenders) to the allowed
-- values. Safe whether or not 202611150001 has already been applied.
alter table public.merchant_profiles
  drop constraint if exists merchant_profiles_business_type_check;

alter table public.merchant_profiles
  add constraint merchant_profiles_business_type_check check (business_type in (
    'trading_broker', 'crypto_exchange', 'gambling', 'short_term_lender', 'loan_provider',
    'insurance', 'subscription_service', 'retailer', 'food_and_drink', 'telecom_or_utility',
    'transport', 'bank_or_fintech', 'education', 'other_business'
  ));
