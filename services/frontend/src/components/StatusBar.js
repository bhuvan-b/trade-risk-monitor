import React from 'react';
import './StatusBar.css';

export default function StatusBar({ status, lastUpdated, breachedCount }) {
  return (
    <div className="status-bar">
      {breachedCount > 0 && (
        <div className="status-breach-alert">
          ⚠ {breachedCount} BREACH{breachedCount > 1 ? 'ES' : ''}
        </div>
      )}
      <div className="status-dot-wrap">
        <span className={`status-dot ${status === 'ok' ? 'dot-ok' : status === 'error' ? 'dot-err' : 'dot-conn'}`} />
        <span className="status-label">
          {status === 'ok' ? 'LIVE' : status === 'error' ? 'API ERROR' : 'CONNECTING'}
        </span>
      </div>
      {lastUpdated && (
        <span className="status-time">
          {lastUpdated.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
