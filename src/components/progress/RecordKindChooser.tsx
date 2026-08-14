import { Camera, ClipboardPlus } from 'lucide-react'
import { Modal } from '../ui/Modal'

export function RecordKindChooser({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (kind: 'progress' | 'defect') => void
}) {
  return (
    <Modal onClose={onClose} variant="bottom" aria-label="新增紀錄">
      <h3 className="serif" style={{ margin: '0 0 12px', fontSize: 20 }}>
        新增
      </h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={() => onPick('progress')}>
          <Camera size={18} /> 記進度
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onPick('defect')}>
          <ClipboardPlus size={18} /> 記缺失
        </button>
      </div>
    </Modal>
  )
}
