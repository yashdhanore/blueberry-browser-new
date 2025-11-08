/**
 * Agent Actions
 *
 * Defines all available actions that an agent can perform on web pages.
 * Each action has validation and execution logic.
 */

import type { Tab } from "../Tab";
import { ActionType } from "./types";
import type {
  AgentAction,
  NavigateAction,
  ClickAction,
  TypeAction,
  SelectAction,
  ScrollAction,
  ExtractAction,
  GetTextAction,
  GetAttributeAction,
  WaitAction,
  WaitForElementAction,
  SwitchTabAction,
  CloseTabAction,
  CompleteAction,
} from "./types";

export function validateNavigateAction(action: NavigateAction): string | null {
  if (!action.parameters.url) {
    return "URL is required for navigate action";
  }

  try {
    new URL(action.parameters.url);
    return null;
  } catch {
    try {
      new URL("https://" + action.parameters.url);
      return null;
    } catch {
      return "Invalid URL format";
    }
  }
}

export function validateClickAction(action: ClickAction): string | null {
  if (!action.parameters.selector) {
    return "Selector is required for click action";
  }
  return null;
}

export function validateTypeAction(action: TypeAction): string | null {
  if (!action.parameters.selector) {
    return "Selector is required for type action";
  }
  if (action.parameters.text === undefined || action.parameters.text === null) {
    return "Text is required for type action";
  }
  return null;
}

export function validateSelectAction(action: SelectAction): string | null {
  if (!action.parameters.selector) {
    return "Selector is required for select action";
  }
  if (!action.parameters.value) {
    return "Value is required for select action";
  }
  return null;
}

export function validateScrollAction(action: ScrollAction): string | null {
  const validDirections = ["up", "down", "to"];
  if (!validDirections.includes(action.parameters.direction)) {
    return `Invalid scroll direction. Must be one of: ${validDirections.join(", ")}`;
  }
  return null;
}

export function validateExtractAction(action: ExtractAction): string | null {
  if (
    !action.parameters.schema ||
    Object.keys(action.parameters.schema).length === 0
  ) {
    return "Schema is required for extract action";
  }
  return null;
}

export function validateWaitAction(action: WaitAction): string | null {
  if (action.parameters.ms < 0) {
    return "Wait duration must be positive";
  }
  if (action.parameters.ms > 30000) {
    return "Wait duration cannot exceed 30 seconds";
  }
  return null;
}

export function validateWaitForElementAction(
  action: WaitForElementAction
): string | null {
  if (!action.parameters.selector) {
    return "Selector is required for wait_for_element action";
  }
  if (action.parameters.timeout < 0) {
    return "Timeout must be positive";
  }
  if (action.parameters.timeout > 60000) {
    return "Timeout cannot exceed 60 seconds";
  }
  return null;
}

export function validateAction(action: AgentAction): string | null {
  switch (action.type) {
    case ActionType.NAVIGATE:
      return validateNavigateAction(action as NavigateAction);
    case ActionType.CLICK:
      return validateClickAction(action as ClickAction);
    case ActionType.TYPE:
      return validateTypeAction(action as TypeAction);
    case ActionType.SELECT:
      return validateSelectAction(action as SelectAction);
    case ActionType.SCROLL:
      return validateScrollAction(action as ScrollAction);
    case ActionType.EXTRACT:
      return validateExtractAction(action as ExtractAction);
    case ActionType.WAIT:
      return validateWaitAction(action as WaitAction);
    case ActionType.WAIT_FOR_ELEMENT:
      return validateWaitForElementAction(action as WaitForElementAction);
    case ActionType.GO_BACK:
    case ActionType.GO_FORWARD:
    case ActionType.RELOAD:
    case ActionType.HOVER:
    case ActionType.GET_TEXT:
    case ActionType.GET_ATTRIBUTE:
    case ActionType.CREATE_TAB:
    case ActionType.SWITCH_TAB:
    case ActionType.CLOSE_TAB:
    case ActionType.COMPLETE:
      return null;
    default:
      return "Unknown action type";
  }
}

