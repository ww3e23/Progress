import type { WorkItem, WorkStage } from '../types'
import { createId } from '../lib/id'

type WorkDef = {
  id: string
  name: string
  stages: string[]
}

/** 對應現場 Excel：止水墩／室內泥作／室外泥作 */
const DEFAULT_WORK_DEFS: WorkDef[] = [
  {
    id: 'wi_waterstop_rear',
    name: '止水墩（背向）',
    stages: ['模板組立', '鋼筋綁紮', '灌漿', '拆模', '鋼筋過高切除'],
  },
  {
    id: 'wi_waterstop_front',
    name: '止水墩（正向）',
    stages: ['模板組立', '鋼筋綁紮', '灌漿', '拆模', '鋼筋過高切除'],
  },
  {
    id: 'wi_plaster_in',
    name: '室內泥作',
    stages: ['崁縫', '吊線', '粗底', '粉光'],
  },
  {
    id: 'wi_plaster_out',
    name: '室外泥作',
    stages: ['噴打', '吊線', '粗底', '粉光'],
  },
]

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
