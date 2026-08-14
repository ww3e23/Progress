import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { WorkItem } from '../../types'
import { createId } from '../../lib/id'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

export function WorkItemEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: WorkItem
  onSave: (item: WorkItem) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [stages, setStages] = useState(
    initial.stages.length
      ? initial.stages.map((s) => ({ ...s }))
      : [{ id: createId('st'), name: '', sortOrder: 0 }],
  )

  return (
    <Modal onClose={onCancel} aria-label="編輯工項">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 14px', fontSize: 20 }}
        hint="工序由左到右，對應 Excel 欄位。已有紀錄的工項只能停用，不會刪歷史。"
      >
        {initial.name ? `編輯「${initial.name}」` : '新增工項'}
      </TitleHint>

      <div className="field">
        <label>工項名稱</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：室內泥作"
        />
      </div>

      <div className="field">
        <label>工序（由左到右）</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {stages.map((stage, index) => (
            <div key={stage.id} style={{ display: 'flex', gap: 8 }}>
              <input
                value={stage.name}
                placeholder={`工序 ${index + 1}`}
                onChange={(e) => {
                  const next = [...stages]
                  next[index] = { ...stage, name: e.target.value }
                  setStages(next)
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minWidth: 40, padding: 0 }}
                onClick={() => setStages(stages.filter((s) => s.id !== stage.id))}
                aria-label="刪除工序"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="link"
          style={{ marginTop: 8 }}
          onClick={() =>
            setStages([
              ...stages,
              { id: createId('st'), name: '', sortOrder: stages.length },
            ])
          }
        >
          <Plus size={14} /> 新增工序
        </button>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 8 }}
        onClick={() => {
          const cleaned = stages
            .map((s, i) => ({ ...s, name: s.name.trim(), sortOrder: i }))
            .filter((s) => s.name)
          if (!name.trim() || cleaned.length === 0) return
          onSave({ ...initial, name: name.trim(), stages: cleaned })
        }}
      >
        儲存
      </button>
      {onDelete && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: 8, color: 'var(--terracotta)' }}
          onClick={onDelete}
        >
          刪除／停用此工項
        </button>
      )}
    </Modal>
  )
}
