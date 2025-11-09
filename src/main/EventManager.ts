/**
 * Event Manager
 *
 * Handles all IPC communication between main process and renderer processes.
 * Now includes agent management handlers.
 */

import { ipcMain, WebContents } from "electron";
import * as fs from "fs";
import type { Window } from "./Window";
import { AgentManager } from "./agent/AgentManager";
import { ChromeRecorder } from "./agent/ChromeRecorder";
import { PuppeteerConverter } from "./agent/PuppeteerConverter";
import type { PuppeteerRecording } from "./agent/types";

export class EventManager {
  private mainWindow: Window;
  private agentManager: AgentManager;
  private chromeRecorder: ChromeRecorder;

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

    this.chromeRecorder = new ChromeRecorder();

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
    this.handleRecordingEvents();
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
          const recipeId = this.agentManager.saveRecipe(agentId, name, description || "");
          return { success: true, recipeId };
        } catch (error) {
          console.error("Error saving recipe:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    ipcMain.handle("agent-load-recipe", async (_, recipeId: string) => {
      try {
        const activeTab = this.mainWindow.activeTab;
        if (!activeTab) {
          throw new Error("No active tab");
        }

        const agentId = await this.agentManager.loadRecipe(recipeId, activeTab.id);
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

    ipcMain.handle("agent-delete-recipe", (_, recipeId: string) => {
      try {
        const success = this.agentManager.deleteRecipe(recipeId);
        return { success };
      } catch (error) {
        console.error("Error deleting recipe:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("agent-get-recipe", (_, recipeId: string) => {
      try {
        const recipe = this.agentManager.getRecipeById(recipeId);
        return { success: true, recipe };
      } catch (error) {
        console.error("Error getting recipe:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log("✅ Agent IPC handlers registered");
  }

  private handleRecordingEvents(): void {
    // Start recording
    ipcMain.handle("chrome-recording-start", async (_, tabId: string) => {
      try {
        const tab = this.mainWindow.getTab(tabId);
        if (!tab) {
          throw new Error(`Tab ${tabId} not found`);
        }

        const sessionId = await this.chromeRecorder.startRecording(tab);
        return { success: true, sessionId };
      } catch (error) {
        console.error("Error starting recording:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Stop recording
    ipcMain.handle("chrome-recording-stop", async (_, sessionId: string) => {
      try {
        const recording = await this.chromeRecorder.stopRecording(sessionId);
        return { success: true, recording };
      } catch (error) {
        console.error("Error stopping recording:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Pause recording
    ipcMain.handle("chrome-recording-pause", (_, sessionId: string) => {
      try {
        this.chromeRecorder.pauseRecording(sessionId);
        return { success: true };
      } catch (error) {
        console.error("Error pausing recording:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Resume recording
    ipcMain.handle("chrome-recording-resume", (_, sessionId: string) => {
      try {
        this.chromeRecorder.resumeRecording(sessionId);
        return { success: true };
      } catch (error) {
        console.error("Error resuming recording:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Get current recording
    ipcMain.handle("chrome-recording-get", (_, sessionId: string) => {
      try {
        const recording = this.chromeRecorder.getRecording(sessionId);
        return { success: true, recording };
      } catch (error) {
        console.error("Error getting recording:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Get active sessions
    ipcMain.handle("chrome-recording-list-sessions", () => {
      try {
        const sessions = this.chromeRecorder.getActiveSessions();
        return { success: true, sessions };
      } catch (error) {
        console.error("Error listing sessions:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Save recording as recipe
    ipcMain.handle(
      "chrome-recording-save-as-recipe",
      (_, recording: PuppeteerRecording, name: string, description?: string) => {
        try {
          const actions = PuppeteerConverter.puppeteerToAgentActions(recording);

          // Create a temporary agent to save the recipe
          const activeTab = this.mainWindow.activeTab;
          if (!activeTab) {
            throw new Error("No active tab");
          }

          const agentId = this.agentManager.createAgent(name, activeTab.id);
          const state = this.agentManager.getAgentStatus(agentId);
          if (state) {
            // Populate action history with converted actions
            state.actionHistory = actions.map((action) => ({
              success: true,
              action,
              duration: 0,
              timestamp: new Date(),
            }));
          }

          const recipeId = this.agentManager.saveRecipe(
            agentId,
            name,
            description || ""
          );

          return { success: true, recipeId };
        } catch (error) {
          console.error("Error saving recording as recipe:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    // Export recording to file
    ipcMain.handle(
      "chrome-recording-export",
      (_, sessionId: string, filepath: string) => {
        try {
          const recording = this.chromeRecorder.getRecording(sessionId);
          fs.writeFileSync(filepath, JSON.stringify(recording, null, 2), "utf-8");
          return { success: true };
        } catch (error) {
          console.error("Error exporting recording:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    // Import recording from file
    ipcMain.handle("chrome-recording-import", (_, filepath: string) => {
      try {
        const content = fs.readFileSync(filepath, "utf-8");
        const recording = JSON.parse(content) as PuppeteerRecording;

        // Validate recording
        const validation = PuppeteerConverter.validateRecording(recording);
        if (!validation.isValid) {
          throw new Error(`Invalid recording: ${validation.errors.join(", ")}`);
        }

        return { success: true, recording };
      } catch (error) {
        console.error("Error importing recording:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log("✅ Recording IPC handlers registered");
  }

  public cleanup(): void {
    console.log("Cleaning up EventManager");
    this.agentManager.cleanup();
    this.chromeRecorder.cleanup();
    ipcMain.removeAllListeners();
  }
}
