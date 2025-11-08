/**
 * Event Manager
 *
 * Handles all IPC communication between main process and renderer processes.
 * Now includes agent management handlers.
 */

import { ipcMain, WebContents } from "electron";
import type { Window } from "./Window";
import { AgentManager } from "./agent/AgentManager";
import { SkillsManager } from "./agent/SkillsManager";

export class EventManager {
  private mainWindow: Window;
  private agentManager: AgentManager;
  private skillsManager: SkillsManager;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;

    this.agentManager = new AgentManager(mainWindow, {
      maxIterations: 50,
      maxRetries: 3,
      actionDelay: 1000,
      defaultTimeout: 30000,
      captureScreenshots: true,
      llmModel: process.env.LLM_MODEL || "gpt-5-mini",
      llmTemperature: 0.7,
    });

    this.skillsManager = new SkillsManager(mainWindow);
    this.skillsManager.initialize().catch((error) => {
      console.error("Failed to initialize SkillsManager:", error);
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Existing handlers
    this.handleTabEvents();
    this.handleSidebarEvents();
    this.handlePageContentEvents();
    this.handleDarkModeEvents();
    this.handleDebugEvents();
    this.handleAgentEvents();
    this.handleSkillsEvents();
  }

  private handleTabEvents(): void {
    // Create new tab
    ipcMain.handle("create-tab", (_, url?: string) => {
      const newTab = this.mainWindow.createTab(url);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    // Close tab
    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    // Switch tab
    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    // Get tabs
    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      return this.mainWindow.allTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
      }));
    });

    // Navigation (for compatibility with existing code)
    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    ipcMain.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    ipcMain.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    ipcMain.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    // Tab-specific navigation handlers
    ipcMain.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    ipcMain.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    // Tab info
    ipcMain.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.canGoBack(),
          canGoForward: activeTab.webContents.canGoForward(),
        };
      }
      return null;
    });
  }

  private handleSidebarEvents(): void {
    // Toggle sidebar
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    // Chat message
    ipcMain.handle("sidebar-chat-message", async (_, request) => {
      // The LLMClient now handles getting the screenshot and context directly
      await this.mainWindow.sidebar.client.sendChatMessage(request);
    });

    // Clear chat
    ipcMain.handle("sidebar-clear-chat", () => {
      this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    // Get messages
    ipcMain.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });
  }

  private handlePageContentEvents(): void {
    // Get page content
    ipcMain.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    // Get page text
    ipcMain.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    // Get current URL
    ipcMain.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    // Dark mode broadcasting
    ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    // Send to topbar
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to sidebar
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  private handleDebugEvents(): void {
    // Ping test
    ipcMain.on("ping", () => console.log("pong"));
  }

  private handleAgentEvents(): void {
    const sidebarWebContents = this.mainWindow.sidebar.view.webContents;
    this.agentManager.setWebContents(sidebarWebContents);

    ipcMain.handle("agent-create", async (_, goal: string) => {
      try {
        const activeTab = this.mainWindow.activeTab;
        if (!activeTab) {
          throw new Error("No active tab");
        }

        const agentId = this.agentManager.createAgent(goal, activeTab.id);
        return { success: true, agentId };
      } catch (error) {
        console.error("Error creating agent:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-start", async (_, agentId: string) => {
      try {
        await this.agentManager.startAgent(agentId);
        return { success: true };
      } catch (error) {
        console.error("Error starting agent:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-pause", (_, agentId: string) => {
      try {
        this.agentManager.pauseAgent(agentId);
        return { success: true };
      } catch (error) {
        console.error("Error pausing agent:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-resume", async (_, agentId: string) => {
      try {
        await this.agentManager.resumeAgent(agentId);
        return { success: true };
      } catch (error) {
        console.error("Error resuming agent:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-stop", (_, agentId: string) => {
      try {
        this.agentManager.stopAgent(agentId);
        return { success: true };
      } catch (error) {
        console.error("Error stopping agent:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-get-status", (_, agentId: string) => {
      try {
        const state = this.agentManager.getAgentStatus(agentId);
        return { success: true, state };
      } catch (error) {
        console.error("Error getting agent status:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-list-all", () => {
      try {
        const agents = this.agentManager.listAllAgents();
        return { success: true, agents };
      } catch (error) {
        console.error("Error listing agents:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-list-active", () => {
      try {
        const agents = this.agentManager.getActiveAgents();
        return { success: true, agents };
      } catch (error) {
        console.error("Error listing active agents:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle(
      "agent-save-recipe",
      (_, agentId: string, name: string, description?: string) => {
        try {
          this.agentManager.saveRecipe(agentId, name, description || "");
          return { success: true };
        } catch (error) {
          console.error("Error saving recipe:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    ipcMain.handle("agent-load-recipe", async (_, recipeName: string) => {
      try {
        const agentId = await this.agentManager.loadRecipe(recipeName);
        return { success: true, agentId };
      } catch (error) {
        console.error("Error loading recipe:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-list-recipes", () => {
      try {
        const recipes = this.agentManager.listRecipes();
        return { success: true, recipes };
      } catch (error) {
        console.error("Error listing recipes:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-delete-recipe", (_, recipeName: string) => {
      try {
        this.agentManager.deleteRecipe(recipeName);
        return { success: true };
      } catch (error) {
        console.error("Error deleting recipe:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log("✅ Agent IPC handlers registered");
  }

  private handleSkillsEvents(): void {
    // Create skill from agent
    ipcMain.handle(
      "skill-create-from-agent",
      async (
        _,
        agentId: string,
        name: string,
        description?: string,
        tags?: string[]
      ) => {
        try {
          const agentState = this.agentManager.getAgentStatus(agentId);
          if (!agentState) {
            throw new Error(`Agent not found: ${agentId}`);
          }

          const skill = this.skillsManager.createSkillFromAgent(
            agentState,
            name,
            description,
            tags
          );
          await this.skillsManager.saveSkill(skill);

          return { success: true, skill };
        } catch (error) {
          console.error("Error creating skill from agent:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    // Create custom skill
    ipcMain.handle(
      "skill-create",
      async (_, name: string, description: string, actions: any[], tags?: string[]) => {
        try {
          const skill = this.skillsManager.createSkill(
            name,
            description,
            actions,
            tags
          );
          await this.skillsManager.saveSkill(skill);

          return { success: true, skill };
        } catch (error) {
          console.error("Error creating skill:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    // Save skill
    ipcMain.handle("skill-save", async (_, skill: any) => {
      try {
        await this.skillsManager.saveSkill(skill);
        return { success: true };
      } catch (error) {
        console.error("Error saving skill:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Load skill
    ipcMain.handle("skill-load", async (_, skillId: string) => {
      try {
        const skill = await this.skillsManager.loadSkill(skillId);
        return { success: true, skill };
      } catch (error) {
        console.error("Error loading skill:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Get all skills
    ipcMain.handle("skill-list-all", () => {
      try {
        const skills = this.skillsManager.getAllSkills();
        return { success: true, skills };
      } catch (error) {
        console.error("Error listing skills:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Get skill by ID
    ipcMain.handle("skill-get", (_, skillId: string) => {
      try {
        const skill = this.skillsManager.getSkill(skillId);
        return { success: true, skill };
      } catch (error) {
        console.error("Error getting skill:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Execute skill
    ipcMain.handle("skill-execute", async (_, skillId: string, options?: any) => {
      try {
        const result = await this.skillsManager.executeSkill(skillId, options);
        return { success: true, result };
      } catch (error) {
        console.error("Error executing skill:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Execute skill by name (for slash commands)
    ipcMain.handle("skill-execute-by-name", async (_, name: string, options?: any) => {
      try {
        const result = await this.skillsManager.executeSkillByName(name, options);
        return { success: true, result };
      } catch (error) {
        console.error("Error executing skill by name:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Delete skill
    ipcMain.handle("skill-delete", async (_, skillId: string) => {
      try {
        await this.skillsManager.deleteSkill(skillId);
        return { success: true };
      } catch (error) {
        console.error("Error deleting skill:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Search skills by tags
    ipcMain.handle("skill-search-by-tags", (_, tags: string[]) => {
      try {
        const skills = this.skillsManager.searchSkillsByTags(tags);
        return { success: true, skills };
      } catch (error) {
        console.error("Error searching skills by tags:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Export skill to JSON
    ipcMain.handle("skill-export-json", async (_, skillId: string) => {
      try {
        const json = await this.skillsManager.exportSkillToJSON(skillId);
        return { success: true, json };
      } catch (error) {
        console.error("Error exporting skill to JSON:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Import skill from JSON
    ipcMain.handle("skill-import-json", async (_, jsonContent: string) => {
      try {
        const skill = await this.skillsManager.importSkillFromJSON(jsonContent);
        return { success: true, skill };
      } catch (error) {
        console.error("Error importing skill from JSON:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log("✅ Skills IPC handlers registered");
  }

  public cleanup(): void {
    console.log("Cleaning up EventManager");
    this.agentManager.cleanup();
    ipcMain.removeAllListeners();
  }
}
