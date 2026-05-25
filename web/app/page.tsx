"use client"

import { useEffect, useState } from "react"

interface TokenRecord {
  task: string
  date: string
  model: string
  turns: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  estimated_cost_usd: number
}

type SortKey =
  | "task"
  | "date"
  | "model"
  | "turns"
  | "input_tokens"
  | "output_tokens"
  | "cache_read_tokens"
  | "estimated_cost_usd"

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--cost-red)"
  if (cost > 8) return "var(--cost-yellow)"
  return "var(--cost-green)"
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((data: { sessions: TokenRecord[] }) => {
        setSessions(data.sessions)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === "string" && typeof bv === "string") {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av)
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === "task" || key === "date" || key === "model")
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ""
    return sortAsc ? " ↑" : " ↓"
  }

  const totalSessions = sessions.length
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0)
  const totalTokens = sessions.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0)
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0

  const totalInput = sessions.reduce((s, r) => s + r.input_tokens, 0)
  const totalOutput = sessions.reduce((s, r) => s + r.output_tokens, 0)
  const totalCacheRead = sessions.reduce((s, r) => s + r.cache_read_tokens, 0)
  const totalTurns = sessions.reduce((s, r) => s + r.turns, 0)

  if (loading) {
    return (
      <main className="dashboard">
        <div className="header">
          <h1>Agent Harness</h1>
          <span className="badge">Loading...</span>
        </div>
      </main>
    )
  }

  if (sessions.length === 0) {
    return (
      <main className="dashboard">
        <div className="header">
          <h1>Agent Harness</h1>
          <span className="badge">Idle</span>
        </div>
        <div className="empty-state">No sessions recorded yet</div>
      </main>
    )
  }

  return (
    <main className="dashboard">
      <div className="header">
        <h1>Agent Harness</h1>
        <span className="badge">{totalSessions} sessions</span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Sessions</div>
          <div className="metric-value">{totalSessions}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Cost</div>
          <div className="metric-value">{formatCost(totalCost)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Tokens</div>
          <div className="metric-value">{formatTokens(totalTokens)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Cost/Session</div>
          <div className="metric-value">{formatCost(avgCost)}</div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort("task")}>Task{sortIndicator("task")}</th>
              <th onClick={() => toggleSort("date")}>Date{sortIndicator("date")}</th>
              <th onClick={() => toggleSort("model")}>Model{sortIndicator("model")}</th>
              <th onClick={() => toggleSort("turns")}>Turns{sortIndicator("turns")}</th>
              <th onClick={() => toggleSort("input_tokens")}>Input Tokens{sortIndicator("input_tokens")}</th>
              <th onClick={() => toggleSort("output_tokens")}>Output Tokens{sortIndicator("output_tokens")}</th>
              <th onClick={() => toggleSort("cache_read_tokens")}>Cache Read{sortIndicator("cache_read_tokens")}</th>
              <th onClick={() => toggleSort("estimated_cost_usd")}>Cost{sortIndicator("estimated_cost_usd")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={i}>
                <td className="cell-task">{s.task}</td>
                <td>{formatDate(s.date)}</td>
                <td className="cell-model">{s.model}</td>
                <td className="cell-number">{s.turns}</td>
                <td className="cell-number">{formatTokens(s.input_tokens)}</td>
                <td className="cell-number">{formatTokens(s.output_tokens)}</td>
                <td className="cell-number">{formatTokens(s.cache_read_tokens)}</td>
                <td>
                  <span className="cost-bar" style={{ color: costColor(s.estimated_cost_usd) }}>
                    {formatCost(s.estimated_cost_usd)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="cell-task">Total</td>
              <td></td>
              <td></td>
              <td className="cell-number">{totalTurns}</td>
              <td className="cell-number">{formatTokens(totalInput)}</td>
              <td className="cell-number">{formatTokens(totalOutput)}</td>
              <td className="cell-number">{formatTokens(totalCacheRead)}</td>
              <td>
                <span className="cost-bar" style={{ color: costColor(totalCost) }}>
                  {formatCost(totalCost)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  )
}
