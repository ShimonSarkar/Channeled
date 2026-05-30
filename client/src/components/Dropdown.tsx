import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** small leading swatch / icon */
  leading?: ReactNode;
  /** color hint for the swatch */
  color?: string;
}

interface Props<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Custom trigger renderer; falls back to the styled chip-style trigger */
  renderTrigger?: (selected: DropdownOption<T> | undefined, open: boolean) => ReactNode;
  triggerClassName?: string;
  menuWidth?: number;
  align?: 'left' | 'right';
  ariaLabel?: string;
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  renderTrigger,
  triggerClassName,
  menuWidth,
  align = 'left',
  ariaLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const menuStyle: CSSProperties = {
    minWidth: menuWidth ?? 200,
    [align === 'right' ? 'right' : 'left']: 0,
  };

  return (
    <div className="dd-wrap" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={triggerClassName ?? 'dd-trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {renderTrigger ? (
          renderTrigger(selected, open)
        ) : (
          <>
            {selected?.leading}
            <span className="dd-trigger-label">{selected?.label ?? '—'}</span>
            <ChevronDown size={12} className="dd-caret" />
          </>
        )}
      </button>
      {open && (
        <div className="dd-menu" role="listbox" style={menuStyle}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`dd-option ${active ? 'active' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="dd-option-leading">
                  {opt.leading ?? (opt.color ? <span className="dd-swatch" style={{ background: opt.color }} /> : null)}
                </span>
                <span className="dd-option-text">
                  <span className="dd-option-label">{opt.label}</span>
                  {opt.description && <span className="dd-option-desc">{opt.description}</span>}
                </span>
                {active && <Check size={13} className="dd-option-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
