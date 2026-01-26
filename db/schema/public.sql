-- =========================================================
-- CONTEXT-ONLY SCHEMA SNAPSHOT
-- Source: Supabase Schema Visualizer
-- Purpose: AI + developer context ONLY
-- ⚠️ Do NOT run or apply this file
-- =========================================================
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- ENUM DEFINITIONS (approximate, for AI context)

-- customer_status
-- values: 'ACTIVE', 'INACTIVE'

-- shortlist_status
-- values: 'DRAFT', 'PUBLISHED', 'ARCHIVED'

-- actor_role / created_by_role
-- values: 'horticulturist', 'admin', 'system'

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_number text NOT NULL,
  address text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status USER-DEFINED NOT NULL DEFAULT 'ACTIVE'::customer_status,
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  shortlist_id uuid,
  version_number integer,
  actor_role USER-DEFINED,
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_shortlist_id_fkey FOREIGN KEY (shortlist_id) REFERENCES public.shortlists(id)
);
CREATE TABLE public.internal_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'editor'::text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT internal_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.plants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  airtable_id text UNIQUE,
  name text NOT NULL,
  scientific_name text,
  category text,
  light text,
  air_purifier boolean NOT NULL DEFAULT false,
  image_url text,
  thumbnail_url text,
  toxicity text,
  watering_requirement text,
  horticulturist_notes text,
  sync_status text DEFAULT 'pending'::text,
  last_synced_at timestamp with time zone,
  source_updated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  image_storage_url text,
  thumbnail_storage_url text,
  fertilization_requirement text,
  soil_mix text,
  lifespan text,
  can_be_procured boolean,
  price_band text,
  procurement_notes text,
  CONSTRAINT plants_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shortlist_draft_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL,
  plant_id uuid NOT NULL,
  why_picked_for_balcony text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  quantity integer CHECK (quantity IS NULL OR quantity > 0),
  note text,
  CONSTRAINT shortlist_draft_items_pkey PRIMARY KEY (id),
  CONSTRAINT shortlist_draft_items_shortlist_id_fkey FOREIGN KEY (shortlist_id) REFERENCES public.shortlists(id),
  CONSTRAINT shortlist_draft_items_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plants(id)
);
CREATE TABLE public.shortlist_public_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL,
  token_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_accessed_at timestamp with time zone,
  CONSTRAINT shortlist_public_links_pkey PRIMARY KEY (id),
  CONSTRAINT shortlist_public_links_shortlist_id_fkey FOREIGN KEY (shortlist_id) REFERENCES public.shortlists(id)
);
CREATE TABLE public.shortlist_version_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shortlist_version_id uuid NOT NULL,
  plant_id uuid,
  why_picked_for_balcony text,
  horticulturist_note text,
  approved boolean NOT NULL,
  quantity integer,
  midpoint_price integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT shortlist_version_items_pkey PRIMARY KEY (id),
  CONSTRAINT shortlist_version_items_shortlist_version_id_fkey FOREIGN KEY (shortlist_version_id) REFERENCES public.shortlist_versions(id)
);
CREATE TABLE public.shortlist_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL,
  version_number integer NOT NULL,
  status_at_time USER-DEFINED NOT NULL,
  created_by_role USER-DEFINED NOT NULL,
  estimated_total integer NOT NULL,
  customer_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shortlist_versions_pkey PRIMARY KEY (id),
  CONSTRAINT shortlist_versions_shortlist_id_fkey FOREIGN KEY (shortlist_id) REFERENCES public.shortlists(id)
);
CREATE TABLE public.shortlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  title text,
  description text,
  status USER-DEFINED NOT NULL DEFAULT 'DRAFT'::shortlist_status,
  current_version_number integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  customer_uuid uuid NOT NULL,
  CONSTRAINT shortlists_pkey PRIMARY KEY (id),
  CONSTRAINT fk_shortlists_customer FOREIGN KEY (customer_uuid) REFERENCES public.customers(id)
);
