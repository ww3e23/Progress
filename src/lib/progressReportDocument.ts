import { escapeHtml } from './escapeHtml'
import { triggerAnchorDownload } from './download'
import {
  buildProgressReportModel,
  type ProgressReportCell,
} from './progressReportModel'
import type { ProjectState } from '../types'

type ReportInput = {
  projectName: string
  state: ProjectState
  mode?: 'embed' | 'window'
}

function cellStyle(cell: ProgressReportCell): { bg: string; fg: string } {
  if (cell.mixed) return { bg: '#ffe699', fg: '#1e2733' }
  switch (cell.status) {
    case 'completed':
      return { bg: '#245a8c', fg: '#fff' }
    case 'in_progress':
      return { bg: '#c97b2e', fg: '#fff' }
    case 'blocked':
      return { bg: '#c64545', fg: '#fff' }
    case 'defect_fixing':
      return { bg: '#ae4c3b', fg: '#fff' }
    case 'na':
      return { bg: '#d5dde6', fg: '#5a6573' }
    default:
      return { bg: '#ffffff', fg: '#5a6573' }
  }
}

function legendHtml(): string {
  const items: [string, string, string][] = [
    ['#ffffff', '#5a6573', '未開始'],
    ['#c97b2e', '#fff', '施工中'],
    ['#245a8c', '#fff', '完成'],
    ['#c64545', '#fff', '卡關'],
    ['#ae4c3b', '#fff', '缺失改善中'],
    ['#d5dde6', '#5a6573', '不適用'],
    ['#ffe699', '#1e2733', '同層戶別不同'],
  ]
  return items
    .map(
      ([bg, fg, label]) =>
        `<span class="legend-item"><i style="background:${bg};color:${fg}">${
          bg === '#ffffff' ? '—' : bg === '#c97b2e' ? '施' : bg === '#245a8c' ? '✓' : bg === '#c64545' ? '卡' : bg === '#ae4c3b' ? '!' : bg === '#d5dde6' ? '×' : '混'
        }</i>${escapeHtml(label)}</span>`,
    )
    .join('')
}

