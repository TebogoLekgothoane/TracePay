-- Core identity schema the mobile/auth apps depend on, plus indexed phone lookup.
-- Safe to apply on an existing project: objects are created only when missing.

DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM (
    'cheque', 'savings', 'credit_card', 'debit_card', 'investment', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  currency text NOT NULL DEFAULT 'ZAR' CHECK (char_length(currency) = 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) >= 2 AND char_length(btrim(name)) <= 80),
  institution text CHECK (
    institution IS NULL
    OR (char_length(btrim(institution)) >= 2 AND char_length(btrim(institution)) <= 80)
  ),
  account_type public.account_type NOT NULL DEFAULT 'cheque',
  currency text NOT NULL DEFAULT 'ZAR' CHECK (char_length(currency) = 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  parent_category_id uuid REFERENCES public.categories(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can view their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can create their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.accounts;
CREATE POLICY "Users can view their own accounts"
  ON public.accounts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can create their own accounts"
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update their own accounts"
  ON public.accounts FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete their own accounts"
  ON public.accounts FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;
CREATE POLICY "Authenticated users can view categories"
  ON public.categories FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.normalize_sa_phone(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN d LIKE '27%' AND length(d) = 11 THEN '+' || d
    WHEN d LIKE '0%' AND length(d) = 10 THEN '+27' || substr(d, 2)
    WHEN length(d) = 9 THEN '+27' || d
    ELSE NULL
  END
  FROM (SELECT regexp_replace(coalesce(value, ''), '\D', '', 'g') AS d) AS digits(d);
$$;

REVOKE ALL ON FUNCTION public.normalize_sa_phone(text) FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    public.normalize_sa_phone(NEW.phone)
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_phone_updated ON auth.users;
CREATE TRIGGER on_auth_user_phone_updated
  AFTER UPDATE OF phone ON auth.users
  FOR EACH ROW
  WHEN (OLD.phone IS DISTINCT FROM NEW.phone)
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.protect_profile_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.phone := NULL;
    ELSE
      NEW.phone := OLD.phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_phone ON public.profiles;
CREATE TRIGGER profiles_protect_phone
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_phone();

CREATE OR REPLACE FUNCTION public.accounts_assign_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  IF NEW.institution IS NOT NULL THEN
    NEW.institution := btrim(NEW.institution);
    IF NEW.institution = '' THEN
      NEW.institution := NULL;
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Account must belong to a user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_assign_owner ON public.accounts;
CREATE TRIGGER accounts_assign_owner
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.accounts_assign_owner();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS accounts_updated_at ON public.accounts;
CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

UPDATE public.profiles AS profile
SET phone = public.normalize_sa_phone(users.phone)
FROM auth.users AS users
WHERE profile.id = users.id
  AND profile.phone IS NULL
  AND public.normalize_sa_phone(users.phone) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON public.accounts (user_id);
