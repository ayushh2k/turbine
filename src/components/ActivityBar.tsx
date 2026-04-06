import './ActivityBar.css';

export type SidePanelId = 'files' | 'tasks' | 'swarm';

interface ActivityBarProps {
  activePanel: SidePanelId | null;
  onPanelToggle: (panel: SidePanelId) => void;
  onOpenSettings: () => void;
  broadcastMode: boolean;
  onToggleBroadcast: () => void;
}

const FilesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const TasksIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="6" x2="20" y2="6"/>
    <line x1="9" y1="12" x2="20" y2="12"/>
    <line x1="9" y1="18" x2="20" y2="18"/>
    <polyline points="4 6 5 7 7 5"/>
    <polyline points="4 12 5 13 7 11"/>
    <polyline points="4 18 5 19 7 17"/>
  </svg>
);

const SwarmIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="2"/>
    <circle cx="5" cy="19" r="2"/>
    <circle cx="19" cy="19" r="2"/>
    <line x1="12" y1="7" x2="5" y2="17"/>
    <line x1="12" y1="7" x2="19" y2="17"/>
    <line x1="5" y1="19" x2="19" y2="19"/>
  </svg>
);

const BroadcastIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
    <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
    <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="2.5"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

interface BarItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  active?: boolean;
  highlight?: boolean;
  onClick: () => void;
  className?: string;
}

function BarItem({ icon, label, description, active, highlight, onClick, className }: BarItemProps) {
  const cls = [
    'activity-bar__btn',
    active && 'activity-bar__btn--active',
    highlight && 'activity-bar__btn--broadcast',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="activity-bar__item">
      <button className={cls} onClick={onClick}>
        {icon}
      </button>
      <div className="activity-bar__tooltip">
        <span className="activity-bar__tooltip-label">{label}</span>
        <span className="activity-bar__tooltip-desc">{description}</span>
      </div>
    </div>
  );
}

const PANELS: { id: SidePanelId; label: string; description: string; Icon: React.FC }[] = [
  { id: 'files', label: 'Files', description: 'Browse project files', Icon: FilesIcon },
  { id: 'tasks', label: 'Tasks', description: 'Manage tasks and agents', Icon: TasksIcon },
  { id: 'swarm', label: 'Swarm', description: 'Monitor agent swarm runs', Icon: SwarmIcon },
];

export function ActivityBar({ activePanel, onPanelToggle, onOpenSettings, broadcastMode, onToggleBroadcast }: ActivityBarProps) {
  return (
    <div className="activity-bar">
      <div className="activity-bar__top">
        {PANELS.map(({ id, label, description, Icon }) => (
          <BarItem
            key={id}
            icon={<Icon />}
            label={label}
            description={description}
            active={activePanel === id}
            onClick={() => onPanelToggle(id)}
          />
        ))}
      </div>
      <div className="activity-bar__bottom">
        <BarItem
          icon={<BroadcastIcon />}
          label="Broadcast"
          description={broadcastMode ? 'On — sending to all terminals' : 'Off — click to enable'}
          highlight={broadcastMode}
          onClick={onToggleBroadcast}
        />
        <BarItem
          icon={<SettingsIcon />}
          label="Settings"
          description="Themes, keybindings, terminal"
          onClick={onOpenSettings}
        />
      </div>
    </div>
  );
}
