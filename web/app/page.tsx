"use client"

import { useEffect, useState } from "react"
import type { TokenRecord } from "./types"

type SortKey = keyof TokenRecord
type SortDir = "asc" | "desc"

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "task", label: "Task" },
  { key: "date", label: "Date" },
  { key: "model", label: "Model" },
  { key: "turns", label: "Turns", numeric: true },
  { key: "input_tokens", label: "Input tokens", numeric: true },
  { key: "output_tokens", label: "Output tokens", numeric: true },
  { key: "cache_read_tokens", label: "Cache read", numeric: true },
  { key: "estimated_cost_usd", label: "Cost", numeric: true },
]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)"
  if (cost >= 8) return "var(--color-cost-yellow)"
  return "var(--color-cost-green)"
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { sessions: TokenRecord[] }) => setSessions(data.sessions))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : Number(av) - Number(bv)
    return sortDir === "asc" ? cmp : -cmp
  })

  const totalSessions = sessions.length
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0)
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  )
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0
  const totalInput = sessions.reduce((s, r) => s + r.input_tokens, 0)
  const totalOutput = sessions.reduce((s, r) => s + r.output_tokens, 0)
  const totalCacheRead = sessions.reduce((s, r) => s + r.cache_read_tokens, 0)
  const totalTurns = sessions.reduce((s, r) => s + r.turns, 0)

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
          <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent">
            Loading…
          </span>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
        </div>
        <p className="mt-8 text-center text-cost-red">
          Failed to load sessions: {error}
        </p>
      </main>
    )
  }

  if (sessions.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
          <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent">
            Idle
          </span>
        </div>
        <p className="mt-16 text-center text-muted">
          No sessions recorded yet
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
        <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent">
          {totalSessions} sessions
        </span>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-card p-6 shadow-sm">
          <p className="text-sm text-muted">Total Sessions</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {totalSessions}
          </p>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-sm">
          <p className="text-sm text-muted">Total Cost</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCost(totalCost)}
          </p>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-sm">
          <p className="text-sm text-muted">Total Tokens</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatTokens(totalTokens)}
          </p>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-sm">
          <p className="text-sm text-muted">Avg Cost/Session</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCost(avgCost)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`cursor-pointer select-none whitespace-nowrap border-b border-border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink ${col.numeric ? "text-right" : ""}`}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr
                key={i}
                className={`border-b border-border hover:bg-accent/5 ${i % 2 === 1 ? "bg-row-alt" : ""}`}
              >
                <td className="px-4 py-2.5 font-medium">{s.task}</td>
                <td className="px-4 py-2.5">{formatDate(s.date)}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{s.model}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {s.turns}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatTokens(s.input_tokens)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatTokens(s.output_tokens)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatTokens(s.cache_read_tokens)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span
                    className="font-semibold"
                    style={{ color: costColor(s.estimated_cost_usd) }}
                  >
                    {formatCost(s.estimated_cost_usd)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-right tabular-nums">
                {totalTurns}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatTokens(totalInput)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatTokens(totalOutput)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatTokens(totalCacheRead)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span style={{ color: costColor(totalCost) }}>
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
