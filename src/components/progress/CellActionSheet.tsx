import { AlertTriangle, Ban, Camera, CircleOff, ClipboardPlus, Play } from 'lucide-react'
import { Modal } from '../ui/Modal'
import type { StageStatus } from '../../types'
import { stageStatusLabel } from '../../lib/stageProgress'

export function CellActionSheet({
  title,
  subtitle,
  status,
  openDefects,
  canEdit,
  onClose,
  onProgress,
  onDefect,
  onBlock,
  onUnblock,
  onMarkNa,
  onClearNa,
}: {
  title: string
  subtitle: string
  status: StageStatus
  openDefects: number
  canEdit: boolean
  onClose: () => void
  onProgress: () => void
  onDefect: () => void
  onBlock: () => void
  onUnblock: () => void
  onMarkNa: () => void
  onClearNa: () => void
}) {
  return (
    <Modal onClose={onClose} variant="bottom" aria-label="格子操作">
      <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 20 }}>
        {title}
      </h3>
      <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
        {subtitle} · {stageStatusLabel(status)}
        {openDefects > 0 ? ` · 未關缺失 ${openDefects}` : ''}
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={!canEdit} onClick={onProgress}>
          <Camera size={18} /> 拍照記進度
        </button>
        <button type="button" className="btn btn-ghost" disabled={!canEdit} onClick={onDefect}>
          <ClipboardPlus size={18} /> 記缺失
        </button>
        {status === 'blocked' ? (
          <button type="button" className="btn btn-ghost" disabled={!canEdit} onClick={onUnblock}>
            <Play size={18} /> 解除卡關，改施工中
          </button>
        ) : status !== 'na' ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!canEdit || openDefects > 0}
            onClick={onBlock}
          >
            <CircleOff size={18} /> 卡關／待協調
          </button>
        ) : null}
        {status === 'na' ? (
          <button type="button" className="btn btn-ghost" disabled={!canEdit} onClick={onClearNa}>
            <Play size={18} /> 取消不適用，改未開始
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!canEdit || openDefects > 0}
            onClick={onMarkNa}
          >
            <Ban size={18} /> 標為不適用
          </button>
        )}
      </div>

      {openDefects > 0 && (
        <p
          style={{
            margin: '12px 0 0',
            color: 'var(--terracotta)',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={14} />
          有未關閉缺失時不能標完成、不適用或卡關。請先改善或作廢缺失。
        </p>
      )}
    </Modal>
  )
}
