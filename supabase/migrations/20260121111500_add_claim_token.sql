-- Add claim_token and expiration to contacts for robust invites
ALTER TABLE "contacts" 
ADD COLUMN IF NOT EXISTS "claim_token" UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS "claim_token_expires_at" TIMESTAMPTZ DEFAULT (now() + interval '7 days');

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS "contacts_claim_token_idx" ON "contacts" ("claim_token");

-- Ensure it's unique to prevent collisions (though uuid is practically unique)
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_claim_token_unique" UNIQUE ("claim_token");
