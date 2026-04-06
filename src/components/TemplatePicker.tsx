import { useState, useCallback, useRef, useEffect } from 'react';
import type { PaneTemplate } from '../types';
import './TemplatePicker.css';

const TEMPLATES: PaneTemplate[] = [1, 2, 4, 6, 8, 10, 12, 14, 16];

interface TemplatePickerProps {
  onSelect: (template: PaneTemplate) => void;
}

export function TemplatePicker({ onSelect }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (template: PaneTemplate) => {
      onSelect(template);
      setOpen(false);
    },
    [onSelect],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="template-picker" ref={dropdownRef}>
      <button
        className="template-picker__trigger"
        title="Pane layout templates"
        aria-label="Choose pane layout"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        ⊞ Layout
      </button>
      {open && (
        <div className="template-picker__dropdown" role="listbox">
          {TEMPLATES.map((t) => (
            <button
              key={t}
              className="template-picker__option"
              role="option"
              onClick={() => handleSelect(t)}
            >
              <span className="template-picker__grid">
                {renderMiniGrid(t)}
              </span>
              <span>{t} {t === 1 ? 'pane' : 'panes'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render a tiny visual grid preview for the template count */
function renderMiniGrid(count: number) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cells = Array.from({ length: count }, (_, i) => (
    <span
      key={i}
      className="template-picker__cell"
      style={{
        width: `calc(${100 / cols}% - 1.5px)`,
        height: `calc(${100 / rows}% - 1.5px)`,
      }}
    />
  ));
  return <span className="template-picker__mini-grid">{cells}</span>;
}
