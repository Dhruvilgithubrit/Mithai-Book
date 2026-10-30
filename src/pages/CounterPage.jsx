import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

export default function CounterPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Adjust stock modal state
  const [selectedItem, setSelectedItem] = useState(null)
  const [stockInput, setStockInput] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')

  // ── 1. Fetch initial items ────────────────────────────────────────────────
  const fetchItems = async () => {
    if (!user) return
    try {
      const { data, error: fetchErr } = await supabase
        .from('counter_items')
        .select('*')
        .eq('shop_id', user.id)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (fetchErr) throw fetchErr
      setItems(data || [])
    } catch (err) {
      console.error('Error fetching counter items:', err)
      setError('Failed to load counter items.')
    } finally {
      setLoading(false)
    }
  }

  // ── 2. Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    fetchItems()

    const channel = supabase
      .channel(`counter_items_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'counter_items',
          filter: `shop_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (payload.new.is_active) {
              setItems((prev) => {
                const exists = prev.some((i) => i.id === payload.new.id)
                if (exists) return prev
                return [...prev, payload.new].sort((a, b) => a.name.localeCompare(b.name))
              })
            }
          } else if (payload.eventType === 'UPDATE') {
            setItems((prev) =>
              prev
                .map((i) => (i.id === payload.new.id ? payload.new : i))
                .filter((i) => i.is_active)
                .sort((a, b) => a.name.localeCompare(b.name))
            )
          } else if (payload.eventType === 'DELETE') {
            setItems((prev) => prev.filter((i) => i.id === payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Open adjust stock modal
  const openAdjustModal = (item) => {
    setSelectedItem(item)
    setStockInput(String(Number(item.current_stock_kg)))
    setUpdateError('')
  }

  const closeAdjustModal = () => {
    setSelectedItem(null)
    setStockInput('')
    setUpdateError('')
  }

  // Quick adjust delta (+0.5, -1, etc.)
  const handleDelta = (delta) => {
    const current = parseFloat(stockInput) || 0
    const nextVal = Math.max(0, parseFloat((current + delta).toFixed(3)))
    setStockInput(String(nextVal))
  }

  // Save updated stock
  const handleSaveStock = async (e) => {
    e.preventDefault()
    if (!selectedItem) return

    const newStock = parseFloat(stockInput)
    if (isNaN(newStock) || newStock < 0) {
      setUpdateError('Stock must be 0 kg or greater.')
      return
    }

    setIsUpdating(true)
    setUpdateError('')

    try {
      const { error: updateErr } = await supabase
        .from('counter_items')
        .update({ current_stock_kg: newStock })
        .eq('id', selectedItem.id)
        .eq('shop_id', user.id)

      if (updateErr) throw updateErr

      // Update local state optimistically
      setItems((prev) =>
        prev.map((i) =>
          i.id === selectedItem.id ? { ...i, current_stock_kg: newStock } : i
        )
      )

      closeAdjustModal()
    } catch (err) {
      console.error('Update stock error:', err)
      setUpdateError(err.message || 'Failed to update stock.')
    } finally {
      setIsUpdating(false)
    }
  }

  // Filtered items
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  const lowStockCount = items.filter((i) => Number(i.current_stock_kg) <= 1.0).length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Top Header / Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Counter Stock
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Sync
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {items.length} items on display
              {lowStockCount > 0 && (
                <span className="text-red-600 font-medium ml-2">
                  · {lowStockCount} {lowStockCount === 1 ? 'item' : 'items'} low on stock
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/sale"
              className="btn-secondary text-sm font-semibold flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Quick Sale</span>
            </Link>
            <Link
              to="/counter/add"
              id="add-item-btn"
              className="btn-primary text-sm font-semibold flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Item</span>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search sweets by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 text-sm"
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading counter inventory…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900">
              {search ? 'No sweets found' : 'Counter is empty'}
            </h3>
            <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto mb-6">
              {search
                ? `No items matching "${search}". Try another search term.`
                : 'Add sweets to your counter to track stock and record sales.'}
            </p>
            {!search && (
              <Link to="/counter/add" className="btn-primary text-sm inline-flex items-center gap-2">
                <span>+</span> Add Your First Sweet
              </Link>
            )}
          </div>
        ) : (
          /* Grid of Sweet Cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item) => {
              const stock = Number(item.current_stock_kg)
              const isLowStock = stock <= 1.0

              return (
                <div
                  key={item.id}
                  onClick={() => openAdjustModal(item)}
                  className="card-hover cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Item name + Stock Badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-bold text-gray-900 text-base leading-snug">
                        {item.name}
                      </h3>
                      {isLowStock ? (
                        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                          {stock === 0 ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          In Stock
                        </span>
                      )}
                    </div>

                    {/* Stock display (Bold black numbers) */}
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                        {stock.toFixed(stock % 1 === 0 ? 1 : 2)}
                      </span>
                      <span className="text-gray-500 text-sm font-medium">kg in tray</span>
                    </div>

                    {/* Price per kg */}
                    <div className="mt-3 flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-gray-500 font-semibold uppercase tracking-wider">Rate</span>
                      <span className="text-gray-900 font-bold">
                        ₹{Number(item.price_per_kg).toLocaleString('en-IN')} / kg
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Expiry & Click Hint */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {item.shelf_life_days ? `Shelf: ${item.shelf_life_days}d` : 'No shelf set'}
                      {item.expiry_date ? ` · Exp: ${item.expiry_date.slice(5)}` : ''}
                    </span>
                    <span className="text-orange-600 font-semibold hover:underline">
                      Adjust Stock →
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </main>

      {/* ── Adjust Stock Modal ──────────────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl relative">
            
            {/* Close Button */}
            <button
              onClick={closeAdjustModal}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Header */}
            <div className="mb-5 pb-3 border-b border-gray-100">
              <span className="label mb-1">Adjust Inventory</span>
              <h3 className="text-xl font-bold text-gray-900">{selectedItem.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Rate: ₹{Number(selectedItem.price_per_kg).toLocaleString('en-IN')} / kg
              </p>
            </div>

            <form onSubmit={handleSaveStock} className="flex flex-col gap-4">
              
              {/* Previous vs New Stock */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-500 uppercase font-semibold block">Previous Stock</span>
                  <span className="text-base font-bold text-gray-700">
                    {Number(selectedItem.current_stock_kg).toFixed(2)} kg
                  </span>
                </div>
                <div className="text-gray-400 text-lg">→</div>
                <div className="text-right">
                  <span className="text-xs text-gray-500 uppercase font-semibold block">Updated Stock</span>
                  <span className="text-base font-bold text-gray-900">
                    {stockInput ? `${parseFloat(stockInput) || 0} kg` : '0 kg'}
                  </span>
                </div>
              </div>

              {/* Exact Stock Input */}
              <div>
                <label className="label">Set New Stock (kg)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={stockInput}
                    onChange={(e) => setStockInput(e.target.value)}
                    className="input text-xl font-bold pr-12"
                    placeholder="0.0"
                    autoFocus
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">
                    kg
                  </span>
                </div>
              </div>

              {/* Quick Adjustment Delta Buttons */}
              <div>
                <label className="label">Quick Adjust (+ / -)</label>
                <div className="grid grid-cols-5 gap-2">
                  {[-1.0, -0.5, 0.5, 1.0, 5.0].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => handleDelta(delta)}
                      className={`py-2 px-1 rounded-lg text-xs font-semibold border transition-colors ${
                        delta < 0
                          ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                          : 'bg-gray-50 text-gray-800 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {updateError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  {updateError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAdjustModal}
                  className="btn-secondary flex-1 text-sm"
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1 text-sm font-semibold"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving…' : 'Save Stock'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  )
}
