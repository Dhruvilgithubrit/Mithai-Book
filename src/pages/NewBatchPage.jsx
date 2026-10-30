import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function calculateExpiry(days) {
  if (!days || isNaN(days) || Number(days) <= 0) return ''
  const d = new Date()
  d.setDate(d.getDate() + Number(days))
  return d.toISOString().split('T')[0]
}

export default function NewBatchPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [counterItems, setCounterItems] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [dataLoading,  setDataLoading]  = useState(true)
  const [dataError,    setDataError]    = useState('')

  const [selectedItemId, setSelectedItemId] = useState('')
  const [qtyKg,          setQtyKg]          = useState('5')
  const [expiryDate,     setExpiryDate]     = useState('')

  const [ingredients, setIngredients] = useState([{ materialId: '', qty: '' }])

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const [ciRes, rmRes] = await Promise.all([
          supabase
            .from('counter_items')
            .select('id, name, shelf_life_days')
            .eq('shop_id', user.id)
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('raw_materials')
            .select('id, name, unit, current_stock')
            .eq('shop_id', user.id)
            .eq('is_active', true)
            .order('name'),
        ])
        if (ciRes.error) throw ciRes.error
        if (rmRes.error) throw rmRes.error
        setCounterItems(ciRes.data || [])
        setRawMaterials(rmRes.data || [])
      } catch (err) {
        setDataError('Failed to load kitchen data. Refresh the page.')
      } finally {
        setDataLoading(false)
      }
    }
    load()
  }, [user])

  useEffect(() => {
    const item = counterItems.find((i) => i.id === selectedItemId)
    if (item?.shelf_life_days) {
      setExpiryDate(calculateExpiry(item.shelf_life_days))
    }
  }, [selectedItemId, counterItems])

  const addIngredientRow = () => {
    setIngredients((prev) => [...prev, { materialId: '', qty: '' }])
  }

  const removeIngredientRow = (idx) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateIngredientRow = (idx, field, value) => {
    setIngredients((prev) => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!selectedItemId) { setError('Select the sweet being produced.'); return }

    const qty = parseFloat(qtyKg)
    if (isNaN(qty) || qty <= 0) { setError('Quantity to produce must be greater than 0.'); return }

    const selectedItem = counterItems.find((i) => i.id === selectedItemId)
    if (!selectedItem) { setError('Selected sweet not found.'); return }

    const validIngredients = ingredients.filter((r) => r.materialId && r.qty)
    for (const row of validIngredients) {
      const q = parseFloat(row.qty)
      if (isNaN(q) || q <= 0) {
        setError('All ingredient quantities must be greater than 0.')
        return
      }
      const mat = rawMaterials.find((m) => m.id === row.materialId)
      if (!mat) { setError('An ingredient could not be found.'); return }
      if (Number(mat.current_stock) < q) {
        setError(`Insufficient stock for "${mat.name}". Available: ${mat.current_stock} ${mat.unit}, needed: ${q} ${mat.unit}.`)
        return
      }
    }

    setSubmitting(true)
    try {
      const { data: batchData, error: batchErr } = await supabase
        .from('production_batches')
        .insert({
          shop_id:        user.id,
          counter_item_id: selectedItemId,
          item_name:      selectedItem.name,
          qty_kg:         qty,
          status:         'in_progress',
          expiry_date:    expiryDate || null,
          started_at:     new Date().toISOString(),
        })
        .select('id')
        .single()

      if (batchErr) throw batchErr

      for (const row of validIngredients) {
        const q   = parseFloat(row.qty)
        const mat = rawMaterials.find((m) => m.id === row.materialId)
        const newStock = parseFloat((Number(mat.current_stock) - q).toFixed(3))

        const { error: deductErr } = await supabase
          .from('raw_materials')
          .update({ current_stock: newStock })
          .eq('id', row.materialId)
          .eq('shop_id', user.id)

        if (deductErr) throw deductErr
      }

      navigate('/kitchen/batches')
    } catch (err) {
      console.error('New batch error:', err)
      setError(err.message || 'Failed to start batch. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-gray-400">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading kitchen inventory…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8">

        <div className="mb-6">
          <Link to="/kitchen/batches" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Back to Batches
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Start Production Batch</h1>
          <p className="text-gray-500 text-sm mt-1">
            Specify finished sweet quantity and deduct raw materials from kitchen inventory.
          </p>
        </div>

        {dataError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{dataError}</div>
        )}

        <div className="card shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

            {/* Sweet being produced */}
            <div>
              <label htmlFor="batch-item" className="label">Sweet Being Made *</label>
              {counterItems.length === 0 ? (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  No sweets found on counter.{' '}
                  <Link to="/counter/add" className="underline font-semibold">Add sweet items</Link> first.
                </div>
              ) : (
                <select
                  id="batch-item"
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="input text-base bg-white"
                  required
                >
                  <option value="">— Select a sweet —</option>
                  {counterItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Qty + Expiry */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="batch-qty" className="label">Quantity to Produce (kg) *</label>
                <div className="relative">
                  <input
                    id="batch-qty"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={qtyKg}
                    onChange={(e) => setQtyKg(e.target.value)}
                    className="input pr-12 text-xl font-bold"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">kg</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[2, 5, 10, 20].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setQtyKg(String(v))}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                        qtyKg === String(v)
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {v}kg
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="batch-expiry" className="label">Expiry Date (Optional)</label>
                <input
                  id="batch-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="input text-base text-gray-800"
                />
                <p className="text-xs text-gray-400 mt-1">Auto-calculated from sweet's shelf life</p>
              </div>
            </div>

            {/* Raw Materials Consumed */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">Raw Materials Consumed</p>
                  <p className="text-xs text-gray-500">Auto-deducted from kitchen inventory upon starting</p>
                </div>
                <button
                  type="button"
                  onClick={addIngredientRow}
                  className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
                >
                  + Add Ingredient
                </button>
              </div>

              {rawMaterials.length === 0 ? (
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 text-sm text-center">
                  No raw materials found.{' '}
                  <Link to="/kitchen/materials/add" className="text-orange-600 underline font-medium">Add materials</Link> first.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {ingredients.map((row, idx) => {
                    const mat = rawMaterials.find((m) => m.id === row.materialId)
                    return (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={row.materialId}
                          onChange={(e) => updateIngredientRow(idx, 'materialId', e.target.value)}
                          className="input text-sm flex-1 bg-white min-h-10 py-1.5"
                        >
                          <option value="">— Select Material —</option>
                          {rawMaterials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({Number(m.current_stock)} {m.unit} in stock)
                            </option>
                          ))}
                        </select>

                        <div className="relative w-28 shrink-0">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Qty"
                            value={row.qty}
                            onChange={(e) => updateIngredientRow(idx, 'qty', e.target.value)}
                            className="input text-sm pr-10 min-h-10 py-1.5"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">
                            {mat?.unit || 'unit'}
                          </span>
                        </div>

                        {ingredients.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeIngredientRow(idx)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1 shrink-0 font-bold"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Stock preview for selected materials */}
                  {ingredients.some((r) => r.materialId && r.qty) && (
                    <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 flex flex-col gap-1.5">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Inventory Deduction Preview</p>
                      {ingredients
                        .filter((r) => r.materialId && r.qty)
                        .map((row, i) => {
                          const mat  = rawMaterials.find((m) => m.id === row.materialId)
                          if (!mat) return null
                          const used = parseFloat(row.qty) || 0
                          const after = Number(mat.current_stock) - used
                          const isNeg = after < 0
                          return (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700 font-medium">{mat.name}</span>
                              <span className={`font-semibold ${isNeg ? 'text-red-600' : 'text-gray-900'}`}>
                                {Number(mat.current_stock)} → {isNeg ? 'Low Stock Warning: ' : ''}{after.toFixed(2)} {mat.unit}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <Link to="/kitchen/batches" className="btn-secondary flex-1 text-center">Cancel</Link>
              <button
                type="submit"
                id="start-batch-btn"
                disabled={submitting || counterItems.length === 0}
                className="btn-primary flex-1 font-semibold"
              >
                {submitting ? 'Starting Batch…' : 'Start Batch'}
              </button>
            </div>

          </form>
        </div>
      </main>
    </div>
  )
}
