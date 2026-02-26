-- Add missing notes and route columns to protocol_items.
-- These columns are referenced by auto-protocol generation and AI chat functions.
ALTER TABLE public.protocol_items
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS route text;
