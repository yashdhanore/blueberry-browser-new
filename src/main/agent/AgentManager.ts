/**
 * Agent Manager
 *
 * Orchestrates the entire agent system:
 * - Creates and manages agents
 * - Runs the execution loop
 * - Tracks state and history
 * - Handles pause/resume/stop
 * - Saves/loads recipes
 * - Communicates with renderer via IPC
 */

import type { Window } from "../Window";
import type { Tab } from "../Tab";
import type {
  AgentGoal,
  AgentState,
  AgentContext,
  ExecutionResult,
  AgentRecipe,
  AgentConfig,
} from "./types";
import { DEFAULT_AGENT_CONFIG, AgentStatus, AgentAction } from "./types";
import { AgentPlanner, shouldGiveUp, getRecoveryHints } from "./AgentPlanner";
import { AgentExecutor } from "./AgentExecutor";
import { ensureHelperScript } from "./AgentActions";
import { extractInteractiveElements } from "./DOMHelpers";
import { WebContents } from "electron";
import { RecipesManager } from "./RecipesManager";
import type { RecipeWithMetadata } from "./RecipesManager";

// ============================================================================
// AGENT MANAGER CLASS
// ============================================================================

export class AgentManager {
  private window: Window;
  private agents: Map<string, AgentState> = new Map();
  private planner: AgentPlanner;
  private executor: AgentExecutor;
  private config: AgentConfig;
  private webContents: WebContents | null = null;
  private recipesManager: RecipesManager;

