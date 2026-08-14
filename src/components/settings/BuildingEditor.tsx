import { useMemo, useState } from 'react'
import type { BuildingLayout, BuildingRule } from '../../types'
import { expandFloorRange, naKey, parseUnitCodes, sortFloorsAsc } from '../../lib/floors'
import { buildingLayout, countActiveUnits, countHouseholds } from '../../lib/units'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

const APARTMENT_PRESETS: [string, string][] = [
  ['1F', '7F'],
  ['B1F', 'RF'],
  ['B3F', 'R2F'],
  ['1F', '12F'],
]

const VILLA_PRESETS: [string, string][] = [
  ['1F', '2F'],
  ['1F', '3F'],
  ['B1F', '3F'],
  ['B1F', 'RF'],
]

export function BuildingEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: BuildingRule
  onSave: (building: BuildingRule) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [layout, setLayout] = useState<BuildingLayout>(() => buildingLayout(initial))
  const [name, setName] = useState(initial.name)
  const [floorFrom, setFloorFrom] = useState(initial.floors[0] ?? '1F')
  const [floorTo, setFloorTo] = useState(
    initial.floors[initial.floors.length - 1] ?? (buildingLayout(initial) === 'villa' ? '3F' : '7F'),
  )
  const [unitCodesText, setUnitCodesText] = useState(
    initial.unitCodes.join(', ') || (buildingLayout(initial) === 'villa' ? '整棟' : ''),
  )
  const [naFloorText, setNaFloorText] = useState(guessNaFloors(initial).join(', '))
  const [extraFloors, setExtraFloors] = useState('')

  const villa = layout === 'villa'

  function applyLayout(next: BuildingLayout) {
    setLayout(next)
    if (next === 'villa') {
      const codes = parseUnitCodes(unitCodesText)
      if (codes.length === 0) setUnitCodesText('整棟')
      if (!initial.floors.length && floorTo === '7F') setFloorTo('3F')
    }
  }

  const floors = useMemo(() => {
    const base = expandFloorRange(floorFrom, floorTo)
    const extra = parseUnitCodes(extraFloors).map((s) => s.toUpperCase())
    return sortFloorsAsc([...new Set([...base, ...extra])])
  }, [floorFrom, floorTo, extraFloors])

  const unitCodes = useMemo(() => {
    const parsed = parseUnitCodes(unitCodesText)
    if (villa && parsed.length === 0) return ['整棟']
    return parsed
  }, [unitCodesText, villa])

  const naFloors = useMemo(
    () => parseUnitCodes(naFloorText).map((s) => s.toUpperCase()),
    [naFloorText],
  )

  const preview = useMemo(() => {
    const naKeys: string[] = []
    for (const floor of naFloors) {
      for (const code of unitCodes) {
        naKeys.push(naKey(floor, code))
      }
    }
    const draft: BuildingRule = {
      ...initial,
      name: name.trim() || initial.name,
      floors,
      unitCodes,
      naKeys,
      active: true,
      layout,
    }
    return {
      draft,
      households: countHouseholds(draft),
      activeSlots: countActiveUnits(draft),
      totalSlots: floors.length * unitCodes.length,
      naCount: floors.length * unitCodes.length - countActiveUnits(draft),
    }
  }, [initial, name, floors, unitCodes, naFloors, layout])

  const canSave = Boolean(name.trim() && floors.length > 0 && unitCodes.length > 0)
  const displayName = name.trim() || initial.name || (villa ? '新別墅' : '新棟別')
  const floorPresets = villa ? VILLA_PRESETS : APARTMENT_PRESETS

  return (
    <Modal
      onClose={onCancel}
      aria-label={villa ? '編輯別墅整棟' : '編輯棟別結構'}
      variant="bottom"
      className="building-editor-sheet"
    >
      <div className="building-editor-body">
        <header className="building-editor-header">
          <TitleHint
            as="h3"
            className="serif"
            style={{ margin: 0, fontSize: 20, fontWeight: 700 }}
            hint={
              villa
                ? '別墅是「整棟一戶」。樓層是這戶裡面的樓（施工分層），不會變成一層一戶。'
                : '只需設定「棟別、樓層範圍、各層戶別編號」，系統自動展開成數百戶，不必一戶一戶新增。'
            }
          >
            {initial.name
              ? `編輯 ${initial.name}`
              : villa
                ? '新增別墅整棟'
                : '新增棟別'}
          </TitleHint>
        </header>

        <section className="glass building-editor-card">
          <div className="building-editor-card-title">結構類型</div>
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${!villa ? 'on' : ''}`}
              onClick={() => applyLayout('apartment')}
            >
              大樓／公寓
            </button>
            <button
              type="button"
              className={`chip ${villa ? 'on' : ''}`}
              onClick={() => applyLayout('villa')}
            >
              別墅整棟
            </button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
            {villa
              ? '一戶＝整棟房子。樓層用來記 1F／2F／屋頂的施工進度，不是再拆成另一戶。'
              : '同一套戶號套用到每一層，適合每層戶數相同的集合住宅。'}
          </p>
        </section>

        <section className="glass building-editor-card">
          <div className="building-editor-card-title">{villa ? '別墅名稱' : '棟別名稱'}</div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="building-name">名稱</label>
            <input
              id="building-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={villa ? '例如 1號、A1、別墅區' : '例如 A棟'}
              autoFocus
            />
          </div>
        </section>

        <section className="glass building-editor-card">
          <div className="building-editor-card-title">{villa ? '屋內樓層（施工分層）' : '樓層範圍'}</div>

          <div className="field-grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="floor-from">{villa ? '最低層' : '樓層起'}</label>
              <input
                id="floor-from"
                value={floorFrom}
                onChange={(e) => setFloorFrom(e.target.value)}
                placeholder="B1F / 1F"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="floor-to">{villa ? '最高層' : '樓層迄'}</label>
              <input
                id="floor-to"
                value={floorTo}
                onChange={(e) => setFloorTo(e.target.value)}
                placeholder={villa ? '3F / RF' : '7F / R2F'}
              />
            </div>
          </div>

          <div className="chip-row" style={{ marginTop: 12 }}>
            {floorPresets.map(([from, to]) => {
              const on = floorFrom === from && floorTo === to
              return (
                <button
                  key={`${from}-${to}`}
                  type="button"
                  className={`chip ${on ? 'on' : ''}`}
                  onClick={() => {
                    setFloorFrom(from)
                    setFloorTo(to)
                  }}
                >
                  {from}-{to}
                </button>
              )
            })}
          </div>

          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label htmlFor="extra-floors">{villa ? '其他樓層（可選）' : '額外樓層（可選）'}</label>
            <input
              id="extra-floors"
              value={extraFloors}
              onChange={(e) => setExtraFloors(e.target.value)}
              placeholder={villa ? '例如 RF、閣樓' : '例如 M1F, RF'}
            />
          </div>

          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label htmlFor="na-floors">{villa ? '這戶沒有的樓層' : '整層不適用'}</label>
            <input
              id="na-floors"
              value={naFloorText}
              onChange={(e) => setNaFloorText(e.target.value)}
              placeholder={villa ? '範圍裡多出來、實際沒有的樓' : '例如 B3F, B2F, B1F, R1F, R2F'}
            />
          </div>
        </section>

        <section className="glass building-editor-card">
          <div className="building-editor-card-title">{villa ? '戶號' : '戶別編號規則'}</div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="unit-codes">
              <TitleHint
                as="span"
                hint={
                  villa
                    ? '一棟一戶就填「整棟」或跟名稱相同。別墅區很多戶時，在同一棟填 A1, A2, A3…'
                    : '同一套編號會套用到每一層，適合「每層戶號規則相同」的建案。'
                }
              >
                {villa ? '整棟戶號（逗號分隔）' : '各層戶別編號（逗號分隔）'}
              </TitleHint>
            </label>
            <input
              id="unit-codes"
              value={unitCodesText}
              onChange={(e) => setUnitCodesText(e.target.value)}
              placeholder={villa ? '一戶填 整棟；多戶填 A1, A2, A3' : '例如 A1, A2, A3, A5'}
            />
          </div>
        </section>

        <section className="glass-green building-editor-preview">
          <div className="building-editor-preview-label">展開預覽</div>
          <div className="serif building-editor-preview-title">
            {displayName}
            {floors.length > 0 && unitCodes.length > 0
              ? villa
                ? `・整棟 ${preview.households} 戶・${floors[0]}–${floors[floors.length - 1]}`
                : `・${floors[0]}–${floors[floors.length - 1]}・每層 ${unitCodes.length} 戶`
              : ''}
          </div>
          <div className="building-editor-preview-stats">
            {villa ? (
              <>
                <div>
                  <span className="nums building-editor-preview-num">{preview.households}</span>
                  <span>戶（整棟）</span>
                </div>
                <div>
                  <span className="nums building-editor-preview-num">{floors.length}</span>
                  <span>層施工</span>
                </div>
                <div>
                  <span className="nums building-editor-preview-num">{preview.naCount}</span>
                  <span>沒有的樓</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="nums building-editor-preview-num">{preview.totalSlots}</span>
                  <span>個格位</span>
                </div>
                <div>
                  <span className="nums building-editor-preview-num">{preview.activeSlots}</span>
                  <span>有效戶</span>
                </div>
                <div>
                  <span className="nums building-editor-preview-num">{preview.naCount}</span>
                  <span>不適用</span>
                </div>
              </>
            )}
          </div>
          <div className="building-editor-preview-meta">
            {villa ? '屋內樓層' : '樓層'} {floors.length ? floors.join('、') : '尚未設定'}
            <br />
            {villa ? '戶號' : '戶別'}{' '}
            {unitCodes.length ? unitCodes.join('、') : villa ? '整棟' : '尚未設定'}
          </div>
        </section>
      </div>

      <footer className="building-editor-footer">
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={!canSave}
          onClick={() => onSave(preview.draft)}
        >
          {villa ? '儲存整棟結構' : '儲存並自動展開戶別'}
        </button>
        <button type="button" className="building-editor-cancel" onClick={onCancel}>
          取消
        </button>
        {onDelete && (
          <button type="button" className="building-editor-delete" onClick={onDelete}>
            刪除／停用此棟
          </button>
        )}
      </footer>
    </Modal>
  )
}

function guessNaFloors(b: BuildingRule): string[] {
  const counts = new Map<string, number>()
  for (const key of b.naKeys) {
    const floor = key.split('|')[0]
    counts.set(floor, (counts.get(floor) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= b.unitCodes.length)
    .map(([floor]) => floor)
}
