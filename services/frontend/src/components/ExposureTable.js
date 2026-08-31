import React from 'react';
import './ExposureTable.css';

function UtilBar({ pct, breached }) {
  const capped = Math.min(pct, 100);
  const color = breached ? 'var(--breach)' : pct > 80 ? 'var(--warn)' : 'var(--safe)';
  return (
    <div className="util-track">
      <div className="util-fill" style={{ width: `${capped}%`, background: color }} />
      {breached && <div className="util-overflow" />}
    </div>
  );
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function ExposureTable({ rows }) {
  if (!rows.length) {
    return <div className="empty-state">Waiting for data...</div>;
  }

  return (
    <table className="exp-table">
      <thead>
        <tr>
          <th>COUNTERPARTY</th>
          <th className="num">EXPOSURE</th>
          <th className="num">LIMIT</th>
          <th>UTILISATION</th>
          <th className="num">%</th>
          <th>STATUS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const pct = parseFloat(row.utilisation_pct);
          const breached = row.breached;
          return (
            <tr key={row.counterparty_id} className={breached ? 'row-breach' : ''}>
              <td className="cp-id">{row.counterparty_id}</td>
              <td className="num mono">{fmt(row.exposure)}</td>
              <td className="num mono muted">{fmt(row.limit_amount)}</td>
              <td className="bar-cell">
                <UtilBar pct={pct} breached={breached} />
              </td>
              <td className={`num mono pct ${breached ? 'text-breach' : pct > 80 ? 'text-warn' : 'text-safe'}`}>
                {pct}%
              </td>
              <td>
                <span className={`badge ${breached ? 'badge-breach' : 'badge-ok'}`}>
                  {breached ? 'BREACH' : 'OK'}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
