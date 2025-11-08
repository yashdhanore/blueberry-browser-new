/**
 * Agent Planner
 *
 * Uses LLM to analyze the current page state and decide what action to take next.
 * This is the "brain" of the agent that makes intelligent decisions.
 */

import { streamText, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type {
  AgentAction,
  ExecutionResult,
  PlanningRequest,
  PlanningResponse,
} from "./types";
import { ActionType } from "./types";
import { getActionDescriptions } from "./AgentActions";

export class AgentPlanner {
  private model: LanguageModel | null;
  private provider: "openai" | "anthropic";

  constructor() {
    this.provider = this.getProvider();
    this.model = this.initializeModel();
  }

  private getProvider(): "openai" | "anthropic" {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic") return "anthropic";
    return "openai"; // Default
  }

  private initializeModel(): LanguageModel | null {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    const modelName = process.env.LLM_MODEL || "gpt-5-mini";

    try {
      if (this.provider === "anthropic") {
        return anthropic(modelName);
      } else {
        return openai(modelName);
      }
    } catch (error) {
      console.error("Error initializing LLM:", error);
      return null;
    }
  }

  private getApiKey(): string | undefined {
    if (this.provider === "anthropic") {
      return process.env.ANTHROPIC_API_KEY;
    }
    return process.env.OPENAI_API_KEY;
  }

  async planNextAction(request: PlanningRequest): Promise<PlanningResponse> {
    if (!this.model) {
      throw new Error("LLM not initialized. Please check your API key.");
    }

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(request);

      const result = await streamText({
        model: this.model,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                image: request.context.screenshot,
              },
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ],
        temperature: 0.7,
      });

      let fullResponse = "";
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
      }

      // Log the raw LLM response for debugging
      console.log("🤖 Raw LLM Response:");
      console.log("=".repeat(80));
      console.log(fullResponse);
      console.log("=".repeat(80));

      const planningResponse = this.parseResponse(fullResponse);

      // Log the parsed response
      console.log("📋 Parsed Planning Response:");
      console.log(`   Reasoning: ${planningResponse.reasoning}`);
      console.log(`   Goal Achieved: ${planningResponse.goalAchieved}`);
      console.log(`   Confidence: ${planningResponse.confidence}`);
      if (planningResponse.action) {
        console.log(`   Action Type: ${planningResponse.action.type}`);
        console.log(
          `   Action Parameters: ${JSON.stringify(planningResponse.action.parameters, null, 2)}`
        );
        console.log(
          `   Action Reasoning: ${planningResponse.action.reasoning || "N/A"}`
        );
      } else {
        console.log(`   Action: null (goal achieved or no action)`);
      }

      return planningResponse;
    } catch (error) {
      console.error("Error planning next action:", error);

      return {
        action: null,
        goalAchieved: false,
        confidence: 0,
        reasoning: `Planning failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are an autonomous web browsing agent. Your job is to achieve user goals by interacting with web pages.

CAPABILITIES:
${getActionDescriptions()}

RESPONSE FORMAT:
You must respond with a JSON object in the following format:

{
  "reasoning": "Explain your thought process and why you chose this action",
  "goalAchieved": false,
  "confidence": 0.85,
  "action": {
    "type": "action_type",
    "parameters": {
      // action-specific parameters
    },
    "reasoning": "Why this specific action"
  }
}

If the goal is achieved, set "goalAchieved" to true and "action" to null.

IMPORTANT RULES:
1. You can see a screenshot of the current page - use it to understand the visual layout
2. You also get simplified DOM and page text - use them to find exact selectors
3. For selectors, prefer IDs and classes, but you can also use text content (e.g., "Sign In button")
4. CRITICAL: Do NOT use jQuery-style selectors like :contains() - these are NOT valid CSS selectors
   - Use standard CSS selectors: #id, .class, tag.class, [attribute="value"]
   - For text-based selection, just use the text directly (e.g., "Sign In button" instead of "button:contains('Sign In')")
   - The system will automatically search for elements by text if CSS selector fails
5. Take small, deliberate steps - don't try to do too much at once
6. After navigation actions, you may need to wait for the page to load
7. If you can't find an element, try scrolling first
8. Before extracting data, make sure you can see all the data you need
9. Be patient - some actions take time
10. If something fails repeatedly, try a different approach
11. Your confidence score should reflect how certain you are the action will succeed

EXAMPLES:

Example 1 - Clicking a button:
{
  "reasoning": "I can see a 'Search' button in the screenshot. I need to click it to submit the search query.",
  "goalAchieved": false,
  "confidence": 0.9,
  "action": {
    "type": "click",
    "parameters": {
      "selector": "button.search-btn"
    },
    "reasoning": "Clicking the search button to submit the form"
  }
}

Example 2 - Filling a form:
{
  "reasoning": "I need to enter the search term into the input field before clicking search.",
  "goalAchieved": false,
  "confidence": 0.95,
  "action": {
    "type": "type",
    "parameters": {
      "selector": "input[name='q']",
      "text": "machine learning",
      "clear": true
    },
    "reasoning": "Entering the search query"
  }
}

Example 3 - Scrolling to load more:
{
  "reasoning": "I can only see 10 products but the goal requires extracting all products. I should scroll down to load more.",
  "goalAchieved": false,
  "confidence": 0.8,
  "action": {
    "type": "scroll",
    "parameters": {
      "direction": "down",
      "amount": 500
    },
    "reasoning": "Scrolling to reveal more products"
  }
}

Example 4 - Data extraction:
{
  "reasoning": "I can now see all the product information needed. Time to extract the data.",
  "goalAchieved": false,
  "confidence": 0.85,
  "action": {
    "type": "extract",
    "parameters": {
      "schema": {
        "products": {
          "selector": ".product-card",
          "type": "array",
          "multiple": true
        },
        "names": {
          "selector": ".product-name",
          "type": "text",
          "multiple": true
        },
        "prices": {
          "selector": ".product-price",
          "type": "text",
          "multiple": true
        }
      }
    },
    "reasoning": "Extracting all product names and prices"
  }
}

Example 5 - Goal achieved:
{
  "reasoning": "I have successfully extracted all product data. The goal is complete.",
  "goalAchieved": true,
  "confidence": 1.0,
  "action": null
}

RESPOND ONLY WITH THE JSON OBJECT. DO NOT include any markdown formatting, code blocks, or additional text.`;
  }

  private buildUserPrompt(request: PlanningRequest): string {
    const parts: string[] = [];

    parts.push(`GOAL: ${request.goal}`);
    parts.push("");

    parts.push("CURRENT PAGE:");
    parts.push(`URL: ${request.context.url}`);
    parts.push(`Title: ${request.context.title}`);
    parts.push("");

    if (request.context.simplifiedDOM) {
      const domPreview = request.context.simplifiedDOM.substring(0, 3000);
      parts.push("PAGE STRUCTURE:");
      parts.push(domPreview);
      if (request.context.simplifiedDOM.length > 3000) {
        parts.push("... (truncated)");
      }
      parts.push("");
    }

    if (request.context.pageText) {
      const textPreview = request.context.pageText.substring(0, 2000);
      parts.push("PAGE TEXT:");
      parts.push(textPreview);
      if (request.context.pageText.length > 2000) {
        parts.push("... (truncated)");
      }
      parts.push("");
    }

    if (request.actionHistory.length > 0) {
      parts.push("PREVIOUS ACTIONS:");
      const recentActions = request.actionHistory.slice(-5);
      recentActions.forEach((result, _) => {
        const status = result.success ? "✓" : "✗";
        parts.push(
          `${status} ${result.action.type}: ${JSON.stringify(result.action.parameters)}`
        );
        if (!result.success && result.error) {
          parts.push(`  Error: ${result.error}`);
        }
      });
      parts.push("");
    }

    parts.push(`ITERATION: ${request.iteration}/50`);
    parts.push("");

    parts.push(
      "Based on the screenshot, page structure, and context above, what should be the next action to achieve the goal?"
    );
    parts.push("");
    parts.push(
      "Remember: Respond ONLY with a JSON object, no markdown or code blocks."
    );

    return parts.join("\n");
  }

  private parseResponse(response: string): PlanningResponse {
    try {
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\s*/g, "");
      cleaned = cleaned.replace(/```\s*/g, "");
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      if (typeof parsed.reasoning !== "string") {
        throw new Error("Missing or invalid 'reasoning' field");
      }
      if (typeof parsed.goalAchieved !== "boolean") {
        throw new Error("Missing or invalid 'goalAchieved' field");
      }
      if (typeof parsed.confidence !== "number") {
        throw new Error("Missing or invalid 'confidence' field");
      }

      if (parsed.goalAchieved) {
        return {
          action: null,
          goalAchieved: true,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
        };
      }

      if (!parsed.action || typeof parsed.action !== "object") {
        throw new Error("Missing or invalid 'action' field");
      }

      const action = this.parseAction(parsed.action);

      return {
        action,
        goalAchieved: false,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error("❌ Error parsing LLM response:", error);
      console.error("Raw response:", response);
      console.error("Response length:", response.length);
      console.error(
        "Response preview (first 500 chars):",
        response.substring(0, 500)
      );
      console.error(
        "Response preview (last 500 chars):",
        response.substring(Math.max(0, response.length - 500))
      );

      return {
        action: null,
        goalAchieved: false,
        confidence: 0,
        reasoning: `Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private parseAction(actionObj: any): AgentAction {
    if (!actionObj.type || typeof actionObj.type !== "string") {
      throw new Error("Action must have a 'type' field");
    }

    const type = actionObj.type as ActionType;

    if (!actionObj.parameters || typeof actionObj.parameters !== "object") {
      throw new Error("Action must have a 'parameters' object");
    }

    const action: AgentAction = {
      type,
      parameters: actionObj.parameters,
      reasoning: actionObj.reasoning || "",
      timestamp: new Date(),
    } as AgentAction;

    return action;
  }

  async planWithoutLLM(request: PlanningRequest): Promise<PlanningResponse> {
    const scrollActions = request.actionHistory.filter(
      (r) => r.action.type === "scroll"
    ).length;

    if (scrollActions >= 3) {
      return {
        action: {
          type: ActionType.EXTRACT,
          parameters: {
            schema: {
              text: {
                selector: "body",
                type: "text",
              },
            },
          },
          timestamp: new Date(),
        } as AgentAction,
        goalAchieved: false,
        confidence: 0.3,
        reasoning: "Attempting basic data extraction after exploration",
      };
    }

    return {
      action: {
        type: ActionType.SCROLL,
        parameters: {
          direction: "down",
          amount: 500,
        },
        timestamp: new Date(),
      } as AgentAction,
      goalAchieved: false,
      confidence: 0.5,
      reasoning: "Exploring page by scrolling (LLM not available)",
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function extractInteractiveElementsSummary(dom: string): string {
  const buttons = (dom.match(/<button/gi) || []).length;
  const links = (dom.match(/<a /gi) || []).length;
  const inputs = (dom.match(/<input/gi) || []).length;
  const selects = (dom.match(/<select/gi) || []).length;

  return `Page contains: ${buttons} buttons, ${links} links, ${inputs} inputs, ${selects} dropdowns`;
}

export function shouldGiveUp(actionHistory: ExecutionResult[]): {
  shouldGiveUp: boolean;
  reason: string;
} {
  const recentActions = actionHistory.slice(-5);
  if (recentActions.length >= 5 && recentActions.every((r) => !r.success)) {
    return {
      shouldGiveUp: true,
      reason: "Last 5 actions failed - unable to make progress",
    };
  }

  if (actionHistory.length >= 3) {
    const last3 = actionHistory.slice(-3);
    const allSameType = last3.every(
      (r) => r.action.type === last3[0].action.type
    );
    const allSameParams = last3.every(
      (r) =>
        JSON.stringify(r.action.parameters) ===
        JSON.stringify(last3[0].action.parameters)
    );

    if (allSameType && allSameParams) {
      return {
        shouldGiveUp: true,
        reason: "Stuck in a loop - repeating the same action",
      };
    }
  }

  return {
    shouldGiveUp: false,
    reason: "",
  };
}

export function getRecoveryHints(actionHistory: ExecutionResult[]): string {
  const recentFailures = actionHistory.slice(-3).filter((r) => !r.success);

  if (recentFailures.length === 0) {
    return "";
  }

  const hints: string[] = [];

  recentFailures.forEach((failure) => {
    const error = failure.error || "";

    if (error.includes("not found")) {
      hints.push(
        "- Previous element not found. Try scrolling or using a different selector (text-based, ID, or class)"
      );
    }

    if (error.includes("timeout")) {
      hints.push(
        "- Previous action timed out. The element might be dynamically loaded. Try waiting longer or scrolling."
      );
    }

    if (failure.action.type === "click") {
      hints.push(
        "- Previous click failed. Ensure the element is visible and clickable. Try scrolling to it first."
      );
    }

    if (failure.action.type === "type") {
      hints.push(
        "- Previous typing failed. Make sure the input field is focused and not disabled."
      );
    }
  });

  if (hints.length > 0) {
    return "\n\nRECOVERY HINTS:\n" + hints.join("\n");
  }

  return "";
}
