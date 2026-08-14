import ExcelJS from 'exceljs'
import type { ProjectState } from '../types'
import { triggerAnchorDownload } from './download'
import { sortFloorsAsc } from './floors'
import {
  activeWorkItems,
  buildStageMatrix,
  openDefectRemarks,
  stageStatusLabel,
} from './stageProgress'

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },
}

const DONE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC6EFCE' },
}

const PROGRESS_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFE699' },
}

const BLOCKED_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFF6B6B' },
}

const DEFECT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFC000' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet'
  let candidate = cleaned
  let i = 2
  while (used.has(candidate)) {
    const suffix = `_${i}`
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`
    i += 1
  }
  used.add(candidate)
  return candidate
}

function fillForStatus(status: string): ExcelJS.Fill | undefined {
  if (status === 'completed') return DONE_FILL
  if (status === 'in_progress') return PROGRESS_FILL
  if (status === 'blocked') return BLOCKED_FILL
  if (status === 'defect_fixing') return DEFECT_FILL
  return undefined
}

export async function exportProgressExcel(
  projectName: string,
  state: ProjectState,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Progress'
  const used = new Set<string>()
  const workItems = activeWorkItems(state)
  const buildings = [...state.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (workItems.length === 0 || buildings.length === 0) {
    const sheet = workbook.addWorksheet('進度')
    sheet.addRow(['尚未建立棟別或工項'])
  }

  for (const workItem of workItems) {
    for (const building of buildings) {
      const sheet = workbook.addWorksheet(
        sanitizeSheetName(`${building.name} ${workItem.name}`, used),
      )
      let rowIdx = 1
      sheet.getCell(rowIdx, 1).value = `${building.name}　${workItem.name}`
      sheet.getCell(rowIdx, 1).font = { bold: true, size: 14 }
      rowIdx += 2

      for (const floor of sortFloorsAsc(building.floors)) {
        const matrix = buildStageMatrix(state, building.id, floor, workItem.id)
        if (!matrix || matrix.rows.length === 0) continue

        sheet.getCell(rowIdx, 1).value = floor
        sheet.getCell(rowIdx, 1).font = { bold: true, size: 12 }
        rowIdx += 1

        const header = sheet.getRow(rowIdx)
        header.getCell(1).value = '戶'
        matrix.stages.forEach((stage, i) => {
          header.getCell(i + 2).value = stage.name
        })
        header.eachCell((cell) => {
          cell.fill = HEADER_FILL
          cell.font = HEADER_FONT
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
          cell.border = THIN_BORDER
        })
        rowIdx += 1

        for (const r of matrix.rows) {
          const row = sheet.getRow(rowIdx)
          row.getCell(1).value = r.unit.code
          row.getCell(1).border = THIN_BORDER
          r.cells.forEach((cell, i) => {
            const c = row.getCell(i + 2)
            c.value = stageStatusLabel(cell.status)
            c.alignment = { vertical: 'middle', horizontal: 'center' }
            c.border = THIN_BORDER
            const fill = fillForStatus(cell.status)
            if (fill) c.fill = fill
          })
          rowIdx += 1
        }
        rowIdx += 1
      }

      const remarks = openDefectRemarks(state).filter((d) => {
        if (d.workItemId && d.workItemId !== workItem.id) return false
        if (d.buildingId && d.buildingId !== building.id) return false
        return true
      })
      sheet.getCell(rowIdx, 1).value = '備註:'
      sheet.getCell(rowIdx, 1).font = { bold: true, color: { argb: 'FFC00000' } }
      rowIdx += 1
      if (remarks.length === 0) {
        sheet.getCell(rowIdx, 1).value = '（無未關閉缺失）'
      } else {
        for (const d of remarks) {
          const loc = `${d.unitCode}-${d.floor}`
          const stage = workItem.stages.find((s) => s.id === d.stageId)?.name
          const text = [loc, stage, d.description || `缺失 #${d.defectNumber}`]
            .filter(Boolean)
            .join(' ')
          sheet.getCell(rowIdx, 1).value = text
          sheet.getCell(rowIdx, 1).font = { color: { argb: 'FFC00000' } }
          rowIdx += 1
        }
      }

      sheet.getColumn(1).width = 18
      for (let i = 2; i <= 8; i += 1) sheet.getColumn(i).width = 16
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  try {
    triggerAnchorDownload(url, `${projectName || '進度'}_${stamp}.xlsx`)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
