import { useState } from 'react'
import { EyeOff } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { activeWorkItems, sortedStages } from '../../lib/stageProgress'
import { reportStageKey, type ReportWorkRow } from '../../lib/reportSummary'
import type { ProjectState } from '../../types'

function stageLine(stage: ReportWorkRow['stages'][number]): string {
  if (stage.householdsTotal === 0) return `${stage.name}：皆不適用。`
  const pct = Math.round((stage.householdsDone / stage.householdsTotal) * 100)
  return `${stage.name}：完成${stage.householdsDone}戶，未完成${stage.householdsLeft}戶，總共${stage.householdsTotal}戶。（${pct}%）`
}

export function ReportWorkMatrix({
  rows,
  hiddenKeys,
  workItems,
  onChangeHidden,
}: {
  rows: ReportWorkRow[]
  hiddenKeys: string[]
  workItems: ProjectState['workItems']
  onChangeHidden: (keys: string[]) => void
}) {
  const [hideOpen, setHideOpen] = useState(false)
  const hidden = new Set(hiddenKeys)
  const visible = rows
    .map((row) => ({
      ...row,
      stages: row.stages.filter((s) => !hidden.has(reportStageKey(row.id, s.id))),
    }))
    .filter((row) => row.stages.length > 0)

  return (
    <>
      <div className="report-toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => setHideOpen(true)}>
          <EyeOff size={16} /> 隱藏工序
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="report-empty">
          {rows.length === 0 ? '請先設定棟別與工項。' : '已全部隱藏。點「隱藏工序」可再勾回來。'}
        </p>
      ) : (
        <div className="report-copy-list glass">
          {visible.map((row) => (
            <div key={row.id} className="report-copy-item">
              <strong className="report-copy-title">{row.name}</strong>
              <ul className="report-stage-copy">
                {row.stages.map((stage) => (
                  <li key={stage.id}>{stageLine(stage)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {hideOpen && (
        <HideStagesSheet
          workItems={workItems}
          hiddenKeys={hiddenKeys}
          onChangeHidden={onChangeHidden}
          onClose={() => setHideOpen(false)}
        />
      )}
    </>
  )
}

function HideStagesSheet({
  workItems,
  hiddenKeys,
  onChangeHidden,
  onClose,
}: {
  workItems: ProjectState['workItems']
  hiddenKeys: string[]
  onChangeHidden: (keys: string[]) => void
  onClose: () => void
}) {
  const hidden = new Set(hiddenKeys)
  const items = activeWorkItems({ workItems })

  function toggle(key: string) {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChangeHidden([...next])
  }

  return (
    <Modal onClose={onClose} variant="bottom" aria-label="隱藏工序">
      <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 20 }}>
        隱藏工序
      </h3>
      <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
        勾選後，該工序不會出現在報表。已結案的可勾起來。
      </p>
      <div className="report-hide-list">
        {items.map((item) => (
          <section key={item.id} className="report-hide-group">
            <div className="report-hide-group-title">{item.name}</div>
            <div className="chip-row">
              {sortedStages(item).map((stage) => {
                const key = reportStageKey(item.id, stage.id)
                const on = hidden.has(key)
                return (
                  <button
                    key={stage.id}
                    type="button"
                    className={`chip ${on ? 'on' : ''}`}
                    onClick={() => toggle(key)}
                  >
                    {stage.name}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={onClose}>
        完成
      </button>
    </Modal>
  )
}
