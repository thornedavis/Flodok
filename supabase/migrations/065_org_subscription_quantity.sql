-- subscription_quantity mirrors the Stripe subscription_item.quantity for the
-- org's Pro subscription. Written by the Stripe webhook handler in the
-- billing edge function on every customer.subscription.* event.
--
-- Why we store it: the BillingTab UI needs to display the actual amount the
-- customer is being charged, which can differ from the local employee count.
-- The user might commit to N seats at upgrade time even before adding the
-- corresponding employees; sync-seats only ever increases (not decreases) so
-- the committed quantity sticks until they explicitly Adjust it down.

alter table public.organizations
  add column if not exists subscription_quantity integer;
