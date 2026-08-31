import { useState, useEffect, useCallback } from 'react'
import ExposureTable from './components/ExposureTable.jsx'
import BreachFeed from './components/BreachFeed.jsx'
import SummaryBar from './components/SummaryBar.jsx'
import './App.css'

const POLL_INTERVAL_MS = 4000

const API = (path) => `/api${path}`

function usePoll(url, interval) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`${r.status}`)
      const j = await r.json()
      setData(j)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, interval)
    return () => clearInterval(id)
  }, [fetch_, interval])

  return { data, error, loading }
}

export default function App() {
  const { data: summary } = usePoll(API('/summary'), POLL_INTERVAL_MS)
  const { data: exposure, loading: expLoading } = usePoll(API('/exposure'), POLL_INTERVAL_MS)
  const { data: breaches } = usePoll(API('/breaches?limit=20'), POLL_INTERVAL_MS)

  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    if (!expLoading) setLastUpdated(new Date())
  }, [exposure, expLoading])

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">⬡ RISK MONITOR</span>
          <span className="tagline">Counterparty Exposure · Live</span>
        </div>
        <div className="header-right">
          {lastUpdated && (
            <span className="last-updated">
              updated <span className="mono">{lastUpdated.toLocaleTimeString()}</span>
            </span>
          )}
          <span className="pulse-dot" />
        </div>
      </header>

      <main className="main">
        <SummaryBar summary={summary} />
        <div className="panels">
          <section className="panel panel--wide">
            <h2 className="panel-title">Exposure by Counterparty</h2>
            <ExposureTable
              data={exposure}
              loading={expLoading}
            />
          </section>
          <section className="panel panel--narrow">
            <h2 className="panel-title">Breach Events</h2>
            <BreachFeed breaches={breaches?.breaches} />
          </section>
        </div>
      </main>
    </div>
  )
}
