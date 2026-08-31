import './BreachFeed.css'

const fmtUSD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
    notation: 'compact', maximumFractionDigits: 1 }).format(n)

const fmtTime = (s) => s ? new Date(s).toLocaleTimeString() : '—'

export default function BreachFeed({ breaches }) {
  if (!breaches) return <div className="feed-empty">Loading…</div>
  if (!breaches.length) return (
    <div className="feed-empty">
      <span className="feed-empty-icon">✓</span>
      No breaches detected
    </div>
  )

  return (
    <div className="breach-feed">
      {breaches.map((b) => {
        const excess = b.exposure_at_breach - b.limit_usd
        const pct = ((b.exposure_at_breach / b.limit_usd) * 100).toFixed(0)
        return (
          <div key={b.id} className="breach-item">
            <div className="breach-header">
              <span className="breach-cp">{b.counterparty}</span>
              <span className="breach-time mono">{fmtTime(b.detected_at)}</span>
            </div>
            <div className="breach-detail">
              <span className="mono breach-exposure">{fmtUSD(b.exposure_at_breach)}</span>
              <span className="breach-meta">
                {pct}% of limit · +{fmtUSD(excess)} over
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
