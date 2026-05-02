// billing — all Stripe interactions live here.
//
// User-facing actions (POST /billing/<action>, Bearer Supabase JWT):
//   checkout    — create or reuse a Stripe Customer for the org, then return
//                 a Checkout Session URL for the Pro graduated price.
//   portal      — return a Customer Portal URL so the org can manage card,
//                 invoices, and cancel.
//   sync-seats  — push the org's current employee count to Stripe as the
//                 subscription_item quantity. Frontend calls this after every
//                 employee add/delete on Pro orgs.
//
// Webhook (POST /billing/webhook, Stripe-Signature header):
//   checkout.session.completed     — link org → customer + subscription
//   customer.subscription.updated  — mirror status, period_end, cancel flag
//   customer.subscription.deleted  — drop org back to Free
//
// All DB writes use the service-role client. Plan/subscription columns are
// never written by client code — only by this function.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17.5.0'
import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'

// ─── Stripe client ─────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(key, {
    apiVersion: '2024-11-20.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// Lookup_key set on the graduated Pro Price in Stripe. Resolved at request
// time so we never embed a price_id in code.
function getProLookupKey(): string {
  return Deno.env.get('STRIPE_PRO_LOOKUP_KEY') ?? 'pro_monthly_idr'
}

// Mirrors PRO_MIN_SEATS in src/lib/pricing.ts. Pro subs are billed for at
// least this many seats even if the org has fewer.
const PRO_MIN_SEATS = 3

// ─── Auth ──────────────────────────────────────────────────────────────────

interface AuthedUser {
  user_id: string
  org_id: string
  role: string
}

async function authenticateUser(
  req: Request,
  admin: SupabaseClient,
): Promise<AuthedUser | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null

  const { data: row } = await admin
    .from('users')
    .select('id, org_id, role')
    .eq('id', data.user.id)
    .single()

  if (!row) return null
  return { user_id: row.id, org_id: row.org_id, role: row.role }
}

function isAdmin(user: AuthedUser): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface OrgRow {
  id: string
  name: string
  plan_tier: 'free' | 'pro'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

async function loadOrg(admin: SupabaseClient, orgId: string): Promise<OrgRow | null> {
  const { data } = await admin
    .from('organizations')
    .select('id, name, plan_tier, stripe_customer_id, stripe_subscription_id')
    .eq('id', orgId)
    .single()
  return (data as OrgRow | null) ?? null
}

// First-checkout user gets billed-to email. For renewals Stripe owns this.
async function findUserEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}

async function ensureCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  org: OrgRow,
  user: AuthedUser,
): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id

  const email = await findUserEmail(admin, user.user_id)
  const customer = await stripe.customers.create({
    name: org.name,
    email: email ?? undefined,
    metadata: { org_id: org.id },
  })

  // Persist immediately so we never accidentally create two customers for
  // one org if the user retries before Checkout completes.
  const { error } = await admin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', org.id)
  if (error) throw new Error(`Failed to persist stripe_customer_id: ${error.message}`)

  return customer.id
}

async function countEmployees(admin: SupabaseClient, orgId: string): Promise<number> {
  const { count, error } = await admin
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) throw new Error(`Failed to count employees: ${error.message}`)
  return count ?? 0
}

function billableQuantity(employeeCount: number): number {
  return Math.max(employeeCount, PRO_MIN_SEATS)
}

// ─── Action: checkout ──────────────────────────────────────────────────────

interface CheckoutRequest {
  success_url: string
  cancel_url: string
  // Optional override for the subscription quantity. If absent we use the
  // org's current employee count. The frontend's upgrade modal lets the
  // user commit to a higher seat count up front so the first invoice
  // matches their planned team size; sync-seats keeps it accurate after.
  seats?: number
}

