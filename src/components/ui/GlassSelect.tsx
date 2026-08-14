import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
}

export function GlassSelect({
  label,
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  searchable,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value) ?? options[0]
  const enableSearch = searchable ?? options.length > 8

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => searchRef.current?.focus(), 40)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`filter-select glass-select ${open ? 'open' : ''}`} ref={rootRef}>
      <span className="filter-select-label">{label}</span>
      <button
        type="button"
        className="glass-select-trigger"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="glass-select-value">{selected?.label ?? '請選擇'}</span>
        <ChevronDown size={16} className="glass-select-chevron" aria-hidden />
      </button>

      {open && (
        <div className="glass-select-menu" id={listId}>
          {enableSearch && (
            <label className="glass-select-search">
              <Search size={14} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`搜尋${label}`}
                aria-label={`搜尋${label}`}
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
              <li className="glass-select-empty">沒有符合「{query.trim()}」的項目</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
