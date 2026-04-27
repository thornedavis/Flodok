-- Add organizations.display_name for the trading / brand name shown in
-- customer-facing UI (employee portal header, manager dashboard breadcrumb).
--
-- The existing organizations.name continues to hold the legal/registered
-- entity name and is what contracts and signed documents render from.
-- display_name is optional — when null, surfaces fall back to name.
--
-- This pattern fits operators who incorporate under one name (e.g.
-- "PT Foo Bar Indonesia") but operate one or more public brands
-- (e.g. "Burger Joint Bali"). Employees see the brand they actually
-- work for; contracts cite the legal entity that employs them.

alter table public.organizations
  add column if not exists display_name text;
