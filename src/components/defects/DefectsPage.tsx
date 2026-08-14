import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import {
  defectInspectorLabel,
  defectListTitle,
  resolveDefectRemark,
} from '../../lib/defectDisplay'
import { defectsByStatus, statusLabel } from '../../lib/progress'
import { isProgressRecord } from '../../lib/stageProgress'
import type { Defect, DefectStatus } from '../../types'
import { UnitSwitcher } from '../UnitSwitcher'
import { formatUnitTitle, layoutForUnit } from '../../lib/units'
import { DefectDetailModal } from './DefectDetailModal'
import { PackUnitPhotosButton } from './PackUnitPhotosButton'

type KindFilter = 'all' | 'progress' | 'defect'
type QuickStatus = 'all' | DefectStatus

export function DefectsPage() {
  const defects = useProjectStore((s) => s.defects)
  const units = useProjectStore((s) => s.units)
  const buildings = useProjectStore((s) => s.buildings)
  const items = useProjectStore((s) => s.checklistItems)
  const workItems = useProjectStore((s) => s.workItems)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const backfillActorNames = useProjectStore((s) => s.backfillActorNames)

  const [kind, setKind] = useState<KindFilter>('all')
  const [quickStatus, setQuickStatus] = useState<QuickStatus>('all')
  const [unitOpen, setUnitOpen] = useState(false)
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null)

  useEffect(() => {
    backfillActorNames()
  }, [backfillActorNames])

  const unit =
    units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active) ?? null

  const unitDefects = useMemo(() => {
    if (!unit) return [] as Defect[]
    return defects.filter((d) => d.unitId === unit.id && d.status !== 'voided')
  }, [defects, unit])

  const byKind = useMemo(() => {
    if (kind === 'progress') return unitDefects.filter(isProgressRecord)
    if (kind === 'defect') return unitDefects.filter((d) => !isProgressRecord(d))
    return unitDefects
  }, [unitDefects, kind])

  const filtered = useMemo(() => {
    const list =
      kind === 'progress' || quickStatus === 'all'
        ? byKind
        : byKind.filter((d) => d.status === quickStatus)
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [byKind, quickStatus, kind])

  const counts = defectsByStatus(unitDefects.filter((d) => !isProgressRecord(d)))
  const progressCount = unitDefects.filter(isProgressRecord).length

  const tabs: { key: QuickStatus; label: string; count: number; cls?: string }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'pending_repair', label: '待改善', count: counts.pending_repair, cls: 'amber' },
    { key: 'pending_reinspection', label: '待複驗', count: counts.pending_reinspection, cls: 'slate' },
    { key: 'returned', label: '退回', count: counts.returned, cls: 'terra' },
    { key: 'completed', label: '已改善', count: counts.completed, cls: 'muted' },
  ]

  const unitLabel = unit
    ? formatUnitTitle(unit, layoutForUnit(buildings, unit))
    : '尚未選擇'

  return (
    <div className="rise">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">SITE LOG</div>
          <div className="serif" style={{ fontWeight: 700, fontSize: 22 }}>現場紀錄</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--green-deep)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {unitLabel}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 40, padding: '0 12px', flexShrink: 0 }}
          onClick={() => setUnitOpen(true)}
        >
          切換戶別 <ChevronDown size={16} />
        </button>
      </header>

      {unit && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <PackUnitPhotosButton unitId={unit.id} />
          <PackUnitPhotosButton
            unitId={unit.id}
            records={filtered}
            filenameNote={filterZipNote(kind, quickStatus)}
            buttonLabel="打包已篩選"
            hint="只打包目前篩選（類型／狀態）底下的照片，不是整戶。"
          />
        </div>
      )}

      <div className="status-chip-row" role="tablist" aria-label="紀錄類型">
        {([
          ['all', '全部', unitDefects.length],
          ['progress', '進度', progressCount],
          ['defect', '缺失', counts.all],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`chip ${kind === key ? 'on' : ''}`}
            onClick={() => setKind(key)}
          >
            {label}
            <span className="nums" style={{ opacity: 0.85 }}>（{count}）</span>
          </button>
        ))}
      </div>

      {kind !== 'progress' && (
        <div className="status-chip-row" role="tablist" aria-label="本戶狀態快捷篩選">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={quickStatus === t.key}
              className={`chip ${t.cls ?? ''} ${quickStatus === t.key ? 'on' : ''}`}
              onClick={() => setQuickStatus(t.key)}
            >
              {t.label}
              <span className="nums" style={{ opacity: 0.85 }}>（{t.count}）</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.map((d) => {
          const improved = d.status === 'completed'
          const wi = workItems.find((w) => w.id === d.workItemId)
          const st = wi?.stages.find((s) => s.id === d.stageId)
          const title = isProgressRecord(d)
            ? [st?.name || d.area, d.description].filter(Boolean).join(' · ') || '施工紀錄'
            : st
              ? `#${d.defectNumber} ${st.name}`
              : defectListTitle(d, items)
          const remark = isProgressRecord(d) ? '' : resolveDefectRemark(d, items)
          const inspector = defectInspectorLabel(d)
          return (
            <button
              key={d.id}
              type="button"
              className={`glass defect-row ${improved ? 'defect-row-improved' : ''}`}
              style={{
                padding: 12,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
              }}
              onClick={() => setSelectedDefect(d)}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <Thumb label="位置" src={d.planPhotoDataUrl} />
                <Thumb label="現況" src={d.photoDataUrls[0]} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 14,
                    lineHeight: 1.35,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {title}
                </div>
                {remark ? (
                  <div
                    style={{
                      marginTop: 4,
                      color: 'var(--ink-soft)',
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {remark}
                  </div>
                ) : null}
                <div style={{ marginTop: 4, color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600 }}>
                  {d.categoryName}{st ? `／${st.name}` : d.area ? ` · ${d.area}` : ''}
                  {isProgressRecord(d) ? ' · 進度' : ` · ${statusLabel(d.status)}`}
                  {inspector ? ` · ${inspector}` : ''}
                </div>
              </div>
              <ChevronRight size={18} color="var(--stone)" />
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="glass" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)' }}>
            {!unit
              ? '請先切換戶別'
              : quickStatus === 'all'
                ? '此戶尚無紀錄'
                : '此狀態沒有紀錄'}
          </div>
        )}
      </div>

      {unitOpen && <UnitSwitcher onClose={() => setUnitOpen(false)} />}

      {selectedDefect && (
        <DefectDetailModal defect={selectedDefect} onClose={() => setSelectedDefect(null)} />
      )}
    </div>
  )
}

function filterZipNote(kind: KindFilter, status: QuickStatus): string {
  const kindLabel =
    kind === 'progress' ? '進度' : kind === 'defect' ? '缺失' : '全部類型'
  if (kind === 'progress' || status === 'all') return kindLabel
  const statusMap: Record<Exclude<QuickStatus, 'all'>, string> = {
    pending_repair: '待改善',
    pending_reinspection: '待複驗',
    returned: '退回',
    completed: '已改善',
    voided: '作廢',
  }
  return `${kindLabel}_${statusMap[status]}`
}

function Thumb({ label, src }: { label: string; src?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }}
      />
    )
  }
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: 'rgba(138,133,120,0.14)',
        color: 'var(--stone)',
        fontSize: 10,
        fontWeight: 700,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {label}
    </div>
  )
}
