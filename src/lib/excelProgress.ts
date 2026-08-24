import ExcelJS from 'exceljs'
import type { ProjectState, StageStatus } from '../types'
import { triggerAnchorDownload } from './download'
import { buildProgressReportModel, type ProgressReportCell } from './progressReportModel'

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF245A8C' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 10,
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

function fillForCell(cell: ProgressReportCell): ExcelJS.Fill | undefined {
  if (cell.mixed) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } }
  }
  const map: Record<StageStatus, string | undefined> = {
    completed: 'FFBDD7EE',
    in_progress: 'FFFFE699',
    blocked: 'FFFF6B6B',
    defect_fixing: 'FFFFC000',
    na: 'FFD5DDE6',
    not_started: undefined,
  }
  const argb = map[cell.status]
  return argb ? { type: 'pattern', pattern: 'solid', fgColor: { argb } } : undefined
}

function fontForCell(cell: ProgressReportCell): Partial<ExcelJS.Font> {
  if (cell.status === 'completed' && !cell.mixed) {
    return { bold: true, color: { argb: 'FF1A446C' } }
  }
  if (cell.status === 'blocked' || cell.status === 'defect_fixing') {
    return { bold: true, color: { argb: 'FF7A2218' } }
  }
  return { bold: true }
}

function applyHeaderRow(row: ExcelJS.Row, colCount: number) {
  for (let i = 1; i <= colCount; i += 1) {
    const cell = row.getCell(i)
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = THIN_BORDER
  }
  row.height = 32
}

export async function exportProgressExcel(
  projectName: string,
  state: ProjectState,
): Promise<void> {
  const model = buildProgressReportModel(projectName, state)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Progress'
  const used = new Set<string>()

  const overview = workbook.addWorksheet('總覽')
  overview.getCell(1, 1).value = `${model.projectName}　進度報表`
  overview.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FF245A8C' } }
  overview.getCell(2, 1).value = model.dateLabel
  overview.getCell(3, 1).value = `全案完成率 ${model.overallPercent}%（${model.completedCells}/${model.totalCells} 格）`
  overview.getCell(4, 1).value =
    `未關缺失 ${model.openDefects}　缺失改善中 ${model.defectCells}　卡關 ${model.blockedCells}`
  overview.getCell(6, 1).value = '圖例：— 未開始　施 施工中　✓ 完成　卡 卡關　! 缺失改善中　× 不適用　混 同層戶別不同'
  let overviewRow = 8
  for (const work of model.works) {
    overview.getCell(overviewRow, 1).value = `${work.name}　${work.percent}%`
    overview.getCell(overviewRow, 1).font = { bold: true, size: 13 }
    overviewRow += 1
    for (const line of work.summaryLines) {
      overview.getCell(overviewRow, 1).value = line
      overviewRow += 1
    }
    overviewRow += 1
  }
  overview.getColumn(1).width = 72
  overview.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  }

  if (model.works.length === 0) {
    const sheet = workbook.addWorksheet('進度')
    sheet.addRow(['尚未建立棟別或工項'])
  }

  for (const work of model.works) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(work.name, used))
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2, showGridLines: false }]
    sheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      printTitlesRow: '1:2',
    }

    let rowIdx = 1
    sheet.getCell(rowIdx, 1).value = `${model.projectName}　${work.name}　${work.percent}%`
    sheet.getCell(rowIdx, 1).font = { bold: true, size: 14, color: { argb: 'FF245A8C' } }
    rowIdx += 1
    sheet.getCell(rowIdx, 1).value = model.dateLabel
    rowIdx += 2

    for (const table of work.tables) {
      sheet.getCell(rowIdx, 1).value = table.title
      sheet.getCell(rowIdx, 1).font = { bold: true, size: 12 }
      rowIdx += 1

      const header = sheet.getRow(rowIdx)
      header.getCell(1).value = table.rowHeader
      table.stages.forEach((stage, i) => {
        header.getCell(i + 2).value = stage.name
      })
      applyHeaderRow(header, table.stages.length + 1)
      rowIdx += 1

      for (const r of table.rows) {
        const row = sheet.getRow(rowIdx)
        row.height = 22
        const label = r.note ? `${r.label}（${r.note}）` : r.label
        row.getCell(1).value = label
        row.getCell(1).font = { bold: true }
        row.getCell(1).border = THIN_BORDER
        row.getCell(1).alignment = { vertical: 'middle' }
        r.cells.forEach((cell, i) => {
          const c = row.getCell(i + 2)
          c.value = cell.openDefects ? `${cell.mark} ${cell.openDefects}` : cell.mark
          c.alignment = { vertical: 'middle', horizontal: 'center' }
          c.border = THIN_BORDER
          c.font = fontForCell(cell)
          const fill = fillForCell(cell)
          if (fill) c.fill = fill
        })
        rowIdx += 1
      }
      rowIdx += 1
    }

    if (work.remarks.length > 0) {
      sheet.getCell(rowIdx, 1).value = '未關缺失'
      sheet.getCell(rowIdx, 1).font = { bold: true, color: { argb: 'FFC00000' } }
      rowIdx += 1
      for (const remark of work.remarks) {
        sheet.getCell(rowIdx, 1).value = remark
        sheet.getCell(rowIdx, 1).font = { color: { argb: 'FFC00000' } }
        rowIdx += 1
      }
    } else if (work.tables.length === 0) {
      sheet.getCell(rowIdx, 1).value = '此工種尚無棟別資料'
    }

    sheet.getColumn(1).width = 16
    const colCount = Math.max(
      2,
      ...work.tables.map((t) => t.stages.length + 1),
      2,
    )
    for (let i = 2; i <= colCount; i += 1) sheet.getColumn(i).width = 12
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
