import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { sortFloorsDesc } from '../lib/floors'
import { formatUnitTitle, isVillaLayout, layoutForUnit } from '../lib/units'
import { Modal } from './ui/Modal'
import { TitleHint } from './ui/TitleHint'

export function UnitSwitcher({ onClose }: { onClose: () => void }) {
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const recentUnitIds = useProjectStore((s) => s.recentUnitIds)
  const setCurrentUnit = useProjectStore((s) => s.setCurrentUnit)

  const activeBuildings = useMemo(
    () => [...buildings].filter((b) => b.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [buildings],
  )

  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const currentUnit = units.find((u) => u.id === currentUnitId)

  const [buildingId, setBuildingId] = useState(
    currentUnit?.buildingId ?? activeBuildings[0]?.id ?? '',
  )
  const building = activeBuildings.find((b) => b.id === buildingId) ?? activeBuildings[0]
  const villa = building ? isVillaLayout(building) : false
  const houseCodes = building?.unitCodes ?? []
  const singleHouse = villa && houseCodes.length <= 1

  const floors = useMemo(
    () => (building ? sortFloorsDesc(building.floors) : []),
    [building],
  )
  const [floor, setFloor] = useState(currentUnit?.floor ?? '')
  const [houseCode, setHouseCode] = useState(currentUnit?.code ?? '')
  const effectiveFloor = floors.includes(floor) ? floor : floors[0] ?? ''
  const effectiveCode = singleHouse
    ? houseCodes[0] ?? ''
    : houseCodes.includes(houseCode)
      ? houseCode
      : houseCodes[0] ?? ''

  const floorUnits = useMemo(() => {
    if (!building) return []
    return units.filter(
      (u) => u.buildingId === building.id && u.floor === effectiveFloor && u.active,
    )
  }, [units, building, effectiveFloor])

  const [unitId, setUnitId] = useState(currentUnit?.id ?? '')

  const selected = useMemo(() => {
    if (!building) return null
    if (villa) {
      return (
        units.find(
          (u) =>
            u.buildingId === building.id &&
            u.floor === effectiveFloor &&
            u.code === effectiveCode &&
            u.active,
        ) ?? null
      )
    }
    return floorUnits.find((u) => u.id === unitId) ?? floorUnits[0] ?? null
  }, [villa, units, building, effectiveFloor, effectiveCode, floorUnits, unitId])

  const step = !building ? 1 : villa ? (singleHouse || effectiveCode ? (effectiveFloor ? 3 : 2) : 2) : !effectiveFloor ? 2 : selected ? 3 : 2

  const recent = recentUnitIds
    .map((id) => units.find((u) => u.id === id))
    .filter(Boolean)
    .slice(0, 6)

  return (
    <Modal onClose={onClose} aria-label={villa ? '切換別墅／樓層' : '快速切換戶別'}>
        <TitleHint
          as="h3"
          className="serif"
          style={{ margin: '0 0 12px', fontSize: 20 }}
          hint={
            villa
              ? '別墅先選哪一戶（整棟），再選屋內樓層。'
              : '棟別 → 樓層 → 戶別，適合數百戶現場導航。'
          }
        >
          {villa ? '切換別墅／樓層' : '快速切換戶別'}
        </TitleHint>

        <div className="stepper">
          <div className={`step ${step >= 1 ? 'on' : ''} ${building ? 'done' : ''}`}>1. 棟別</div>
          {villa ? (
            <>
              {!singleHouse && (
                <div className={`step ${effectiveCode ? 'on done' : ''}`}>2. 戶號</div>
              )}
              <div className={`step ${effectiveFloor ? 'on done' : ''}`}>
                {singleHouse ? '2. 樓層' : '3. 樓層'}
              </div>
            </>
          ) : (
            <>
              <div className={`step ${step >= 2 ? 'on' : ''} ${effectiveFloor ? 'done' : ''}`}>2. 樓層</div>
              <div className={`step ${step >= 3 ? 'on' : ''} ${selected ? 'done' : ''}`}>3. 戶別</div>
            </>
          )}
        </div>

        {recent.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>最近使用</div>
            <div className="chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {recent.map((u) =>
                u ? (
                  <button
                    key={u.id}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setCurrentUnit(u.id)
                      onClose()
                    }}
                  >
                    {formatUnitTitle(u, layoutForUnit(buildings, u))}
                  </button>
                ) : null,
              )}
            </div>
          </div>
        )}

        <div className="field">
          <label>棟別</label>
          <div className="chip-row">
            {activeBuildings.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`chip ${building?.id === b.id ? 'on' : ''}`}
                onClick={() => {
                  setBuildingId(b.id)
                  setUnitId('')
                  setHouseCode('')
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        {villa && !singleHouse && (
          <div className="field">
            <label>戶號（整棟）</label>
            <div className="chip-row">
              {houseCodes.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`chip ${effectiveCode === code ? 'on' : ''}`}
                  onClick={() => setHouseCode(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label>{villa ? '屋內樓層' : '樓層'}</label>
          <div className="chip-row">
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${effectiveFloor === f ? 'on' : ''}`}
                onClick={() => {
                  setFloor(f)
                  setUnitId('')
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {!villa && (
          <div className="field">
            <label>戶別</label>
            <div className="chip-row">
              {floorUnits.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`chip ${selected?.id === u.id ? 'on' : ''}`}
                  onClick={() => setUnitId(u.id)}
                >
                  {u.code}
                </button>
              ))}
              {floorUnits.length === 0 && (
                <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>此樓層無有效戶別</span>
              )}
            </div>
          </div>
        )}

        <div
          className="glass-green"
          style={{ padding: 12, marginBottom: 14, borderRadius: 16 }}
        >
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>即將切換至</div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
            {selected
              ? formatUnitTitle(selected, layoutForUnit(buildings, selected))
              : '尚未選擇'}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            setCurrentUnit(selected.id)
            onClose()
          }}
        >
          {villa ? '切換至此樓層' : '切換至此戶'}
        </button>
    </Modal>
  )
}
