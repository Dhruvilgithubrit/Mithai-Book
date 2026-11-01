import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function formatINR(val) {
  return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

const DENOMINATIONS = [500, 200, 100, 50, 20, 10]

export default function ReconcilePage() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Today's System Figures
  const [todaySales, setTodaySales] = useState([])
  const [existingRecon, setExistingRecon] = useState(null)
  const [pastRecons, setPastRecons] = useState([])

  // Drawer Cash Input: Denomination Counts
  const [counts, setCounts] = useState({
    500: '',
    200: '',
    100: '',
    50: '',
    20: '',
    10: '',
    coins: '',
  })
  const [manualCashInput, setManualCashInput] = useState('')
  const [useDenominations, setUseDenominations] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Fetch Today's Figures & History ─────────────────────────────────────
  const loadData = async () => {
    if (!user) return
    setError('')
    try {
      const today = todayISO()
      const todayStart = `${today}T00:00:00`
      const todayEnd = `${today}T23:59:59`

      const [salesRes, todayReconRes, historyRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id, total_amount, payment_mode, sale_date')
          .eq('shop_id', user.id)
          .gte('sale_date', todayStart)
          .lte('sale_date', todayEnd),
        supabase
          .from('daily_reconciliations')
          .select('*')
          .eq('shop_id', user.id)
          .eq('recon_date', today)
          .maybeSingle(),
        supabase
          .from('daily_reconciliations')
          .select('*')
          .eq('shop_id', user.id)
          .order('recon_date', { ascending: false })
          .limit(10),
      ])

      if (salesRes.error) throw salesRes.error
      if (todayReconRes.error) throw todayReconRes.error
      if (historyRes.error) throw historyRes.error

      setTodaySales(salesRes.data || [])
      setPastRecons(historyRes.data || [])

      if (todayReconRes.data) {
        setExistingRecon(todayReconRes.data)
        setManualCashInput(String(todayReconRes.data.actual_cash))
        setNotes(todayReconRes.data.notes || '')
      }
    } catch (err) {
      console.error('Reconciliation load error:', err)
      setError('Failed to load daily sales data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  // ── Calculate System Totals ─────────────────────────────────────────────
  const systemCash = todaySales
    .filter((s) => s.payment_mode === 'Cash')
    .reduce((sum, s) => sum + Number(s.total_amount), 0)

  const systemUPI = todaySales
    .filter((s) => s.payment_mode === 'UPI')
    .reduce((sum, s) => sum + Number(s.total_amount), 0)

  const systemCard = todaySales
    .filter((s) => s.payment_mode === 'Card')
    .reduce((sum, s) => sum + Number(s.total_amount), 0)

  const totalRevenue = systemCash + systemUPI + systemCard

  // ── Compute Actual Cash Counted ─────────────────────────────────────────
  const denomTotal =
    DENOMINATIONS.reduce((sum, denom) => {
      const qty = parseInt(counts[denom], 10) || 0
      return sum + qty * denom
    }, 0) + (parseFloat(counts.coins) || 0)

  const actualCash = useDenominations ? denomTotal : parseFloat(manualCashInput) || 0
  const difference = actualCash - systemCash

  const handleDenomChange = (denom, val) => {
    setCounts((prev) => ({ ...prev, [denom]: val }))
  }

  // ── Submit Reconciliation ───────────────────────────────────────────────
  const handleSaveRecon = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setSaving(true)

    try {
      const today = todayISO()
      const payload = {
        shop_id: user.id,
        recon_date: today,
        system_cash: systemCash,
        actual_cash: actualCash,
        total_upi: systemUPI,
        total_card: systemCard,
        total_revenue: totalRevenue,
        notes: notes.trim() || null,
      }

      const { data, error: saveErr } = await supabase
        .from('daily_reconciliations')
        .upsert(payload, { onConflict: 'shop_id, recon_date' })
        .select()
        .single()

      if (saveErr) throw saveErr

      setExistingRecon(data)
      setSuccessMsg('Daily reconciliation saved successfully!')
      loadData()
    } catch (err) {
      console.error('Save reconciliation error:', err)
      setError(err.message || 'Failed to save daily closing record.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                End-of-Day Cash Drawer Closing
              </h1>
              {existingRecon && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ Reconciled Today
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Count drawer cash, verify against system billing totals, and record closing discrepancies
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="btn-secondary text-sm font-semibold flex items-center gap-2">
              <span>Dashboard Overview →</span>
            </Link>
          </div>
        </div>

        {/* ── Alerts ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            {successMsg}
          </div>
        )}

        {/* ── System Totals (Row 1) ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <span className="label mb-1">Expected System Cash</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900">₹{formatINR(systemCash)}</p>
            <p className="text-xs text-gray-500 mt-1">Cash bills recorded today</p>
          </div>

          <div className="card">
            <span className="label mb-1">UPI / QR Revenue</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-blue-600">₹{formatINR(systemUPI)}</p>
            <p className="text-xs text-gray-500 mt-1">Direct to bank</p>
          </div>

          <div className="card">
            <span className="label mb-1">Card / POS Revenue</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-purple-600">₹{formatINR(systemCard)}</p>
            <p className="text-xs text-gray-500 mt-1">Terminal payments</p>
          </div>

          <div className="card">
            <span className="label mb-1">Total Day's Business</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600">₹{formatINR(totalRevenue)}</p>
            <p className="text-xs text-gray-500 mt-1">{todaySales.length} total bills</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">

          {/* ── Left: Cash Counting Interface (7 cols) ──────────────── */}
          <div className="lg:col-span-7">
            <div className="card shadow-sm p-6">
              <div className="flex items-center justify-between pb-3 mb-5 border-b border-gray-100">
                <div>
                  <h2 className="font-bold text-gray-900 text-base">Drawer Physical Cash Count</h2>
                  <p className="text-xs text-gray-500">Count banknotes and coins in drawer</p>
                </div>

                {/* Mode toggle */}
                <button
                  type="button"
                  onClick={() => setUseDenominations(!useDenominations)}
                  className="text-xs text-orange-600 font-semibold hover:underline"
                >
                  {useDenominations ? 'Switch to Simple Total Input' : 'Switch to Denomination Counter'}
                </button>
              </div>

              <form onSubmit={handleSaveRecon} className="space-y-5">

                {useDenominations ? (
                  /* Indian Currency Denomination Grid */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {DENOMINATIONS.map((denom) => {
                        const noteCount = parseInt(counts[denom], 10) || 0
                        const subtotal = noteCount * denom
                        return (
                          <div key={denom} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-gray-800 text-sm">₹{denom} notes</span>
                              <span className="text-[11px] font-semibold text-gray-500">
                                ₹{formatINR(subtotal)}
                              </span>
                            </div>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={counts[denom]}
                              onChange={(e) => handleDenomChange(denom, e.target.value)}
                              className="input text-center font-bold text-sm min-h-9 py-1 bg-white"
                            />
                          </div>
                        )
                      })}

                      {/* Coins */}
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-gray-800 text-sm">Coins Total (₹)</span>
                          <span className="text-[11px] font-semibold text-gray-500">
                            ₹{formatINR(counts.coins)}
                          </span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={counts.coins}
                          onChange={(e) => setCounts((prev) => ({ ...prev, coins: e.target.value }))}
                          className="input text-center font-bold text-sm min-h-9 py-1 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Simple manual entry */
                  <div>
                    <label className="label">Total Physical Cash in Hand (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">₹</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="e.g. 15450"
                        value={manualCashInput}
                        onChange={(e) => setManualCashInput(e.target.value)}
                        className="input pl-8 text-xl font-bold"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Notes input */}
                <div>
                  <label className="label">Closing Notes / Discrepancy Reason (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. ₹200 paid to milkman from drawer, ₹500 opening float"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary w-full text-base font-semibold min-h-12"
                >
                  {saving ? 'Saving Closing Record…' : existingRecon ? 'Update Reconciliation Record' : 'Save End-of-Day Reconciliation'}
                </button>

              </form>
            </div>
          </div>

          {/* ── Right: Discrepancy / Reconciliation Gauge (5 cols) ───── */}
          <div className="lg:col-span-5">
            <div className="card shadow-sm p-6 sticky top-20 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-base mb-1">Reconciliation Summary</h3>
                <p className="text-xs text-gray-500 mb-5">Comparison between register sales and physical cash</p>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100">
                    <span className="text-gray-500">System Expected Cash:</span>
                    <span className="font-bold text-gray-900">₹{formatINR(systemCash)}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100">
                    <span className="text-gray-500">Physical Cash Counted:</span>
                    <span className="font-bold text-gray-900">₹{formatINR(actualCash)}</span>
                  </div>

                  <div className="flex justify-between items-center text-base py-3 border-b border-gray-200">
                    <span className="font-bold text-gray-900">Difference / Variance:</span>
                    <span
                      className={`font-extrabold text-xl ${
                        difference === 0
                          ? 'text-emerald-600'
                          : difference > 0
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {difference === 0 ? '₹0.00' : `${difference > 0 ? '+₹' : '-₹'}${formatINR(Math.abs(difference))}`}
                    </span>
                  </div>
                </div>

                {/* Status Callout Banner */}
                <div
                  className={`p-4 rounded-xl border text-xs ${
                    difference === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : difference > 0
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <p className="font-bold text-sm mb-0.5">
                    {difference === 0
                      ? '✓ Cash Drawer Balanced'
                      : difference > 0
                      ? '⚠️ Cash Over / Excess'
                      : '⚠️ Cash Shortage'}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {difference === 0
                      ? 'Drawer physical count exactly matches the system sales total.'
                      : difference > 0
                      ? `There is ₹${formatINR(difference)} more in drawer than recorded in billing.`
                      : `The drawer has ₹${formatINR(Math.abs(difference))} less than recorded bills. Check for unrecorded drawer expenses.`}
                  </p>
                </div>
              </div>

              {existingRecon && (
                <div className="mt-6 pt-4 border-t border-gray-100 text-[11px] text-gray-400 text-center">
                  Last saved at {new Date(existingRecon.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Past 7 Days History Table ──────────────────────────────── */}
        <div className="card shadow-sm">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
            <div>
              <h2 className="font-bold text-gray-900 text-base">Past Daily Reconciliations</h2>
              <p className="text-xs text-gray-500">History of drawer closing records</p>
            </div>
          </div>

          {pastRecons.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">No previous daily closing records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Date</th>
                    <th className="pb-3 font-semibold">System Cash</th>
                    <th className="pb-3 font-semibold">Physical Cash</th>
                    <th className="pb-3 font-semibold">Difference</th>
                    <th className="pb-3 font-semibold">Total Revenue</th>
                    <th className="pb-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pastRecons.map((r) => {
                    const diff = Number(r.difference)
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors text-xs">
                        <td className="py-3 font-semibold text-gray-900 whitespace-nowrap">
                          {r.recon_date}
                        </td>
                        <td className="py-3 text-gray-700">₹{formatINR(r.system_cash)}</td>
                        <td className="py-3 text-gray-900 font-bold">₹{formatINR(r.actual_cash)}</td>
                        <td className="py-3">
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                              diff === 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : diff > 0
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {diff === 0 ? 'Balanced' : `${diff > 0 ? '+₹' : '-₹'}${formatINR(Math.abs(diff))}`}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-gray-900">₹{formatINR(r.total_revenue)}</td>
                        <td className="py-3 text-gray-500 max-w-xs truncate">
                          {r.notes || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
