-- Make gardeners.phone nullable — V1 gardeners may not have a phone number.
-- Previously the NOT NULL + UNIQUE constraint forced synthetic phone values.
ALTER TABLE public.gardeners ALTER COLUMN phone DROP NOT NULL;
