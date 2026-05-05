-- Strengthen the evidentiary value of contract signatures by capturing the
-- context the signer was in when they signed: their device, the exact
-- consent wording they saw, a hash of the document content at that moment,
-- and a verified contact channel.
--
-- All columns are nullable so existing signatures (which lack this context)
-- remain valid records. New signatures will populate them.
--
-- IP address is captured at the column level but is left null by current
-- client-side sign flows because the browser cannot read its own public IP
-- reliably. A future server endpoint (Cloudflare Worker or Supabase Edge
-- Function) can populate it from request headers.

alter table public.contract_signatures
  add column ip_address text,
  add column user_agent text,
  add column consent_text text,
  add column document_hash text,
  add column signer_email text,
  add column signer_phone text;
