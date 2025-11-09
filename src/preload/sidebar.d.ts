/**
 * Sidebar API Type Definitions
 *
 * TypeScript definitions for the sidebar preload API including agent management.
 */

import { ElectronAPI } from "@electron-toolkit/preload";

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

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface AgentGoal {
  id: string;
  goal: string;
  tabId: string;
  createdAt: string;
}

interface AgentState {
  goal: AgentGoal;
  status:
    | "created"
    | "planning"
    | "executing"
    | "paused"
    | "completed"
    | "failed"
    | "stopped";
  currentContext: AgentContext | null;
  actionHistory: ExecutionResult[];
  currentAction: AgentAction | null;
  iteration: number;
  maxIterations: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  result?: any;
}

interface AgentContext {
  url: string;
  title: string;
  screenshot: string;
  simplifiedDOM: string;
  pageText: string;
  timestamp: string;
}

interface AgentAction {
  type: string;
  parameters: any;
  reasoning?: string;
  timestamp: string;
}

interface ExecutionResult {
  success: boolean;
  action: AgentAction;
  error?: string;
  data?: any;
  screenshot?: string;
  duration: number;
  timestamp: string;
}

interface AgentStatusUpdate {
  agentId: string;
  state: AgentState;
}

interface AgentActionExecuted {
  agentId: string;
  action: AgentAction;
}

interface AgentCompleted {
  agentId: string;
  result: any;
}

interface AgentError {
  agentId: string;
  error: string;
}

interface AgentAPIResponse {
  success: boolean;
  error?: string;
}

interface CreateAgentResponse extends AgentAPIResponse {
  agentId?: string;
}

interface GetAgentStatusResponse extends AgentAPIResponse {
  state?: AgentState;
}

interface ListAgentsResponse extends AgentAPIResponse {
  agents?: AgentState[];
}

interface LoadRecipeResponse extends AgentAPIResponse {
  agentId?: string;
}

interface ListRecipesResponse extends AgentAPIResponse {
  recipes?: any[];
}

interface GetRecipeResponse extends AgentAPIResponse {
  recipe?: any;
}

interface PuppeteerRecording {
  title: string;
  steps: any[];
  timeout?: number;
}

interface ChromeRecordingSession {
  id: string;
  tabId: string;
  startTime: number;
  isRecording: boolean;
  isPaused: boolean;
  recording: PuppeteerRecording;
}

interface RecordingAPIResponse {
  success: boolean;
  error?: string;
}

interface StartRecordingResponse extends RecordingAPIResponse {
  sessionId?: string;
}

interface StopRecordingResponse extends RecordingAPIResponse {
  recording?: PuppeteerRecording;
}

interface GetRecordingResponse extends RecordingAPIResponse {
  recording?: PuppeteerRecording;
}

interface ListSessionsResponse extends RecordingAPIResponse {
  sessions?: ChromeRecordingSession[];
}

interface SaveRecipeResponse extends RecordingAPIResponse {
  recipeId?: string;
}

interface ImportRecordingResponse extends RecordingAPIResponse {
  recording?: PuppeteerRecording;
}

interface SidebarAPI {
  sendChatMessage: (request: Partial<ChatRequest>) => Promise<void>;
  clearChat: () => Promise<boolean>;
  getMessages: () => Promise<any[]>;
  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  onMessagesUpdated: (callback: (messages: any[]) => void) => void;
  removeChatResponseListener: () => void;
  removeMessagesUpdatedListener: () => void;

  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  getActiveTabInfo: () => Promise<TabInfo | null>;

  createAgent: (goal: string) => Promise<CreateAgentResponse>;
  startAgent: (agentId: string) => Promise<AgentAPIResponse>;
  pauseAgent: (agentId: string) => Promise<AgentAPIResponse>;
  resumeAgent: (agentId: string) => Promise<AgentAPIResponse>;
  stopAgent: (agentId: string) => Promise<AgentAPIResponse>;

  getAgentStatus: (agentId: string) => Promise<GetAgentStatusResponse>;
  listAllAgents: () => Promise<ListAgentsResponse>;
  listActiveAgents: () => Promise<ListAgentsResponse>;

  onAgentStatusUpdate: (callback: (data: AgentStatusUpdate) => void) => void;
  onAgentActionExecuted: (
    callback: (data: AgentActionExecuted) => void
  ) => void;
  onAgentCompleted: (callback: (data: AgentCompleted) => void) => void;
  onAgentError: (callback: (data: AgentError) => void) => void;
  removeAgentStatusUpdateListener: () => void;
  removeAgentActionExecutedListener: () => void;
  removeAgentCompletedListener: () => void;
  removeAgentErrorListener: () => void;
  removeAllAgentListeners: () => void;

  saveAgentRecipe: (
    agentId: string,
    name: string,
    description?: string
  ) => Promise<AgentAPIResponse>;
  loadAgentRecipe: (recipeId: string) => Promise<LoadRecipeResponse>;
  listAgentRecipes: () => Promise<ListRecipesResponse>;
  deleteAgentRecipe: (recipeId: string) => Promise<AgentAPIResponse>;
  getAgentRecipe: (recipeId: string) => Promise<GetRecipeResponse>;

  // Chrome Recording APIs
  chromeRecordingStart: (tabId: string) => Promise<StartRecordingResponse>;
  chromeRecordingStop: (sessionId: string) => Promise<StopRecordingResponse>;
  chromeRecordingPause: (sessionId: string) => Promise<RecordingAPIResponse>;
  chromeRecordingResume: (sessionId: string) => Promise<RecordingAPIResponse>;
  chromeRecordingGet: (sessionId: string) => Promise<GetRecordingResponse>;
  chromeRecordingListSessions: () => Promise<ListSessionsResponse>;
  chromeRecordingSaveAsRecipe: (
    recording: PuppeteerRecording,
    name: string,
    description?: string
  ) => Promise<SaveRecipeResponse>;
  chromeRecordingExport: (
    sessionId: string,
    filepath: string
  ) => Promise<RecordingAPIResponse>;
  chromeRecordingImport: (filepath: string) => Promise<ImportRecordingResponse>;

  // Tab management APIs
  getTabs: () => Promise<TabInfo[]>;
  createTab: (url?: string) => Promise<TabInfo>;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => Promise<void>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}

export type {
  ChatRequest,
  ChatResponse,
  TabInfo,
  AgentGoal,
  AgentState,
  AgentContext,
  AgentAction,
  ExecutionResult,
  AgentStatusUpdate,
  AgentActionExecuted,
  AgentCompleted,
  AgentError,
  AgentAPIResponse,
  CreateAgentResponse,
  GetAgentStatusResponse,
  ListAgentsResponse,
  LoadRecipeResponse,
  ListRecipesResponse,
  GetRecipeResponse,
  SidebarAPI,
  PuppeteerRecording,
  ChromeRecordingSession,
  RecordingAPIResponse,
  StartRecordingResponse,
  StopRecordingResponse,
  GetRecordingResponse,
  ListSessionsResponse,
  SaveRecipeResponse,
  ImportRecordingResponse,
};
