/**
 * Agent System Type Definitions
 *
 * This file contains all TypeScript types and interfaces for the autonomous browsing agent system.
 */

export interface AgentGoal {
  id: string;
  goal: string;
  tabId: string;
  createdAt: Date;
}

export enum ActionType {
  // Navigation
  NAVIGATE = "navigate",
  GO_BACK = "go_back",
  GO_FORWARD = "go_forward",
  RELOAD = "reload",

  // DOM Interactions
  CLICK = "click",
  TYPE = "type",
  SELECT = "select",
  SCROLL = "scroll",
  HOVER = "hover",

  // Data Extraction
  EXTRACT = "extract",
  GET_TEXT = "get_text",
  GET_ATTRIBUTE = "get_attribute",

  // Tab Management
  CREATE_TAB = "create_tab",
  SWITCH_TAB = "switch_tab",
  CLOSE_TAB = "close_tab",

  // Utility
  WAIT = "wait",
  WAIT_FOR_ELEMENT = "wait_for_element",

  // Meta
  COMPLETE = "complete",
}

export interface BaseAction {
  type: ActionType;
  reasoning?: string;
  timestamp: Date;
}

export interface NavigateAction extends BaseAction {
  type: ActionType.NAVIGATE;
  parameters: {
    url: string;
  };
}

export interface GoBackAction extends BaseAction {
  type: ActionType.GO_BACK;
  parameters: Record<string, never>;
}

export interface GoForwardAction extends BaseAction {
  type: ActionType.GO_FORWARD;
  parameters: Record<string, never>;
}

export interface ReloadAction extends BaseAction {
  type: ActionType.RELOAD;
  parameters: Record<string, never>;
}

export interface ClickAction extends BaseAction {
  type: ActionType.CLICK;
  parameters: {
    selector: string;
    selectors?: string[][];
    offsetX?: number;
    offsetY?: number;
    waitFor?: number;
  };
}

export interface TypeAction extends BaseAction {
  type: ActionType.TYPE;
  parameters: {
    selector: string;
    selectors?: string[][];
    text: string;
    clear?: boolean;
    delay?: number;
  };
}

export interface SelectAction extends BaseAction {
  type: ActionType.SELECT;
  parameters: {
    selector: string;
    value: string;
  };
}

export interface ScrollAction extends BaseAction {
  type: ActionType.SCROLL;
  parameters: {
    direction: "up" | "down" | "to";
    amount?: number;
    toSelector?: string;
  };
}

export interface HoverAction extends BaseAction {
  type: ActionType.HOVER;
  parameters: {
    selector: string;
  };
}

export interface ExtractAction extends BaseAction {
  type: ActionType.EXTRACT;
  parameters: {
    schema: {
      [key: string]: {
        selector?: string;
        type: "text" | "number" | "url" | "image" | "array";
        multiple?: boolean;
      };
    };
  };
}

export interface GetTextAction extends BaseAction {
  type: ActionType.GET_TEXT;
  parameters: {
    selector: string;
  };
}

export interface GetAttributeAction extends BaseAction {
  type: ActionType.GET_ATTRIBUTE;
  parameters: {
    selector: string;
    attribute: string;
  };
}

export interface CreateTabAction extends BaseAction {
  type: ActionType.CREATE_TAB;
  parameters: {
    url?: string;
  };
}

export interface SwitchTabAction extends BaseAction {
  type: ActionType.SWITCH_TAB;
  parameters: {
    tabId: string;
  };
}

export interface CloseTabAction extends BaseAction {
  type: ActionType.CLOSE_TAB;
  parameters: {
    tabId: string;
  };
}

export interface WaitAction extends BaseAction {
  type: ActionType.WAIT;
  parameters: {
    ms: number;
  };
}

export interface WaitForElementAction extends BaseAction {
  type: ActionType.WAIT_FOR_ELEMENT;
  parameters: {
    selector: string;
    timeout: number;
  };
}

