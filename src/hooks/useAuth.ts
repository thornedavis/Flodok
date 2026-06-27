import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { User } from '../types/aliases'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)

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

  async function fetchUser(authId: string) {
    // maybeSingle(): a missing row is a normal "not provisioned yet" state, not
    // an error. App.tsx renders the self-heal screen when session && !user.
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', authId)
      .maybeSingle()
    setUser(data)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email: string, password: string, name: string, orgName: string, inviteToken?: string) {
    // Provisioning is no longer a separate, droppable second await. The org +
    // users row are created atomically with the identity by the
    // on_auth_user_created trigger (migration 164), which reads this metadata
    // from raw_user_meta_data. A network drop here can no longer orphan the
    // account — the trigger runs server-side within the auth.users insert.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          org_name: orgName,
          invite_token: inviteToken ?? null,
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

  return { session, user, loading, recovering, signIn, signUp, signOut, recover }
}
