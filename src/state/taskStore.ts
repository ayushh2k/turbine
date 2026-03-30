import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Task } from '../types';

interface TaskState {
  tasks: Task[];
  loadTasks: (projectPath: string) => Promise<void>;
  createTask: (projectPath: string, title: string) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  
  loadTasks: async (projectPath: string) => {
    try {
      const fetchedTasks = await invoke<Task[]>('load_tasks', { projectPath });
      set({ tasks: fetchedTasks });
    } catch (e) {
      console.error('Failed to load tasks', e);
    }
  },
  
  createTask: async (projectPath: string, title: string) => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      project_path: projectPath,
      title,
      description: null,
      status: 'todo',
      linked_files_json: '[]',
    };
    try {
      await invoke('save_task', { task: newTask });
      set((state) => ({ tasks: [newTask, ...state.tasks] }));
    } catch (e) {
      console.error('Failed to create task', e);
    }
  },
  
  updateTask: async (task: Task) => {
    try {
      await invoke('save_task', { task });
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
      }));
    } catch (e) {
      console.error('Failed to update task', e);
    }
  },
  
  deleteTask: async (taskId: string) => {
    try {
      await invoke('delete_task', { taskId });
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      }));
    } catch (e) {
      console.error('Failed to delete task', e);
    }
  },
}));
