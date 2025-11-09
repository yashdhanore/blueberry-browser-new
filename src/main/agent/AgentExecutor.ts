/**
 * Agent Executor
 *
 * Executes validated actions on tabs and returns execution results.
 * Handles action execution, error handling, screenshots, and retries.
 */

import type { Tab } from "../Tab";
import type { Window } from "../Window";
import { ActionType } from "./types";
import type {
  AgentAction,
  ExecutionResult,
  NavigateAction,
  ClickAction,
  TypeAction,
  SelectAction,
  ScrollAction,
  HoverAction,
  ExtractAction,
  GetTextAction,
  GetAttributeAction,
  WaitAction,
  WaitForElementAction,
  CreateTabAction,
  SwitchTabAction,
  CloseTabAction,
  CompleteAction,
  AgentConfig,
} from "./types";
import {
  validateAction,
  ensureHelperScript,
  normalizeURL,
  waitForPageLoad,
} from "./AgentActions";

export class AgentExecutor {
  private window: Window;
  private config: AgentConfig;

  constructor(window: Window, config: AgentConfig) {
    this.window = window;
    this.config = config;
  }

  async executeAction(
    action: AgentAction,
    tab: Tab,
    retryCount: number = 0
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Log action execution details
      console.log("🔨 Executing Action:");
      console.log(`   Type: ${action.type}`);
      console.log(`   Parameters: ${JSON.stringify(action.parameters, null, 2)}`);
      console.log(`   Reasoning: ${action.reasoning || 'N/A'}`);
      console.log(`   Retry Count: ${retryCount}/${this.config.maxRetries}`);

      const validationError = validateAction(action);
      if (validationError) {
        console.error(`   ❌ Validation Error: ${validationError}`);
        return this.createErrorResult(action, validationError, startTime);
      }

      let result: ExecutionResult;

      switch (action.type) {
        case ActionType.NAVIGATE:
          result = await this.executeNavigate(action as NavigateAction, tab);
          break;
        case ActionType.GO_BACK:
          result = await this.executeGoBack(tab);
          break;
        case ActionType.GO_FORWARD:
          result = await this.executeGoForward(tab);
          break;
        case ActionType.RELOAD:
          result = await this.executeReload(tab);
          break;
        case ActionType.CLICK:
          result = await this.executeClick(action as ClickAction, tab);
          break;
        case ActionType.TYPE:
          result = await this.executeType(action as TypeAction, tab);
          break;
        case ActionType.SELECT:
          result = await this.executeSelect(action as SelectAction, tab);
          break;
        case ActionType.SCROLL:
          result = await this.executeScroll(action as ScrollAction, tab);
          break;
        case ActionType.HOVER:
          result = await this.executeHover(action as HoverAction, tab);
          break;
        case ActionType.EXTRACT:
          result = await this.executeExtract(action as ExtractAction, tab);
          break;
        case ActionType.GET_TEXT:
          result = await this.executeGetText(action as GetTextAction, tab);
          break;
        case ActionType.GET_ATTRIBUTE:
          result = await this.executeGetAttribute(
            action as GetAttributeAction,
            tab
          );
          break;
        case ActionType.WAIT:
          result = await this.executeWait(action as WaitAction);
          break;
        case ActionType.WAIT_FOR_ELEMENT:
          result = await this.executeWaitForElement(
            action as WaitForElementAction,
            tab
          );
          break;
        case ActionType.CREATE_TAB:
          result = await this.executeCreateTab(action as CreateTabAction);
          break;
        case ActionType.SWITCH_TAB:
          result = await this.executeSwitchTab(action as SwitchTabAction);
          break;
        case ActionType.CLOSE_TAB:
          result = await this.executeCloseTab(action as CloseTabAction);
          break;
        case ActionType.COMPLETE:
          result = await this.executeComplete(action as CompleteAction);
          break;
        default:
          result = this.createErrorResult(
            action,
            `Unknown action type: ${(action as AgentAction).type}`,
            startTime
          );
      }

      if (!result.success && retryCount < this.config.maxRetries) {
        console.log(
          `   ⚠️  Action failed, retrying (attempt ${retryCount + 1}/${this.config.maxRetries})`
        );
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
        await this.wait(1000);
        return this.executeAction(action, tab, retryCount + 1);
      }

      if (result.success) {
        console.log(`   ✅ Action succeeded (${Date.now() - startTime}ms)`);
      } else {
        console.log(`   ❌ Action failed (${Date.now() - startTime}ms)`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error executing action:", error);

      if (retryCount < this.config.maxRetries) {
        console.log(
          `   ⚠️  Exception occurred, retrying (attempt ${retryCount + 1}/${this.config.maxRetries})`
        );
        console.log(`   Exception: ${errorMessage}`);
        await this.wait(1000);
        return this.executeAction(action, tab, retryCount + 1);
      }

      console.error(`   ❌ Action failed after ${retryCount + 1} attempts: ${errorMessage}`);
      return this.createErrorResult(action, errorMessage, startTime);
    }
  }

  private async executeNavigate(
    action: NavigateAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const url = normalizeURL(action.parameters.url);
      await tab.loadURL(url);
      await waitForPageLoad(tab, 10000);
      await ensureHelperScript(tab);

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        data: { url },
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(
        action,
        `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
        startTime
      );
    }
  }

  private async executeGoBack(tab: Tab): Promise<ExecutionResult> {
    const startTime = Date.now();
    const action: AgentAction = {
      type: ActionType.GO_BACK,
      parameters: {},
      timestamp: new Date(),
    };

    try {
      tab.goBack();
      await waitForPageLoad(tab, 10000);
      await ensureHelperScript(tab);

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeGoForward(tab: Tab): Promise<ExecutionResult> {
    const startTime = Date.now();
    const action: AgentAction = {
      type: ActionType.GO_FORWARD,
      parameters: {},
      timestamp: new Date(),
    };

    try {
      tab.goForward();
      await waitForPageLoad(tab, 10000);
      await ensureHelperScript(tab);

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeReload(tab: Tab): Promise<ExecutionResult> {
    const startTime = Date.now();
    const action: AgentAction = {
      type: ActionType.RELOAD,
      parameters: {},
      timestamp: new Date(),
    };

    try {
      tab.reload();
      await waitForPageLoad(tab, 10000);
      await ensureHelperScript(tab);

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeClick(
    action: ClickAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      // Check if we have multi-selectors
      const selectors = (action.parameters as any).selectors;

      if (selectors && Array.isArray(selectors) && selectors.length > 0) {
        // Try each selector strategy until one works
        console.log(`   🖱️  Attempting click with ${selectors.length} selector strategies`);

        for (let i = 0; i < selectors.length; i++) {
          const selectorArray = selectors[i];
          if (!Array.isArray(selectorArray) || selectorArray.length === 0) continue;

          for (const selector of selectorArray) {
            try {
              console.log(`   🔍 Trying selector: "${selector}"`);
              const result = await this.tryClickWithSelector(selector, action, tab);

              if (result.success) {
                console.log(`   ✅ Click succeeded with selector: "${selector}"`);
                await this.wait(this.config.actionDelay);
                const screenshot = await this.captureScreenshot(tab);

                return {
                  success: true,
                  action,
                  data: result,
                  screenshot,
                  duration: Date.now() - startTime,
                  timestamp: new Date(),
                };
              }
            } catch (e) {
              console.log(`   ⚠️  Selector failed: "${selector}"`);
              continue; // Try next selector
            }
          }
        }

        // All selectors failed
        return this.createErrorResult(
          action,
          "All selector strategies failed",
          startTime
        );
      } else {
        // Fallback to single selector
        const selector = action.parameters.selector;
        console.log(`   🖱️  Attempting to click element with selector: "${selector}"`);

        const result = await tab.runJs(
          `window.__agentHelpers.click('${this.escapeString(selector)}')`
        );

        if (!result.success) {
          console.error(`   ❌ Click failed: ${result.error || "Unknown error"}`);
          return this.createErrorResult(
            action,
            result.error || "Click failed",
            startTime
          );
        }

        console.log(`   ✅ Click succeeded on: ${result.element || 'element'}${result.text ? ` (${result.text})` : ''}`);

        await this.wait(this.config.actionDelay);

        const screenshot = await this.captureScreenshot(tab);

        return {
          success: true,
          action,
          data: result,
          screenshot,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async tryClickWithSelector(
    selector: string,
    action: ClickAction,
    tab: Tab
  ): Promise<any> {
    // Handle special selector formats
    let jsSelector = selector;

    // Convert xpath/ format
    if (selector.startsWith("xpath/")) {
      const xpath = selector.substring(6);
      jsSelector = `xpath:${xpath}`;
    }
    // Convert aria/ format
    else if (selector.startsWith("aria/")) {
      const ariaLabel = selector.substring(5);
      jsSelector = `[aria-label="${ariaLabel}"]`;
    }
    // Convert text/ format
    else if (selector.startsWith("text/")) {
      const text = selector.substring(5);
      jsSelector = `text:${text}`;
    }
    // Convert pierce/ format (for shadow DOM)
    else if (selector.startsWith("pierce/")) {
      jsSelector = selector.substring(7);
    }

    return await tab.runJs(
      `window.__agentHelpers.click('${this.escapeString(jsSelector)}')`
    );
  }

  private async executeType(
    action: TypeAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      // Check if we have multi-selectors
      const selectors = (action.parameters as any).selectors;
      const clear = action.parameters.clear || false;
      const text = action.parameters.text;

      if (selectors && Array.isArray(selectors) && selectors.length > 0) {
        // Try each selector strategy until one works
        console.log(`   ⌨️  Attempting type with ${selectors.length} selector strategies`);

        for (let i = 0; i < selectors.length; i++) {
          const selectorArray = selectors[i];
          if (!Array.isArray(selectorArray) || selectorArray.length === 0) continue;

          for (const selector of selectorArray) {
            try {
              console.log(`   🔍 Trying selector: "${selector}"`);
              const result = await this.tryTypeWithSelector(selector, text, clear, tab);

              if (result.success) {
                console.log(`   ✅ Type succeeded with selector: "${selector}"`);
                const typingDuration = text.length * 50 + 500;
                await this.wait(Math.min(typingDuration, 3000));
                const screenshot = await this.captureScreenshot(tab);

                return {
                  success: true,
                  action,
                  data: result,
                  screenshot,
                  duration: Date.now() - startTime,
                  timestamp: new Date(),
                };
              }
            } catch (e) {
              console.log(`   ⚠️  Selector failed: "${selector}"`);
              continue; // Try next selector
            }
          }
        }

        // All selectors failed
        return this.createErrorResult(
          action,
          "All selector strategies failed",
          startTime
        );
      } else {
        // Fallback to single selector
        const result = await tab.runJs(
          `window.__agentHelpers.type('${this.escapeString(action.parameters.selector)}', '${this.escapeString(text)}', ${clear})`
        );

        if (!result.success) {
          return this.createErrorResult(
            action,
            result.error || "Type failed",
            startTime
          );
        }

        const typingDuration = text.length * 50 + 500;
        await this.wait(Math.min(typingDuration, 3000));

        const screenshot = await this.captureScreenshot(tab);

        return {
          success: true,
          action,
          data: result,
          screenshot,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async tryTypeWithSelector(
    selector: string,
    text: string,
    clear: boolean,
    tab: Tab
  ): Promise<any> {
    // Handle special selector formats (same as click)
    let jsSelector = selector;

    if (selector.startsWith("xpath/")) {
      jsSelector = `xpath:${selector.substring(6)}`;
    } else if (selector.startsWith("aria/")) {
      jsSelector = `[aria-label="${selector.substring(5)}"]`;
    } else if (selector.startsWith("text/")) {
      jsSelector = `text:${selector.substring(5)}`;
    } else if (selector.startsWith("pierce/")) {
      jsSelector = selector.substring(7);
    }

    return await tab.runJs(
      `window.__agentHelpers.type('${this.escapeString(jsSelector)}', '${this.escapeString(text)}', ${clear})`
    );
  }

  private async executeSelect(
    action: SelectAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      const result = await tab.runJs(
        `window.__agentHelpers.select('${this.escapeString(action.parameters.selector)}', '${this.escapeString(action.parameters.value)}')`
      );

      if (!result.success) {
        return this.createErrorResult(
          action,
          result.error || "Select failed",
          startTime
        );
      }

      await this.wait(this.config.actionDelay);

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        data: result,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeScroll(
    action: ScrollAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      const direction = action.parameters.direction;
      const amount = action.parameters.amount || 300;

      const result = await tab.runJs(
        `window.__agentHelpers.scroll('${direction}', ${amount})`
      );

      if (!result.success) {
        return this.createErrorResult(
          action,
          result.error || "Scroll failed",
          startTime
        );
      }

      await this.wait(1000);

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        data: result,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeHover(
    action: HoverAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      const result = await tab.runJs(
        `window.__agentHelpers.hover('${this.escapeString(action.parameters.selector)}')`
      );

      if (!result.success) {
        return this.createErrorResult(
          action,
          result.error || "Hover failed",
          startTime
        );
      }

      await this.wait(500);

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        data: result,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeExtract(
    action: ExtractAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      const schemaJson = JSON.stringify(action.parameters.schema);
      const result = await tab.runJs(
        `window.__agentHelpers.extractData(${schemaJson})`
      );

      if (!result.success) {
        return this.createErrorResult(
          action,
          result.error || "Extract failed",
          startTime
        );
      }

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        data: result.data,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeGetText(
    action: GetTextAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      const result = await tab.runJs(
        `window.__agentHelpers.getText('${this.escapeString(action.parameters.selector)}')`
      );

      if (!result.success) {
        return this.createErrorResult(
          action,
          result.error || "Get text failed",
          startTime
        );
      }

      return {
        success: true,
        action,
        data: { text: result.text },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeGetAttribute(
    action: GetAttributeAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      const result = await tab.runJs(
        `window.__agentHelpers.getAttribute('${this.escapeString(action.parameters.selector)}', '${action.parameters.attribute}')`
      );

      if (!result.success) {
        return this.createErrorResult(
          action,
          result.error || "Get attribute failed",
          startTime
        );
      }

      return {
        success: true,
        action,
        data: { value: result.value },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeWait(action: WaitAction): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await this.wait(action.parameters.ms);

      return {
        success: true,
        action,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeWaitForElement(
    action: WaitForElementAction,
    tab: Tab
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await ensureHelperScript(tab);

      const result = await tab.runJs(
        `window.__agentHelpers.waitForElement('${this.escapeString(action.parameters.selector)}', ${action.parameters.timeout})`
      );

      if (!result.success) {
        return this.createErrorResult(
          action,
          result.error || "Element not found within timeout",
          startTime
        );
      }

      const screenshot = await this.captureScreenshot(tab);

      return {
        success: true,
        action,
        data: result,
        screenshot,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeCreateTab(
    action: CreateTabAction
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const newTab = this.window.createTab(action.parameters.url);
      await this.wait(500);

      if (action.parameters.url) {
        await waitForPageLoad(newTab, 10000);
        await ensureHelperScript(newTab);
      }

      return {
        success: true,
        action,
        data: { tabId: newTab.id },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeSwitchTab(
    action: SwitchTabAction
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const success = this.window.switchActiveTab(action.parameters.tabId);

      if (!success) {
        return this.createErrorResult(action, "Tab not found", startTime);
      }

      await this.wait(300);

      return {
        success: true,
        action,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeCloseTab(
    action: CloseTabAction
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const success = this.window.closeTab(action.parameters.tabId);

      if (!success) {
        return this.createErrorResult(action, "Tab not found", startTime);
      }

      return {
        success: true,
        action,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return this.createErrorResult(action, String(error), startTime);
    }
  }

  private async executeComplete(
    action: CompleteAction
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    return {
      success: true,
      action,
      data: {
        reason: action.parameters.reason,
        result: action.parameters.data,
      },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  private async captureScreenshot(tab: Tab): Promise<string | undefined> {
    if (!this.config.captureScreenshots) {
      return undefined;
    }

    try {
      const image = await tab.screenshot();
      return image.toDataURL();
    } catch (error) {
      console.error("Error capturing screenshot:", error);
      return undefined;
    }
  }

  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }

  private createErrorResult(
    action: AgentAction,
    error: string,
    startTime: number
  ): ExecutionResult {
    return {
      success: false,
      action,
      error,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}
