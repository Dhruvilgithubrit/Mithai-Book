import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [shop, setShop]       = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch shop row for the currently authed user
  const fetchShop = async (userId) => {
    if (!userId) { setShop(null); return null }
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('shop_id', userId)
      .maybeSingle()
    if (error) console.error('fetchShop error:', error)
    setShop(data ?? null)
    return data ?? null
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s)
      if (s?.user) await fetchShop(s.user.id)
      setLoading(false)
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s)
        if (s?.user) await fetchShop(s.user.id)
        else setShop(null)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return data
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const shopData = await fetchShop(data.user.id)
    return { user: data.user, shop: shopData }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setShop(null)
    setSession(null)
  }

  // Called from SetupPage after shop is created, to refresh shop state
  const refreshShop = () => fetchShop(session?.user?.id)

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      shop,
      loading,
      signUp,
      signIn,
      signOut,
      refreshShop,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
