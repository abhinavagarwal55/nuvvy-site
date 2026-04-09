-- Add communicated_to_customer flag to requests
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS communicated_to_customer boolean;
