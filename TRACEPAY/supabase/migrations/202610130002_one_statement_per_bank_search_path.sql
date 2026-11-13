-- Harden search_path on one-statement-per-bank helpers (security advisor).

CREATE OR REPLACE FUNCTION public.normalize_statement_bank_key(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  haystack text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;

  haystack := lower(btrim(raw));

  IF haystack ~ '(^|[^a-z0-9])go[[:space:]]*tyme([^a-z0-9]|$)' THEN
    RETURN 'gotyme';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])tyme[[:space:]]*bank([^a-z0-9]|$)'
     OR haystack = 'tymebank' THEN
    RETURN 'tymebank';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])standard[[:space:]]*bank([^a-z0-9]|$)' THEN
    RETURN 'standard bank';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])first[[:space:]]*national([^a-z0-9]|$)'
     OR haystack ~ '(^|[^a-z0-9])fnb([^a-z0-9]|$)' THEN
    RETURN 'fnb';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])discovery[[:space:]]*bank([^a-z0-9]|$)'
     OR haystack = 'discovery' THEN
    RETURN 'discovery bank';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])african[[:space:]]*bank([^a-z0-9]|$)' THEN
    RETURN 'african bank';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])capitec([^a-z0-9]|$)' THEN
    RETURN 'capitec';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])nedbank([^a-z0-9]|$)' THEN
    RETURN 'nedbank';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])investec([^a-z0-9]|$)' THEN
    RETURN 'investec';
  END IF;
  IF haystack ~ '(^|[^a-z0-9])absa([^a-z0-9]|$)' THEN
    RETURN 'absa';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.statement_imports_bank_slot_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.bank_key IS NOT NULL THEN
    NEW.bank_key := public.normalize_statement_bank_key(NEW.bank_key);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('uploaded', 'processing', 'processed') THEN
      IF NEW.bank_key IS NULL THEN
        RAISE EXCEPTION 'bank_key is required for active statement imports'
          USING ERRCODE = '23514';
      END IF;
      NEW.bank_slot_active := true;
    ELSE
      NEW.bank_slot_active := false;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'failed' THEN
    NEW.bank_slot_active := false;
  ELSIF OLD.status = 'failed'
        AND NEW.status IN ('uploaded', 'processing', 'processed') THEN
    IF NEW.bank_key IS NULL THEN
      RAISE EXCEPTION 'bank_key is required for active statement imports'
        USING ERRCODE = '23514';
    END IF;
    NEW.bank_slot_active := true;
  ELSIF NEW.status IN ('uploaded', 'processing', 'processed')
        AND OLD.bank_slot_active = true THEN
    NEW.bank_slot_active := true;
  END IF;

  RETURN NEW;
END;
$$;
