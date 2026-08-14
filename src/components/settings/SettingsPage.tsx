import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { countActiveUnits, newBuildingDraft, summarizeBuilding } from '../../lib/units'
import { getUnitAreas } from '../../lib/areas'
import { BuildingEditor } from './BuildingEditor'
import { WorkItemEditor } from './WorkItemEditor'
import { UnitAreasEditor } from './UnitAreasEditor'
import { ProjectAreasEditor } from './ProjectAreasEditor'
import { BatchAreasApplySheet } from './BatchAreasApplySheet'
import { UnitPlanGallerySheet } from './UnitPlanGallerySheet'
import type { BuildingRule, WorkItem } from '../../types'
import { TitleHint } from '../ui/TitleHint'
import { newWorkItemDraft } from '../../data/defaultWorkItems'

export function SettingsPage({ embedded = false }: { embedded?: boolean }) {
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const projectAreas = useProjectStore((s) => s.areas)
  const areaTemplates = useProjectStore((s) => s.areaTemplates) ?? []
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const upsertBuilding = useProjectStore((s) => s.upsertBuilding)
  const removeBuilding = useProjectStore((s) => s.removeBuilding)
  const resetDemoData = useProjectStore((s) => s.resetDemoData)
  const workItems = useProjectStore((s) => s.workItems)
  const upsertWorkItem = useProjectStore((s) => s.upsertWorkItem)
  const removeWorkItem = useProjectStore((s) => s.removeWorkItem)
  const applyDefaultWorkItems = useProjectStore((s) => s.applyDefaultWorkItems)

  const [editing, setEditing] = useState<BuildingRule | null>(null)
  const [editingWork, setEditingWork] = useState<WorkItem | null>(null)
  const [isNewWork, setIsNewWork] = useState(false)
  const [unitAreasOpen, setUnitAreasOpen] = useState(false)
  const [projectAreasOpen, setProjectAreasOpen] = useState(false)
  const [batchAreasOpen, setBatchAreasOpen] = useState(false)
  const [planGalleryOpen, setPlanGalleryOpen] = useState(false)
  /** 棟很多時預設收合，避免整頁被棟別卡片占滿 */
  const [buildingsOpen, setBuildingsOpen] = useState(
    () => buildings.filter((b) => b.active).length <= 2,
  )
  /** 工項多時整組收合；單筆工序預設收起，點列才展開 */
  const [workItemsOpen, setWorkItemsOpen] = useState(
    () => workItems.filter((w) => w.active).length <= 6,
  )
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null)
  const [workQuery, setWorkQuery] = useState('')

  const currentUnit =
    units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)

  const activeBuildings = [...buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const totalActiveUnits = units.filter((u) => u.active).length

  const activeWorkList = [...workItems]
    .filter((w) => w.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const workFilter = workQuery.trim().toLowerCase()
  const visibleWorks = workFilter
    ? activeWorkList.filter((w) => w.name.toLowerCase().includes(workFilter))
    : activeWorkList

  return (
    <div className={embedded ? undefined : 'rise'}>
      {!embedded && (
        <header style={{ marginBottom: 14 }}>
          <div className="eyebrow">PROJECT SETUP</div>
          <h1 className="serif" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700 }}>
            棟別、樓層與戶別
          </h1>
        </header>
      )}

      <div className="section-row" style={{ marginTop: embedded ? 0 : undefined }}>
        <TitleHint
          as="h2"
          hint={`以規則批次建立：棟別、樓層範圍、各層戶別編號。目前 ${activeBuildings.length} 棟・${totalActiveUnits} 有效戶。`}
        >
          棟別結構
        </TitleHint>
        <button
          type="button"
          className="link"
          onClick={() => {
            if (confirm('確定清空本專案的棟別、範本、缺失與歷程？此操作無法復原。')) {
              resetDemoData()
            }
          }}
        >
          清空本專案
        </button>
      </div>

      <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          className="building-fold-toggle"
          aria-expanded={buildingsOpen}
          onClick={() => setBuildingsOpen((v) => !v)}
        >
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {activeBuildings.length} 棟 · {totalActiveUnits} 有效戶
            </div>
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink-soft)',
                fontSize: 12,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activeBuildings.length === 0
                ? '尚未設定棟別'
                : buildingsOpen
                  ? '點此收合棟別清單'
                  : activeBuildings.map((b) => b.name).join('、')}
            </div>
          </div>
          <ChevronDown
            size={20}
            style={{
              flexShrink: 0,
              color: 'var(--ink-soft)',
              transform: buildingsOpen ? 'rotate(180deg)' : undefined,
              transition: 'transform 0.2s ease',
            }}
          />
        </button>

        {buildingsOpen && (
          <div style={{ display: 'grid', gap: 0, borderTop: '1px solid rgba(34,41,31,0.08)' }}>
            {activeBuildings.map((b) => (
              <div key={b.id} className="building-fold-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    {b.name}
                    <span
                      style={{
                        color: 'var(--ink-soft)',
                        fontWeight: 600,
                        fontSize: 12,
                        marginLeft: 8,
                      }}
                    >
                      {summarizeBuilding(b)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      color: 'var(--ink-soft)',
                      fontSize: 11,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.unitCodes.join('、')} · {countActiveUnits(b)} 戶
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 36, flexShrink: 0, padding: '0 12px' }}
                  onClick={() => setEditing(b)}
                >
                  編輯
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn-dashed"
              style={{ margin: 12, marginTop: 8 }}
              onClick={() => {
                const nextIndex = activeBuildings.length
                const letter = String.fromCharCode(65 + (nextIndex % 26))
                setEditing(
                  newBuildingDraft({
                    name: `${letter}棟`,
                    unitCodes: [`${letter}1`, `${letter}2`, `${letter}3`],
                    sortOrder: nextIndex,
                  }),
                )
              }}
            >
              + 新增棟別
            </button>
          </div>
        )}

        {!buildingsOpen && (
          <div style={{ padding: '0 12px 12px' }}>
            <button
              type="button"
              className="btn-dashed"
              style={{ width: '100%' }}
              onClick={() => {
                setBuildingsOpen(true)
                const nextIndex = activeBuildings.length
                const letter = String.fromCharCode(65 + (nextIndex % 26))
                setEditing(
                  newBuildingDraft({
                    name: `${letter}棟`,
                    unitCodes: [`${letter}1`, `${letter}2`, `${letter}3`],
                    sortOrder: nextIndex,
                  }),
                )
              }}
            >
              + 新增棟別
            </button>
          </div>
        )}
      </div>

      <div className="section-row" style={{ marginTop: 22 }}>
        <TitleHint as="h2" hint="對應 Excel 的一張表：工項名稱 + 由左到右的工序欄。點工項可展開工序，右側編輯。">
          工項與工序
        </TitleHint>
        <button
          type="button"
          className="link"
          onClick={() => applyDefaultWorkItems('fill-if-empty')}
        >
          填入預設
        </button>
      </div>
      <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          className="building-fold-toggle"
          aria-expanded={workItemsOpen}
          onClick={() => setWorkItemsOpen((v) => !v)}
        >
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {activeWorkList.length} 個工項
            </div>
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink-soft)',
                fontSize: 12,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activeWorkList.length === 0
                ? '尚未設定工項'
                : workItemsOpen
                  ? '點工項展開工序，右側可編輯'
                  : activeWorkList.map((w) => w.name).join('、')}
            </div>
          </div>
          <ChevronDown
            size={20}
            style={{
              flexShrink: 0,
              color: 'var(--ink-soft)',
              transform: workItemsOpen ? 'rotate(180deg)' : undefined,
              transition: 'transform 0.2s ease',
            }}
          />
        </button>

        {workItemsOpen && (
          <>
            {activeWorkList.length > 8 && (
              <label className="fold-search">
                <Search size={14} aria-hidden />
                <input
                  value={workQuery}
                  onChange={(e) => setWorkQuery(e.target.value)}
                  placeholder="搜尋工項"
                  aria-label="搜尋工項"
                />
              </label>
            )}
            <div className="fold-list">
              {visibleWorks.map((w) => {
                const open = expandedWorkId === w.id
                return (
                  <div key={w.id} className="building-fold-row" style={{ alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      className="fold-row-expand"
                      aria-expanded={open}
                      onClick={() => setExpandedWorkId(open ? null : w.id)}
                    >
                      <ChevronDown
                        size={18}
                        style={{
                          flexShrink: 0,
                          marginTop: 2,
                          color: 'var(--ink-soft)',
                          transform: open ? 'rotate(180deg)' : undefined,
                          transition: 'transform 0.2s ease',
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{w.name}</div>
                        {open ? (
                          <div className="fold-stages">{w.stages.map((s) => s.name).join(' → ')}</div>
                        ) : (
                          <div
                            style={{
                              marginTop: 2,
                              color: 'var(--ink-soft)',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {w.stages.length} 道工序
                          </div>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 36, flexShrink: 0, padding: '0 12px' }}
                      onClick={() => {
                        setIsNewWork(false)
                        setEditingWork(w)
                      }}
                    >
                      編輯
                    </button>
                  </div>
                )
              })}
              {visibleWorks.length === 0 && (
                <div
                  style={{
                    padding: 14,
                    color: 'var(--ink-soft)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {workFilter ? `沒有符合「${workQuery.trim()}」的工項` : '尚未設定工項'}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-dashed"
              style={{ margin: 12, marginTop: 8 }}
              onClick={() => {
                setIsNewWork(true)
                setEditingWork(newWorkItemDraft({ sortOrder: workItems.length }))
              }}
            >
              + 新增工項
            </button>
          </>
        )}

        {!workItemsOpen && (
          <div style={{ padding: '0 12px 12px' }}>
            <button
              type="button"
              className="btn-dashed"
              style={{ width: '100%' }}
              onClick={() => {
                setWorkItemsOpen(true)
                setIsNewWork(true)
                setEditingWork(newWorkItemDraft({ sortOrder: workItems.length }))
              }}
            >
              + 新增工項
            </button>
          </div>
        )}
      </div>

      <div className="section-row" style={{ marginTop: 22 }}>
        <TitleHint
          as="h2"
          hint="此戶編輯、專案預設、格局範本（矩陣套用），以及位置圖總覽，都集中在這裡。"
        >
          施工區域／位置圖
        </TitleHint>
      </div>
      <article className="glass" style={{ padding: 14, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
          {currentUnit
            ? `目前戶：${currentUnit.buildingName} ${currentUnit.floor} ${currentUnit.code}戶 · ${getUnitAreas(currentUnit, projectAreas, areaTemplates).join('、')}`
            : '尚未選擇有效戶別'}
          {projectAreas.length > 0 ? (
            <>
              <br />
              專案預設：{projectAreas.join('、')}
            </>
          ) : null}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            disabled={!currentUnit}
            onClick={() => setUnitAreasOpen(true)}
          >
            此戶設定
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            onClick={() => setProjectAreasOpen(true)}
          >
            專案預設
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            onClick={() => setBatchAreasOpen(true)}
          >
            格局範本
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            onClick={() => setPlanGalleryOpen(true)}
          >
            位置圖總覽
          </button>
        </div>
      </article>

      {editing && (
        <BuildingEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(b) => {
            upsertBuilding(b)
            setEditing(null)
          }}
          onDelete={
            buildings.some((b) => b.id === editing.id)
              ? () => {
                  removeBuilding(editing.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}

      {editingWork && (
        <WorkItemEditor
          initial={editingWork}
          onCancel={() => {
            setEditingWork(null)
            setIsNewWork(false)
          }}
          onSave={(item) => {
            upsertWorkItem(item)
            setEditingWork(null)
            setIsNewWork(false)
          }}
          onDelete={
            isNewWork
              ? undefined
              : () => {
                  removeWorkItem(editingWork.id)
                  setEditingWork(null)
                }
          }
        />
      )}

      {unitAreasOpen && currentUnit && (
        <UnitAreasEditor unitId={currentUnit.id} onClose={() => setUnitAreasOpen(false)} />
      )}
      {projectAreasOpen && <ProjectAreasEditor onClose={() => setProjectAreasOpen(false)} />}
      {batchAreasOpen && <BatchAreasApplySheet onClose={() => setBatchAreasOpen(false)} />}
      {planGalleryOpen && <UnitPlanGallerySheet onClose={() => setPlanGalleryOpen(false)} />}
    </div>
  )
}
