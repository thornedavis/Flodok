import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { User, Organization } from '../types/aliases'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)

  // Declared before the effect that calls it (function declarations hoist, so
  // this is a pure source-order move) to satisfy react-hooks/immutability.
  async function fetchUser(authId: string) {
    // maybeSingle(): a missing row is a normal "not provisioned yet" state, not
    // an error. App.tsx renders the self-heal screen when session && !user.
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', authId)
      .maybeSingle()
    setUser(data)
    // Load the org too, so App.tsx can gate the first-run onboarding wizard on
    // organizations.onboarding_completed_at and seed the wizard's fields.
    if (data?.org_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', data.org_id)
        .maybeSingle()
      setOrg(orgData)
    } else {
      setOrg(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUser(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchUser(session.user.id)
      else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(
    email: string,
    password: string,
    name: string,
    orgName: string,
    opts?: { inviteToken?: string; setupMode?: 'owner' | 'on_behalf' },
  ) {
    // Provisioning is no longer a separate, droppable second await. The org +
    // users row are created atomically with the identity by the
    // on_auth_user_created trigger (migrations 164/179), which reads this
    // metadata from raw_user_meta_data. A network drop here can no longer orphan
    // the account — the trigger runs server-side within the auth.users insert.
    // setup_mode='on_behalf' provisions the signer as admin of an ownerless org
    // (the real owner claims via email); default 'owner' is unchanged. Note:
    // setup_mode only applies to NEW-org signups — the invite path (invite_token)
    // takes precedence in the trigger (179) and uses the invite's role instead.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          org_name: orgName,
          invite_token: opts?.inviteToken ?? null,
          setup_mode: opts?.setupMode ?? 'owner',
        },
      },
    })
    return { error }
  }

  // Self-heal for any session that has no users row (a pre-trigger orphan, or
  // the trigger's exception fallback fired). Re-runs the idempotent
  // handle_signup recovery primitive, then refetches. Safe to call repeatedly —
  // it returns the existing org and inserts nothing if already provisioned.
  // Used by App.tsx's account-setup screen.
  async function recover() {
    const { data: { session: current } } = await supabase.auth.getSession()
    if (!current) return { error: new Error('No active session') }

    const meta = (current.user.user_metadata ?? {}) as {
      name?: string
      org_name?: string
      invite_token?: string | null
    }
    setRecovering(true)
    const { error } = await supabase.rpc('handle_signup', {
      user_id: current.user.id,
      user_email: current.user.email ?? '',
      user_name: meta.name ?? current.user.email?.split('@')[0] ?? 'User',
      org_name: meta.org_name ?? '',
      invite_token: meta.invite_token ?? null,
    })
    if (!error) await fetchUser(current.user.id)
    setRecovering(false)
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { session, user, org, loading, recovering, signIn, signUp, signOut, recover }
}
