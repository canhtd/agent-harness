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

function costColor(cost: number): string {
  if (cost > 15) return "var(--cost-red)"
  if (cost >= 8) return "var(--cost-yellow)"
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

  const totalSessions = sessions.length
  const totalCost = sessions.reduce((s, r) => s + r.estimated_cost_usd, 0)
  const totalTokens = sessions.reduce(
    (s, r) => s + r.input_tokens + r.output_tokens,
    0,
  )
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0

  const totalsRow = {
    turns: sessions.reduce((s, r) => s + r.turns, 0),
    input_tokens: sessions.reduce((s, r) => s + r.input_tokens, 0),
    output_tokens: sessions.reduce((s, r) => s + r.output_tokens, 0),
    cache_read_tokens: sessions.reduce((s, r) => s + r.cache_read_tokens, 0),
    estimated_cost_usd: totalCost,
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">Agent Harness</h1>
        <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
          Dashboard
        </span>
      </header>

      {sessions.length === 0 ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-muted text-lg">No sessions recorded yet</p>
        </div>
      ) : (
        <>
          <div className="metric-grid mb-8">
            <MetricCard label="Total Sessions" value={String(totalSessions)} />
            <MetricCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} />
            <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} />
            <MetricCard label="Avg Cost/Session" value={`$${avgCost.toFixed(2)}`} />
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <SortHeader label="Task" sortKey="task" current={sortKey} asc={sortAsc} onClick={handleSort} />
                  <SortHeader label="Date" sortKey="date" current={sortKey} asc={sortAsc} onClick={handleSort} />
                  <SortHeader label="Model" sortKey="model" current={sortKey} asc={sortAsc} onClick={handleSort} />
                  <SortHeader label="Turns" sortKey="turns" current={sortKey} asc={sortAsc} onClick={handleSort} align="right" />
                  <SortHeader label="Input" sortKey="input_tokens" current={sortKey} asc={sortAsc} onClick={handleSort} align="right" />
                  <SortHeader label="Output" sortKey="output_tokens" current={sortKey} asc={sortAsc} onClick={handleSort} align="right" />
                  <SortHeader label="Cache Read" sortKey="cache_read_tokens" current={sortKey} asc={sortAsc} onClick={handleSort} align="right" />
                  <SortHeader label="Cost" sortKey="estimated_cost_usd" current={sortKey} asc={sortAsc} onClick={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-black/[0.02]"}>
                    <td className="px-4 py-3 font-medium text-ink">{s.task}</td>
                    <td className="px-4 py-3 text-muted">{new Date(s.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{s.model}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.turns}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatTokens(s.input_tokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatTokens(s.output_tokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatTokens(s.cache_read_tokens)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="inline-flex items-center gap-1.5 tabular-nums"
                        style={{ color: costColor(s.estimated_cost_usd) }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: costColor(s.estimated_cost_usd) }}
                        />
                        ${s.estimated_cost_usd.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/10 font-semibold">
                  <td className="px-4 py-3 text-ink" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totalsRow.turns}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatTokens(totalsRow.input_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatTokens(totalsRow.output_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatTokens(totalsRow.cache_read_tokens)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span style={{ color: costColor(totalsRow.estimated_cost_usd) }}>
                      ${totalsRow.estimated_cost_usd.toFixed(2)}
                    </span>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</p>
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  current,
  asc,
  onClick,
  align = "left",
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  asc: boolean
  onClick: (key: SortKey) => void
  align?: "left" | "right"
}) {
  const active = current === sortKey
  return (
    <th
      className={`cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted hover:text-ink ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onClick(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-1">{asc ? "↑" : "↓"}</span>
      )}
    </th>
  )
}
