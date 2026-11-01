import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

// ── Helpers ───────────────────────────────────────────────────────────────
function formatINR(amount) {
  return Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function formatPickupDate(dateStr) {
  if (!dateStr) return 'No date'
  const today = new Date().toISOString().split('T')[0]
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = tomorrowDate.toISOString().split('T')[0]

  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  if (dateStr < today) return 'Past Due'

  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_CONFIG = {
  Pending: {
    label: 'Pending',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    next: 'In Kitchen',
    nextLabel: 'Send to Kitchen →',
  },
  'In Kitchen': {
    label: 'In Kitchen',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    next: 'Ready',
    nextLabel: 'Mark Ready →',
  },
  Ready: {
    label: 'Ready for Pickup',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    next: 'Delivered',
    nextLabel: 'Deliver & Settle →',
  },
  Delivered: {
    label: 'Delivered',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    next: null,
    nextLabel: null,
  },
}

export default function OrdersPage() {
  const { user } = useAuth()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Deliver modal state (for settling balance)
  const [deliverModalOrder, setDeliverModalOrder] = useState(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  // ── Fetch orders with nested items ──────────────────────────────────────
  const fetchOrders = async () => {
    if (!user) return
    setError('')
    try {
      const { data, error: fetchErr } = await supabase
        .from('advance_orders')
        .select(`
          id,
          customer_name,
          customer_phone,
          pickup_date,
          total_amount,
          advance_paid,
          balance_amount,
          status,
          note,
          created_at,
          advance_order_items (
            id,
            item_name,
            price_per_kg,
            qty_kg,
            line_total
          )
        `)
        .eq('shop_id', user.id)
        .order('pickup_date', { ascending: true })

      if (fetchErr) throw fetchErr
      setOrders(data || [])
    } catch (err) {
      console.error('Fetch orders error:', err)
      setError('Failed to load advance orders.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel(`orders_changes_${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'advance_orders',
          filter: `shop_id=eq.${user?.id}`,
        },
        () => {
          fetchOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // ── Quick status transition ─────────────────────────────────────────────
  const handleNextStatus = async (order) => {
    const config = STATUS_CONFIG[order.status]
    if (!config || !config.next) return

    if (config.next === 'Delivered') {
      // Open modal to confirm balance collection
      setDeliverModalOrder(order)
      setSettleAmount(String(Number(order.balance_amount) || 0))
      return
    }

    setUpdatingId(order.id)
    try {
      const { error: updErr } = await supabase
        .from('advance_orders')
        .update({ status: config.next })
        .eq('id', order.id)
        .eq('shop_id', user.id)

      if (updErr) throw updErr

      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: config.next } : o))
      )
    } catch (err) {
      console.error('Status update error:', err)
      setError(err.message || 'Failed to update order status.')
    } finally {
      setUpdatingId(null)
    }
  }

  // ── Settle & Deliver Order ──────────────────────────────────────────────
  const handleConfirmDelivery = async (e) => {
    e.preventDefault()
    if (!deliverModalOrder) return

    const addtlPaid = parseFloat(settleAmount) || 0
    const newAdvance = Number(deliverModalOrder.advance_paid) + addtlPaid

    setUpdatingId(deliverModalOrder.id)
    try {
      const { error: updErr } = await supabase
        .from('advance_orders')
        .update({
          status: 'Delivered',
          advance_paid: newAdvance,
        })
        .eq('id', deliverModalOrder.id)
        .eq('shop_id', user.id)

      if (updErr) throw updErr

      setOrders((prev) =>
        prev.map((o) =>
          o.id === deliverModalOrder.id
            ? {
                ...o,
                status: 'Delivered',
                advance_paid: newAdvance,
                balance_amount: Math.max(0, Number(o.total_amount) - newAdvance),
              }
            : o
        )
      )

      setDeliverModalOrder(null)
    } catch (err) {
      console.error('Delivery settlement error:', err)
      setError(err.message || 'Failed to complete delivery.')
    } finally {
      setUpdatingId(null)
    }
  }

  // ── Filters & Stats ─────────────────────────────────────────────────────
  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'All' || o.status === statusFilter
    const matchesSearch =
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone?.includes(search)
    return matchesStatus && matchesSearch
  })

  const totalAdvanceCollected = orders.reduce((s, o) => s + Number(o.advance_paid), 0)
  const totalBalanceDue = orders
    .filter((o) => o.status !== 'Delivered')
    .reduce((s, o) => s + Number(o.balance_amount), 0)
  const activeOrdersCount = orders.filter((o) => o.status !== 'Delivered').length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Advance & Festival Orders
              </h1>
              {activeOrdersCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  {activeOrdersCount} Active
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Track bulk sweet bookings, pickup dates, and pending balance payments
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/orders/new" className="btn-primary text-sm font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>New Advance Order</span>
            </Link>
          </div>
        </div>

        {/* ── Summary Stats Row ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <span className="label mb-1">Total Orders</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">{orders.length}</p>
            <p className="text-xs text-gray-500 mt-1">{activeOrdersCount} pending delivery</p>
          </div>

          <div className="card">
            <span className="label mb-1">Balance Due</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-red-600">₹{formatINR(totalBalanceDue)}</p>
            <p className="text-xs text-gray-500 mt-1">To collect at pickup</p>
          </div>

          <div className="card">
            <span className="label mb-1">Advance Collected</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600">₹{formatINR(totalAdvanceCollected)}</p>
            <p className="text-xs text-gray-500 mt-1">Deposit in hand</p>
          </div>

          <div className="card">
            <span className="label mb-1">Ready for Pickup</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-blue-600">
              {orders.filter((o) => o.status === 'Ready').length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Waiting for customer</p>
          </div>
        </div>

        {/* ── Filters & Search ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6">
          {/* Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['All', 'Pending', 'In Kitchen', 'Ready', 'Delivered'].map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${
                  statusFilter === tab
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tab}
                {tab === 'All'
                  ? ` (${orders.length})`
                  : ` (${orders.filter((o) => o.status === tab).length})`}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-xs w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search customer or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 text-xs min-h-10 py-1.5"
            />
          </div>
        </div>

        {/* ── Error ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Orders List ────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-400">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading advance orders…</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <h3 className="text-lg font-bold text-gray-900">
              {search ? 'No orders match your search' : 'No advance orders found'}
            </h3>
            <p className="text-gray-500 text-sm mt-1 mb-6">
              {search
                ? `No orders matching "${search}".`
                : 'Book festival sweets, wedding gifts, and bulk orders in advance.'}
            </p>
            {!search && (
              <Link to="/orders/new" className="btn-primary text-sm inline-flex items-center gap-2">
                + Book First Order
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const conf = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending
              const isPastDue = order.status !== 'Delivered' && formatPickupDate(order.pickup_date) === 'Past Due'
              const balance = Number(order.balance_amount)

              return (
                <div
                  key={order.id}
                  className="card p-5 hover:border-gray-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                >
                  {/* Left: Customer & Date Info */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-gray-900 text-base">{order.customer_name}</h3>
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="text-xs font-semibold text-orange-600 hover:underline flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {order.customer_phone}
                      </a>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${conf.badge}`}>
                        {conf.label}
                      </span>
                    </div>

                    {/* Order items preview */}
                    <div className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
                      {(order.advance_order_items || []).map((item) => (
                        <span key={item.id} className="font-medium">
                          {item.item_name}: <strong className="text-gray-900">{Number(item.qty_kg).toFixed(1)} kg</strong>
                        </span>
                      ))}
                      {order.note && (
                        <span className="text-gray-500 italic block w-full mt-0.5">
                          Note: {order.note}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Pickup & Pricing */}
                  <div className="flex items-center gap-6 text-sm shrink-0">
                    <div>
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Pickup</span>
                      <span className={`font-bold block ${isPastDue ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatPickupDate(order.pickup_date)}
                      </span>
                      <span className="text-[11px] text-gray-400 block">{order.pickup_date}</span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Total</span>
                      <span className="font-extrabold text-gray-900 text-base block">
                        ₹{formatINR(order.total_amount)}
                      </span>
                      <span className="text-[11px] text-emerald-600 block">
                        Adv: ₹{formatINR(order.advance_paid)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">Balance</span>
                      <span className={`font-extrabold text-base block ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {balance > 0 ? `₹${formatINR(balance)}` : 'Paid'}
                      </span>
                      <span className="text-[11px] text-gray-400 block">
                        {balance > 0 ? 'Due' : 'Cleared'}
                      </span>
                    </div>
                  </div>

                  {/* Right: Status Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {conf.next && (
                      <button
                        onClick={() => handleNextStatus(order)}
                        disabled={updatingId === order.id}
                        className="btn-primary text-xs font-semibold py-2 px-3.5"
                      >
                        {updatingId === order.id ? 'Updating…' : conf.nextLabel}
                      </button>
                    )}
                    {order.status === 'Delivered' && (
                      <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                        ✓ Complete
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </main>

      {/* ── Deliver Order & Settle Balance Modal ───────────────────────── */}
      {deliverModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm p-6 shadow-xl relative">
            <button
              onClick={() => setDeliverModalOrder(null)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="mb-4 pb-3 border-b border-gray-100">
              <span className="label mb-1">Order Delivery & Settlement</span>
              <h3 className="font-bold text-gray-900 text-lg">{deliverModalOrder.customer_name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{deliverModalOrder.customer_phone}</p>
            </div>

            <form onSubmit={handleConfirmDelivery} className="flex flex-col gap-4">
              <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Order Total:</span>
                  <span className="font-bold text-gray-900">₹{formatINR(deliverModalOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Advance Paid:</span>
                  <span className="font-bold text-emerald-600">₹{formatINR(deliverModalOrder.advance_paid)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold">
                  <span className="text-gray-700">Pending Balance:</span>
                  <span className="text-red-600">₹{formatINR(deliverModalOrder.balance_amount)}</span>
                </div>
              </div>

              <div>
                <label className="label">Amount Collected Now (₹)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max={Number(deliverModalOrder.balance_amount)}
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="input pl-8 text-lg font-bold"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Enter final cash or UPI payment collected from customer
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeliverModalOrder(null)}
                  className="btn-secondary flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingId === deliverModalOrder.id}
                  className="btn-primary flex-1 text-xs font-semibold"
                >
                  {updatingId === deliverModalOrder.id ? 'Saving…' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
