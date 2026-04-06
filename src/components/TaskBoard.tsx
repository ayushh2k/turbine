import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTaskStore } from '../state/taskStore';
import { useAgentStore } from '../state/agentStore';
import { useSwarmStore } from '../state/swarmStore';
import type { Task, TaskStatus, AgentPreset } from '../types';
import './TaskBoard.css';

interface TaskBoardProps {
  projectPath: string;
  onFocus?: () => void;
  onRunTask?: (task: Task, preset?: AgentPreset) => void;
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

export function TaskBoard({ projectPath, onFocus, onRunTask }: TaskBoardProps) {
  const allTasks = useTaskStore((s) => s.tasks);
  const tasks = useMemo(() => allTasks.filter((t) => t.project_path === projectPath), [allTasks, projectPath]);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const presets = useAgentStore((s) => s.presets);
  const loadPresets = useAgentStore((s) => s.loadPresets);
  const startSwarmRun = useSwarmStore((s) => s.startRun);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [activeRunTaskId, setActiveRunTaskId] = useState<string | null>(null);
  const draggedTaskId = useRef<string | null>(null);

  useEffect(() => {
    void loadTasks(projectPath);
    void loadPresets();
  }, [projectPath, loadTasks, loadPresets]);

  const handleCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (newTaskTitle.trim()) {
        void createTask(projectPath, newTaskTitle.trim());
        setNewTaskTitle('');
      }
    },
    [newTaskTitle, projectPath, createTask],
  );

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    draggedTaskId.current = taskId;
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== status) {
      setDragOverCol(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear when leaving the column entirely, not when entering a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    // WebKit (Tauri/macOS) returns empty string from getData in drop handler,
    // so fall back to the ref set during dragstart.
    const taskId = draggedTaskId.current ?? e.dataTransfer.getData('text/plain');
    draggedTaskId.current = null;
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) {
      void updateTask({ ...task, status: newStatus });
    }
  };

  const handleDelete = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    void deleteTask(taskId);
  };

  return (
    <div className="task-board" onClick={onFocus}>
      <div className="task-board__header">
        <h2 className="task-board__title">Tasks</h2>
        <span className="task-board__path" title={projectPath}>{projectPath}</span>
      </div>

      <div className="task-board__columns">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          const isDragOver = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              className={`task-board__column ${isDragOver ? 'task-board__column--drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <div className="task-board__column-header">
                <h3>{col.label}</h3>
                <span className="task-board__count">{colTasks.length}</span>
              </div>

              {col.id === 'todo' && (
                <form className="task-board__add-form" onSubmit={handleCreate}>
                  <input
                    type="text"
                    placeholder="+ Add a task..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                </form>
              )}

              <div className="task-board__list">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="task-board__card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="task-board__card-title">{task.title}</div>
                    <div className="task-board__card-actions">
                      {onRunTask && (
                        <button
                          className={`task-board__run-btn ${activeRunTaskId === task.id ? 'active' : ''}`}
                          onClick={() => setActiveRunTaskId(activeRunTaskId === task.id ? null : task.id)}
                          title="Run task in pane"
                        >
                          ▶ Run
                        </button>
                      )}
                      <button
                        className="task-board__del-btn"
                        onClick={(e) => handleDelete(e, task.id)}
                        title="Delete task"
                      >
                        ×
                      </button>
                    </div>
                    {activeRunTaskId === task.id && presets.length > 0 && (
                      <div className="task-board__agent-selector">
                        <span className="task-board__agent-label">Select Agent:</span>
                        <div className="task-board__agent-list">
                          {presets.map((preset) => (
                            <button
                              key={preset.id}
                              className="task-board__agent-btn"
                              onClick={() => {
                                setActiveRunTaskId(null);
                                if (task.status === 'todo') {
                                  void updateTask({ ...task, status: 'in_progress' });
                                }
                                void startSwarmRun(task, projectPath);
                                onRunTask?.(task, preset);
                              }}
                            >
                              <span className="task-board__agent-role">{preset.role}</span>
                              <span className="task-board__agent-name">{preset.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
