import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email.trim())    return setError('Email is required.')
    if (!password)        return setError('Password is required.')

    setLoading(true)
    try {
      const { shop } = await signIn(email.trim(), password)
      if (!shop || !shop.setup_done) {
        navigate('/setup')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      const msg = err.message ?? ''
      if (msg.includes('Email not confirmed')) {
        setError(
          'Your email is not confirmed yet. ' +
          'Please disable "Confirm email" in Supabase Auth settings, ' +
          'or check your inbox for a confirmation link.'
        )
      } else if (msg.includes('Invalid login credentials')) {
        setError('Wrong email or password. Please try again.')
      } else {
        setError(msg || 'Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center text-xl font-bold shadow-sm">
            M
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">MithaiBook</h1>
          <p className="text-gray-500 text-xs">Sweet Shop Operating System</p>
        </div>

        {/* Card */}
        <div className="card shadow-sm p-7 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">Sign in to your shop</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

            {/* Email */}
            <div>
              <label htmlFor="login-email" className="label">Email address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="owner@sweetshop.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="label">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
              />
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3"
              >
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-base font-semibold min-h-11 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging in…
                </span>
              ) : 'Log In'}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center text-gray-500 mt-6 text-sm">
          New shop owner?{' '}
          <Link to="/signup" className="text-orange-600 font-semibold hover:underline">
            Register your shop
          </Link>
        </p>
      </div>
    </div>
  )
}
