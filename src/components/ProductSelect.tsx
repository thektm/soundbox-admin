import { Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

export type ProductSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type ProductSelectProps = {
  value: string
  onValueChange: (value: string) => void
  options: ProductSelectOption[]
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
  side: 'top' | 'bottom'
}

const VIEWPORT_MARGIN = 10
const MENU_GAP = 6
const MIN_MENU_WIDTH = 172
const MAX_MENU_WIDTH = 330
const MAX_MENU_HEIGHT = 340
const OPTION_HEIGHT = 34

export function ProductSelect({ value, onValueChange, options, ariaLabel, placeholder, disabled = false, className = '' }: ProductSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 0, left: 0, width: MIN_MENU_WIDTH, maxHeight: MAX_MENU_HEIGHT, side: 'bottom' })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<number | null>(null)
  const listboxId = useId()

  const selectedIndex = options.findIndex(option => option.value === value && !option.disabled)
  const selectedOption = options.find(option => option.value === value)

  const enabledIndices = useCallback(() => options.reduce<number[]>((indices, option, index) => {
    if (!option.disabled) indices.push(index)
    return indices
  }, []), [options])

  const initialIndex = useCallback((edge: 'selected' | 'first' | 'last' = 'selected') => {
    const enabled = enabledIndices()
    if (enabled.length === 0) return -1
    if (edge === 'first') return enabled[0]
    if (edge === 'last') return enabled[enabled.length - 1]
    return selectedIndex >= 0 ? selectedIndex : enabled[0]
  }, [enabledIndices, selectedIndex])

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = Math.max(0, window.innerWidth)
    const viewportHeight = Math.max(0, window.innerHeight)
    const usableWidth = Math.max(120, viewportWidth - VIEWPORT_MARGIN * 2)
    const width = Math.min(Math.max(rect.width, MIN_MENU_WIDTH), MAX_MENU_WIDTH, usableWidth)
    const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.right - width), maxLeft)

    const desiredHeight = Math.min(MAX_MENU_HEIGHT, Math.max(OPTION_HEIGHT + 10, options.length * OPTION_HEIGHT + 10))
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN)
    const spaceAbove = Math.max(0, rect.top - MENU_GAP - VIEWPORT_MARGIN)
    const side: MenuPosition['side'] = spaceBelow >= Math.min(desiredHeight, 180) || spaceBelow >= spaceAbove ? 'bottom' : 'top'
    const availableHeight = side === 'bottom' ? spaceBelow : spaceAbove
    const maxHeight = Math.min(desiredHeight, Math.max(OPTION_HEIGHT + 10, availableHeight))
    const top = side === 'bottom'
      ? Math.min(rect.bottom + MENU_GAP, Math.max(VIEWPORT_MARGIN, viewportHeight - maxHeight - VIEWPORT_MARGIN))
      : Math.max(VIEWPORT_MARGIN, rect.top - MENU_GAP - maxHeight)

    setMenuPosition({ top, left, width, maxHeight, side })
  }, [options.length])

  const closeMenu = useCallback((focusTrigger = false) => {
    setOpen(false)
    setActiveIndex(-1)
    typeaheadRef.current = ''
    if (typeaheadTimerRef.current !== null) {
      window.clearTimeout(typeaheadTimerRef.current)
      typeaheadTimerRef.current = null
    }
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
  }, [])

  const openMenu = useCallback((edge: 'selected' | 'first' | 'last' = 'selected') => {
    if (disabled) return
    setActiveIndex(initialIndex(edge))
    setOpen(true)
  }, [disabled, initialIndex])

  const toggleMenu = useCallback(() => {
    if (disabled) return
    if (open) closeMenu(false)
    else openMenu('selected')
  }, [closeMenu, disabled, open, openMenu])

  const focusIndex = useCallback((index: number) => {
    if (index < 0) return
    setActiveIndex(index)
    requestAnimationFrame(() => optionRefs.current[index]?.focus({ preventScroll: true }))
  }, [])

  const moveActive = useCallback((direction: 1 | -1) => {
    const enabled = enabledIndices()
    if (enabled.length === 0) return
    const currentPosition = enabled.indexOf(activeIndex)
    const nextPosition = currentPosition < 0
      ? (direction === 1 ? 0 : enabled.length - 1)
      : (currentPosition + direction + enabled.length) % enabled.length
    focusIndex(enabled[nextPosition])
  }, [activeIndex, enabledIndices, focusIndex])

  const chooseOption = useCallback((index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    if (option.value !== value) onValueChange(option.value)
    closeMenu(true)
  }, [closeMenu, onValueChange, options, value])

  const handleTypeahead = useCallback((key: string) => {
    if (key.length !== 1 || key === ' ') return false
    typeaheadRef.current += key.toLocaleLowerCase('fa')
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = ''
      typeaheadTimerRef.current = null
    }, 650)

    const query = typeaheadRef.current
    const enabled = enabledIndices()
    if (enabled.length === 0) return true
    const start = Math.max(0, enabled.indexOf(activeIndex))
    const ordered = [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)]
    const match = ordered.find(index => options[index].label.toLocaleLowerCase('fa').startsWith(query))
    if (match !== undefined) focusIndex(match)
    return true
  }, [activeIndex, enabledIndices, focusIndex, options])

  useEffect(() => {
    if (!open) return

    const frame = requestAnimationFrame(() => {
      updateMenuPosition()
      const index = activeIndex >= 0 ? activeIndex : initialIndex('selected')
      if (index >= 0) focusIndex(index)
    })

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu(false)
    }
    const handleViewportChange = () => updateMenuPosition()

    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [activeIndex, closeMenu, focusIndex, initialIndex, open, updateMenuPosition])

  useEffect(() => () => {
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current)
  }, [])

  return <>
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-controls={open ? listboxId : undefined}
      aria-expanded={open}
      aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      className={`product-select ${className}`.trim()}
      data-state={open ? 'open' : 'closed'}
      data-disabled={disabled ? '' : undefined}
      disabled={disabled}
      onClick={toggleMenu}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          closeMenu(true)
          return
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          if (open) moveActive(1)
          else openMenu('selected')
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          if (open) moveActive(-1)
          else openMenu('last')
          return
        }
        if ((event.key === 'Enter' || event.key === ' ') && open) {
          event.preventDefault()
          closeMenu(true)
        }
      }}
    >
      <span>{selectedOption?.label ?? placeholder ?? ''}</span>
      <span className="product-select__chevron" aria-hidden><ChevronDown size={15} /></span>
    </button>

    {open && typeof document !== 'undefined' && createPortal(
      <div
        ref={menuRef}
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel}
        dir="rtl"
        className="product-select-menu"
        data-state="open"
        data-side={menuPosition.side}
        style={{
          position: 'fixed',
          top: menuPosition.top,
          left: menuPosition.left,
          width: menuPosition.width,
          maxHeight: menuPosition.maxHeight,
        }}
      >
        <div className="product-select-menu__viewport" style={{ maxHeight: menuPosition.maxHeight, overflowY: 'auto' }}>
          {options.map((option, index) => {
            const checked = option.value === value
            const highlighted = index === activeIndex
            return <div
              key={`${option.value}__${index}`}
              ref={node => { optionRefs.current[index] = node }}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={checked}
              aria-disabled={option.disabled || undefined}
              tabIndex={option.disabled ? undefined : -1}
              className="product-select-option"
              data-state={checked ? 'checked' : 'unchecked'}
              data-highlighted={highlighted ? '' : undefined}
              data-disabled={option.disabled ? '' : undefined}
              onPointerMove={() => {
                if (!option.disabled && activeIndex !== index) setActiveIndex(index)
              }}
              onClick={() => chooseOption(index)}
              onKeyDown={event => {
                if (event.altKey || event.ctrlKey || event.metaKey) return
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  moveActive(1)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  moveActive(-1)
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  focusIndex(initialIndex('first'))
                } else if (event.key === 'End') {
                  event.preventDefault()
                  focusIndex(initialIndex('last'))
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  chooseOption(index)
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  closeMenu(true)
                } else if (event.key === 'Tab') {
                  closeMenu(false)
                  triggerRef.current?.focus({ preventScroll: true })
                } else {
                  handleTypeahead(event.key)
                }
              }}
            >
              <span>{option.label}</span>
              {checked && <span className="product-select-option__check" aria-hidden><Check size={14} /></span>}
            </div>
          })}
        </div>
      </div>,
      document.body,
    )}
  </>
}
