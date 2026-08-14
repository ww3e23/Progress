import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'

export type GlassSelectOption = {
  value: string
  label: string
}

type Props = {
  label: string
  value: string
  options: GlassSelectOption[]
  onChange: (value: string) => void
  'aria-label'?: string
  /** 選項多時顯示搜尋框；未指定則超過 8 筆自動開啟 */
  searchable?: boolean
  disabled?: boolean
  hideLabel?: boolean
}

type MenuPos = { top: number; left: number; width: number; maxHeight: number }

export function GlassSelect({
  label,
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  searchable,
  disabled,
  hideLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<MenuPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value)
  const enableSearch = searchable ?? options.length > 8

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [options, query])

  function placeMenu() {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 6
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const maxHeight = Math.min(280, Math.max(spaceBelow, spaceAbove, 120))
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const top = openUp ? Math.max(8, rect.top - gap - maxHeight) : rect.bottom + gap
    setPos({
      top,
      left: rect.left,
      width: rect.width,
      maxHeight,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    placeMenu()
  }, [open, filtered.length])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReposition = () => placeMenu()
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    const t = window.setTimeout(() => searchRef.current?.focus(), 40)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  const menu = open && pos
    ? createPortal(
        <div
          ref={menuRef}
          className="glass-select-menu glass-select-menu-portal"
          id={listId}
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
          }}
        >
          {enableSearch && (
            <label className="glass-select-search">
              <Search size={14} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`搜尋${label || '項目'}`}
                aria-label={`搜尋${label || '項目'}`}
              />
            </label>
          )}
          <ul className="glass-select-list" role="listbox" aria-label={ariaLabel ?? label}>
            {filtered.map((opt) => {
              const active = opt.value === value
              return (
                <li key={opt.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={`glass-select-option ${active ? 'on' : ''}`}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="glass-select-empty">
                {options.length === 0 ? '尚無選項' : `沒有符合「${query.trim()}」的項目`}
              </li>
            )}
          </ul>
        </div>,
        document.body,
      )
    : null

  return (
    <div className={`filter-select glass-select ${open ? 'open' : ''}`} ref={rootRef}>
      {!hideLabel && <span className="filter-select-label">{label}</span>}
      <button
        type="button"
        ref={triggerRef}
        className="glass-select-trigger"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((v) => !v)
        }}
      >
        <span className="glass-select-value">{selected?.label ?? '請選擇'}</span>
        <ChevronDown size={16} className="glass-select-chevron" aria-hidden />
      </button>
      {menu}
    </div>
  )
}