export interface CompleteAction extends BaseAction {
  type: ActionType.COMPLETE;
  parameters: {
    reason: string;
    data?: any;
  };
}

export type AgentAction =
  | NavigateAction
  | GoBackAction
  | GoForwardAction
  | ReloadAction
  | ClickAction
  | TypeAction
  | SelectAction
  | ScrollAction
  | HoverAction
  | ExtractAction
  | GetTextAction
  | GetAttributeAction
  | CreateTabAction
  | SwitchTabAction
  | CloseTabAction
  | WaitAction
  | WaitForElementAction
  | CompleteAction;

export interface ExecutionResult {
  success: boolean;
  action: AgentAction;
  error?: string;
  data?: any;
  screenshot?: string;
  duration: number;
  timestamp: Date;
}

export interface AgentContext {
  url: string;
  title: string;
  screenshot: string;
  simplifiedDOM: string;
  pageText: string;
  timestamp: Date;
}

export enum AgentStatus {
  CREATED = "created",
  PLANNING = "planning",
  EXECUTING = "executing",
  PAUSED = "paused",
  COMPLETED = "completed",
  FAILED = "failed",
  STOPPED = "stopped",
}

export interface AgentState {
  goal: AgentGoal;
  status: AgentStatus;
  currentContext: AgentContext | null;
  actionHistory: ExecutionResult[];
  currentAction: AgentAction | null;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  iteration: number;
  maxIterations: number;
  result?: any;
}

export interface AgentRecipe {
  name: string;
  description: string;
  goal: string;
  actions: AgentAction[];
  tags: string[];
  createdAt: Date;
  lastUsedAt?: Date;
  useCount: number;
}

export interface PlanningRequest {
  goal: string;
  context: AgentContext;
  actionHistory: ExecutionResult[];
  iteration: number;
}

export interface PlanningResponse {
  action: AgentAction | null;
  goalAchieved: boolean;
  confidence: number;
  reasoning: string;
}

export interface AgentConfig {
  maxIterations: number;
  maxRetries: number;
  actionDelay: number;
  defaultTimeout: number;
  captureScreenshots: boolean;
  llmModel: string;
  llmTemperature: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 50,
  maxRetries: 3,
  actionDelay: 1000,
  defaultTimeout: 30000,
  captureScreenshots: true,
  llmModel: "gpt-5-mini",
  llmTemperature: 0.7,
};

export interface SimplifiedDOMNode {
  tag: string;
  id?: string;
  class?: string;
  text?: string;
  attributes?: Record<string, string>;
  children?: SimplifiedDOMNode[];
  selector?: string;
}

export interface ElementLocator {
  strategy: "css" | "xpath" | "text" | "id" | "class";
  value: string;
}

// ============================================================================
// PUPPETEER REPLAY FORMAT TYPES
// ============================================================================

export interface AssertedEvent {
  type: "navigation" | "interaction";
  url?: string;
  title?: string;
}

export type StepType =
  | "setViewport"
  | "navigate"
  | "click"
  | "change"
  | "keyDown"
  | "keyUp"
  | "scroll"
  | "hover"
  | "waitForElement"
  | "waitForExpression";

export interface PuppeteerStep {
  type: StepType;
  selectors?: string[][]; // Multiple selector strategies
  selector?: string; // Single selector fallback
  offsetX?: number;
  offsetY?: number;
  target?: string;
  url?: string;
  value?: string;
  key?: string;
  assertedEvents?: AssertedEvent[];
  timeout?: number;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  isLandscape?: boolean;
  x?: number;
  y?: number;
  expression?: string;
}

export interface PuppeteerRecording {
  title: string;
  steps: PuppeteerStep[];
  timeout?: number;
}

export interface ChromeRecordingSession {
  id: string;
  tabId: string;
  startTime: number;
  isRecording: boolean;
  isPaused: boolean;
  recording: PuppeteerRecording;
}
