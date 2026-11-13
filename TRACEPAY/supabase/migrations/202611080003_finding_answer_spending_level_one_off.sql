-- Let users say whether a spending habit is their usual level, and whether one large charge
-- was planned.
alter table public.finding_answers
  drop constraint finding_answers_kind_check;

alter table public.finding_answers
  add constraint finding_answers_kind_check check (
    question_kind in (
      'subscription_usage',
      'cancelled_in',
      'duplicate_expected',
      'data_usage',
      'insurance_cover',
      'bank_account',
      'payment_purpose',
      'transfer_purpose',
      'spending_level',
      'one_off_expected'
    )
  );
