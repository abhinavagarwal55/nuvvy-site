-- Add created_by to service_plans (nullable — existing rows predate this column)
ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
