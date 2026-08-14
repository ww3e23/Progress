import { StageCellButton } from './StageCellButton'
import {
  stageStatusLabel,
  type FloorMatrixCell,
  type WorkItemFloorMatrix,
} from '../../lib/stageProgress'
import { isVillaLayout } from '../../lib/units'

export function FloorStageMatrix({
  matrix,
  canEdit,
  onTap,
  onLong,
}: {
  matrix: WorkItemFloorMatrix
  canEdit: boolean
  onTap?: (floor: string, cell: FloorMatrixCell) => void
  onLong?: (floor: string, cell: FloorMatrixCell) => void
}) {
  if (matrix.rows.length === 0) {
    return (
      <p style={{ padding: 16, color: 'var(--ink-soft)', fontWeight: 600 }}>
        此棟沒有可施工樓層。
      </p>
    )
  }

  return (
    <table className="stage-matrix">
      <thead>
        <tr>
          <th className="unit-cell">樓層</th>
          {matrix.stages.map((s) => (
            <th key={s.id} className="stage-head">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.rows.map((row) => (
          <tr key={row.floor}>
            <td className="unit-cell">
              <div style={{ fontWeight: 800 }}>{row.floor}</div>
              {isVillaLayout(matrix.building) ? (
                row.units.length > 1 ? (
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)' }}>
                    {row.units.length} 戶
                  </div>
                ) : null
              ) : (
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)' }}>
                  {row.units.length} 戶
                </div>
              )}
            </td>
            {row.cells.map((cell) => (
              <td key={cell.stageId}>
                <StageCellButton
                  status={cell.status}
                  mixed={cell.mixed}
                  openDefects={cell.openDefects}
                  disabled={!canEdit}
                  label={`${row.floor} ${cell.stageName} ${stageStatusLabel(cell.status)}${
                    cell.mixed ? '（戶別進度不同）' : ''
                  }`}
                  onTap={() => onTap?.(row.floor, cell)}
                  onLongPress={() => onLong?.(row.floor, cell)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
