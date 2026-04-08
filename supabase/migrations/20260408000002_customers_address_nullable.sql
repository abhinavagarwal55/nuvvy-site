-- Make customers.address nullable — ops onboarding doesn't require address upfront.
ALTER TABLE public.customers ALTER COLUMN address DROP NOT NULL;
