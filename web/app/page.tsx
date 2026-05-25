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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function costColor(cost: number): string {
  if (cost > 15) return "bg-cost-red"
  if (cost >= 8) return "bg-cost-yellow"
  return "bg-cost-green"
}

const HEADER_LABELS: Record<SortKey, string> = {
  task: "Task",
  date: "Date",
  model: "Model",
  turns: "Turns",
  input_tokens: "Input",
  output_tokens: "Output",
  cache_read_tokens: "Cache Read",
  estimated_cost_usd: "Cost",
}

export default function Home() {
  const [sessions, setSessions] = useState<TokenRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: { sessions: TokenRecord[] }) => {
        setSessions(data.sessions)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortAsc ? cmp : -cmp
  })

  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0)
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  )
  const avgCost = sessions.length > 0 ? totalCost / sessions.length : 0

  if (loading) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-cost-red">Failed to load token data</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-page">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
          <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent">
            Dashboard
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="text-muted text-lg">No sessions recorded yet</p>
          </div>
        ) : (
          <>
            {/* Metric Cards */}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Sessions" value={sessions.length.toString()} />
              <MetricCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} />
              <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} />
              <MetricCard label="Avg Cost / Session" value={`$${avgCost.toFixed(2)}`} />
            </div>

            {/* Sessions Table */}
            <div className="overflow-x-auto rounded-2xl bg-card shadow-sm border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {(Object.keys(HEADER_LABELS) as SortKey[]).map((key) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="cursor-pointer px-4 py-3 font-medium text-muted select-none hover:text-ink whitespace-nowrap"
                      >
                        {HEADER_LABELS[key]}
                        {sortKey === key && (
                          <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr
                      key={`${s.task}-${s.date}-${i}`}
                      className={i % 2 === 1 ? "bg-row-alt" : ""}
                    >
                      <td className="px-4 py-3 font-medium text-ink">{s.task}</td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {new Date(s.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted">{s.model}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.turns}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTokens(s.input_tokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTokens(s.output_tokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTokens(s.cache_read_tokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <span
                          className={`inline-block mr-2 h-2 w-2 rounded-full ${costColor(s.estimated_cost_usd)}`}
                        />
                        ${s.estimated_cost_usd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">
                      {sessions.reduce((s, r) => s + r.turns, 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatTokens(
                        sessions.reduce((s, r) => s + r.input_tokens, 0),
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatTokens(
                        sessions.reduce((s, r) => s + r.output_tokens, 0),
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatTokens(
                        sessions.reduce((s, r) => s + r.cache_read_tokens, 0),
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${totalCost.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm border border-border">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  )
}
