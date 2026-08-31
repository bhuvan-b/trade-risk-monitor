import React from 'react';
import './BreachFeed.css';

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function BreachFeed({ items, newIds }) {
  if (!items.length) {
    return (
      <div className="feed-empty">
        <span className="feed-empty-icon">✓</span>
        <span>No breaches recorded</span>
      </div>
    );
  }

  return (
    <div className="feed">
      {items.map(item => (
        <div key={item.id} className={`feed-item ${newIds.has(item.id) ? 'feed-item--new' : ''}`}>
          <div className="feed-header">
            <span className="feed-cp">{item.counterparty_id}</span>
            <span className="feed-time">{timeAgo(item.breached_at)}</span>
          </div>
          <div className="feed-details">
            <span className="feed-exposure">{fmt(item.exposure)}</span>
            <span className="feed-vs">vs</span>
            <span className="feed-limit">{fmt(item.limit_amount)} limit</span>
          </div>
          <div className="feed-bar-wrap">
            <div
              className="feed-bar"
              style={{ width: `${Math.min(parseFloat(item.utilisation_pct), 100)}%` }}
            />
          </div>
          <div className="feed-pct">{item.utilisation_pct}% utilised</div>
        </div>
      ))}
    </div>
  );
}
