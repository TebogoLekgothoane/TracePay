-- One active statement import per (user, bank).
-- Failed imports release the bank slot. Historical duplicate processed rows are kept;
-- only the earliest processed row per user+bank keeps bank_slot_active = true.

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

  -- Longest / most specific aliases first (mirrors pdf_processor.statement_schema._BANK_ALIASES).
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

COMMENT ON FUNCTION public.normalize_statement_bank_key(text) IS
  'Canonical bank key for one-statement-per-bank enforcement. Returns NULL when the bank is unknown or ambiguous.';

ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS bank_key text;

ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS bank_slot_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.statement_imports.bank_key IS
  'Normalized bank identity for one-statement-per-bank. Derived from account institution and verified against extracted_bank.';

COMMENT ON COLUMN public.statement_imports.bank_slot_active IS
  'True while this import holds the user+bank slot (uploaded, processing, or processed). False for failed and for historical extras.';

-- Backfill from extracted_bank, then linked account institution.
UPDATE public.statement_imports AS si
SET bank_key = public.normalize_statement_bank_key(si.extracted_bank)
WHERE si.bank_key IS NULL
  AND si.extracted_bank IS NOT NULL;

UPDATE public.statement_imports AS si
SET bank_key = public.normalize_statement_bank_key(a.institution)
FROM public.accounts AS a
WHERE si.account_id = a.id
  AND si.bank_key IS NULL
  AND a.institution IS NOT NULL;

-- Preserve historical duplicates: only the earliest processed row per user+bank keeps the slot.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, bank_key
      ORDER BY
        CASE status
          WHEN 'processed' THEN 0
          WHEN 'processing' THEN 1
          WHEN 'uploaded' THEN 2
          ELSE 3
        END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.statement_imports
  WHERE bank_key IS NOT NULL
    AND status IN ('uploaded', 'processing', 'processed')
)
UPDATE public.statement_imports AS si
SET bank_slot_active = (ranked.rn = 1)
FROM ranked
WHERE si.id = ranked.id;

UPDATE public.statement_imports
SET bank_slot_active = false
WHERE status = 'failed'
   OR bank_key IS NULL;

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

  -- UPDATE: failed always releases the slot. Reactivating from failed reclaims it.
  -- Existing processed rows with bank_slot_active = false stay false unless reactivated from failed.
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

DROP TRIGGER IF EXISTS statement_imports_bank_slot_sync ON public.statement_imports;
CREATE TRIGGER statement_imports_bank_slot_sync
  BEFORE INSERT OR UPDATE OF status, bank_key, bank_slot_active
  ON public.statement_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.statement_imports_bank_slot_sync();

CREATE UNIQUE INDEX IF NOT EXISTS statement_imports_user_bank_slot_active_key
  ON public.statement_imports (user_id, bank_key)
  WHERE bank_slot_active = true AND bank_key IS NOT NULL;

COMMENT ON INDEX public.statement_imports_user_bank_slot_active_key IS
  'At most one active statement import per authenticated user and bank.';

-- Atomically release abandoned uploaded/processing slots for this user+bank (except an optional resume id).
CREATE OR REPLACE FUNCTION public.release_stale_statement_bank_slots(
  p_bank_key text,
  p_keep_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  normalized text;
  updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  normalized := public.normalize_statement_bank_key(p_bank_key);
  IF normalized IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.statement_imports
  SET
    status = 'failed',
    error_message = 'Superseded by a newer import attempt for this bank.',
    bank_slot_active = false
  WHERE user_id = auth.uid()
    AND bank_key = normalized
    AND status IN ('uploaded', 'processing')
    AND (p_keep_id IS NULL OR id <> p_keep_id);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_statement_bank_slots(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stale_statement_bank_slots(text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.normalize_statement_bank_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_statement_bank_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_statement_bank_key(text) TO service_role;
