import React, { useState, useEffect, useCallback } from 'react';
import ExposureTable from './components/ExposureTable';
import BreachFeed from './components/BreachFeed';
import StatusBar from './components/StatusBar';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';
const POLL_INTERVAL = 4000; // ms

export default function App() {
  const [exposure, setExposure] = useState([]);
  const [breaches, setBreaches] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [apiStatus, setApiStatus] = useState('connecting');
  const [newBreachIds, setNewBreachIds] = useState(new Set());

  const fetchData = useCallback(async () => {
    try {
      const [expRes, brRes] = await Promise.all([
        fetch(`${API_BASE}/exposure`),
        fetch(`${API_BASE}/breaches?limit=30`),
      ]);

      if (!expRes.ok || !brRes.ok) throw new Error('API error');

      const [expData, brData] = await Promise.all([expRes.json(), brRes.json()]);

      // Detect new breaches for flash animation
      setBreaches(prev => {
        const prevIds = new Set(prev.map(b => b.id));
        const freshIds = new Set(brData.filter(b => !prevIds.has(b.id)).map(b => b.id));
        if (freshIds.size > 0) {
          setNewBreachIds(freshIds);
          setTimeout(() => setNewBreachIds(new Set()), 2000);
        }
        return brData;
      });

      setExposure(expData);
      setLastUpdated(new Date());
      setApiStatus('ok');
    } catch {
      setApiStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const totalBreached = exposure.filter(e => e.breached).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="header-logo">◈</span>
          <div>
            <h1 className="header-title">RISK MONITOR</h1>
            <span className="header-sub">Counterparty Exposure Tracker</span>
          </div>
        </div>
        <StatusBar status={apiStatus} lastUpdated={lastUpdated} breachedCount={totalBreached} />
      </header>

      <main className="app-main">
        <section className="panel panel-exposure">
          <h2 className="panel-title">LIVE EXPOSURE</h2>
          <ExposureTable rows={exposure} />
        </section>

        <section className="panel panel-breaches">
          <h2 className="panel-title">
            BREACH LOG
            {breaches.length > 0 && (
              <span className="breach-count">{breaches.length}</span>
            )}
          </h2>
          <BreachFeed items={breaches} newIds={newBreachIds} />
        </section>
      </main>
    </div>
  );
}
