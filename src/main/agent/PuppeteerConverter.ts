/**
 * Puppeteer Converter
 *
 * Converts between Puppeteer Replay format and AgentAction format.
 * Handles multi-selector strategies and preserves all metadata.
 */

import type {
  PuppeteerRecording,
  PuppeteerStep,
  AgentAction,
  ClickAction,
  TypeAction,
  NavigateAction,
  ScrollAction,
  HoverAction,
  WaitForElementAction,
} from "./types";
import { ActionType } from "./types";

export class PuppeteerConverter {
  /**
   * Convert Puppeteer Replay recording to AgentAction array
   */
  static puppeteerToAgentActions(
    recording: PuppeteerRecording
  ): AgentAction[] {
    const actions: AgentAction[] = [];

    for (const step of recording.steps) {
      const action = this.convertStepToAction(step);
      if (action) {
        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Convert AgentAction array to Puppeteer Replay recording
   */
  static agentActionsToPuppeteer(
    actions: AgentAction[],
    title?: string
  ): PuppeteerRecording {
    const steps: PuppeteerStep[] = [];

    // Add initial viewport step
    steps.push({
      type: "setViewport",
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      isLandscape: true,
    });

    for (const action of actions) {
      const step = this.convertActionToStep(action);
      if (step) {
        steps.push(step);
      }
    }

    return {
      title: title || `Recording ${new Date().toISOString()}`,
      steps,
    };
  }

  /**
   * Convert single Puppeteer step to AgentAction
   */
  private static convertStepToAction(step: PuppeteerStep): AgentAction | null {
    const timestamp = new Date();

    switch (step.type) {
      case "navigate":
        if (!step.url) return null;
        return {
          type: ActionType.NAVIGATE,
          parameters: { url: step.url },
          timestamp,
        } as NavigateAction;

      case "click": {
        const selector = this.extractPrimarySelector(step.selectors);
        if (!selector) return null;

        return {
          type: ActionType.CLICK,
          parameters: {
            selector,
            selectors: step.selectors,
            offsetX: step.offsetX,
            offsetY: step.offsetY,
          },
          timestamp,
        } as ClickAction;
      }

      case "change": {
        const selector = this.extractPrimarySelector(step.selectors);
        if (!selector || !step.value) return null;

        return {
          type: ActionType.TYPE,
          parameters: {
            selector,
            selectors: step.selectors,
            text: String(step.value),
            clear: true,
          },
          timestamp,
        } as TypeAction;
      }

      case "keyDown":
      case "keyUp": {
        // For key events, we convert them to type actions
        // This is simplified - in reality you might want to handle special keys
        if (!step.key) return null;

        const selector = this.extractPrimarySelector(step.selectors);
        if (!selector) return null;

        return {
          type: ActionType.TYPE,
          parameters: {
            selector,
            selectors: step.selectors,
            text: step.key,
            clear: false,
          },
          timestamp,
        } as TypeAction;
      }

      case "scroll": {
        return {
          type: ActionType.SCROLL,
          parameters: {
            direction: "down",
            amount: step.y || 300,
          },
          timestamp,
        } as ScrollAction;
      }

      case "hover": {
        const selector = this.extractPrimarySelector(step.selectors);
        if (!selector) return null;

        return {
          type: ActionType.HOVER,
          parameters: {
            selector,
          },
          timestamp,
        } as HoverAction;
      }

      case "waitForElement": {
        const selector = this.extractPrimarySelector(step.selectors);
        if (!selector) return null;

        return {
          type: ActionType.WAIT_FOR_ELEMENT,
          parameters: {
            selector,
            timeout: step.timeout || 30000,
          },
          timestamp,
        } as WaitForElementAction;
      }

      case "setViewport":
        // Ignore viewport steps - these are metadata
        return null;

      default:
        console.warn(`Unknown Puppeteer step type: ${step.type}`);
        return null;
    }
  }

  /**
   * Convert AgentAction to Puppeteer step
   */
  private static convertActionToStep(action: AgentAction): PuppeteerStep | null {
    switch (action.type) {
      case ActionType.NAVIGATE: {
        const navAction = action as NavigateAction;
        return {
          type: "navigate",
          url: navAction.parameters.url,
          assertedEvents: [
            {
              type: "navigation",
              url: navAction.parameters.url,
            },
          ],
        };
      }

      case ActionType.CLICK: {
        const clickAction = action as ClickAction;
        const selectors =
          (clickAction.parameters as any).selectors ||
          this.generateSelectorsArray(clickAction.parameters.selector);

        return {
          type: "click",
          selectors,
          offsetX: (clickAction.parameters as any).offsetX,
          offsetY: (clickAction.parameters as any).offsetY,
          target: "main",
        };
      }

      case ActionType.TYPE: {
        const typeAction = action as TypeAction;
        const selectors =
          (typeAction.parameters as any).selectors ||
          this.generateSelectorsArray(typeAction.parameters.selector);

        return {
          type: "change",
          selectors,
          value: typeAction.parameters.text,
        };
      }

      case ActionType.SCROLL: {
        const scrollAction = action as ScrollAction;
        return {
          type: "scroll",
          y: scrollAction.parameters.amount || 300,
        };
      }

      case ActionType.HOVER: {
        const hoverAction = action as HoverAction;
        const selectors = this.generateSelectorsArray(
          hoverAction.parameters.selector
        );

        return {
          type: "hover",
          selectors,
        };
      }

      case ActionType.WAIT_FOR_ELEMENT: {
        const waitAction = action as WaitForElementAction;
        const selectors = this.generateSelectorsArray(
          waitAction.parameters.selector
        );

        return {
          type: "waitForElement",
          selectors,
          timeout: waitAction.parameters.timeout,
        };
      }

      case ActionType.WAIT: {
        // Puppeteer Replay doesn't have a direct wait step
        // We could use waitForExpression instead
        return null;
      }

      default:
        console.warn(`Cannot convert action type ${action.type} to Puppeteer step`);
        return null;
    }
  }

  /**
   * Extract primary selector from multi-selector array
   */
  private static extractPrimarySelector(
    selectors?: string[][]
  ): string | null {
    if (!selectors || selectors.length === 0) return null;

    // Try to find the best selector
    // Priority: ID selector > class selector > xpath > aria > text
    for (const selectorArray of selectors) {
      if (selectorArray.length === 0) continue;

      const selector = selectorArray[0];

      // Prefer ID selectors
      if (selector.startsWith("#")) {
        return selector;
      }
    }

    // If no ID selector, try class or tag selectors
    for (const selectorArray of selectors) {
      if (selectorArray.length === 0) continue;

      const selector = selectorArray[0];

      // Skip special formats (aria, xpath, text, pierce)
      if (
        !selector.startsWith("aria/") &&
        !selector.startsWith("xpath/") &&
        !selector.startsWith("text/") &&
        !selector.startsWith("pierce/")
      ) {
        return selector;
      }
    }

    // Fallback to first available selector, converting special formats
    const firstSelector = selectors[0]?.[0];
    if (!firstSelector) return null;

    // Convert special selector formats to CSS selectors where possible
    if (firstSelector.startsWith("text/")) {
      const text = firstSelector.substring(5);
      return `*:contains("${text}")`;
    }

    if (firstSelector.startsWith("aria/")) {
      const label = firstSelector.substring(5);
      return `[aria-label="${label}"]`;
    }

    return firstSelector;
  }

  /**
   * Generate selector array from single selector
   */
  private static generateSelectorsArray(selector: string): string[][] {
    return [[selector]];
  }

  /**
   * Validate Puppeteer recording
   */
  static validateRecording(recording: PuppeteerRecording): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!recording.title) {
      errors.push("Recording must have a title");
    }

    if (!Array.isArray(recording.steps)) {
      errors.push("Recording must have a steps array");
      return { isValid: false, errors };
    }

    for (let i = 0; i < recording.steps.length; i++) {
      const step = recording.steps[i];

      if (!step.type) {
        errors.push(`Step ${i} is missing type`);
        continue;
      }

      // Validate step-specific requirements
      if (step.type === "navigate" && !step.url) {
        errors.push(`Navigate step ${i} is missing url`);
      }

      if (
        (step.type === "click" ||
          step.type === "change" ||
          step.type === "hover") &&
        (!step.selectors || step.selectors.length === 0)
      ) {
        errors.push(`${step.type} step ${i} is missing selectors`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merge multiple recordings into one
   */
  static mergeRecordings(recordings: PuppeteerRecording[]): PuppeteerRecording {
    if (recordings.length === 0) {
      throw new Error("Cannot merge empty recordings array");
    }

    const mergedSteps: PuppeteerStep[] = [];

    // Add viewport from first recording
    const firstViewport = recordings[0].steps.find(
      (s) => s.type === "setViewport"
    );
    if (firstViewport) {
      mergedSteps.push(firstViewport);
    }

    // Merge all steps
    for (const recording of recordings) {
      const steps = recording.steps.filter((s) => s.type !== "setViewport");
      mergedSteps.push(...steps);
    }

    return {
      title: `Merged Recording ${new Date().toISOString()}`,
      steps: mergedSteps,
    };
  }
}
