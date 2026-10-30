import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

// Calculate YYYY-MM-DD from today + days
function calculateExpiry(days) {
  if (!days || isNaN(days) || Number(days) <= 0) return ''
  const d = new Date()
  d.setDate(d.getDate() + Number(days))
  return d.toISOString().split('T')[0]
}

export default function AddItemPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [pricePerKg, setPricePerKg] = useState('')
  const [stockKg, setStockKg] = useState('5.0')
  const [shelfLifeDays, setShelfLifeDays] = useState('5')
  const [expiryDate, setExpiryDate] = useState(() => calculateExpiry(5))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Handle shelf life days change -> auto-update expiry date
  const handleShelfLifeChange = (val) => {
    setShelfLifeDays(val)
    if (val) {
      setExpiryDate(calculateExpiry(val))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validation
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Sweet item name is required.')
      return
    }

    const price = parseFloat(pricePerKg)
    if (isNaN(price) || price <= 0) {
      setError('Price per kg must be greater than ₹0.')
      return
    }

    const stock = parseFloat(stockKg)
    if (isNaN(stock) || stock < 0) {
      setError('Stock cannot be negative.')
      return
    }

    const shelf = parseInt(shelfLifeDays, 10)
    if (isNaN(shelf) || shelf <= 0) {
      setError('Shelf life must be at least 1 day.')
      return
    }

    setLoading(true)

    try {
      const { error: insertErr } = await supabase.from('counter_items').insert({
        shop_id: user.id,
        name: cleanName,
        price_per_kg: price,
        current_stock_kg: stock,
        shelf_life_days: shelf,
        expiry_date: expiryDate || null,
        is_active: true,
      })

      if (insertErr) throw insertErr

      navigate('/counter')
    } catch (err) {
      console.error('Add item error:', err)
      setError(err.message || 'Failed to add item to counter.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8">
        
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link
            to="/counter"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Back to Counter Stock
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Add New Sweet
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Add a finished sweet item to your shop's counter inventory for live tracking and POS billing.
          </p>
        </div>

        {/* Card Form */}
        <div className="card shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            
            {/* Item Name */}
            <div>
              <label htmlFor="item-name" className="label">
                Sweet Item Name *
              </label>
              <input
                id="item-name"
                type="text"
                placeholder="e.g. Kaju Katli, Gulab Jamun, Motichoor Ladoo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input text-base"
                autoFocus
                required
              />
            </div>

            {/* Price & Stock Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Price per kg */}
              <div>
                <label htmlFor="price-per-kg" className="label">
                  Price per kg (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                    ₹
                  </span>
                  <input
                    id="price-per-kg"
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g. 600"
                    value={pricePerKg}
                    onChange={(e) => setPricePerKg(e.target.value)}
                    className="input pl-9 text-base font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Current Stock in kg */}
              <div>
                <label htmlFor="current-stock" className="label">
                  Initial Stock on Counter (kg) *
                </label>
                <div className="relative">
                  <input
                    id="current-stock"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 5.0"
                    value={stockKg}
                    onChange={(e) => setStockKg(e.target.value)}
                    className="input pr-12 text-base font-semibold"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">
                    kg
                  </span>
                </div>
              </div>

            </div>

            {/* Shelf Life & Expiry Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Shelf Life Days */}
              <div>
                <label htmlFor="shelf-life" className="label">
                  Shelf Life (Days) *
                </label>
                <div className="relative">
                  <input
                    id="shelf-life"
                    type="number"
                    min="1"
                    value={shelfLifeDays}
                    onChange={(e) => handleShelfLifeChange(e.target.value)}
                    className="input pr-16 text-base font-semibold"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-xs">
                    days
                  </span>
                </div>
                {/* Presets */}
                <div className="flex gap-1.5 mt-2">
                  {[3, 5, 7, 10, 15].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleShelfLifeChange(String(d))}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                        shelfLifeDays === String(d)
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label htmlFor="expiry-date" className="label">
                  Expiry Date (Optional)
                </label>
                <input
                  id="expiry-date"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="input text-base text-gray-800"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Auto-calculated from shelf life (today + {shelfLifeDays || 0} days)
                </p>
              </div>

            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
              <Link
                to="/counter"
                className="btn-secondary flex-1 text-center"
              >
                Cancel
              </Link>
              <button
                type="submit"
                id="submit-add-item"
                disabled={loading}
                className="btn-primary flex-1 text-center font-semibold"
              >
                {loading ? 'Adding Sweet…' : 'Add Sweet to Counter'}
              </button>
            </div>

          </form>
        </div>

      </main>
    </div>
  )
}
