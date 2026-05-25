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

function costColor(cost: number): string {
  if (cost > 15) return "var(--color-cost-red)"
  if (cost >= 8) return "var(--color-cost-yellow)"
  return "var(--color-cost-green)"
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  )
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
      typeof av === "string"
        ? (av as string).localeCompare(bv as string)
        : (av as number) - (bv as number)
    return sortDir === "asc" ? cmp : -cmp
  })

  const totalSessions = sessions.length
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0)
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  )
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0
  const maxCost = Math.max(...sessions.map((r) => r.estimated_cost_usd), 1)

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-12">
        <p className="text-muted">Loading…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-12">
        <p className="text-cost-red">Failed to load data: {error}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          Dashboard
        </span>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-2xl bg-card p-12 text-center shadow-sm">
          <p className="text-muted">No sessions recorded yet</p>
        </div>
      ) : (
        <>
          <div
            className="mb-8 grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <MetricCard label="Total Sessions" value={String(totalSessions)} />
            <MetricCard label="Total Cost" value={formatCost(totalCost)} />
            <MetricCard
              label="Total Tokens"
              value={formatTokens(totalTokens)}
            />
            <MetricCard
              label="Avg Cost / Session"
              value={formatCost(avgCost)}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className={`cursor-pointer select-none px-4 py-3 font-medium text-muted hover:text-ink ${
                        col.numeric ? "text-right" : ""
                      }`}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="ml-1">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border/50 ${
                      i % 2 === 1 ? "bg-row-alt" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {s.task}
                    </td>
                    <td className="px-4 py-3 text-muted">{s.date}</td>
                    <td className="px-4 py-3 text-muted">{s.model}</td>
                    <td className="px-4 py-3 text-right">{s.turns}</td>
                    <td className="px-4 py-3 text-right">
                      {formatTokens(s.input_tokens)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatTokens(s.output_tokens)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatTokens(s.cache_read_tokens)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span
                          style={{ color: costColor(s.estimated_cost_usd) }}
                        >
                          {formatCost(s.estimated_cost_usd)}
                        </span>
                        <div
                          className="h-1 rounded-full"
                          style={{
                            backgroundColor: costColor(s.estimated_cost_usd),
                            width: `${(s.estimated_cost_usd / maxCost) * 100}%`,
                            minWidth: "4px",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium text-ink">
                  <td className="px-4 py-3" colSpan={3}>
                    Totals
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sessions.reduce((s, r) => s + r.turns, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.input_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.output_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatTokens(
                      sessions.reduce((s, r) => s + r.cache_read_tokens, 0),
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCost(totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
