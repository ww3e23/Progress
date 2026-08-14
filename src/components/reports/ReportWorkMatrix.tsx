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
          <ul className="report-stage-copy">
            {row.stages.map((stage) => (
              <li key={stage.id}>
                {stage.householdsTotal === 0
                  ? `${stage.name}：皆不適用。`
                  : `${stage.name}：完成${stage.householdsDone}戶，未完成${stage.householdsLeft}戶，總共${stage.householdsTotal}戶。`}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
