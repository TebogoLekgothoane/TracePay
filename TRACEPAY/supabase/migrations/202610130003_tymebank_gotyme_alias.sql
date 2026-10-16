-- Treat GoTyme (Tyme Group) statements as the TymeBank slot.

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

  IF haystack ~ '(^|[^a-z0-9])go[[:space:]]*tyme([^a-z0-9]|$)'
     OR haystack = 'gotyme'
     OR haystack ~ '(^|[^a-z0-9])tyme[[:space:]]*bank([^a-z0-9]|$)'
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

-- Remap any existing GoTyme slots onto TymeBank.
UPDATE public.statement_imports
SET bank_key = 'tymebank'
WHERE bank_key = 'gotyme';

UPDATE public.accounts
SET institution = 'TymeBank'
WHERE lower(btrim(coalesce(institution, ''))) IN ('gotyme', 'go tyme', 'go tyme bank', 'gotyme bank');
