import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

// ── Helpers ───────────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

function toLocalDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatINR(amount) {
  return Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

// ── Component ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, shop } = useAuth()

  // ── Data state ────────────────────────────────────────────────────────
  const [todaySales,       setTodaySales]       = useState([])
  const [recentSales,      setRecentSales]      = useState([])
  const [counterItems,     setCounterItems]     = useState([])
  const [activeOrders,     setActiveOrders]     = useState([])
  const [todayRecon,       setTodayRecon]       = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState('')

  // ── Computed stats ────────────────────────────────────────────────────
  const todayTotal = todaySales.reduce((s, r) => s + Number(r.total_amount), 0)
  const todayCount = todaySales.length

  const paymentBreakdown = todaySales.reduce((acc, r) => {
    acc[r.payment_mode] = (acc[r.payment_mode] || 0) + Number(r.total_amount)
    return acc
  }, { Cash: 0, UPI: 0, Card: 0 })

  const lowStockItems = counterItems.filter((i) => Number(i.current_stock_kg) <= 1.0)
  const outOfStockItems = counterItems.filter((i) => Number(i.current_stock_kg) === 0)

  // Expiry check
  const todayStr = todayISO()
  const expiredItems = counterItems.filter((i) => i.expiry_date && i.expiry_date < todayStr && Number(i.current_stock_kg) > 0)
  const expiringTodayItems = counterItems.filter((i) => i.expiry_date && i.expiry_date === todayStr && Number(i.current_stock_kg) > 0)

  // Orders stats
  const totalBalanceDue = activeOrders.reduce((s, o) => s + Number(o.balance_amount), 0)

  // ── Fetch all data ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user) return
    setError('')
    try {
      const today = todayISO()
      const todayStart = `${today}T00:00:00`
      const todayEnd   = `${today}T23:59:59`

      const [todaySalesRes, recentSalesRes, itemsRes, ordersRes, reconRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id, total_amount, payment_mode, note, sale_date, sale_items(item_name, qty_kg, line_total)')
          .eq('shop_id', user.id)
          .gte('sale_date', todayStart)
          .lte('sale_date', todayEnd)
          .order('sale_date', { ascending: false }),

        supabase
          .from('sales')
          .select('id, total_amount, payment_mode, note, sale_date, sale_items(item_name, qty_kg, line_total)')
          .eq('shop_id', user.id)
          .order('sale_date', { ascending: false })
          .limit(20),

        supabase
          .from('counter_items')
          .select('id, name, current_stock_kg, price_per_kg, shelf_life_days, expiry_date')
          .eq('shop_id', user.id)
          .eq('is_active', true)
          .order('current_stock_kg', { ascending: true }),

        supabase
          .from('advance_orders')
          .select('id, customer_name, pickup_date, balance_amount, status')
          .eq('shop_id', user.id)
          .neq('status', 'Delivered'),

        supabase
          .from('daily_reconciliations')
          .select('id, recon_date, actual_cash, difference')
          .eq('shop_id', user.id)
          .eq('recon_date', today)
          .maybeSingle(),
      ])

      if (todaySalesRes.error) throw todaySalesRes.error
      if (recentSalesRes.error) throw recentSalesRes.error
      if (itemsRes.error) throw itemsRes.error
      if (ordersRes.error) throw ordersRes.error
      if (reconRes.error) throw reconRes.error

      setTodaySales(todaySalesRes.data || [])
      setRecentSales(recentSalesRes.data || [])
      setCounterItems(itemsRes.data || [])
      setActiveOrders(ordersRes.data || [])
      setTodayRecon(reconRes.data)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError('Failed to refresh dashboard. Please check connection.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel(`dashboard_sales_${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'sales',
        filter: `shop_id=eq.${user.id}`,
      }, () => {
        fetchAll()
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'advance_orders',
        filter: `shop_id=eq.${user.id}`,
      }, () => {
        fetchAll()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'counter_items',
        filter: `shop_id=eq.${user.id}`,
      }, (payload) => {
        setCounterItems((prev) =>
          prev
            .map((i) => i.id === payload.new.id ? { ...i, ...payload.new } : i)
            .sort((a, b) => Number(a.current_stock_kg) - Number(b.current_stock_kg))
        )
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user, fetchAll])

  // ── Top-selling items today ───────────────────────────────────────────
  const topItems = (() => {
    const map = {}
    todaySales.forEach((sale) => {
      ;(sale.sale_items || []).forEach((si) => {
        if (!map[si.item_name]) map[si.item_name] = { name: si.item_name, qty: 0, revenue: 0 }
        map[si.item_name].qty     += Number(si.qty_kg)
        map[si.item_name].revenue += Number(si.line_total)
      })
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  })()

  // ── Greeting ──────────────────────────────────────────────────────────
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Error ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
            <button onClick={fetchAll} className="text-xs font-semibold underline text-red-700 hover:text-red-800">
              Retry
            </button>
          </div>
        )}

        {/* ── Header / Greeting Bar ─────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 mb-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">
              {greeting}, {shop?.owner_name || 'Owner'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {shop?.shop_name || 'MithaiBook'}
            </h1>
            <p className="text-gray-500 text-xs mt-1">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={fetchAll}
              title="Refresh dashboard"
              className="btn-secondary text-xs sm:text-sm px-3 py-2"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline text-xs text-gray-600 font-medium">Refresh</span>
            </button>
            <Link to="/orders/new" className="btn-secondary text-xs sm:text-sm px-3.5 py-2 font-semibold">
              + Advance Order
            </Link>
            <Link to="/sale" className="btn-primary text-xs sm:text-sm font-semibold flex items-center gap-1.5 py-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Quick Sale</span>
            </Link>
          </div>
        </div>

        {/* ── Operational Status Banner (Orders / Expiry / Closing) ───── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
          {/* Advance Orders Banner */}
          <Link
            to="/orders"
            className="p-3.5 rounded-xl border border-gray-200 bg-white hover:border-orange-300 hover:shadow-xs transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs">
                {activeOrders.length}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 leading-tight">Advance Orders</p>
                <p className="text-[11px] text-gray-500">
                  {activeOrders.length === 0
                    ? 'No pending orders'
                    : `₹${formatINR(totalBalanceDue)} balance to collect`}
                </p>
              </div>
            </div>
            <span className="text-xs text-orange-600 font-semibold">View →</span>
          </Link>

          {/* Expiry Banner */}
          <Link
            to="/expiry"
            className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
              expiredItems.length > 0
                ? 'bg-red-50/50 border-red-200 hover:border-red-300'
                : expiringTodayItems.length > 0
                ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  expiredItems.length > 0
                    ? 'bg-red-100 text-red-700'
                    : expiringTodayItems.length > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {expiredItems.length + expiringTodayItems.length}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 leading-tight">Shelf Life Alerts</p>
                <p className="text-[11px] text-gray-500">
                  {expiredItems.length > 0
                    ? `${expiredItems.length} items expired on tray`
                    : expiringTodayItems.length > 0
                    ? `${expiringTodayItems.length} items expiring today`
                    : 'All sweets well within shelf life'}
                </p>
              </div>
            </div>
            <span className="text-xs text-orange-600 font-semibold">Check →</span>
          </Link>

          {/* Daily Closing Banner */}
          <Link
            to="/reconcile"
            className="p-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-xs transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  todayRecon ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {todayRecon ? '✓' : '₹'}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 leading-tight">Day's Drawer Closing</p>
                <p className="text-[11px] text-gray-500">
                  {todayRecon
                    ? `Balanced (₹${formatINR(todayRecon.actual_cash)} counted)`
                    : 'Drawer count pending for tonight'}
                </p>
              </div>
            </div>
            <span className="text-xs text-orange-600 font-semibold">
              {todayRecon ? 'Details →' : 'Reconcile →'}
            </span>
          </Link>
        </div>

        {/* ── Loading skeleton ──────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-400">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading dashboard data…</p>
          </div>
        ) : (
          <>
            {/* ── 4-COLUMN STAT CARDS (Strict rules: large black numbers, small uppercase gray labels, simple line icons) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

              {/* Total Revenue */}
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="label mb-0">Today's Revenue</span>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                  ₹{formatINR(todayTotal)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {todayCount} {todayCount === 1 ? 'sale' : 'sales'} recorded today
                </p>
              </div>

              {/* Cash Card */}
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="label mb-0">Cash</span>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                  ₹{formatINR(paymentBreakdown.Cash || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {todaySales.filter((s) => s.payment_mode === 'Cash').length} cash bills
                </p>
              </div>

              {/* UPI Card */}
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="label mb-0">UPI / QR</span>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                  ₹{formatINR(paymentBreakdown.UPI || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {todaySales.filter((s) => s.payment_mode === 'UPI').length} digital transfers
                </p>
              </div>

              {/* Card Card */}
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="label mb-0">Card / POS</span>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                  ₹{formatINR(paymentBreakdown.Card || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {todaySales.filter((s) => s.payment_mode === 'Card').length} card transactions
                </p>
              </div>

            </div>

            {/* ── ROW 2: Top Items & Stock Alerts Side by Side ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

              {/* Top-Selling Items Today */}
              <div className="card">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <h2 className="font-bold text-gray-900 text-base">Top Selling Sweets</h2>
                  </div>
                  <span className="text-xs text-gray-500">Today</span>
                </div>

                {topItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">No sales recorded yet today.</p>
                    <Link to="/sale" className="btn-primary text-xs mt-3 inline-flex items-center gap-1.5">
                      Record First Sale
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topItems.map((item, idx) => {
                      const maxRevenue = topItems[0]?.revenue || 1
                      const pct = Math.round((item.revenue / maxRevenue) * 100)
                      return (
                        <div key={item.name} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-gray-800 flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-4 font-mono">{idx + 1}.</span>
                              {item.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{item.qty.toFixed(2)} kg</span>
                              <span className="font-bold text-gray-900">₹{formatINR(item.revenue)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Stock Alerts Panel */}
              <div className="card">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h2 className="font-bold text-gray-900 text-base">Low Stock Warnings</h2>
                  </div>
                  <Link
                    to="/counter"
                    className="text-xs text-orange-600 hover:text-orange-700 font-semibold"
                  >
                    Manage Counter →
                  </Link>
                </div>

                {lowStockItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-emerald-700">All trays well-stocked</p>
                    <p className="text-xs text-gray-500 mt-0.5">No critical stock warnings right now</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {lowStockItems.map((item) => {
                      const stock = Number(item.current_stock_kg)
                      const isOut = stock === 0
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isOut
                              ? 'bg-red-50/50 border-red-200'
                              : 'bg-amber-50/50 border-amber-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isOut ? 'bg-red-500' : 'bg-amber-500'}`} />
                            <span className="text-sm font-semibold text-gray-900 truncate">
                              {item.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              isOut
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isOut ? 'Out of Stock' : `${stock.toFixed(2)} kg`}
                            </span>
                            <Link
                              to="/counter"
                              className="text-xs text-gray-500 hover:text-orange-600 font-medium"
                            >
                              Update →
                            </Link>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* ── COUNTER STOCK OVERVIEW ────────────────────────────── */}
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900 text-base">Counter Stock Overview</h2>
                  <span className="text-xs text-gray-500 font-medium">({counterItems.length} items)</span>
                </div>
                <div className="flex items-center gap-3">
                  {outOfStockItems.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                      {outOfStockItems.length} out of stock
                    </span>
                  )}
                  <Link to="/counter/add" className="text-xs text-orange-600 hover:text-orange-700 font-semibold">
                    + Add Item
                  </Link>
                </div>
              </div>

              {counterItems.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">No items on counter yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {counterItems.map((item) => {
                    const stock = Number(item.current_stock_kg)
                    const isOut = stock === 0
                    const isLow = stock > 0 && stock <= 1.0
                    return (
                      <Link
                        key={item.id}
                        to="/counter"
                        className="p-3 rounded-lg border border-gray-200 bg-white hover:border-orange-300 hover:shadow-xs transition-all flex flex-col justify-between"
                      >
                        <span className="text-xs font-semibold text-gray-900 truncate">
                          {item.name}
                        </span>
                        <div className="mt-2">
                          <span className={`text-lg font-bold block ${
                            isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'
                          }`}>
                            {isOut ? 'OUT' : `${stock.toFixed(1)} kg`}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            ₹{Number(item.price_per_kg).toLocaleString('en-IN')}/kg
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── RECENT TRANSACTIONS ───────────────────────────────── */}
            <div className="card">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-900 text-base">Recent Transactions</h2>
                  <p className="text-xs text-gray-500">Latest recorded sales across counter and POS</p>
                </div>
                {todayCount > 0 && (
                  <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">
                    {todayCount} today · ₹{formatINR(todayTotal)}
                  </span>
                )}
              </div>

              {recentSales.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-sm">No sales recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Time</th>
                        <th className="pb-3 font-semibold">Items Sold</th>
                        <th className="pb-3 font-semibold">Payment Mode</th>
                        <th className="pb-3 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentSales.map((sale) => {
                        const isToday = sale.sale_date.startsWith(todayISO())
                        return (
                          <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 text-xs text-gray-600 whitespace-nowrap">
                              {isToday ? `Today · ${formatTime(sale.sale_date)}` : `${toLocalDate(sale.sale_date)} · ${formatTime(sale.sale_date)}`}
                            </td>
                            <td className="py-3 text-sm text-gray-800">
                              <span className="line-clamp-1">
                                {(sale.sale_items || []).map((si) => `${si.item_name} (${Number(si.qty_kg).toFixed(1)}kg)`).join(', ') || 'Direct sale'}
                              </span>
                            </td>
                            <td className="py-3 text-xs">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${
                                sale.payment_mode === 'Cash'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : sale.payment_mode === 'UPI'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}>
                                {sale.payment_mode}
                              </span>
                            </td>
                            <td className="py-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">
                              ₹{formatINR(sale.total_amount)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </>
        )}

      </main>
    </div>
  )
}
