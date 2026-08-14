import type { WorkItem, WorkStage } from '../types'
import { createId } from '../lib/id'

type WorkDef = {
  id: string
  name: string
  stages: string[]
}

/**
 * 對應現場 Excel「各樓層工作進度」：工項＝大項列，工序＝其下細項。
 * 矩陣仍是樓層 × 工序（1F／2F／RF）。
 */
const DEFAULT_WORK_DEFS: WorkDef[] = [
  {
    id: 'wi_plaster',
    name: '泥作',
    stages: ['吊線', '崁縫', '粉刷（粗底）', '粉刷（粉光）', '浴廁磁磚', '陽台磁磚'],
  },
  {
    id: 'wi_partition',
    name: '輕隔間',
    stages: ['止水墩', '立骨架', '單封', '雙封', '灌漿', '二次擊釘'],
  },
  {
    id: 'wi_window',
    name: '鋁窗',
    stages: ['鋁窗噴打', '鋁窗安裝'],
  },
  {
    id: 'wi_railing',
    name: '欄杆',
    stages: ['欄杆預埋', '欄杆組立'],
  },
  {
    id: 'wi_cladding',
    name: '鋁包板',
    stages: ['鋁包板骨架安裝', '鋁包板安裝'],
  },
  {
    id: 'wi_stone',
    name: '石材',
    stages: ['石材骨架安裝', '石材安裝', '圍牆石材安裝'],
  },
  {
    id: 'wi_waterproof',
    name: '防水',
    stages: [
      '鋁窗防水 - 素地清潔及潤濕',
      '鋁窗防水 - 第一道彈潤性水泥',
      '鋁窗防水 - 第二道彈潤性水泥',
      '浴廁防水 - 素地清潔及潤濕',
      '浴廁防水 - 第一道彈潤性水泥',
      '浴廁防水 - 第二道彈潤性水泥',
      '陽台防水 - 素地清潔及潤濕',
      '陽台防水 - 第一道彈潤性水泥',
      '陽台防水 - 第二道彈潤性水泥',
      '外牆骨架固定點單液 PU',
      '斜屋頂防水施作',
    ],
  },
  {
    id: 'wi_firedoor',
    name: '防火門',
    stages: ['防火門噴打', '防火門安裝'],
  },
  {
    id: 'wi_formwork',
    name: '模板',
    stages: ['陽台止水墩（正面）', '陽台止水墩（背面）', '後方延伸板', '門窗下方止水墩'],
  },
  {
    id: 'wi_rebar',
    name: '鋼筋',
    stages: ['陽台止水墩鋼筋綁紮（正面）', '陽台止水墩鋼筋綁紮（背面）'],
  },
  {
    id: 'wi_pour',
    name: '灌漿',
    stages: ['陽台止水墩灌漿（正面）', '陽台止水墩灌漿（背面）'],
  },
]

/** 舊版四項預設；填入預設時會整批換成上面的 Excel 工項 */
export const LEGACY_DEFAULT_WORK_NAMES = [
  '止水墩（背向）',
  '止水墩（正向）',
  '室內泥作',
  '室外泥作',
]

export type ApplyWorkItemsMode = 'fill-if-empty' | 'fill-missing' | 'replace'

export type ApplyWorkItemsResult = {
  workItems: WorkItem[]
  added: number
  revived: number
  migrated: boolean
  message: string
}

export function stagesFromNames(names: string[], prefix?: string): WorkStage[] {
  return names.map((name, index) => ({
    id: `${prefix ?? 'st'}_${index + 1}`,
    name,
    sortOrder: index,
  }))
}

export function buildDefaultWorkItems(): WorkItem[] {
  return DEFAULT_WORK_DEFS.map((def, index) => ({
    id: def.id,
    name: def.name,
    stages: stagesFromNames(def.stages, `${def.id}_st`),
    sortOrder: index,
    active: true,
  }))
}

function sameWorkItem(a: { id: string; name: string }, b: { id: string; name: string }): boolean {
  return a.id === b.id || a.name === b.name
}

export function applyDefaultWorkItemsToList(
  existing: WorkItem[],
  mode: ApplyWorkItemsMode = 'fill-missing',
): ApplyWorkItemsResult {
  const defaults = buildDefaultWorkItems()
  const active = existing.filter((w) => w.active)

  if (mode === 'fill-if-empty') {
    if (active.length > 0) {
      return {
        workItems: existing,
        added: 0,
        revived: 0,
        migrated: false,
        message: '',
      }
    }
    return {
      workItems: defaults,
      added: defaults.length,
      revived: 0,
      migrated: false,
      message: `已填入 ${defaults.length} 個預設工項`,
    }
  }

  const onlyLegacy =
    active.length > 0 && active.every((w) => LEGACY_DEFAULT_WORK_NAMES.includes(w.name))

  if (mode === 'replace' || onlyLegacy) {
    const leftover = existing
      .filter((w) => !defaults.some((d) => sameWorkItem(d, w)))
      .map((w) => ({ ...w, active: false }))
    return {
      workItems: [...defaults, ...leftover],
      added: defaults.length,
      revived: 0,
      migrated: onlyLegacy,
      message: onlyLegacy
        ? `已改為現場 Excel 預設工項（泥作、輕隔間、鋁窗、防水…共 ${defaults.length} 項）。舊的止水墩／室內泥作已停用。`
        : `已換成 ${defaults.length} 個預設工項`,
    }
  }

  const next = [...existing]
  let added = 0
  let revived = 0
  for (const def of defaults) {
    const idx = next.findIndex((w) => sameWorkItem(w, def))
    if (idx < 0) {
      next.push({ ...def, sortOrder: next.length })
      added += 1
      continue
    }
    if (!next[idx].active) {
      next[idx] = { ...next[idx], active: true }
      revived += 1
    }
  }

  if (added === 0 && revived === 0) {
    return {
      workItems: existing,
      added: 0,
      revived: 0,
      migrated: false,
      message: '預設工項都在，沒有缺的。誤刪的若已改名，請用「+ 新增工項」加回。',
    }
  }

  const bits = [
    added ? `補上 ${added} 個` : '',
    revived ? `恢復 ${revived} 個停用的` : '',
  ].filter(Boolean)
  return {
    workItems: next,
    added,
    revived,
    migrated: false,
    message: `已${bits.join('、')}預設工項。`,
  }
}

export function newWorkItemDraft(partial?: Partial<WorkItem>): WorkItem {
  const id = partial?.id ?? createId('wi')
  return {
    id,
    name: partial?.name ?? '',
    stages: partial?.stages?.length
      ? partial.stages
      : stagesFromNames(['工序 1'], `${id}_st`),
    sortOrder: partial?.sortOrder ?? 0,
    active: partial?.active ?? true,
  }
}
