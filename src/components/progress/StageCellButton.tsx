import { useRef } from 'react'
import type { StageStatus } from '../../types'
import { stageStatusClass, stageStatusShort } from '../../lib/stageProgress'

export function StageCellButton({
  status,
  openDefects,
  disabled,
  onTap,
  onLongPress,
  label,
  mixed,
}: {
  status: StageStatus
  openDefects: number
  disabled?: boolean
  onTap: () => void
  onLongPress: () => void
  label: string
  mixed?: boolean
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const start = useRef({ x: 0, y: 0 })

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  return (
    <button
      type="button"
      className={`stage-cell matrix-cell ${stageStatusClass(status)}${mixed ? ' mixed' : ''}`}
      aria-label={label}
      disabled={disabled}
      onContextMenu={(e) => {
        e.preventDefault()
        if (disabled) return
        onLongPress()
      }}
      onPointerDown={(e) => {
        if (disabled) return
        longFired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        clearTimer()
        timer.current = setTimeout(() => {
          longFired.current = true
          onLongPress()
        }, 420)
      }}
      onPointerMove={(e) => {
        const dx = e.clientX - start.current.x
        const dy = e.clientY - start.current.y
        if (dx * dx + dy * dy > 100) clearTimer()
      }}
      onPointerUp={() => {
        const wasLong = longFired.current
        clearTimer()
        if (!wasLong && !disabled) onTap()
      }}
      onPointerCancel={clearTimer}
    >
      {stageStatusShort(status)}
      {openDefects > 0 && status !== 'defect_fixing' ? (
        <span style={{ fontSize: 9, lineHeight: 1 }}>{openDefects}</span>
      ) : null}
    </button>
  )
}
