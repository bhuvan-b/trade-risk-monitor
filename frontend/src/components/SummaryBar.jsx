import './SummaryBar.css'

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    notation: 'compact', maximumFractionDigits: 1
  }).format(n)

const fmtInt = (n) => n == null ? '—' : Number(n).toLocaleString()

export default function SummaryBar({ summary }) {
  if (!summary) return <div className="summary-bar summary-bar--loading">Loading…</div>

  const breachedCount = Number(summary.breached_count ?? 0)

  return (
    <div className="summary-bar">
      <Stat label="Total Exposure" value={fmt(summary.total_exposure)} />
      <Stat label="Counterparties" value={fmtInt(summary.counterparty_count)} />
      <Stat label="Trades Processed" value={fmtInt(summary.total_trades)} />
      <Stat
        label="Limit Breaches"
        value={fmtInt(summary.total_breach_events)}
        alert={breachedCount > 0}
      />
      <Stat
        label="Counterparties Breached"
        value={fmtInt(breachedCount)}
        alert={breachedCount > 0}
      />
      <Stat label="Limit (per CP)" value={fmt(summary.limit_usd)} dim />
    </div>
  )
}

function Stat({ label, value, alert, dim }) {
  return (
    <div className={`stat ${alert ? 'stat--alert' : ''} ${dim ? 'stat--dim' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
