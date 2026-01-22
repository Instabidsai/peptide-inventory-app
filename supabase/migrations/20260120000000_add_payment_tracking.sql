-- Migration to add payment tracking columns to movements table

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('paid', 'unpaid', 'partial', 'refunded');

-- Add columns to movements table
ALTER TABLE public.movements 
ADD COLUMN payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
ADD COLUMN amount_paid numeric NOT NULL DEFAULT 0,
ADD COLUMN payment_method text,
ADD COLUMN payment_date timestamp with time zone;

-- Add comment
COMMENT ON COLUMN public.movements.payment_status IS 'Status of payment for this movement (sale)';
