-- Let users say what an unrecognised recurring payment is for.
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
      'payment_purpose'
    )
  );
