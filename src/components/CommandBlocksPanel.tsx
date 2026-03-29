import type { CommandBlock } from '../types';
import './CommandBlocksPanel.css';

interface CommandBlocksPanelProps {
  blocks: CommandBlock[];
  onToggleCollapse: (blockId: string) => void;
  onClose: () => void;
}

function getExitLabel(exitCode: number | null): string {
  if (exitCode === null) {
    return 'Unknown';
  }

  return exitCode === 0 ? 'OK' : `Exit ${exitCode}`;
}

function getCommandLabel(command: string): string {
  const trimmed = command.trim();
  return trimmed || '(interactive command)';
}

export function CommandBlocksPanel({
  blocks,
  onToggleCollapse,
  onClose,
}: CommandBlocksPanelProps) {
  const recentBlocks = [...blocks].reverse().slice(0, 12);

  return (
    <div className="command-blocks-panel" role="complementary" aria-label="Command blocks">
      <div className="command-blocks-panel__header">
        <div>
          <div className="command-blocks-panel__eyebrow">Command Blocks</div>
          <div className="command-blocks-panel__title">{blocks.length} tracked</div>
        </div>
        <button
          type="button"
          className="command-blocks-panel__close"
          aria-label="Close command blocks panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="command-blocks-panel__list">
        {recentBlocks.map((block) => (
          <button
            key={block.id}
            type="button"
            className={[
              'command-blocks-panel__item',
              block.collapsed ? 'command-blocks-panel__item--collapsed' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onToggleCollapse(block.id)}
          >
            <div className="command-blocks-panel__item-top">
              <span
                className={[
                  'command-blocks-panel__status',
                  block.exitCode === 0
                    ? 'command-blocks-panel__status--ok'
                    : 'command-blocks-panel__status--err',
                ].join(' ')}
              />
              <span className="command-blocks-panel__command">
                {getCommandLabel(block.command)}
              </span>
              <span className="command-blocks-panel__toggle">
                {block.collapsed ? '+' : '-'}
              </span>
            </div>
            {!block.collapsed && (
              <div className="command-blocks-panel__meta">
                <span>{getExitLabel(block.exitCode)}</span>
                <span>
                  Lines {block.startLine + 1}-{block.endLine + 1}
                </span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