export function getActionDescriptions(): string {
  return `
Available Actions:

NAVIGATION:
- navigate(url): Navigate to a URL
- go_back(): Go back in browser history
- go_forward(): Go forward in browser history
- reload(): Reload the current page

DOM INTERACTIONS:
- click(selector): Click an element (CSS selector, ID, class, or text)
- type(selector, text, clear?): Type text into an input field
- select(selector, value): Select an option from a dropdown
- scroll(direction, amount?): Scroll the page (up/down/to)
- hover(selector): Hover over an element

DATA EXTRACTION:
- extract(schema): Extract structured data using a schema
  Example schema: { "title": { "selector": "h1", "type": "text" } }
- get_text(selector): Get text content from an element
- get_attribute(selector, attribute): Get an attribute value from an element

TAB MANAGEMENT:
- create_tab(url?): Create a new tab
- switch_tab(tabId): Switch to a different tab
- close_tab(tabId): Close a tab

UTILITY:
- wait(ms): Wait for a specific duration
- wait_for_element(selector, timeout): Wait for an element to appear

META:
- complete(reason, data?): Mark the goal as completed

Each action should include a "reasoning" field explaining why you chose it.
`.trim();
}

export async function ensureHelperScript(tab: Tab): Promise<boolean> {
  try {
    // Check if already injected
    const isInjected = await tab.runJs(
      "typeof window.__agentHelpers !== 'undefined'"
    );

    if (isInjected) {
      return true;
    }

    const helperScript = `
      (function() {
        if (window.__agentHelpers) return true;
        
        window.__agentHelpers = {
          findElement: function(selector) {
            // Try CSS selector first, but handle invalid selectors gracefully
            try {
              let el = document.querySelector(selector);
              if (el) return el;
            } catch (selectorError) {
              // Invalid CSS selector (e.g., :contains() is not valid), try fallback methods
              console.debug('Invalid CSS selector, trying fallback methods:', selector);
            }
            
            // Try text search with XPath
            try {
              const xpath = \`//\*[contains(text(), '\${selector.replace(/'/g, "''")}')]\`;
              const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              const el = result.singleNodeValue;
              if (el) return el;
            } catch (xpathError) {
              // XPath failed, continue
            }
            
            // Try text-based search on buttons
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
            const btn = buttons.find(b => b.textContent && b.textContent.toLowerCase().includes(selector.toLowerCase()));
            if (btn) return btn;
            
            return null;
          },
          
          click: function(selector) {
            const el = this.findElement(selector);
            if (!el) return { success: false, error: 'Element not found' };
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => el.click(), 300);
            return { success: true };
          },
          
          type: function(selector, text, clear) {
            const el = this.findElement(selector);
            if (!el) return { success: false, error: 'Element not found' };
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (clear) el.value = '';
            el.focus();
            el.value += text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true };
          },
          
          select: function(selector, value) {
            const el = this.findElement(selector);
            if (!el) return { success: false, error: 'Element not found' };
            el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true };
          },
          
          scroll: function(direction, amount) {
            if (direction === 'down') window.scrollBy({ top: amount || 300, behavior: 'smooth' });
            else if (direction === 'up') window.scrollBy({ top: -(amount || 300), behavior: 'smooth' });
            else if (direction === 'to') window.scrollTo({ top: amount || 0, behavior: 'smooth' });
            return { success: true };
          },
          
          hover: function(selector) {
            const el = this.findElement(selector);
            if (!el) return { success: false, error: 'Element not found' };
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            return { success: true };
          },
          
          waitForElement: function(selector, timeout) {
            return new Promise((resolve) => {
              const start = Date.now();
              const interval = setInterval(() => {
                const el = this.findElement(selector);
                if (el) {
                  clearInterval(interval);
                  resolve({ success: true, found: true });
                } else if (Date.now() - start > timeout) {
                  clearInterval(interval);
                  resolve({ success: false, error: 'Timeout' });
                }
              }, 100);
            });
          },
          
          getText: function(selector) {
            const el = this.findElement(selector);
            if (!el) return { success: false, error: 'Element not found' };
            return { success: true, text: el.textContent?.trim() };
          },
          
          getAttribute: function(selector, attr) {
            const el = this.findElement(selector);
            if (!el) return { success: false, error: 'Element not found' };
            return { success: true, value: el.getAttribute(attr) };
          },
          
          extractData: function(schema) {
            const results = {};
            for (const [key, config] of Object.entries(schema)) {
              if (!config.selector) continue;
              if (config.multiple) {
                // Try querySelectorAll, but handle invalid selectors gracefully
                let els = [];
                try {
                  els = Array.from(document.querySelectorAll(config.selector));
                } catch (selectorError) {
                  // Invalid CSS selector, return empty array
                  console.debug('Invalid CSS selector for extractData, returning empty array:', config.selector);
                  results[key] = [];
                  continue;
                }
                results[key] = els.map(el => el.textContent?.trim());
              } else {
                const el = this.findElement(config.selector);
                if (el) results[key] = el.textContent?.trim();
              }
            }
            return { success: true, data: results };
          },
          
          getInteractiveElements: function() {
            const elements = [];
            document.querySelectorAll('a, button, input, select, textarea').forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                elements.push({
                  tag: el.tagName.toLowerCase(),
                  id: el.id,
                  text: el.textContent?.trim().substring(0, 50),
                  type: el.type,
                  name: el.name
                });
              }
            });
            return elements.slice(0, 100);
          }
        };
        
        console.log('🤖 Agent helpers injected');
        return true;
      })();
    `;

    const result = await tab.runJs(helperScript);
    return result === true;
  } catch (error) {
    console.error("Error injecting helper script:", error);
    return false;
  }
}

