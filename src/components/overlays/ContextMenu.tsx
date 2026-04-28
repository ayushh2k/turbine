import { useEffect, useRef, useCallback } from 'react';
import './ContextMenu.css';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  submenu?: React.ReactNode;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`ctx-menu__item ${item.danger ? 'ctx-menu__item--danger' : ''}`}
          role="menuitem"
          onClick={() => {
            item.action();
            onClose();
          }}
        >
          {item.label}
          {item.submenu}
        </button>
      ))}
    </div>
  );
}

/* Preset color picker for workspace color assignment */
const PRESET_COLORS = [
  '#00e5c8', '#00b4d8', '#4895ef', '#7b61ff',
  '#f72585', '#ff5c5c', '#f0c040', '#06d6a0',
  '#ff8c42', '#a8dadc', '#e0e0e0', '#6b8a9e',
];

interface ColorPickerProps {
  onSelect: (color: string) => void;
}

export function ColorPicker({ onSelect }: ColorPickerProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent, color: string) => {
      e.stopPropagation();
      onSelect(color);
    },
    [onSelect],
  );

  return (
    <div className="color-picker" role="listbox" aria-label="Choose a color">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          className="color-picker__swatch"
          style={{ backgroundColor: color }}
          role="option"
          aria-label={color}
          onClick={(e) => handleClick(e, color)}
        />
      ))}
    </div>
  );
}
