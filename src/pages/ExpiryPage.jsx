import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function daysDifference(dateStr) {
  if (!dateStr) return null
  const today = new Date(todayISO())
  const target = new Date(dateStr)
  const diffTime = target - today
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function formatINR(val) {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

export default function ExpiryPage() {
  const { user } = useAuth()

  const [counterItems, setCounterItems] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'expired' | 'today' | 'soon' | 'fresh'

  // Stock action modal (discard/adjust)
  const [selectedItem, setSelectedItem] = useState(null)
  const [discardStock, setDiscardStock] = useState('')
  const [updating, setUpdating] = useState(false)

  const fetchData = async () => {
    if (!user) return
    setError('')
    try {
      const [itemsRes, batchesRes] = await Promise.all([
        supabase
          .from('counter_items')
          .select('*')
          .eq('shop_id', user.id)
          .eq('is_active', true)
          .order('expiry_date', { ascending: true }),
        supabase
          .from('production_batches')
          .select('*')
          .eq('shop_id', user.id)
          .eq('status', 'in_progress')
          .order('expiry_date', { ascending: true }),
      ])

      if (itemsRes.error) throw itemsRes.error
      if (batchesRes.error) throw batchesRes.error

      setCounterItems(itemsRes.data || [])
      setBatches(batchesRes.data || [])
    } catch (err) {
      console.error('Fetch expiry error:', err)
      setError('Failed to load shelf life data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [user])

  // Categorize items
  const itemsWithStatus = counterItems.map((item) => {
    const diff = daysDifference(item.expiry_date)
    let status = 'fresh'
    if (diff === null) status = 'no_date'
    else if (diff < 0) status = 'expired'
    else if (diff === 0) status = 'today'
    else if (diff <= 3) status = 'soon'

    return { ...item, daysDiff: diff, expiryStatus: status }
  })

  // Quick Discard/Write-off stock
  const handleDiscardStock = async (e) => {
    e.preventDefault()
    if (!selectedItem) return

    const deductQty = parseFloat(discardStock) || 0
    const newStock = Math.max(0, Number(selectedItem.current_stock_kg) - deductQty)

    setUpdating(true)
    try {
      const { error: updErr } = await supabase
        .from('counter_items')
        .update({ current_stock_kg: newStock })
        .eq('id', selectedItem.id)
        .eq('shop_id', user.id)

      if (updErr) throw updErr

      setCounterItems((prev) =>
        prev.map((i) => (i.id === selectedItem.id ? { ...i, current_stock_kg: newStock } : i))
      )
      setSelectedItem(null)
      setDiscardStock('')
    } catch (err) {
      console.error('Discard stock error:', err)
      setError(err.message || 'Failed to update stock.')
    } finally {
      setUpdating(false)
    }
  }

  // Summary Metrics
  const expiredCount = itemsWithStatus.filter((i) => i.expiryStatus === 'expired').length
  const todayCount = itemsWithStatus.filter((i) => i.expiryStatus === 'today').length
  const soonCount = itemsWithStatus.filter((i) => i.expiryStatus === 'soon').length

  const valueAtRisk = itemsWithStatus
    .filter((i) => ['expired', 'today', 'soon'].includes(i.expiryStatus))
    .reduce((s, i) => s + Number(i.current_stock_kg) * Number(i.price_per_kg), 0)

  const filteredItems = itemsWithStatus.filter((i) => {
    if (filter === 'all') return true
    return i.expiryStatus === filter
  })

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Expiry & Shelf Life Tracking
              </h1>
              {expiredCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {expiredCount} Expired
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Prevent inventory spoilage, track tray shelf-lives, and minimize sweet wastage
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/counter" className="btn-secondary text-sm font-semibold flex items-center gap-2">
              <span>Counter Inventory →</span>
            </Link>
          </div>
        </div>

        {/* ── Summary Stats Row ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <span className="label mb-1">Value at Spoilage Risk</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-red-600">₹{formatINR(valueAtRisk)}</p>
            <p className="text-xs text-gray-500 mt-1">Expired or due in ≤ 3 days</p>
          </div>

          <div className="card">
            <span className="label mb-1">Expired Sweets</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-red-600">{expiredCount}</p>
            <p className="text-xs text-gray-500 mt-1">Needs removal from counter</p>
          </div>

          <div className="card">
            <span className="label mb-1">Expiring Today</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-600">{todayCount}</p>
            <p className="text-xs text-gray-500 mt-1">Priority for sale / discount</p>
          </div>

          <div className="card">
            <span className="label mb-1">Expiring in 1-3 Days</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-orange-600">{soonCount}</p>
            <p className="text-xs text-gray-500 mt-1">Monitor daily</p>
          </div>
        </div>

        {/* ── Filter Tabs ────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {[
            { key: 'all', label: `All Sweets (${counterItems.length})` },
            { key: 'expired', label: `Expired (${expiredCount})` },
            { key: 'today', label: `Expiring Today (${todayCount})` },
            { key: 'soon', label: `Expiring Soon (${soonCount})` },
            { key: 'fresh', label: `Fresh` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${
                filter === tab.key
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Error ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Items Grid ────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-400">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Evaluating shelf life dates…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <h3 className="text-lg font-bold text-gray-900">No sweets in this category</h3>
            <p className="text-gray-500 text-sm mt-1">All other items have sufficient shelf life.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item) => {
              const stock = Number(item.current_stock_kg)
              const rate = Number(item.price_per_kg)
              const totalVal = stock * rate

              return (
                <div
                  key={item.id}
                  className={`card p-5 flex flex-col justify-between transition-all ${
                    item.expiryStatus === 'expired'
                      ? 'border-red-300 bg-red-50/20'
                      : item.expiryStatus === 'today'
                      ? 'border-amber-300 bg-amber-50/20'
                      : item.expiryStatus === 'soon'
                      ? 'border-orange-200 bg-orange-50/10'
                      : 'border-gray-200'
                  }`}
                >
                  <div>
                    {/* Header: Sweet Name & Expiry Badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-bold text-gray-900 text-base leading-snug">{item.name}</h3>
                      <span
                        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          item.expiryStatus === 'expired'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : item.expiryStatus === 'today'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : item.expiryStatus === 'soon'
                            ? 'bg-orange-100 text-orange-800 border-orange-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {item.expiryStatus === 'expired'
                          ? `Expired (${Math.abs(item.daysDiff)}d ago)`
                          : item.expiryStatus === 'today'
                          ? 'Expires Today'
                          : item.expiryStatus === 'soon'
                          ? `${item.daysDiff} days left`
                          : 'Fresh'}
                      </span>
                    </div>

                    {/* Stock & Value on Tray */}
                    <div className="mb-3">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                          {stock.toFixed(1)}
                        </span>
                        <span className="text-gray-500 text-sm font-semibold">kg on counter</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Batch Value: <strong className="text-gray-900">₹{formatINR(totalVal)}</strong>
                      </p>
                    </div>

                    {/* Expiry Details */}
                    <div className="bg-white/80 p-2.5 rounded-lg border border-gray-100 text-xs text-gray-600 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Shelf Life:</span>
                        <span className="font-medium">{item.shelf_life_days || '—'} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Expiry Date:</span>
                        <span className="font-semibold text-gray-800">{item.expiry_date || 'Not set'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setSelectedItem(item)
                        setDiscardStock(String(stock))
                      }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                    >
                      Waste / Discard Stock
                    </button>
                    <Link
                      to="/sale"
                      className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                    >
                      Quick Sale →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </main>

      {/* ── Discard / Waste Stock Modal ────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm p-6 shadow-xl relative">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="mb-4 pb-3 border-b border-gray-100">
              <span className="label mb-1">Write Off / Discard Spoiled Stock</span>
              <h3 className="font-bold text-gray-900 text-lg">{selectedItem.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Current Tray Stock: <strong className="text-gray-900">{Number(selectedItem.current_stock_kg).toFixed(1)} kg</strong>
              </p>
            </div>

            <form onSubmit={handleDiscardStock} className="flex flex-col gap-4">
              <div>
                <label className="label">Quantity to Remove (kg)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max={Number(selectedItem.current_stock_kg)}
                    value={discardStock}
                    onChange={(e) => setDiscardStock(e.target.value)}
                    className="input text-lg font-bold pr-12"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                    kg
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  This stock will be deducted from counter inventory.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="btn-secondary flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="btn bg-red-600 text-white hover:bg-red-700 flex-1 text-xs font-semibold"
                >
                  {updating ? 'Removing…' : 'Discard from Counter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