async function handleCheckout(
  admin: SupabaseClient,
  user: AuthedUser,
  body: CheckoutRequest,
): Promise<Response> {
  if (!isAdmin(user)) {
    return jsonResponse({ error: 'Only owners and admins can manage billing' }, 403)
  }
  if (!body.success_url || !body.cancel_url) {
    return jsonResponse({ error: 'success_url and cancel_url required' }, 400)
  }

  const org = await loadOrg(admin, user.org_id)
  if (!org) return jsonResponse({ error: 'Org not found' }, 404)

  if (org.plan_tier === 'pro' && org.stripe_subscription_id) {
    return jsonResponse({ error: 'Org is already on Pro' }, 409)
  }

  const stripe = getStripe()

  // Find the price by lookup_key so we never hardcode a price_id.
  const prices = await stripe.prices.list({
    lookup_keys: [getProLookupKey()],
    active: true,
    limit: 1,
  })
  const price = prices.data[0]
  if (!price) {
    return jsonResponse({ error: 'Pro price not configured in Stripe' }, 500)
  }

  const customerId = await ensureCustomer(admin, stripe, org, user)
  const employees = await countEmployees(admin, user.org_id)
  if (body.seats !== undefined) {
    if (typeof body.seats !== 'number' || !Number.isFinite(body.seats) || body.seats < 0 || body.seats > 10_000) {
      return jsonResponse({ error: 'Invalid seats value' }, 400)
    }
  }
  const requestedSeats = body.seats ?? employees
  const quantity = billableQuantity(requestedSeats)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: price.id, quantity }],
    success_url: body.success_url,
    cancel_url: body.cancel_url,
    client_reference_id: org.id,
    subscription_data: {
      metadata: { org_id: org.id },
    },
    // We surface the calculator on our pricing page; turning this off keeps
    // the Stripe Checkout UI clean and avoids "where do I edit the qty?"
    // confusion (seats track employee count, not user input).
    allow_promotion_codes: true,
  })

  return jsonResponse({ url: session.url, session_id: session.id })
}

// ─── Action: portal ────────────────────────────────────────────────────────

interface PortalRequest {
  return_url: string
  // Optional Stripe portal "flow" — opens the portal directly to a specific
  // task instead of the default billing landing page.
  //   payment_method_update — go straight to "update card"
  //   subscription_cancel   — go straight to the cancellation flow
  //   undefined             — default landing (billing info, invoices, etc.)
  flow?: 'payment_method_update' | 'subscription_cancel'
}

async function handlePortal(
  admin: SupabaseClient,
  user: AuthedUser,
  body: PortalRequest,
): Promise<Response> {
  if (!isAdmin(user)) {
    return jsonResponse({ error: 'Only owners and admins can manage billing' }, 403)
  }
  if (!body.return_url) {
    return jsonResponse({ error: 'return_url required' }, 400)
  }

  const org = await loadOrg(admin, user.org_id)
  if (!org) return jsonResponse({ error: 'Org not found' }, 404)
  if (!org.stripe_customer_id) {
    return jsonResponse({ error: 'No Stripe customer on file' }, 400)
  }

  const stripe = getStripe()

  // deno-lint-ignore no-explicit-any
  const params: any = {
    customer: org.stripe_customer_id,
    return_url: body.return_url,
  }
  if (body.flow === 'payment_method_update') {
    params.flow_data = { type: 'payment_method_update' }
  } else if (body.flow === 'subscription_cancel') {
    if (!org.stripe_subscription_id) {
      return jsonResponse({ error: 'No active subscription to cancel' }, 400)
    }
    params.flow_data = {
      type: 'subscription_cancel',
      subscription_cancel: { subscription: org.stripe_subscription_id },
    }
  }

  const session = await stripe.billingPortal.sessions.create(params)
  return jsonResponse({ url: session.url })
}

// ─── Action: update-seats ──────────────────────────────────────────────────

interface UpdateSeatsRequest {
  seats: number
}

async function handleUpdateSeats(
  admin: SupabaseClient,
  user: AuthedUser,
  body: UpdateSeatsRequest,
): Promise<Response> {
  if (!isAdmin(user)) {
    return jsonResponse({ error: 'Only owners and admins can manage billing' }, 403)
  }

  const org = await loadOrg(admin, user.org_id)
  if (!org) return jsonResponse({ error: 'Org not found' }, 404)
  if (!org.stripe_subscription_id) {
    return jsonResponse({ error: 'Org is not on a Pro subscription' }, 400)
  }

  if (typeof body.seats !== 'number' || !Number.isFinite(body.seats) || body.seats < PRO_MIN_SEATS || body.seats > 10_000) {
    return jsonResponse({ error: `Seats must be between ${PRO_MIN_SEATS} and 10000` }, 400)
  }

  // SERVER-SIDE FLOOR: never allow seats below the current employee count.
  // This is the load-bearing fraud safeguard — frontend already enforces it,
  // but a malicious client could POST arbitrary values.
  const employees = await countEmployees(admin, user.org_id)
  const floor = billableQuantity(employees)
  if (body.seats < floor) {
    return jsonResponse({
      error: `Cannot reduce below the current employee count. You have ${employees} employees; minimum billable seats is ${floor}. Remove employees in the dashboard first.`,
      code: 'below_employee_count',
      floor,
      employees,
    }, 400)
  }

  const stripe = getStripe()
  const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
  const item = sub.items.data[0]
  if (!item) {
    return jsonResponse({ error: 'Subscription has no items' }, 500)
  }

  if (item.quantity === body.seats) {
    return jsonResponse({ ok: true, quantity: body.seats, unchanged: true })
  }

  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity: body.seats }],
    proration_behavior: 'create_prorations',
  })

  return jsonResponse({ ok: true, quantity: body.seats, previous: item.quantity })
}