export function buildProgressReportHtml(input: ReportInput): string {
  const { projectName, state, mode = 'window' } = input
  const model = buildProgressReportModel(projectName, state)

  const workSections = model.works
    .map((work) => {
      const tables = work.tables
        .map((table) => {
          const head = table.stages
            .map((s) => `<th>${escapeHtml(s.name)}</th>`)
            .join('')
          const body = table.rows
            .map((row) => {
              const cells = row.cells
                .map((cell) => {
                  const { bg, fg } = cellStyle(cell)
                  const title = cell.openDefects ? `缺 ${cell.openDefects}` : ''
                  return `<td style="background:${bg};color:${fg}" title="${escapeHtml(title)}">${escapeHtml(cell.mark)}${
                    cell.openDefects ? `<sup>${cell.openDefects}</sup>` : ''
                  }</td>`
                })
                .join('')
              return `<tr><th>${escapeHtml(row.label)}${
                row.note ? `<small>${escapeHtml(row.note)}</small>` : ''
              }</th>${cells}</tr>`
            })
            .join('')
          return `
        <div class="matrix-wrap">
          <h3>${escapeHtml(table.title)}</h3>
          <div class="matrix-scroll">
            <table class="matrix">
              <thead>
                <tr><th>${escapeHtml(table.rowHeader)}</th>${head}</tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>`
        })
        .join('')

      const summary = work.summaryLines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join('')
      const remarks = work.remarks.length
        ? `<div class="remarks"><strong>未關缺失</strong><ul>${work.remarks
            .map((r) => `<li>${escapeHtml(r)}</li>`)
            .join('')}</ul></div>`
        : ''

      return `
      <section class="work">
        <header class="work-head">
          <h2>${escapeHtml(work.name)}</h2>
          <div class="work-pct">${work.percent}%</div>
        </header>
        ${summary ? `<ul class="summary">${summary}</ul>` : ''}
        ${tables || '<p class="empty">此工種尚無棟別資料。</p>'}
        ${remarks}
      </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(model.projectName)}｜進度報表</title>
  <style>
    :root {
      --ink: #1e2733;
      --soft: #5a6573;
      --blue: #245a8c;
      --paper: #e6eef6;
      --card: #fff;
      --line: rgba(30,39,51,0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Heiti TC', sans-serif;
      background: var(--paper);
    }
    .toolbar {
      position: sticky; top: 0; z-index: 5;
      display: flex; gap: 10px; justify-content: flex-end; align-items: center;
      padding: 12px 16px;
      background: rgba(230,238,246,0.94);
      border-bottom: 1px solid var(--line);
    }
    .toolbar button {
      border: 0; border-radius: 999px; padding: 10px 18px;
      font: inherit; font-weight: 700; cursor: pointer;
    }
    .btn-primary { background: var(--blue); color: #fff; }
    .btn-ghost { background: rgba(255,255,255,0.8); color: var(--ink); }
    .page { max-width: 1100px; margin: 0 auto; padding: 18px 14px 48px; }
    .report-head {
      display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;
      padding: 0 0 14px; margin: 0 0 14px;
      border-bottom: 2px solid var(--blue);
    }
    .report-head h1 { font-size: 22px; margin: 0 0 4px; line-height: 1.25; }
    .report-head .meta { margin: 0; font-size: 12px; color: var(--soft); line-height: 1.5; }
    .pct {
      min-width: 64px; padding: 10px 12px; border-radius: 14px;
      border: 1.5px solid var(--blue); color: var(--blue);
      background: rgba(36,90,140,0.08);
      display: grid; place-items: center;
      font-size: 22px; font-weight: 800;
    }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 0 16px; }
    .stat {
      background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px;
    }
    .stat .n { font-size: 20px; font-weight: 800; color: var(--blue); }
    .stat .l { font-size: 11px; font-weight: 700; color: var(--soft); margin-top: 2px; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px 12px; margin: 0 0 18px; }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--soft); }
    .legend-item i {
      display: inline-grid; place-items: center;
      width: 22px; height: 20px; border-radius: 5px;
      border: 1px solid var(--line); font-style: normal; font-size: 11px; font-weight: 800;
    }
    .work {
      background: var(--card); border: 1px solid var(--line); border-radius: 18px;
      padding: 16px 14px 12px; margin: 0 0 16px;
      break-inside: avoid-page;
    }
    .work-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 0 0 8px; }
    .work-head h2 { margin: 0; font-size: 18px; }
    .work-pct { font-size: 18px; font-weight: 800; color: var(--blue); }
    .summary { margin: 0 0 12px; padding: 0; list-style: none; }
    .summary li { font-size: 13px; font-weight: 700; color: var(--soft); line-height: 1.45; margin: 0 0 3px; }
    .matrix-wrap { margin: 0 0 14px; }
    .matrix-wrap h3 { margin: 0 0 8px; font-size: 14px; }
    .matrix-scroll { overflow-x: auto; }
    table.matrix {
      width: max-content; min-width: 100%;
      border-collapse: collapse; font-size: 11px; table-layout: auto;
    }
    table.matrix th, table.matrix td {
      border: 1px solid #c5d0dc; text-align: center;
      padding: 5px 4px; min-width: 36px;
    }
    table.matrix thead th {
      background: #245a8c; color: #fff; font-weight: 700;
      white-space: normal; max-width: 72px; line-height: 1.2;
    }
    table.matrix tbody th {
      background: #f3f7fb; text-align: left; white-space: nowrap;
      padding: 5px 8px; font-weight: 800; min-width: 72px;
    }
    table.matrix tbody th small {
      display: block; font-weight: 600; color: var(--soft); font-size: 10px;
    }
    table.matrix td { font-weight: 800; }
    table.matrix td sup { font-size: 9px; margin-left: 1px; }
    .remarks { margin-top: 8px; color: #ae4c3b; font-size: 12px; font-weight: 700; }
    .remarks ul { margin: 4px 0 0; padding-left: 18px; }
    .empty, .footer { color: var(--soft); font-size: 12px; font-weight: 600; }
    .footer { text-align: center; margin-top: 24px; }
    @media (max-width: 720px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
    }
    @media print {
      .toolbar { display: none !important; }
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { background: #fff !important; }
      .page { max-width: none; padding: 0; }
      .work { break-inside: auto; page-break-inside: auto; border-radius: 0; }
      .work-head { break-after: avoid; }
      table.matrix { font-size: 10px; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  ${
    mode === 'window'
      ? `<div class="toolbar">
    <button class="btn-ghost" onclick="window.close()">關閉</button>
    <button class="btn-primary" onclick="window.print()">列印／匯出 PDF</button>
  </div>`
      : ''
  }
  <div class="page">
    <header class="report-head">
      <div>
        <h1>${escapeHtml(model.projectName)}｜進度報表</h1>
        <p class="meta">${escapeHtml(model.dateLabel)}<br/>完成 ${model.completedCells}/${model.totalCells} 格</p>
      </div>
      <div class="pct">${model.overallPercent}%</div>
    </header>
    <div class="stats">
      <div class="stat"><div class="n">${model.overallPercent}%</div><div class="l">全案完成率</div></div>
      <div class="stat"><div class="n">${model.openDefects}</div><div class="l">未關缺失</div></div>
      <div class="stat"><div class="n">${model.defectCells}</div><div class="l">缺失改善中</div></div>
      <div class="stat"><div class="n">${model.blockedCells}</div><div class="l">卡關</div></div>
    </div>
    <div class="legend">${legendHtml()}</div>
    ${workSections || '<p class="empty">請先設定棟別與工項。</p>'}
    <div class="footer">施工進度 · ${escapeHtml(model.projectName)} · 本報表由系統自動產生</div>
  </div>
</body>
</html>`
}

export function downloadProgressReport(input: Omit<ReportInput, 'mode'>, filename?: string) {
  const html = buildProgressReportHtml({ ...input, mode: 'window' })
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  try {
    triggerAnchorDownload(url, filename || `${input.projectName || '進度'}_報表_${stamp}.html`)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
