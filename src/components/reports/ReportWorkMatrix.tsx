import type { ReportWorkRow } from '../../lib/reportSummary'
import { reportStageLabel } from '../../lib/reportSummary'

export function ReportWorkMatrix({ rows }: { rows: ReportWorkRow[] }) {
  if (rows.length === 0) {
    return <p className="report-empty">請先設定棟別與工項。</p>
  }

  return (
    <div className="report-matrix glass">
      {rows.map((row) => (
        <div key={row.id} className="report-matrix-row">
          <div className="report-matrix-name">
            <strong>{row.name}</strong>
            <span className="nums">{row.percent}%</span>
          </div>
          <div className="report-matrix-stages" role="group" aria-label={`${row.name} 各工序`}>
            {row.stages.map((stage) => (
              <div key={stage.id} className="report-stage">
                <div className="report-stage-name">{stage.name}</div>
                <span
                  className={`matrix-cell ${stage.tone}`}
                  title={`${stage.name} ${reportStageLabel(stage)}${
                    stage.total > 0 ? `%（${stage.completed}/${stage.total}）` : ' 不適用'
                  }`}
                >
                  {reportStageLabel(stage)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