// ─── Action: sync-seats ────────────────────────────────────────────────────

async function handleSyncSeats(
  admin: SupabaseClient,
  user: AuthedUser,
): Promise<Response> {
  // Anyone in the org can trigger this — it's a side effect of normal employee
  // CRUD, not a billing decision. Admin-only would block legitimate writes.
  const org = await loadOrg(admin, user.org_id)
  if (!org) return jsonResponse({ error: 'Org not found' }, 404)

  // Free orgs have no Stripe sub yet — nothing to sync. The hard cap on
  // adding employees lives in the frontend; this is just a no-op safety net.
  if (org.plan_tier !== 'pro' || !org.stripe_subscription_id) {
    return jsonResponse({ ok: true, skipped: 'not_pro' })
  }

  const stripe = getStripe()
  const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
  const item = sub.items.data[0]
  if (!item) {
    return jsonResponse({ error: 'Subscription has no items' }, 500)
  }

  const employees = await countEmployees(admin, user.org_id)
  const desiredFloor = billableQuantity(employees)
  // ONLY-INCREASE policy: sync-seats never auto-reduces quantity. If the user
  // committed to N seats at upgrade and now has fewer employees, we keep them
  // at N until they explicitly use Adjust to lower it. Otherwise adding the
  // first employee post-upgrade would surprise-reduce their bill below what
  // they signed up for.
  const newQuantity = Math.max(item.quantity ?? 0, desiredFloor)
  if (item.quantity === newQuantity) {
    return jsonResponse({ ok: true, quantity: newQuantity, unchanged: true })
  }

  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity: newQuantity }],
    proration_behavior: 'create_prorations',
  })

  return jsonResponse({ ok: true, quantity: newQuantity, previous: item.quantity })
}

// ─── Action: payment-method (read default card) ────────────────────────────

async function handleGetPaymentMethod(
  admin: SupabaseClient,
  user: AuthedUser,
): Promise<Response> {
  const org = await loadOrg(admin, user.org_id)
  if (!org?.stripe_customer_id) {
    return jsonResponse({ payment_method: null })
  }

  const stripe = getStripe()
  const customer = await stripe.customers.retrieve(org.stripe_customer_id)
  if (customer.deleted) {
    return jsonResponse({ payment_method: null })
  }

  // Stripe checks the subscription's own default first, then falls back to
  // the customer's invoice_settings default. We mirror that resolution order.
  let pmRef: string | Stripe.PaymentMethod | null = null
  if (org.stripe_subscription_id) {
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
    pmRef = sub.default_payment_method ?? null
  }
  if (!pmRef) {
    pmRef = (customer as Stripe.Customer).invoice_settings?.default_payment_method ?? null
  }
  if (!pmRef) return jsonResponse({ payment_method: null })

  const pmId = typeof pmRef === 'string' ? pmRef : pmRef.id
  const pm = await stripe.paymentMethods.retrieve(pmId)
  if (pm.type !== 'card' || !pm.card) {
    return jsonResponse({ payment_method: null })
  }

  return jsonResponse({
    payment_method: {
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year,
    },
  })
}

// ─── Webhook ───────────────────────────────────────────────────────────────

async function handleWebhook(req: Request, admin: SupabaseClient): Promise<Response> {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return jsonResponse({ error: 'Missing stripe-signature header' }, 400)

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!secret) return jsonResponse({ error: 'STRIPE_WEBHOOK_SECRET not set' }, 500)

  const body = await req.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret)
  } catch (e) {
    console.error('Webhook signature verification failed:', e)
    return jsonResponse({ error: 'Invalid signature' }, 400)
  }

  console.log(`Stripe event: ${event.type} (${event.id})`)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(admin, stripe, event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await onSubscriptionUpserted(admin, event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(admin, event.data.object as Stripe.Subscription)
        break
      default:
        // Unhandled event types are still acked (200) so Stripe doesn't retry.
        console.log(`Stripe event ignored: ${event.type}`)
    }
  } catch (e) {
    console.error(`Failed to handle ${event.type}:`, e)
    return jsonResponse({ error: 'Handler failed' }, 500)
  }

  return jsonResponse({ received: true })
}

