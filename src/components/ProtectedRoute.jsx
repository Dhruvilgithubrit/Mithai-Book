import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps any route that requires authentication.
 * - If auth is still loading → show a full-screen spinner
 * - If user is not logged in → redirect to /login
 * - If user is logged in but hasn't completed setup → redirect to /setup
 *   (except when the protected route IS /setup, to avoid redirect loops)
 */
export default function ProtectedRoute({ children }) {
  const { user, shop, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center text-xl font-bold shadow-sm">
          M
        </div>
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-xs">Loading MithaiBook…</p>
      </div>
    )
  }

  // Not authenticated → go to login, preserving where they wanted to go
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Authenticated but setup not done → force /setup (unless already there)
  if ((!shop || !shop.setup_done) && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />
  }

  // Setup done but landed on /setup again → go to dashboard
  if (shop?.setup_done && location.pathname === '/setup') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
