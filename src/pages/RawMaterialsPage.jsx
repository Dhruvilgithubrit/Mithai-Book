import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function statusOf(current, threshold) {
  const c = Number(current)
  const t = Number(threshold)
  if (c <= 0)        return 'out'
  if (c <= t)        return 'low'
  if (c <= t * 1.25) return 'warn'
  return 'ok'
}

const STATUS_STYLES = {
  out:  { badge: 'bg-red-50 text-red-700 border-red-200',         bar: 'bg-red-500',    label: 'Out of Stock' },
  low:  { badge: 'bg-red-50 text-red-700 border-red-200',         bar: 'bg-red-500',    label: 'Low Stock' },
  warn: { badge: 'bg-amber-50 text-amber-700 border-amber-200',   bar: 'bg-amber-500',  label: 'Low Soon' },
  ok:   { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', label: 'Good Stock' },
}

function StockBar({ current, threshold }) {
  const t = Number(threshold) || 1
  const c = Number(current)
  const pct = Math.min(100, Math.round((c / (t * 3)) * 100))
  const status = statusOf(current, threshold)
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full rounded-full transition-all duration-500 ${STATUS_STYLES[status].bar}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function RawMaterialsPage() {
  const { user } = useAuth()

  const [materials,  setMaterials]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [search,     setSearch]     = useState('')

  // Adjust stock modal
  const [selected,   setSelected]   = useState(null)
  const [adjMode,    setAdjMode]    = useState('add')
  const [adjInput,   setAdjInput]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [adjError,   setAdjError]   = useState('')

  const fetchMaterials = async () => {
    if (!user) return
    try {
      const { data, error: e } = await supabase
        .from('raw_materials')
        .select('*')
        .eq('shop_id', user.id)
        .eq('is_active', true)
        .order('name')
      if (e) throw e
      setMaterials(data || [])
    } catch (err) {
      setError('Failed to load raw materials.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchMaterials()

    const channel = supabase
      .channel(`raw_materials_${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'raw_materials',
        filter: `shop_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new.is_active) {
          setMaterials((prev) => [...prev, payload.new].sort((a, b) => a.name.localeCompare(b.name)))
        } else if (payload.eventType === 'UPDATE') {
          setMaterials((prev) =>
            prev.map((m) => m.id === payload.new.id ? payload.new : m)
              .filter((m) => m.is_active)
          )
        } else if (payload.eventType === 'DELETE') {
          setMaterials((prev) => prev.filter((m) => m.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  const openAdjust = (material) => {
    setSelected(material)
    setAdjMode('add')
    setAdjInput('')
    setAdjError('')
  }
  const closeAdjust = () => {
    setSelected(null)
    setAdjInput('')
    setAdjError('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!selected) return

    const val = parseFloat(adjInput)
    if (isNaN(val) || val < 0) {
      setAdjError('Value must be 0 or greater.')
      return
    }

    const currentStock = Number(selected.current_stock)
    let newStock
    if (adjMode === 'add') {
      newStock = parseFloat((currentStock + val).toFixed(3))
    } else {
      if (val > currentStock) {
        setAdjError(`Cannot deduct more than current stock (${currentStock} ${selected.unit}).`)
        return
      }
      newStock = parseFloat((currentStock - val).toFixed(3))
    }

    setSaving(true)
    setAdjError('')
    try {
      const { error: e } = await supabase
        .from('raw_materials')
        .update({ current_stock: newStock })
        .eq('id', selected.id)
        .eq('shop_id', user.id)
      if (e) throw e

      setMaterials((prev) =>
        prev.map((m) => m.id === selected.id ? { ...m, current_stock: newStock } : m)
      )
      closeAdjust()
    } catch (err) {
      setAdjError(err.message || 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const alertCount = materials.filter((m) => {
    const s = statusOf(m.current_stock, m.min_threshold)
    return s === 'out' || s === 'low'
  }).length

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Kitchen Raw Materials
              </h1>
              {alertCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {alertCount} alert{alertCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {materials.length} ingredients tracked · Click any card to record delivery or manual usage
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/kitchen/batches" className="btn-secondary text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Production Batches</span>
            </Link>
            <Link to="/kitchen/materials/add" className="btn-primary text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Material</span>
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search material by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 text-sm"
          />
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading raw materials…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <h3 className="text-lg font-bold text-gray-900">
              {search ? 'No materials found' : 'No raw materials yet'}
            </h3>
            <p className="text-gray-500 text-sm mt-1 mb-6">
              {search ? `No match for "${search}"` : 'Track ghee, sugar, dry fruits, and milk stock.'}
            </p>
            {!search && (
              <Link to="/kitchen/materials/add" className="btn-primary text-sm inline-flex items-center gap-2">
                + Add First Material
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((m) => {
              const status = statusOf(m.current_stock, m.min_threshold)
              const st = STATUS_STYLES[status]
              const stock = Number(m.current_stock)
              const threshold = Number(m.min_threshold)

              return (
                <div
                  key={m.id}
                  onClick={() => openAdjust(m)}
                  className="card-hover cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Name + badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-bold text-gray-900 text-base leading-snug">
                        {m.name}
                      </h3>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${st.badge}`}>
                        {st.label}
                      </span>
                    </div>

                    {/* Stock value */}
                    <div className="mb-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                          {stock % 1 === 0 ? stock.toFixed(0) : stock.toFixed(2)}
                        </span>
                        <span className="text-gray-500 text-sm font-semibold">{m.unit}</span>
                      </div>
                      <StockBar current={m.current_stock} threshold={m.min_threshold} />
                    </div>
                  </div>

                  {/* Threshold + supplier */}
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100 mt-2">
                    <span>Min: {threshold} {m.unit}</span>
                    <span className="text-orange-600 font-semibold hover:underline">
                      Update Stock →
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Adjust Stock Modal ─────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl relative">

            <button
              onClick={closeAdjust}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="mb-5 pb-3 border-b border-gray-100">
              <span className="label mb-1">Kitchen Inventory</span>
              <h3 className="text-xl font-bold text-gray-900">{selected.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Current: <span className="text-gray-900 font-semibold">{Number(selected.current_stock)} {selected.unit}</span>
                {' · '}Minimum threshold: {Number(selected.min_threshold)} {selected.unit}
              </p>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'add',    label: '+ Add Stock',    desc: 'New delivery received' },
                  { key: 'deduct', label: '− Deduct Stock', desc: 'Manual kitchen use' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setAdjMode(opt.key); setAdjInput('') }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      adjMode === opt.key
                        ? 'bg-orange-50 border-orange-500 text-orange-800'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-bold text-sm">{opt.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Current → New preview */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-500 font-semibold block">Current</span>
                  <span className="text-base font-bold text-gray-700">
                    {Number(selected.current_stock)} {selected.unit}
                  </span>
                </div>
                <span className="text-gray-400 text-lg">→</span>
                <div className="text-right">
                  <span className="text-xs text-gray-500 font-semibold block">After Adjustment</span>
                  <span className="text-base font-bold text-gray-900">
                    {(() => {
                      const v = parseFloat(adjInput)
                      if (isNaN(v)) return '—'
                      const curr = Number(selected.current_stock)
                      const result = adjMode === 'add' ? curr + v : Math.max(0, curr - v)
                      return `${result.toFixed(2)} ${selected.unit}`
                    })()}
                  </span>
                </div>
              </div>

              {/* Input */}
              <div>
                <label className="label">
                  {adjMode === 'add' ? 'Quantity Added' : 'Quantity Deducted'} ({selected.unit})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjInput}
                    onChange={(e) => setAdjInput(e.target.value)}
                    className="input text-xl font-bold pr-16"
                    placeholder="0"
                    autoFocus
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">
                    {selected.unit}
                  </span>
                </div>
              </div>

              {/* Quick values */}
              <div className="grid grid-cols-5 gap-1.5">
                {[0.5, 1, 2, 5, 10].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAdjInput(String(v))}
                    className="py-1.5 rounded-lg bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 text-xs font-semibold transition-colors"
                  >
                    +{v}
                  </button>
                ))}
              </div>

              {adjError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  {adjError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeAdjust} className="btn-secondary flex-1 text-sm" disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 text-sm font-semibold" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
