import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

const PAYMENT_MODES = ['Cash', 'UPI', 'Card']

export default function SalePage() {
  const { user } = useAuth()

  // ── Items from DB ──────────────────────────────────────────────────────
  const [items, setItems]               = useState([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [itemsError, setItemsError]     = useState('')

  // ── Cart ───────────────────────────────────────────────────────────────
  const [cart, setCart]                 = useState([])
  const [paymentMode, setPaymentMode]   = useState('Cash')
  const [note, setNote]                 = useState('')

  // ── Qty Entry Modal ────────────────────────────────────────────────────
  const [qtyModal, setQtyModal]         = useState(null)
  const [qtyInput, setQtyInput]         = useState('0.5')
  const [qtyError, setQtyError]         = useState('')

  // ── Submitting ─────────────────────────────────────────────────────────
  const [submitting, setSubmitting]     = useState(false)
  const [saleError, setSaleError]       = useState('')

  // ── Receipt Modal ──────────────────────────────────────────────────────
  const [receipt, setReceipt]           = useState(null)

  // ── Search / Filter ───────────────────────────────────────────────────
  const [search, setSearch]             = useState('')

  // ── 1. Load counter items ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('counter_items')
          .select('id, name, price_per_kg, current_stock_kg, shelf_life_days, expiry_date')
          .eq('shop_id', user.id)
          .eq('is_active', true)
          .order('name')
        if (error) throw error
        setItems(data || [])
      } catch (err) {
        setItemsError('Failed to load sweets. Refresh the page.')
      } finally {
        setLoadingItems(false)
      }
    }
    load()

    const channel = supabase
      .channel(`sale_counter_items_${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'counter_items',
        filter: `shop_id=eq.${user.id}`,
      }, (payload) => {
        setItems((prev) =>
          prev.map((i) => i.id === payload.new.id ? { ...i, ...payload.new } : i)
        )
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  // ── 2. Cart helpers ────────────────────────────────────────────────────
  const cartTotal = cart.reduce((sum, row) => sum + row.line_total, 0)

  const openQtyModal = (item) => {
    setQtyModal({ item })
    setQtyInput('0.5')
    setQtyError('')
  }

  const closeQtyModal = () => {
    setQtyModal(null)
    setQtyInput('0.5')
    setQtyError('')
  }

  const handleQtyConfirm = (e) => {
    e.preventDefault()
    const qty = parseFloat(qtyInput)
    if (isNaN(qty) || qty <= 0) {
      setQtyError('Quantity must be greater than 0.')
      return
    }
    const item = qtyModal.item
    const maxAvail = Number(item.current_stock_kg)
    if (qty > maxAvail) {
      setQtyError(`Only ${maxAvail.toFixed(2)} kg available in stock.`)
      return
    }

    setCart((prev) => {
      const existing = prev.findIndex((r) => r.item.id === item.id)
      const line_total = parseFloat((qty * Number(item.price_per_kg)).toFixed(2))
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { item, qty_kg: qty, line_total }
        return updated
      }
      return [...prev, { item, qty_kg: qty, line_total }]
    })

    closeQtyModal()
  }

  const removeFromCart = (itemId) => {
    setCart((prev) => prev.filter((r) => r.item.id !== itemId))
  }

  const clearCart = () => {
    setCart([])
    setNote('')
    setSaleError('')
  }

  const handleQtyDelta = (delta) => {
    const curr = parseFloat(qtyInput) || 0
    const next = Math.max(0.05, parseFloat((curr + delta).toFixed(3)))
    setQtyInput(String(next))
  }

  // ── 3. Record Sale ─────────────────────────────────────────────────────
  const handleRecordSale = async () => {
    if (cart.length === 0) {
      setSaleError('Add at least one sweet to the cart.')
      return
    }
    setSaleError('')
    setSubmitting(true)

    try {
      const p_items = cart.map((row) => ({
        counter_item_id: row.item.id,
        item_name:       row.item.name,
        price_per_kg:    Number(row.item.price_per_kg),
        qty_kg:          row.qty_kg,
        line_total:      row.line_total,
      }))

      const { data: saleId, error } = await supabase.rpc('record_sale', {
        p_shop_id:      user.id,
        p_payment_mode: paymentMode,
        p_note:         note.trim() || null,
        p_created_by:   user.id,
        p_items:        p_items,
      })

      if (error) throw error

      setReceipt({
        saleId,
        items: [...cart],
        total: cartTotal,
        mode:  paymentMode,
        note:  note.trim(),
      })

      setCart([])
      setNote('')
      setPaymentMode('Cash')

      const { data: freshItems } = await supabase
        .from('counter_items')
        .select('id, name, price_per_kg, current_stock_kg, shelf_life_days, expiry_date')
        .eq('shop_id', user.id)
        .eq('is_active', true)
        .order('name')
      if (freshItems) setItems(freshItems)

    } catch (err) {
      console.error('record_sale error:', err)
      setSaleError(err.message || 'Sale failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">

        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── LEFT: Sweets Selection Grid ─────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                  Quick Sale / POS
                </h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  Click any sweet item to specify quantity and add to bill
                </p>
              </div>
              <Link
                to="/counter"
                className="btn-secondary text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                <span>Counter Inventory →</span>
              </Link>
            </div>

            {/* Search */}
            <div className="relative mb-5">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search sweets by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 text-sm"
              />
            </div>

            {/* Error */}
            {itemsError && (
              <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {itemsError}
              </div>
            )}

            {/* Loading */}
            {loadingItems ? (
              <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
                <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Loading available sweets…</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
                <p className="text-gray-500 text-sm">
                  {search ? `No sweets matching "${search}"` : 'No active sweets on counter.'}
                </p>
                {!search && (
                  <Link to="/counter/add" className="btn-primary text-sm mt-4 inline-flex">
                    + Add Sweet Item
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredItems.map((item) => {
                  const stock = Number(item.current_stock_kg)
                  const isLow = stock <= 1.0
                  const isOut = stock === 0
                  const inCart = cart.some((r) => r.item.id === item.id)
                  const cartRow = cart.find((r) => r.item.id === item.id)

                  return (
                    <button
                      key={item.id}
                      onClick={() => !isOut && openQtyModal(item)}
                      disabled={isOut}
                      title={isOut ? 'Out of stock' : `Add ${item.name} to cart`}
                      className={`relative group flex flex-col gap-2 p-4 rounded-xl text-left border transition-all ${
                        isOut
                          ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                          : inCart
                          ? 'bg-orange-50/50 border-orange-400 shadow-sm'
                          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                      }`}
                    >
                      {/* In-cart indicator */}
                      {inCart && (
                        <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold">
                          ✓
                        </span>
                      )}

                      {/* Stock badge */}
                      <span className={`inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        isOut
                          ? 'bg-gray-100 text-gray-500 border-gray-200'
                          : isLow
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                      </span>

                      <div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{item.name}</p>
                        <p className="text-gray-900 font-bold text-xs mt-1">
                          ₹{Number(item.price_per_kg).toLocaleString('en-IN')} / kg
                        </p>
                      </div>

                      <p className={`text-xs mt-auto font-medium ${isLow ? 'text-red-600' : 'text-gray-500'}`}>
                        {stock.toFixed(2)} kg avail.
                      </p>

                      {/* Qty in cart indicator */}
                      {cartRow && (
                        <div className="mt-1 py-1 px-2 rounded bg-orange-100 text-orange-800 text-[11px] font-semibold text-center">
                          {cartRow.qty_kg} kg · ₹{cartRow.line_total.toLocaleString('en-IN')}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT: Cart / Billing Panel ─────────────────────────── */}
          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm sticky top-20">

              {/* Cart Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900 text-base">Current Bill</h2>
                  {cart.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
                      {cart.length}
                    </span>
                  )}
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-gray-500 hover:text-red-600 font-medium transition-colors"
                  >
                    Clear Bill
                  </button>
                )}
              </div>

              {/* Cart Items */}
              <div className="px-5 py-4 min-h-[200px] max-h-[300px] overflow-y-auto divide-y divide-gray-100">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[170px] text-gray-400">
                    <p className="text-sm text-center">Select sweets from the list to start billing</p>
                  </div>
                ) : (
                  cart.map((row) => (
                    <div
                      key={row.item.id}
                      className="py-3 flex items-start justify-between gap-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 text-sm font-semibold truncate">
                          {row.item.name}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {row.qty_kg} kg × ₹{Number(row.item.price_per_kg).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-gray-900 text-sm font-bold">
                          ₹{row.line_total.toLocaleString('en-IN')}
                        </span>
                        <button
                          onClick={() => openQtyModal(row.item)}
                          title="Edit quantity"
                          className="text-gray-400 hover:text-gray-600 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeFromCart(row.item.id)}
                          title="Remove item"
                          className="text-gray-400 hover:text-red-600 text-sm font-bold"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Payment Mode, Note, Total, and Record */}
              {cart.length > 0 && (
                <div className="border-t border-gray-100 px-5 py-4 flex flex-col gap-4 bg-gray-50/30">

                  {/* Payment Mode */}
                  <div>
                    <label className="label">Payment Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_MODES.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPaymentMode(mode)}
                          className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                            paymentMode === mode
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Optional Note */}
                  <div>
                    <label className="label">Note (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Festival gift pack, customer name"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="input text-xs min-h-9 py-1.5"
                    />
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-gray-100/70 border border-gray-200">
                    <span className="text-gray-600 font-semibold text-xs uppercase tracking-wider">
                      Grand Total
                    </span>
                    <span className="text-2xl font-extrabold text-gray-900">
                      ₹{cartTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Sale Error */}
                  {saleError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                      {saleError}
                    </div>
                  )}

                  {/* Record Sale Button */}
                  <button
                    onClick={handleRecordSale}
                    disabled={submitting || cart.length === 0}
                    id="record-sale-btn"
                    className="btn-primary w-full text-base font-bold min-h-12"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Recording…
                      </span>
                    ) : (
                      `Record Sale · ₹${cartTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    )}
                  </button>

                </div>
              )}

            </div>
          </div>
        </div>
      </main>

      {/* ── Qty Entry Modal ────────────────────────────────────────────────── */}
      {qtyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm p-6 shadow-xl relative">

            {/* Header */}
            <div className="mb-4 pb-3 border-b border-gray-100">
              <span className="label mb-1">Select Quantity</span>
              <h3 className="font-bold text-gray-900 text-lg truncate">
                {qtyModal.item.name}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                ₹{Number(qtyModal.item.price_per_kg).toLocaleString('en-IN')} / kg ·{' '}
                <span className="font-semibold text-gray-700">{Number(qtyModal.item.current_stock_kg).toFixed(2)} kg available</span>
              </p>
            </div>

            <form onSubmit={handleQtyConfirm} className="flex flex-col gap-4">

              {/* Qty Input */}
              <div>
                <label className="label">Quantity in kg</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max={Number(qtyModal.item.current_stock_kg)}
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    className="input text-2xl font-extrabold text-center pr-12"
                    autoFocus
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">
                    kg
                  </span>
                </div>
              </div>

              {/* Quick preset deltas */}
              <div className="grid grid-cols-5 gap-1.5">
                {[0.25, 0.5, 1.0, 2.0, 5.0].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQtyDelta(val)}
                    className="py-1.5 rounded-lg bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 text-xs font-semibold transition-colors"
                  >
                    +{val}
                  </button>
                ))}
              </div>

              {/* Live total preview */}
              {parseFloat(qtyInput) > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 flex justify-between items-center">
                  <span className="text-gray-600 text-xs font-medium">Estimated Amount</span>
                  <span className="text-gray-900 font-bold text-lg">
                    ₹{(parseFloat(qtyInput) * Number(qtyModal.item.price_per_kg)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {qtyError && (
                <div className="text-red-700 text-xs p-3 rounded-lg bg-red-50 border border-red-200">
                  {qtyError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeQtyModal} className="btn-secondary flex-1 text-sm">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 text-sm font-semibold">
                  Add to Bill
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ── Receipt Modal ───────────────────────────────────────────────────── */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm p-6 shadow-xl text-center">

            {/* Success icon */}
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-1">Sale Recorded</h2>
            <p className="text-gray-500 text-xs mb-4">
              Inventory deducted automatically from counter
            </p>

            {/* Bill summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left mb-5">
              <div className="space-y-1.5 mb-3">
                {receipt.items.map((row) => (
                  <div key={row.item.id} className="flex justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                    <span className="text-gray-700">{row.item.name} ({row.qty_kg} kg)</span>
                    <span className="text-gray-900 font-semibold">₹{row.line_total.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2.5 border-t border-gray-200">
                <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
                  Paid via {receipt.mode}
                </span>
                <span className="text-xl font-extrabold text-gray-900">
                  ₹{receipt.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {receipt.note && (
                <p className="text-[11px] text-gray-500 mt-2">Note: {receipt.note}</p>
              )}
            </div>

            <button
              onClick={() => setReceipt(null)}
              className="btn-primary w-full font-semibold text-sm"
              id="close-receipt-btn"
            >
              New Sale
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
