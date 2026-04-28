import { useCallback } from 'react';
import { ContextMenu, type ContextMenuItem } from '../overlays/ContextMenu';

interface TerminalContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onSearch: () => void;
  onSplitH: () => void;
  onSplitV: () => void;
  onClosePane: () => void;
  onDetachPane: () => void;
  hasSelection: boolean;
}

export function TerminalContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onPaste,
  onClear,
  onSearch,
  onSplitH,
  onSplitV,
  onClosePane,
  onDetachPane,
  hasSelection,
}: TerminalContextMenuProps) {
  const handleCopy = useCallback(() => {
    onCopy();
  }, [onCopy]);

  const handlePaste = useCallback(() => {
    onPaste();
  }, [onPaste]);

  const items: ContextMenuItem[] = [
    {
      label: hasSelection ? 'Copy' : 'Copy (no selection)',
      action: handleCopy,
    },
    {
      label: 'Paste',
      action: handlePaste,
    },
    {
      label: '─', // visual separator
      action: () => {},
    },
    {
      label: 'Clear Terminal',
      action: onClear,
    },
    {
      label: 'Search  ⌘F',
      action: onSearch,
    },
    {
      label: '─',
      action: () => {},
    },
    {
      label: 'Split Horizontal  ⌘D',
      action: onSplitH,
    },
    {
      label: 'Split Vertical  ⇧⌘D',
      action: onSplitV,
    },
    {
      label: 'Close Pane  ⌘W',
      action: onClosePane,
      danger: true,
    },
    {
      label: '─',
      action: () => {},
    },
    {
      label: 'Detach to New Workspace',
      action: onDetachPane,
    },
  ];

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
