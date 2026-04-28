import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTaskStore } from '../../state/taskStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import type { Task, TaskStatus } from '../../types';
import { DEFAULT_BOARD_COLUMNS } from '../../types';
import './TaskBoard.css';

export interface AgentCli {
  id: string;
  label: string;
  buildCommand: (task: Task) => string;
}

export const BUILTIN_AGENTS: AgentCli[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    buildCommand: (task) => {
      const prompt = task.description
        ? `${task.title}. ${task.description}`
        : task.title;
      return `claude -p ${JSON.stringify(prompt)}`;
    },
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    buildCommand: (task) => {
      const prompt = task.description
        ? `${task.title}. ${task.description}`
        : task.title;
      return `gemini -p ${JSON.stringify(prompt)}`;
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    buildCommand: (task) => {
      const prompt = task.description
        ? `${task.title}. ${task.description}`
        : task.title;
      return `codex ${JSON.stringify(prompt)}`;
    },
  },
];

export interface RunTaskRequest {
  task: Task;
  command: string;
  agentLabel: string;
}

interface TaskBoardProps {
  projectPath: string;
  workspaceId: string;
  onFocus?: () => void;
  onRunTask?: (req: RunTaskRequest) => void;
}

export function TaskBoard({ projectPath, workspaceId, onFocus, onRunTask }: TaskBoardProps) {
  const allTasks = useTaskStore((s) => s.tasks);
  const tasks = useMemo(() => allTasks.filter((t) => t.project_path === projectPath), [allTasks, projectPath]);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const boardColumns = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    return ws?.boardColumns ?? DEFAULT_BOARD_COLUMNS;
  });
  const setBoardColumns = useWorkspaceStore((s) => s.setBoardColumns);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [activeRunTaskId, setActiveRunTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const draggedTaskId = useRef<string | null>(null);

  useEffect(() => {
    void loadTasks(projectPath);
  }, [projectPath, loadTasks]);

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

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colId) {
      setDragOverCol(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverCol(null);
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

  const handleStartEdit = useCallback((task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingTaskId) return;
    const task = tasks.find((t) => t.id === editingTaskId);
    if (!task) return;
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) return;
    void updateTask({
      ...task,
      title: trimmedTitle,
      description: editDescription.trim() || null,
    });
    setEditingTaskId(null);
  }, [editingTaskId, editTitle, editDescription, tasks, updateTask]);

  const handleCancelEdit = useCallback(() => {
    setEditingTaskId(null);
  }, []);

  const handleAddColumn = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const label = newColumnLabel.trim();
      if (!label) return;
      const id = label.toLowerCase().replace(/\s+/g, '_');
      if (boardColumns.some((c) => c.id === id)) return;
      setBoardColumns(workspaceId, [...boardColumns, { id, label }]);
      setNewColumnLabel('');
      setShowAddColumn(false);
    },
    [newColumnLabel, boardColumns, workspaceId, setBoardColumns],
  );

  const handleRemoveColumn = useCallback(
    (colId: string) => {
      // Move tasks in deleted column to first column
      const firstColId = boardColumns[0]?.id ?? 'todo';
      tasks
        .filter((t) => t.status === colId)
        .forEach((t) => void updateTask({ ...t, status: firstColId }));
      setBoardColumns(
        workspaceId,
        boardColumns.filter((c) => c.id !== colId),
      );
    },
    [boardColumns, workspaceId, setBoardColumns, tasks, updateTask],
  );

  return (
    <div className="task-board" onClick={onFocus}>
      <div className="task-board__header">
        <h2 className="task-board__title">Tasks</h2>
        <span className="task-board__path" title={projectPath}>{projectPath}</span>
        <button
          className="task-board__add-col-btn"
          onClick={() => setShowAddColumn((v) => !v)}
          title="Add column"
        >
          + Column
        </button>
      </div>

      {showAddColumn && (
        <form className="task-board__add-col-form" onSubmit={handleAddColumn}>
          <input
            type="text"
            placeholder="Column name (e.g. Testing)"
            value={newColumnLabel}
            onChange={(e) => setNewColumnLabel(e.target.value)}
            autoFocus
          />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setShowAddColumn(false)}>Cancel</button>
        </form>
      )}

      <div className="task-board__columns">
        {boardColumns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          const isDragOver = dragOverCol === col.id;
          const isDefault = DEFAULT_BOARD_COLUMNS.some((d) => d.id === col.id);

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
                <div className="task-board__column-header-right">
                  <span className="task-board__count">{colTasks.length}</span>
                  {!isDefault && (
                    <button
                      className="task-board__col-del-btn"
                      onClick={() => handleRemoveColumn(col.id)}
                      title="Remove column"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {col.id === boardColumns[0]?.id && (
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
                {colTasks.map((task) => {
                  const isEditing = editingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className={`task-board__card ${isEditing ? 'task-board__card--editing' : ''}`}
                      draggable={!isEditing}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => { if (!isEditing) handleStartEdit(task); }}
                    >
                      {isEditing ? (
                        <div className="task-board__card-edit">
                          <input
                            className="task-board__edit-title"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
                            autoFocus
                          />
                          <textarea
                            className="task-board__edit-desc"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Add a description..."
                            rows={3}
                            onKeyDown={(e) => { if (e.key === 'Escape') handleCancelEdit(); }}
                          />
                          <div className="task-board__edit-actions">
                            <button className="task-board__edit-save" onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}>Save</button>
                            <button className="task-board__edit-cancel" onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="task-board__card-title">{task.title}</div>
                          {task.description && (
                            <div className="task-board__card-desc">{task.description}</div>
                          )}
                          <div className="task-board__card-actions">
                            <button
                              className={`task-board__run-btn ${activeRunTaskId === task.id ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); setActiveRunTaskId(activeRunTaskId === task.id ? null : task.id); }}
                              title="Run task with an AI agent"
                            >
                              ▶ Run
                            </button>
                            <button
                              className="task-board__del-btn"
                              onClick={(e) => handleDelete(e, task.id)}
                              title="Delete task"
                            >
                              ×
                            </button>
                          </div>
                          {activeRunTaskId === task.id && (
                            <div className="task-board__agent-selector" onClick={(e) => e.stopPropagation()}>
                              <span className="task-board__agent-label">Run with:</span>
                              <div className="task-board__agent-list">
                                {BUILTIN_AGENTS.map((agent) => (
                                  <button
                                    key={agent.id}
                                    className="task-board__agent-btn"
                                    onClick={() => {
                                      setActiveRunTaskId(null);
                                      if (task.status === boardColumns[0]?.id) {
                                        void updateTask({ ...task, status: boardColumns[1]?.id ?? 'in_progress' });
                                      }
                                      onRunTask?.({ task, command: agent.buildCommand(task), agentLabel: agent.label });
                                    }}
                                  >
                                    {agent.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
