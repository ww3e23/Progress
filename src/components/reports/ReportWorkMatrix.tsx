import type { ReportWorkRow } from '../../lib/reportSummary'

export function ReportWorkMatrix({ rows }: { rows: ReportWorkRow[] }) {
  if (rows.length === 0) {
    return <p className="report-empty">請先設定棟別與工項。</p>
  }

  return (
    <div className="report-bar-list glass">
      {rows.map((row) => (
        <div key={row.id} className="report-bar-item">
          <div className="report-bar-head">
            <strong>{row.name}</strong>
            <span className="nums">{row.percent}%</span>
          </div>
          <div className="report-bar-track" aria-hidden>
            <i style={{ width: `${row.percent}%` }} />
          </div>
          <p className="report-bar-meta">
            {row.householdsTotal === 0
              ? '沒有應施作戶（皆不適用）'
              : `已完成 ${row.householdsDone} 戶 · 未完成 ${row.householdsLeft} 戶 · 應施作 ${row.householdsTotal} 戶`}
          </p>
        </div>
      ))}
    </div>
  )
}
