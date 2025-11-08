/**
 * Sidebar Preload Script
 *
 * Exposes APIs to the sidebar renderer process including:
 * - Existing chat functionality
 * - Page content access
 * - NEW: Agent management APIs
 */

import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  context: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

interface AgentState {
  goal: {
    id: string;
    goal: string;
    tabId: string;
    createdAt: string;
  };
  status: string;
  currentContext: any;
  actionHistory: any[];
  currentAction: any;
  iteration: number;
  maxIterations: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  result?: any;
}

interface AgentStatusUpdate {
  agentId: string;
  state: AgentState;
}

interface AgentActionExecuted {
  agentId: string;
  action: any;
}

interface AgentCompleted {
  agentId: string;
  result: any;
}

interface AgentError {
  agentId: string;
  error: string;
}

const sidebarAPI = {
  sendChatMessage: (request: Partial<ChatRequest>) =>
    electronAPI.ipcRenderer.invoke("sidebar-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("sidebar-clear-chat"),

  getMessages: () => electronAPI.ipcRenderer.invoke("sidebar-get-messages"),

  onChatResponse: (callback: (data: ChatResponse) => void) => {
    electronAPI.ipcRenderer.on("chat-response", (_, data) => callback(data));
  },

  onMessagesUpdated: (callback: (messages: any[]) => void) => {
    electronAPI.ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages)
    );
  },

  removeChatResponseListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-response");
  },

  removeMessagesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  getPageContent: () => electronAPI.ipcRenderer.invoke("get-page-content"),

  getPageText: () => electronAPI.ipcRenderer.invoke("get-page-text"),

  getCurrentUrl: () => electronAPI.ipcRenderer.invoke("get-current-url"),

  getActiveTabInfo: () => electronAPI.ipcRenderer.invoke("get-active-tab-info"),

  createAgent: (goal: string) =>
    electronAPI.ipcRenderer.invoke("agent-create", goal),

  startAgent: (agentId: string) =>
    electronAPI.ipcRenderer.invoke("agent-start", agentId),

  pauseAgent: (agentId: string) =>
    electronAPI.ipcRenderer.invoke("agent-pause", agentId),

  resumeAgent: (agentId: string) =>
    electronAPI.ipcRenderer.invoke("agent-resume", agentId),

  stopAgent: (agentId: string) =>
    electronAPI.ipcRenderer.invoke("agent-stop", agentId),

  getAgentStatus: (agentId: string) =>
    electronAPI.ipcRenderer.invoke("agent-get-status", agentId),

  listAllAgents: () => electronAPI.ipcRenderer.invoke("agent-list-all"),

  listActiveAgents: () => electronAPI.ipcRenderer.invoke("agent-list-active"),

  onAgentStatusUpdate: (callback: (data: AgentStatusUpdate) => void) => {
    electronAPI.ipcRenderer.on("agent-status-update", (_, data) =>
      callback(data)
    );
  },

  onAgentActionExecuted: (callback: (data: AgentActionExecuted) => void) => {
    electronAPI.ipcRenderer.on("agent-action-executed", (_, data) =>
      callback(data)
    );
  },

  onAgentCompleted: (callback: (data: AgentCompleted) => void) => {
    electronAPI.ipcRenderer.on("agent-completed", (_, data) => callback(data));
  },

  onAgentError: (callback: (data: AgentError) => void) => {
    electronAPI.ipcRenderer.on("agent-error", (_, data) => callback(data));
  },

  removeAgentStatusUpdateListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-status-update");
  },

  removeAgentActionExecutedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-action-executed");
  },

  removeAgentCompletedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-completed");
  },

  removeAgentErrorListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-error");
  },

  removeAllAgentListeners: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-status-update");
    electronAPI.ipcRenderer.removeAllListeners("agent-action-executed");
    electronAPI.ipcRenderer.removeAllListeners("agent-completed");
    electronAPI.ipcRenderer.removeAllListeners("agent-error");
  },

  saveAgentRecipe: (agentId: string, name: string, description?: string) =>
    electronAPI.ipcRenderer.invoke(
      "agent-save-recipe",
      agentId,
      name,
      description
    ),

  loadAgentRecipe: (recipeName: string) =>
    electronAPI.ipcRenderer.invoke("agent-load-recipe", recipeName),

  listAgentRecipes: () => electronAPI.ipcRenderer.invoke("agent-list-recipes"),

  deleteAgentRecipe: (recipeName: string) =>
    electronAPI.ipcRenderer.invoke("agent-delete-recipe", recipeName),

  // Skills Management
  createSkillFromAgent: (
    agentId: string,
    name: string,
    description?: string,
    tags?: string[]
  ) =>
    electronAPI.ipcRenderer.invoke(
      "skill-create-from-agent",
      agentId,
      name,
      description,
      tags
    ),

  createSkill: (
    name: string,
    description: string,
    actions: any[],
    tags?: string[]
  ) =>
    electronAPI.ipcRenderer.invoke("skill-create", name, description, actions, tags),

  saveSkill: (skill: any) =>
    electronAPI.ipcRenderer.invoke("skill-save", skill),

  loadSkill: (skillId: string) =>
    electronAPI.ipcRenderer.invoke("skill-load", skillId),

  listAllSkills: () => electronAPI.ipcRenderer.invoke("skill-list-all"),

  getSkill: (skillId: string) =>
    electronAPI.ipcRenderer.invoke("skill-get", skillId),

  executeSkill: (skillId: string, options?: any) =>
    electronAPI.ipcRenderer.invoke("skill-execute", skillId, options),

  executeSkillByName: (name: string, options?: any) =>
    electronAPI.ipcRenderer.invoke("skill-execute-by-name", name, options),

  deleteSkill: (skillId: string) =>
    electronAPI.ipcRenderer.invoke("skill-delete", skillId),

  searchSkillsByTags: (tags: string[]) =>
    electronAPI.ipcRenderer.invoke("skill-search-by-tags", tags),

  exportSkillToJSON: (skillId: string) =>
    electronAPI.ipcRenderer.invoke("skill-export-json", skillId),

  importSkillFromJSON: (jsonContent: string) =>
    electronAPI.ipcRenderer.invoke("skill-import-json", jsonContent),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error("Error exposing sidebar API:", error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