  constructor(window: Window, config: Partial<AgentConfig> = {}) {
    this.window = window;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.planner = new AgentPlanner();
    this.executor = new AgentExecutor(window, this.config);
    this.recipesManager = new RecipesManager();
  }

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents;
  }

  // ============================================================================
  // AGENT LIFECYCLE
  // ============================================================================

  createAgent(goal: string, tabId: string): string {
    const agentId = this.generateAgentId();

    const agentGoal: AgentGoal = {
      id: agentId,
      goal,
      tabId,
      createdAt: new Date(),
    };

    const agentState: AgentState = {
      goal: agentGoal,
      status: AgentStatus.CREATED,
      currentContext: null,
      actionHistory: [],
      currentAction: null,
      iteration: 0,
      maxIterations: this.config.maxIterations,
    };

    this.agents.set(agentId, agentState);

    console.log(`✨ Created agent ${agentId} with goal: ${goal}`);
    this.notifyStatusUpdate(agentId);

    return agentId;
  }

  async startAgent(agentId: string): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (
      state.status !== AgentStatus.CREATED &&
      state.status !== AgentStatus.PAUSED
    ) {
      throw new Error(
        `Agent ${agentId} cannot be started from status ${state.status}`
      );
    }

    state.status = AgentStatus.PLANNING;
    state.startedAt = new Date();

    console.log(`🚀 Starting agent ${agentId}`);

    this.notifyStatusUpdate(agentId);

    this.runExecutionLoop(agentId).catch((error) => {
      console.error(`Error in agent ${agentId} execution loop:`, error);
      this.failAgent(
        agentId,
        error instanceof Error ? error.message : String(error)
      );
    });
  }

  pauseAgent(agentId: string): void {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (
      state.status !== AgentStatus.PLANNING &&
      state.status !== AgentStatus.EXECUTING
    ) {
      throw new Error(
        `Agent ${agentId} cannot be paused from status ${state.status}`
      );
    }

    state.status = AgentStatus.PAUSED;

    console.log(`⏸️  Paused agent ${agentId}`);

    this.notifyStatusUpdate(agentId);
  }

  async resumeAgent(agentId: string): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (state.status !== AgentStatus.PAUSED) {
      throw new Error(
        `Agent ${agentId} cannot be resumed from status ${state.status}`
      );
    }

    state.status = AgentStatus.PLANNING;

    console.log(`▶️  Resumed agent ${agentId}`);

    this.notifyStatusUpdate(agentId);

    this.runExecutionLoop(agentId).catch((error) => {
      console.error(`Error in agent ${agentId} execution loop:`, error);
      this.failAgent(
        agentId,
        error instanceof Error ? error.message : String(error)
      );
    });
  }

  stopAgent(agentId: string): void {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    state.status = AgentStatus.STOPPED;
    state.completedAt = new Date();

    console.log(`🛑 Stopped agent ${agentId}`);

    this.notifyStatusUpdate(agentId);
  }

  private completeAgent(agentId: string, result?: any): void {
    const state = this.agents.get(agentId);
    if (!state) return;

    state.status = AgentStatus.COMPLETED;
    state.completedAt = new Date();
    state.result = result;

    console.log(`✅ Completed agent ${agentId}`);

    this.notifyStatusUpdate(agentId);
    this.notifyCompletion(agentId);
  }

  private failAgent(agentId: string, error: string): void {
    const state = this.agents.get(agentId);
    if (!state) return;

    state.status = AgentStatus.FAILED;
    state.completedAt = new Date();
    state.error = error;

    console.error(`❌ Failed agent ${agentId}: ${error}`);

    this.notifyStatusUpdate(agentId);
    this.notifyError(agentId, error);
  }

  // ============================================================================
  // EXECUTION LOOP
  // ============================================================================

  private async runExecutionLoop(agentId: string): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) return;

    const tab = this.window.getTab(state.goal.tabId);
    if (!tab) {
      this.failAgent(agentId, `Tab ${state.goal.tabId} not found`);
      return;
    }

    this.window.switchActiveTab(state.goal.tabId);

    while (
      state.status !== AgentStatus.STOPPED &&
      state.status !== AgentStatus.PAUSED &&
      state.status !== AgentStatus.COMPLETED &&
      state.status !== AgentStatus.FAILED &&
      state.iteration < state.maxIterations
    ) {
      try {
        state.iteration++;

        console.log(
          `\n🔄 Agent ${agentId} - Iteration ${state.iteration}/${state.maxIterations}`
        );

        const giveUpCheck = shouldGiveUp(state.actionHistory);
        if (giveUpCheck.shouldGiveUp) {
          this.failAgent(agentId, giveUpCheck.reason);
          return;
        }

        state.status = AgentStatus.PLANNING;
        this.notifyStatusUpdate(agentId);

        const context = await this.captureContext(tab);
        state.currentContext = context;

        console.log(`🧠 Planning next action...`);

        const planningResponse = await this.planner.planNextAction({
          goal: state.goal.goal,
          context,
          actionHistory: state.actionHistory,
          iteration: state.iteration,
        });

        console.log(`💭 Reasoning: ${planningResponse.reasoning}`);
        console.log(`🎯 Confidence: ${planningResponse.confidence}`);

        if (planningResponse.goalAchieved || !planningResponse.action) {
          console.log(`🎉 Goal achieved!`);
          this.completeAgent(agentId, state.currentContext);
          return;
        }

        const action = planningResponse.action;
        state.currentAction = action;

        console.log(`⚡ Next action: ${action.type}`);
        console.log(`📋 Parameters:`, action.parameters);

        state.status = AgentStatus.EXECUTING;
        this.notifyStatusUpdate(agentId);
        this.notifyActionExecuted(agentId, action);

        console.log(`🔨 Executing action...`);

        const result = await this.executor.executeAction(action, tab);

        state.actionHistory.push(result);
        state.currentAction = null;

        if (result.success) {
          console.log(`✓ Action succeeded`);
          if (result.data) {
            console.log(`📊 Data:`, result.data);
          }
        } else {
          console.log(`✗ Action failed: ${result.error}`);
        }

        this.notifyStatusUpdate(agentId);
        await this.wait(this.config.actionDelay);
      } catch (error) {
        console.error(`Error in iteration ${state.iteration}:`, error);

        const errorResult: ExecutionResult = {
          success: false,
          action: state.currentAction!,
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
          timestamp: new Date(),
        };
        state.actionHistory.push(errorResult);
        state.currentAction = null;
        await this.wait(2000);
      }
    }

    if (state.iteration >= state.maxIterations) {
      this.failAgent(
        agentId,
        `Maximum iterations (${state.maxIterations}) reached`
      );
    } else if (state.status === AgentStatus.STOPPED) {
      console.log(`Agent ${agentId} was stopped by user`);
    }
  }

  // ============================================================================
  // CONTEXT CAPTURE
  // ============================================================================

  private async captureContext(tab: Tab): Promise<AgentContext> {
    try {
      await ensureHelperScript(tab);

      const image = await tab.screenshot();
      const screenshot = image.toDataURL();

      let pageText = "";
      try {
        pageText = await tab.getTabText();
      } catch (error) {
        console.warn("Failed to get page text:", error);
      }

      let simplifiedDOM = "";
      try {
        simplifiedDOM = await extractInteractiveElements(tab);
      } catch (error) {
        console.warn("Failed to get simplified DOM:", error);
      }

      let url = tab.url;
      let title = tab.title;

      return {
        url,
        title,
        screenshot,
        simplifiedDOM,
        pageText,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error("Error capturing context:", error);
      throw error;
    }
  }

  // ============================================================================
  // STATE QUERIES
  // ============================================================================

  getAgentStatus(agentId: string): AgentState | null {
    return this.agents.get(agentId) || null;
  }

  listAllAgents(): AgentState[] {
    return Array.from(this.agents.values());
  }

  getActiveAgents(): AgentState[] {
    return Array.from(this.agents.values()).filter(
      (state) =>
        state.status === AgentStatus.PLANNING ||
        state.status === AgentStatus.EXECUTING ||
        state.status === AgentStatus.PAUSED
    );
  }

  // ============================================================================
  // RECIPE MANAGEMENT
  // ============================================================================

  saveRecipe(agentId: string, name: string, description: string = ""): string {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const actions = state.actionHistory
      .filter((result) => result.success)
      .map((result) => result.action);

    const recipe: AgentRecipe = {
      name,
      description: description || state.goal.goal,
      goal: state.goal.goal,
      actions,
      tags: [],
      createdAt: new Date(),
      useCount: 0,
    };

    const recipeId = this.recipesManager.saveRecipe(recipe);
    console.log(`💾 Saved recipe: ${name} (${recipeId})`);

    return recipeId;
  }

  async loadRecipe(recipeId: string, tabId: string): Promise<string> {
    const recipe = this.recipesManager.loadRecipe(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    // Create a new agent with the recipe's actions
    const agentId = this.createAgent(recipe.goal, tabId);
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Failed to create agent for recipe`);
    }

    // Update use count
    this.recipesManager.updateRecipeUsage(recipeId);

    // Execute the recipe actions
    await this.executeRecipe(agentId, recipe.actions);

    return agentId;
  }

  async executeRecipe(agentId: string, actions: AgentAction[]): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const tab = this.window.getTab(state.goal.tabId);
    if (!tab) {
      this.failAgent(agentId, `Tab ${state.goal.tabId} not found`);
      return;
    }

    state.status = AgentStatus.EXECUTING;
    state.startedAt = new Date();
    this.notifyStatusUpdate(agentId);

    for (const action of actions) {
      if (state.status === AgentStatus.STOPPED || state.status === AgentStatus.PAUSED) {
        break;
      }

      state.currentAction = action;
      this.notifyStatusUpdate(agentId);
      this.notifyActionExecuted(agentId, action);

      const result = await this.executor.executeAction(action, tab);
      state.actionHistory.push(result);
      state.currentAction = null;

      if (!result.success) {
        console.error(`Recipe action failed: ${result.error}`);
        // Continue with next action even if one fails
      }

      this.notifyStatusUpdate(agentId);
      await this.wait(this.config.actionDelay);
    }

    this.completeAgent(agentId);
  }

  listRecipes(): RecipeWithMetadata[] {
    return this.recipesManager.listRecipes();
  }

  deleteRecipe(recipeId: string): boolean {
    return this.recipesManager.deleteRecipe(recipeId);
  }

  getRecipeById(recipeId: string): RecipeWithMetadata | null {
    return this.recipesManager.loadRecipe(recipeId);
  }

  // ============================================================================
  // IPC NOTIFICATIONS
  // ============================================================================

  private notifyStatusUpdate(agentId: string): void {
    if (!this.webContents) return;

    const state = this.agents.get(agentId);
    if (!state) return;

    const serializable = {
      ...state,
      currentContext: state.currentContext
        ? {
            ...state.currentContext,
            screenshot: undefined,
          }
        : null,
    };

    this.webContents.send("agent-status-update", {
      agentId,
      state: serializable,
    });
  }

  private notifyActionExecuted(agentId: string, action: AgentAction): void {
    if (!this.webContents) return;

    this.webContents.send("agent-action-executed", {
      agentId,
      action,
    });
  }

  private notifyCompletion(agentId: string): void {
    if (!this.webContents) return;

    const state = this.agents.get(agentId);
    if (!state) return;

    this.webContents.send("agent-completed", {
      agentId,
      result: state.result,
    });
  }

  private notifyError(agentId: string, error: string): void {
    if (!this.webContents) return;

    this.webContents.send("agent-error", {
      agentId,
      error,
    });
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private generateAgentId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup(): void {
    console.log("🧹 Cleaning up AgentManager...");

    for (const [agentId, state] of this.agents.entries()) {
      if (
        state.status === AgentStatus.PLANNING ||
        state.status === AgentStatus.EXECUTING
      ) {
        this.stopAgent(agentId);
      }
    }

    this.recipesManager.cleanup();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format agent state for display
 */
export function formatAgentState(state: AgentState): string {
  const lines = [
    `Agent: ${state.goal.id}`,
    `Goal: ${state.goal.goal}`,
    `Status: ${state.status}`,
    `Iteration: ${state.iteration}/${state.maxIterations}`,
    `Actions: ${state.actionHistory.length}`,
  ];

  if (state.error) {
    lines.push(`Error: ${state.error}`);
  }

  if (state.result) {
    lines.push(`Result: ${JSON.stringify(state.result)}`);
  }

  return lines.join("\n");
}

/**
 * Get agent statistics
 */
export function getAgentStats(state: AgentState): {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  successRate: number;
  duration: number | null;
} {
  const totalActions = state.actionHistory.length;
  const successfulActions = state.actionHistory.filter((r) => r.success).length;
  const failedActions = totalActions - successfulActions;
  const successRate = totalActions > 0 ? successfulActions / totalActions : 0;

  let duration = 0;
  if (state.startedAt && state.completedAt) {
    duration = state.completedAt.getTime() - state.startedAt.getTime();
  }

  return {
    totalActions,
    successfulActions,
    failedActions,
    successRate,
    duration,
  };
}