export function normalizeURL(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return "https://" + url;
}

export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

export async function waitForPageLoad(
  tab: Tab,
  timeout: number = 10000
): Promise<void> {
  try {
    await executeWithTimeout(
      tab.runJs(`
        new Promise((resolve) => {
          if (document.readyState === 'complete') {
            resolve();
          } else {
            window.addEventListener('load', resolve);
          }
        })
      `),
      timeout
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.warn("Page load timeout, continuing anyway:", error);
  }
}

export function formatActionForDisplay(action: AgentAction): string {
  switch (action.type) {
    case ActionType.NAVIGATE:
      return `Navigate to: ${(action as NavigateAction).parameters.url}`;
    case ActionType.CLICK:
      return `Click: ${(action as ClickAction).parameters.selector}`;
    case ActionType.TYPE:
      const typeAction = action as TypeAction;
      return `Type "${typeAction.parameters.text}" into ${typeAction.parameters.selector}`;
    case ActionType.SELECT:
      const selectAction = action as SelectAction;
      return `Select "${selectAction.parameters.value}" from ${selectAction.parameters.selector}`;
    case ActionType.SCROLL:
      const scrollAction = action as ScrollAction;
      return `Scroll ${scrollAction.parameters.direction}`;
    case ActionType.EXTRACT:
      return `Extract data`;
    case ActionType.WAIT:
      return `Wait ${(action as WaitAction).parameters.ms}ms`;
    case ActionType.WAIT_FOR_ELEMENT:
      return `Wait for: ${(action as WaitForElementAction).parameters.selector}`;
    case ActionType.GO_BACK:
      return "Go back";
    case ActionType.GO_FORWARD:
      return "Go forward";
    case ActionType.RELOAD:
      return "Reload page";
    case ActionType.HOVER:
      return `Hover: ${action.parameters.selector}`;
    case ActionType.GET_TEXT:
      return `Get text from: ${(action as GetTextAction).parameters.selector}`;
    case ActionType.GET_ATTRIBUTE:
      const attrAction = action as GetAttributeAction;
      return `Get ${attrAction.parameters.attribute} from: ${attrAction.parameters.selector}`;
    case ActionType.CREATE_TAB:
      return "Create new tab";
    case ActionType.SWITCH_TAB:
      return `Switch to tab: ${(action as SwitchTabAction).parameters.tabId}`;
    case ActionType.CLOSE_TAB:
      return `Close tab: ${(action as CloseTabAction).parameters.tabId}`;
    case ActionType.COMPLETE:
      return `Complete: ${(action as CompleteAction).parameters.reason}`;
    default:
      return "Unknown action";
  }
}

export function estimateActionDuration(action: AgentAction): number {
  switch (action.type) {
    case ActionType.NAVIGATE:
      return 3000;
    case ActionType.CLICK:
      return 500;
    case ActionType.TYPE:
      const typeAction = action as TypeAction;
      return 500 + typeAction.parameters.text.length * 50;
    case ActionType.SCROLL:
      return 1000;
    case ActionType.WAIT:
      return (action as WaitAction).parameters.ms;
    case ActionType.WAIT_FOR_ELEMENT:
      return (action as WaitForElementAction).parameters.timeout;
    case ActionType.EXTRACT:
      return 2000;
    default:
      return 1000;
  }
}
