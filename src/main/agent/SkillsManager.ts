/**
 * Skills Manager
 *
 * Manages the recording, saving, loading, and execution of browser automation skills.
 * Skills are reusable action sequences that can be triggered via slash commands.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { app } from "electron";
import type { Window } from "../Window";
import type { Tab } from "../Tab";
import type {
  Skill,
  SkillMetadata,
  SkillContext,
  SkillExecutionOptions,
  SkillExecutionResult,
  AgentAction,
  ExecutionResult,
  AgentState,
} from "./types";
import { AgentExecutor } from "./AgentExecutor";
import { DEFAULT_AGENT_CONFIG } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_EXTENSION = ".yaml";

// ============================================================================
// SKILLS MANAGER CLASS
// ============================================================================

export class SkillsManager {
  private window: Window;
  private executor: AgentExecutor;
  private skillsDir: string;
  private skills: Map<string, Skill> = new Map();

  constructor(window: Window) {
    this.window = window;
    this.executor = new AgentExecutor(window, DEFAULT_AGENT_CONFIG);
    this.skillsDir = path.join(app.getPath("userData"), SKILLS_DIR_NAME);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
      console.log(`📁 Skills directory: ${this.skillsDir}`);
      await this.loadAllSkills();
    } catch (error) {
      console.error("Error initializing SkillsManager:", error);
      throw error;
    }
  }

  // ============================================================================
  // SKILL RECORDING
  // ============================================================================

  /**
   * Create a skill from an agent's action history
   */
  createSkillFromAgent(
    agentState: AgentState,
    name: string,
    description?: string,
    tags?: string[],
    context?: Partial<SkillContext>
  ): Skill {
    const successfulActions = agentState.actionHistory
      .filter((result) => result.success)
      .map((result) => result.action);

    const skill: Skill = {
      id: this.generateSkillId(name),
      name,
      description: description || agentState.goal.goal,
      actions: successfulActions,
      metadata: {
        tags: tags || [],
        createdAt: new Date(),
        useCount: 0,
        version: "1.0.0",
      },
      context: {
        startUrl: agentState.currentContext?.url,
        ...context,
      },
    };

    return skill;
  }

  /**
   * Create a skill from a custom action sequence
   */
  createSkill(
    name: string,
    description: string,
    actions: AgentAction[],
    tags?: string[],
    context?: SkillContext
  ): Skill {
    const skill: Skill = {
      id: this.generateSkillId(name),
      name,
      description,
      actions,
      metadata: {
        tags: tags || [],
        createdAt: new Date(),
        useCount: 0,
        version: "1.0.0",
      },
      context,
    };

    return skill;
  }

  // ============================================================================
  // SKILL PERSISTENCE
  // ============================================================================

  /**
   * Save a skill to disk (YAML format)
   */
  async saveSkill(skill: Skill): Promise<void> {
    try {
      const filename = `${skill.id}${SKILL_FILE_EXTENSION}`;
      const filepath = path.join(this.skillsDir, filename);

      // Convert skill to serializable format
      const serializable = this.skillToSerializable(skill);

      // Save as YAML
      const yamlContent = yaml.stringify(serializable, {
        indent: 2,
        lineWidth: 0,
      });

      await fs.writeFile(filepath, yamlContent, "utf-8");

      // Update in-memory cache
      this.skills.set(skill.id, skill);

      console.log(`💾 Saved skill: ${skill.name} (${filename})`);
    } catch (error) {
      console.error(`Error saving skill ${skill.name}:`, error);
      throw error;
    }
  }

  /**
   * Load a skill from disk
   */
  async loadSkill(skillId: string): Promise<Skill | null> {
    try {
      const filename = `${skillId}${SKILL_FILE_EXTENSION}`;
      const filepath = path.join(this.skillsDir, filename);

      const content = await fs.readFile(filepath, "utf-8");
      const data = yaml.parse(content);

      const skill = this.serializableToSkill(data);
      this.skills.set(skill.id, skill);

      return skill;
    } catch (error) {
      console.error(`Error loading skill ${skillId}:`, error);
      return null;
    }
  }

  /**
   * Load all skills from disk
   */
  async loadAllSkills(): Promise<void> {
    try {
      const files = await fs.readdir(this.skillsDir);
      const skillFiles = files.filter((f) => f.endsWith(SKILL_FILE_EXTENSION));

      console.log(`📚 Loading ${skillFiles.length} skills...`);

      for (const file of skillFiles) {
        try {
          const skillId = file.replace(SKILL_FILE_EXTENSION, "");
          await this.loadSkill(skillId);
        } catch (error) {
          console.warn(`Failed to load skill from ${file}:`, error);
        }
      }

      console.log(`✅ Loaded ${this.skills.size} skills`);
    } catch (error) {
      console.error("Error loading skills:", error);
    }
  }

  /**
   * Delete a skill
   */
  async deleteSkill(skillId: string): Promise<void> {
    try {
      const filename = `${skillId}${SKILL_FILE_EXTENSION}`;
      const filepath = path.join(this.skillsDir, filename);

      await fs.unlink(filepath);
      this.skills.delete(skillId);

      console.log(`🗑️  Deleted skill: ${skillId}`);
    } catch (error) {
      console.error(`Error deleting skill ${skillId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // SKILL EXECUTION
  // ============================================================================

  /**
   * Execute a skill on a tab
   */
  async executeSkill(
    skillId: string,
    options: SkillExecutionOptions = {}
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const skill = this.skills.get(skillId);

    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Get or create tab
    let tab: Tab | null = null;
    if (options.tabId) {
      tab = this.window.getTab(options.tabId);
    } else {
      const activeTab = this.window.getActiveTab();
      tab = activeTab || this.window.createTab();
    }

    if (!tab) {
      throw new Error("No tab available for skill execution");
    }

    // Switch to the tab
    this.window.switchActiveTab(tab.id);

    const executedActions: ExecutionResult[] = [];
    let lastError: string | undefined;

    try {
      // Navigate to start URL if specified
      if (skill.context?.startUrl) {
        console.log(`🔗 Navigating to: ${skill.context.startUrl}`);
        await tab.navigate(skill.context.startUrl);
        await this.wait(2000); // Wait for page load
      }

      // Execute each action in sequence
      for (let i = 0; i < skill.actions.length; i++) {
        const action = skill.actions[i];
        console.log(
          `⚡ Executing action ${i + 1}/${skill.actions.length}: ${action.type}`
        );

        try {
          const result = await this.executor.executeAction(action, tab);
          executedActions.push(result);

          if (!result.success) {
            lastError = result.error;
            if (!options.continueOnError) {
              console.error(`❌ Action failed: ${result.error}`);
              break;
            } else {
              console.warn(`⚠️  Action failed but continuing: ${result.error}`);
            }
          } else {
            console.log(`✅ Action succeeded`);
          }

          // Wait between actions
          await this.wait(1000);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          lastError = errorMessage;
          console.error(`❌ Error executing action:`, error);

          if (!options.continueOnError) {
            break;
          }
        }
      }

      // Update skill metadata
      skill.metadata.lastUsedAt = new Date();
      skill.metadata.useCount++;
      await this.saveSkill(skill);

      const duration = Date.now() - startTime;
      const success = !lastError || options.continueOnError === true;

      return {
        skillId,
        success,
        executedActions,
        error: lastError,
        duration,
        timestamp: new Date(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        skillId,
        success: false,
        executedActions,
        error: error instanceof Error ? error.message : String(error),
        duration,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute a skill by name
   */
  async executeSkillByName(
    name: string,
    options: SkillExecutionOptions = {}
  ): Promise<SkillExecutionResult> {
    const skill = this.findSkillByName(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    return this.executeSkill(skill.id, options);
  }

  // ============================================================================
  // SKILL QUERIES
  // ============================================================================

  /**
   * Get all skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): Skill | null {
    return this.skills.get(skillId) || null;
  }

  /**
   * Find a skill by name (case-insensitive)
   */
  findSkillByName(name: string): Skill | null {
    const normalizedName = name.toLowerCase().trim();
    for (const skill of this.skills.values()) {
      if (skill.name.toLowerCase() === normalizedName) {
        return skill;
      }
    }
    return null;
  }

  /**
   * Search skills by tags
   */
  searchSkillsByTags(tags: string[]): Skill[] {
    return Array.from(this.skills.values()).filter((skill) =>
      tags.some((tag) => skill.metadata.tags.includes(tag))
    );
  }

  /**
   * Search skills by category
   */
  searchSkillsByCategory(category: string): Skill[] {
    return Array.from(this.skills.values()).filter(
      (skill) => skill.metadata.category === category
    );
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private generateSkillId(name: string): string {
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const timestamp = Date.now().toString(36);
    return `${normalized}-${timestamp}`;
  }

  private skillToSerializable(skill: Skill): any {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      actions: skill.actions.map((action) => ({
        type: action.type,
        parameters: action.parameters,
        reasoning: action.reasoning,
      })),
      metadata: {
        tags: skill.metadata.tags,
        createdAt: skill.metadata.createdAt.toISOString(),
        lastUsedAt: skill.metadata.lastUsedAt?.toISOString(),
        useCount: skill.metadata.useCount,
        author: skill.metadata.author,
        version: skill.metadata.version,
        category: skill.metadata.category,
      },
      context: skill.context,
    };
  }

  private serializableToSkill(data: any): Skill {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      actions: data.actions.map((action: any) => ({
        ...action,
        timestamp: new Date(),
      })),
      metadata: {
        tags: data.metadata.tags || [],
        createdAt: new Date(data.metadata.createdAt),
        lastUsedAt: data.metadata.lastUsedAt
          ? new Date(data.metadata.lastUsedAt)
          : undefined,
        useCount: data.metadata.useCount || 0,
        author: data.metadata.author,
        version: data.metadata.version || "1.0.0",
        category: data.metadata.category,
      },
      context: data.context,
    };
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get skills directory path
   */
  getSkillsDirectory(): string {
    return this.skillsDir;
  }

  /**
   * Export skill to JSON
   */
  async exportSkillToJSON(skillId: string): Promise<string> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    return JSON.stringify(this.skillToSerializable(skill), null, 2);
  }

  /**
   * Import skill from JSON
   */
  async importSkillFromJSON(jsonContent: string): Promise<Skill> {
    try {
      const data = JSON.parse(jsonContent);
      const skill = this.serializableToSkill(data);
      await this.saveSkill(skill);
      return skill;
    } catch (error) {
      console.error("Error importing skill from JSON:", error);
      throw error;
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse slash command
 */
export function parseSlashCommand(
  input: string
): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  return {
    command: parts[0] || "",
    args: parts.slice(1),
  };
}

/**
 * Check if input is a skill command
 */
export function isSkillCommand(input: string): boolean {
  const parsed = parseSlashCommand(input);
  return parsed !== null;
}
