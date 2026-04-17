import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { User } from '../types/database'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

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
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', authId)
      .single()
    setUser(data)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email: string, password: string, name: string, orgName: string, inviteToken?: string) {
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError || !authData.user) return { error: authError }

    // Create org + user profile via security definer function (bypasses RLS).
    // When inviteToken is supplied, handle_signup joins the existing org instead.
    const { error: setupError } = await supabase.rpc('handle_signup', {
      user_id: authData.user.id,
      user_email: email,
      user_name: name,
      org_name: orgName,
      invite_token: inviteToken ?? null,
    })
    if (setupError) return { error: setupError }

    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { session, user, loading, signIn, signUp, signOut }
}