async function onCheckoutCompleted(
  admin: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const orgId = session.client_reference_id ?? session.metadata?.org_id
  if (!orgId) {
    console.error('checkout.session.completed missing org_id')
    return
  }
  if (!session.subscription) {
    console.log('Non-subscription checkout, skipping')
    return
  }

  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  const sub = await stripe.subscriptions.retrieve(subId)

  await applySubscription(admin, orgId, sub)
}

async function onSubscriptionUpserted(admin: SupabaseClient, sub: Stripe.Subscription) {
  const orgId = sub.metadata?.org_id
  if (!orgId) {
    // Fall back to lookup-by-customer in case metadata is missing.
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    const { data } = await admin
      .from('organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single()
    if (!data) {
      console.error(`No org found for subscription ${sub.id} (customer ${customerId})`)
      return
    }
    await applySubscription(admin, data.id, sub)
    return
  }
  await applySubscription(admin, orgId, sub)
}

async function applySubscription(admin: SupabaseClient, orgId: string, sub: Stripe.Subscription) {
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null

  // Stripe's "active" cluster (active/trialing/past_due) keeps Pro lit. Anything
  // else (canceled, unpaid, incomplete*) drops us to Free at the app layer.
  const proStatuses = new Set(['active', 'trialing', 'past_due'])
  const planTier = proStatuses.has(sub.status) ? 'pro' : 'free'

  const item = sub.items.data[0]
  const quantity = item?.quantity ?? null

  // Track past_due_since for app-side dunning timing. We only stamp it on
  // the FIRST transition into past_due, not on subsequent webhook re-fires
  // while still past_due — otherwise a webhook retry would reset the clock
  // and the user would never progress to read-only mode.
  const update: Record<string, unknown> = {
    plan_tier: planTier,
    subscription_status: sub.status,
    stripe_subscription_id: sub.id,
    subscription_quantity: quantity,
    current_period_end: periodEnd,
    cancel_at_period_end: sub.cancel_at_period_end,
  }

  if (sub.status === 'past_due') {
    const { data: current } = await admin
      .from('organizations')
      .select('past_due_since')
      .eq('id', orgId)
      .single()
    if (!current?.past_due_since) {
      update.past_due_since = new Date().toISOString()
    }
  } else {
    // Any non-past_due status clears the clock. Includes active (paid),
    // trialing, canceled, etc.
    update.past_due_since = null
  }

  const { error } = await admin
    .from('organizations')
    .update(update)
    .eq('id', orgId)

  if (error) throw new Error(`Failed to update org ${orgId}: ${error.message}`)
  console.log(`Org ${orgId}: plan=${planTier} status=${sub.status} qty=${quantity} cap=${sub.cancel_at_period_end}`)
}

async function onSubscriptionDeleted(admin: SupabaseClient, sub: Stripe.Subscription) {
  const orgId = sub.metadata?.org_id
  const where = orgId
    ? { column: 'id', value: orgId }
    : { column: 'stripe_subscription_id', value: sub.id }

  const { error } = await admin
    .from('organizations')
    .update({
      plan_tier: 'free',
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
    })
    .eq(where.column, where.value)

  if (error) throw new Error(`Failed to clear sub for org: ${error.message}`)
  console.log(`Org dropped to Free (sub ${sub.id} deleted)`)
}

// ─── Router ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  // Edge function paths arrive as /billing/<action>; strip the function prefix.
  const action = url.pathname.replace(/^\/billing\/?/, '').replace(/\/$/, '')

  // Webhook is the only route that doesn't use Supabase auth.
  if (action === 'webhook') {
    if (req.method !== 'POST') return jsonResponse({ error: 'POST required' }, 405)
    return handleWebhook(req, getSupabaseAdmin())
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'POST required' }, 405)

  const admin = getSupabaseAdmin()
  const user = await authenticateUser(req, admin)
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  try {
    switch (action) {
      case 'checkout':
        return await handleCheckout(admin, user, body as unknown as CheckoutRequest)
      case 'portal':
        return await handlePortal(admin, user, body as unknown as PortalRequest)
      case 'sync-seats':
        return await handleSyncSeats(admin, user)
      case 'update-seats':
        return await handleUpdateSeats(admin, user, body as unknown as UpdateSeatsRequest)
      case 'payment-method':
        return await handleGetPaymentMethod(admin, user)
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 404)
    }
  } catch (e) {
    console.error(`billing/${action} failed:`, e)
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'Internal error' },
      500,
    )
  }
})
