import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

const UNIT_OPTIONS = ['kg', 'gm', 'litre', 'ml', 'piece', 'packet', 'tin', 'bottle']

export default function AddMaterialPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [name,         setName]         = useState('')
  const [unit,         setUnit]         = useState('kg')
  const [customUnit,   setCustomUnit]   = useState('')
  const [stock,        setStock]        = useState('0')
  const [threshold,    setThreshold]    = useState('')
  const [supplier,     setSupplier]     = useState('')
  const [phone,        setPhone]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  const finalUnit = unit === '__custom__' ? customUnit.trim() : unit

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const cleanName = name.trim()
    if (!cleanName) { setError('Material name is required.'); return }
    if (!finalUnit)  { setError('Please specify a unit.'); return }

    const stockVal     = parseFloat(stock)
    const thresholdVal = parseFloat(threshold)

    if (isNaN(stockVal) || stockVal < 0)     { setError('Opening stock cannot be negative.'); return }
    if (isNaN(thresholdVal) || thresholdVal < 0) { setError('Minimum threshold cannot be negative.'); return }

    setLoading(true)
    try {
      const { error: e } = await supabase.from('raw_materials').insert({
        shop_id:        user.id,
        name:           cleanName,
        unit:           finalUnit,
        current_stock:  stockVal,
        min_threshold:  thresholdVal,
        supplier_name:  supplier.trim() || null,
        supplier_phone: phone.trim()    || null,
        is_active:      true,
      })
      if (e) throw e
      navigate('/kitchen')
    } catch (err) {
      setError(err.message || 'Failed to add material.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8">

        <div className="mb-6">
          <Link to="/kitchen" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Back to Raw Materials
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Add Raw Material</h1>
          <p className="text-gray-500 text-sm mt-1">Track ghee, sugar, dry fruits, and kitchen inventory.</p>
        </div>

        <div className="card shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

            {/* Name */}
            <div>
              <label htmlFor="mat-name" className="label">Material Name *</label>
              <input
                id="mat-name"
                type="text"
                placeholder="e.g. Pure Desi Ghee, Cashews (Kaju), Sugar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input text-base"
                autoFocus
                required
              />
            </div>

            {/* Unit */}
            <div>
              <label className="label">Measurement Unit *</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {UNIT_OPTIONS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                      unit === u
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {u}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setUnit('__custom__')}
                  className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-all col-span-4 ${
                    unit === '__custom__'
                      ? 'bg-orange-50 text-orange-700 border-orange-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Custom unit…
                </button>
              </div>
              {unit === '__custom__' && (
                <input
                  type="text"
                  placeholder="Enter custom unit (e.g. sack, tin, drum)"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="input text-sm mt-1"
                  required
                />
              )}
            </div>

            {/* Opening stock + Threshold */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="mat-stock" className="label">Opening Stock *</label>
                <div className="relative">
                  <input
                    id="mat-stock"
                    type="number"
                    step="0.01"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="input pr-16 text-base font-semibold"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                    {finalUnit || 'unit'}
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="mat-threshold" className="label">
                  Alert Threshold *
                  <span className="ml-1 text-gray-400 normal-case font-normal">(flag warning below this)</span>
                </label>
                <div className="relative">
                  <input
                    id="mat-threshold"
                    type="number"
                    step="0.01"
                    min="0"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="input pr-16 text-base font-semibold"
                    placeholder="e.g. 5"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                    {finalUnit || 'unit'}
                  </span>
                </div>
              </div>
            </div>

            {/* Supplier (optional) */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Supplier Information (Optional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mat-supplier" className="label">Supplier / Trader Name</label>
                  <input
                    id="mat-supplier"
                    type="text"
                    placeholder="e.g. Shri Ramji Traders"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="mat-phone" className="label">Contact Phone</label>
                  <input
                    id="mat-phone"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input text-sm"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <Link to="/kitchen" className="btn-secondary flex-1 text-center">Cancel</Link>
              <button
                type="submit"
                id="submit-add-material"
                disabled={loading}
                className="btn-primary flex-1 font-semibold"
              >
                {loading ? 'Adding…' : 'Add Material'}
              </button>
            </div>

          </form>
        </div>
      </main>
    </div>
  )
}
