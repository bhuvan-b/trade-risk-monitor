import './ExposureTable.css'

const fmtUSD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s) => s ? new Date(s).toLocaleTimeString() : '—'

export default function ExposureTable({ data, loading }) {
  if (loading) return <div className="table-empty">Loading exposure data…</div>
  if (!data?.counterparties?.length)
    return <div className="table-empty">No trade data yet. Run the trade generator.</div>

  const rows = data.counterparties

  return (
    <div className="table-wrap">
      <table className="exp-table">
        <thead>
          <tr>
            <th>Counterparty</th>
            <th className="right">Net Exposure</th>
            <th>Utilisation</th>
            <th className="right">Trades</th>
            <th className="right">Last Trade</th>
            <th className="center">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = Math.min(parseFloat(r.utilisation_pct ?? 0), 100)
            const breached = r.breached
            const warn = pct >= 80 && !breached

            return (
              <tr key={r.counterparty} className={breached ? 'row--breach' : warn ? 'row--warn' : ''}>
                <td className="cp-name">{r.counterparty}</td>
                <td className="right mono">{fmtUSD(r.net_exposure)}</td>
                <td className="util-cell">
                  <div className="util-bar-bg">
                    <div
                      className={`util-bar-fill ${breached ? 'fill--breach' : warn ? 'fill--warn' : 'fill--safe'}`}
                      style={{ width: `${Math.max(pct, 0)}%` }}
                    />
                  </div>
                  <span className="mono util-pct">{pct.toFixed(1)}%</span>
                </td>
                <td className="right mono">{r.trade_count}</td>
                <td className="right mono muted">{fmtDate(r.updated_at)}</td>
                <td className="center">
                  <span className={`badge ${breached ? 'badge--breach' : warn ? 'badge--warn' : 'badge--ok'}`}>
                    {breached ? 'BREACH' : warn ? 'WARN' : 'OK'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
