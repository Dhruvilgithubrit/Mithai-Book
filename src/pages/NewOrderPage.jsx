import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function defaultPickupDate() {
  const tomorrow = new Date()
  tomorrowDateAdd(tomorrow, 1)
  return tomorrow.toISOString().split('T')[0]
}

function tomorrowDateAdd(d, days) {
  d.setDate(d.getDate() + days)
  return d
}

function formatINR(val) {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

export default function NewOrderPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [counterItems, setCounterItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(true)

  // Order fields
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [pickupDate, setPickupDate] = useState(() => defaultPickupDate())
  const [advancePaid, setAdvancePaid] = useState('0')
  const [note, setNote] = useState('')

  // Item rows: { counter_item_id, item_name, price_per_kg, qty_kg, line_total }
  const [rows, setRows] = useState([
    { counter_item_id: '', item_name: '', price_per_kg: 0, qty_kg: '1.0', line_total: 0 },
  ])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ── Fetch active counter items ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const loadItems = async () => {
      try {
        const { data, error: err } = await supabase
          .from('counter_items')
          .select('id, name, price_per_kg')
          .eq('shop_id', user.id)
          .eq('is_active', true)
          .order('name')

        if (err) throw err
        setCounterItems(data || [])
      } catch (e) {
        console.error('Failed to load sweets:', e)
      } finally {
        setLoadingItems(false)
      }
    }
    loadItems()
  }, [user])

  // ── Row helpers ─────────────────────────────────────────────────────────
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { counter_item_id: '', item_name: '', price_per_kg: 0, qty_kg: '1.0', line_total: 0 },
    ])
  }

  const removeRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleItemSelect = (idx, itemId) => {
    const selected = counterItems.find((ci) => ci.id === itemId)
    setRows((prev) => {
      const updated = [...prev]
      const price = selected ? Number(selected.price_per_kg) : 0
      const qty = parseFloat(updated[idx].qty_kg) || 0
      updated[idx] = {
        ...updated[idx],
        counter_item_id: itemId,
        item_name: selected ? selected.name : '',
        price_per_kg: price,
        line_total: parseFloat((price * qty).toFixed(2)),
      }
      return updated
    })
  }

  const handleQtyChange = (idx, qtyVal) => {
    setRows((prev) => {
      const updated = [...prev]
      const price = Number(updated[idx].price_per_kg) || 0
      const qty = parseFloat(qtyVal) || 0
      updated[idx] = {
        ...updated[idx],
        qty_kg: qtyVal,
        line_total: parseFloat((price * qty).toFixed(2)),
      }
      return updated
    })
  }

  // ── Computed Totals ─────────────────────────────────────────────────────
  const totalAmount = rows.reduce((s, r) => s + (r.line_total || 0), 0)
  const advanceNum = parseFloat(advancePaid) || 0
  const balanceDue = Math.max(0, totalAmount - advanceNum)

  // ── Submit Order ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const cleanName = customerName.trim()
    const cleanPhone = customerPhone.trim()

    if (!cleanName) {
      setError('Customer name is required.')
      return
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      setError('Enter a valid 10-digit mobile number.')
      return
    }
    if (!pickupDate) {
      setError('Pickup date is required.')
      return
    }

    const validRows = rows.filter((r) => r.counter_item_id && Number(r.qty_kg) > 0)
    if (validRows.length === 0) {
      setError('Please add at least one sweet to the order.')
      return
    }

    if (advanceNum > totalAmount) {
      setError('Advance payment cannot exceed the total order amount.')
      return
    }

    setSubmitting(true)
    try {
      // 1. Insert order header
      const { data: orderData, error: orderErr } = await supabase
        .from('advance_orders')
        .insert({
          shop_id: user.id,
          customer_name: cleanName,
          customer_phone: cleanPhone,
          pickup_date: pickupDate,
          total_amount: totalAmount,
          advance_paid: advanceNum,
          status: 'Pending',
          note: note.trim() || null,
        })
        .select('id')
        .single()

      if (orderErr) throw orderErr

      // 2. Insert order items
      const itemRows = validRows.map((r) => ({
        shop_id: user.id,
        order_id: orderData.id,
        counter_item_id: r.counter_item_id,
        item_name: r.item_name,
        price_per_kg: r.price_per_kg,
        qty_kg: parseFloat(r.qty_kg),
        line_total: r.line_total,
      }))

      const { error: itemsErr } = await supabase
        .from('advance_order_items')
        .insert(itemRows)

      if (itemsErr) throw itemsErr

      navigate('/orders')
    } catch (err) {
      console.error('Order creation error:', err)
      setError(err.message || 'Failed to book order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">

        {/* Breadcrumb */}
        <div className="mb-6">
          <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Back to Advance Orders
          </Link>
        </div>

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Book Advance / Bulk Order
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Reserve festival sweets, wedding gift boxes, and bulk orders with advance payments
          </p>
        </div>

        {/* Form Card */}
        <div className="card shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>

            {/* Customer Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="cust-name" className="label">Customer Name *</label>
                <input
                  id="cust-name"
                  type="text"
                  placeholder="e.g. Anand Sharma"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="input"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label htmlFor="cust-phone" className="label">Mobile Number *</label>
                <input
                  id="cust-phone"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label htmlFor="pickup-date" className="label">Pickup Date *</label>
                <input
                  id="pickup-date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="input text-gray-900 font-semibold"
                  required
                />
              </div>
            </div>

            {/* Sweets Selection */}
            <div className="border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Ordered Sweets</h3>
                  <p className="text-xs text-gray-500">Add sweets and their quantities in kilograms</p>
                </div>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
                >
                  + Add Sweet
                </button>
              </div>

              {loadingItems ? (
                <p className="text-sm text-gray-400 py-3">Loading available sweets…</p>
              ) : counterItems.length === 0 ? (
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-500 text-center">
                  No sweets found.{' '}
                  <Link to="/counter/add" className="text-orange-600 underline font-medium">Add sweets to counter</Link> first.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rows.map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      {/* Sweet Picker */}
                      <select
                        value={row.counter_item_id}
                        onChange={(e) => handleItemSelect(idx, e.target.value)}
                        className="input text-sm flex-1 bg-white min-h-10 py-1.5"
                        required
                      >
                        <option value="">— Select Sweet —</option>
                        {counterItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} (₹{Number(item.price_per_kg).toLocaleString('en-IN')}/kg)
                          </option>
                        ))}
                      </select>

                      {/* Qty in kg */}
                      <div className="relative w-28 shrink-0">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          placeholder="kg"
                          value={row.qty_kg}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          className="input text-sm pr-9 min-h-10 py-1.5 font-bold"
                          required
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">
                          kg
                        </span>
                      </div>

                      {/* Line Total */}
                      <div className="w-24 text-right shrink-0">
                        <span className="text-xs text-gray-400 block text-[10px]">Total</span>
                        <span className="font-bold text-gray-900 text-sm">
                          ₹{formatINR(row.line_total)}
                        </span>
                      </div>

                      {/* Remove Row */}
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1.5 shrink-0 font-bold"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Advance Payment & Note */}
            <div className="border-t border-gray-100 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="adv-paid" className="label">Advance Deposit Collected (₹)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                  <input
                    id="adv-paid"
                    type="number"
                    step="1"
                    min="0"
                    max={totalAmount}
                    value={advancePaid}
                    onChange={(e) => setAdvancePaid(e.target.value)}
                    className="input pl-8 text-base font-bold text-emerald-700"
                    placeholder="0"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Amount received right now (Cash or UPI)</p>
              </div>

              <div>
                <label htmlFor="order-note" className="label">Order Notes / Instructions</label>
                <input
                  id="order-note"
                  type="text"
                  placeholder="e.g. 1kg decorative gift box, ribbon packing"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input text-sm"
                />
              </div>
            </div>

            {/* Order Financial Summary Box */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider block">Total Amount</span>
                <span className="text-2xl font-extrabold text-gray-900">₹{formatINR(totalAmount)}</span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider block">Advance Paid</span>
                <span className="text-xl font-bold text-emerald-600">₹{formatINR(advanceNum)}</span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider block">Balance at Pickup</span>
                <span className={`text-2xl font-extrabold ${balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ₹{formatINR(balanceDue)}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div role="alert" className="flex items-center gap-2 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <Link to="/orders" className="btn-secondary flex-1 text-center">Cancel</Link>
              <button
                type="submit"
                disabled={submitting || counterItems.length === 0}
                className="btn-primary flex-1 font-semibold"
              >
                {submitting ? 'Booking Order…' : 'Confirm & Save Order'}
              </button>
            </div>

          </form>
        </div>

      </main>
    </div>
  )
}
