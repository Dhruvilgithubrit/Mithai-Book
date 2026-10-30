import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Demo seed data
const DEMO_COUNTER_ITEMS = [
  { name: 'Kaju Katli',       price_per_kg: 1200, shelf_life_days: 7, current_stock_kg: 8.0  },
  { name: 'Motichoor Laddu',  price_per_kg: 600,  shelf_life_days: 5, current_stock_kg: 12.0 },
  { name: 'Gulab Jamun',      price_per_kg: 400,  shelf_life_days: 3, current_stock_kg: 10.0 },
  { name: 'Besan Barfi',      price_per_kg: 500,  shelf_life_days: 6, current_stock_kg: 6.0  },
  { name: 'Ghevar',           price_per_kg: 800,  shelf_life_days: 4, current_stock_kg: 5.0  },
]

const DEMO_RAW_MATERIALS = [
  { name: 'Cashews (Kaju)',    unit: 'kg',    current_stock: 10.0,   min_threshold: 3.0   },
  { name: 'Khoya (Mawa)',      unit: 'kg',    current_stock: 15.0,   min_threshold: 5.0   },
  { name: 'Sugar',             unit: 'kg',    current_stock: 20.0,   min_threshold: 8.0   },
  { name: 'Ghee',              unit: 'litre', current_stock: 8.0,    min_threshold: 3.0   },
  { name: 'Besan',             unit: 'kg',    current_stock: 12.0,   min_threshold: 4.0   },
  { name: 'Maida',             unit: 'kg',    current_stock: 10.0,   min_threshold: 3.0   },
  { name: 'Cardamom Powder',   unit: 'gm',    current_stock: 500.0,  min_threshold: 100.0 },
  { name: 'Rose Water',        unit: 'ml',    current_stock: 1000.0, min_threshold: 200.0 },
]

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function SetupPage() {
  const { user, refreshShop } = useAuth()
  const navigate = useNavigate()

  const [shopName,   setShopName]   = useState('')
  const [ownerName,  setOwnerName]  = useState('')
  const [city,       setCity]       = useState('')
  const [error,      setError]      = useState('')
  const [loading,  setLoading]    = useState(false)
  const [progress, setProgress]   = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!shopName.trim())  return setError('Shop name is required.')
    if (!ownerName.trim()) return setError('Owner name is required.')
    if (!city.trim())      return setError('City is required.')

    setLoading(true)
    try {
      const shopId = user.id

      setProgress('Creating your shop profile…')
      const { error: shopErr } = await supabase
        .from('shops')
        .insert({
          shop_id:    shopId,
          shop_name:  shopName.trim(),
          owner_name: ownerName.trim(),
          city:       city.trim(),
          setup_done: true,
        })
      if (shopErr) throw shopErr

      setProgress('Adding demo sweets to counter…')
      const counterRows = DEMO_COUNTER_ITEMS.map((item) => ({
        shop_id:          shopId,
        name:             item.name,
        price_per_kg:     item.price_per_kg,
        shelf_life_days:  item.shelf_life_days,
        current_stock_kg: item.current_stock_kg,
        expiry_date:      addDays(item.shelf_life_days),
        is_active:        true,
      }))
      const { error: counterErr } = await supabase
        .from('counter_items')
        .insert(counterRows)
      if (counterErr) throw counterErr

      setProgress('Adding demo kitchen materials…')
      const rawRows = DEMO_RAW_MATERIALS.map((m) => ({
        shop_id:       shopId,
        name:          m.name,
        unit:          m.unit,
        current_stock: m.current_stock,
        min_threshold: m.min_threshold,
        is_active:     true,
      }))
      const { error: rawErr } = await supabase
        .from('raw_materials')
        .insert(rawRows)
      if (rawErr) throw rawErr

      setProgress('Readying dashboard…')
      await refreshShop()
      navigate('/dashboard')

    } catch (err) {
      console.error('Setup error:', err)
      setError(err.message ?? 'Setup failed. Please try again.')
      setLoading(false)
      setProgress('')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center text-xl font-bold shadow-sm">
            M
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Set up your sweet shop</h1>
          <p className="text-gray-500 text-xs text-center max-w-sm">
            Quick 1-step profile configuration. We'll automatically seed demo sweets and ingredients for you.
          </p>
        </div>

        {/* Card */}
        <div className="card shadow-sm p-7 sm:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

            {/* Shop Name */}
            <div>
              <label htmlFor="setup-shopname" className="label">
                Shop name
              </label>
              <input
                id="setup-shopname"
                type="text"
                placeholder="e.g. Shree Ganesh Mithai"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="input text-base"
                autoFocus
                required
              />
            </div>

            {/* Owner Name */}
            <div>
              <label htmlFor="setup-ownername" className="label">
                Owner name
              </label>
              <input
                id="setup-ownername"
                type="text"
                placeholder="e.g. Rajesh Kumar"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="input text-base"
                required
              />
            </div>

            {/* City */}
            <div>
              <label htmlFor="setup-city" className="label">
                City / Town
              </label>
              <input
                id="setup-city"
                type="text"
                placeholder="e.g. Ahmedabad, Mumbai, Jaipur"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="input text-base"
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

            {/* Seed info box */}
            {!loading && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Sample Data Preloaded
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                  <div>
                    <p className="font-semibold text-gray-800 mb-1">Counter Sweets</p>
                    <p>Kaju Katli, Motichoor Laddu, Gulab Jamun, Besan Barfi, Ghevar</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 mb-1">Raw Materials</p>
                    <p>Cashews, Khoya, Sugar, Ghee, Besan, Cardamom, Rose Water</p>
                  </div>
                </div>
              </div>
            )}

            {/* Progress status */}
            {loading && (
              <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg p-3.5">
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-orange-900 text-xs font-semibold">{progress}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="setup-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-base font-semibold min-h-12"
            >
              {loading ? 'Setting up…' : 'Complete Setup & Open Dashboard'}
            </button>

          </form>
        </div>

        <p className="text-center text-gray-400 mt-6 text-xs">
          You can edit shop details and inventory items anytime.
        </p>
      </div>
    </div>
  )
}
