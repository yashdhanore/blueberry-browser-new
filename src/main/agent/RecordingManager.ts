/**
 * Recording Manager
 *
 * Captures user interactions in the browser and converts them into reusable skills.
 * Tracks clicks, typing, navigation, scrolling, and other user actions.
 */

import type { Window } from "../Window";
import type { Tab } from "../Tab";
import type { AgentAction, ActionType } from "./types";
import { WebContents } from "electron";

// ============================================================================
// TYPES
// ============================================================================

interface RecordedEvent {
  type: string;
  timestamp: number;
  data: any;
}

interface RecordingSession {
  id: string;
  tabId: string;
  startTime: number;
  events: RecordedEvent[];
  actions: AgentAction[];
  isRecording: boolean;
}

// ============================================================================
// RECORDING MANAGER CLASS
// ============================================================================

export class RecordingManager {
  private window: Window;
  private sessions: Map<string, RecordingSession> = new Map();
  private webContents: WebContents | null = null;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(window: Window) {
    this.window = window;
  }

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents;
  }

  // ============================================================================
  // RECORDING CONTROL
  // ============================================================================

  /**
   * Start recording user interactions
   */
  async startRecording(tabId?: string): Promise<string> {
    const activeTab = tabId ? this.window.getTab(tabId) : this.window.activeTab;

    if (!activeTab) {
      throw new Error("No active tab to record");
    }

    const sessionId = this.generateSessionId();

    const session: RecordingSession = {
      id: sessionId,
      tabId: activeTab.id,
      startTime: Date.now(),
      events: [],
      actions: [],
      isRecording: true,
    };

    this.sessions.set(sessionId, session);

    // Inject recording script into the page
    await this.injectRecordingScript(activeTab);

    // Record initial navigation
    const initialAction: AgentAction = {
      type: "navigate" as ActionType.NAVIGATE,
      parameters: { url: activeTab.url },
      timestamp: new Date(),
      reasoning: "Initial page load",
    };
    session.actions.push(initialAction);

    console.log(`🔴 Started recording session: ${sessionId}`);

    // Start polling for events
    this.startPolling(sessionId, activeTab);

    // Notify renderer
    this.notifyRecordingStatus(sessionId, true);

    return sessionId;
  }

  /**
   * Stop recording and return captured actions
   */
  stopRecording(sessionId: string): AgentAction[] {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Recording session not found: ${sessionId}`);
    }

    session.isRecording = false;

    // Stop polling
    this.stopPolling(sessionId);

    console.log(`⏹️  Stopped recording session: ${sessionId}`);
    console.log(`📊 Captured ${session.actions.length} actions`);

    // Notify renderer
    this.notifyRecordingStatus(sessionId, false);

    return session.actions;
  }

  /**
   * Pause recording
   */
  pauseRecording(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Recording session not found: ${sessionId}`);
    }

    session.isRecording = false;
    this.stopPolling(sessionId);
    console.log(`⏸️  Paused recording session: ${sessionId}`);

    this.notifyRecordingStatus(sessionId, false);
  }

  /**
   * Resume recording
   */
  resumeRecording(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Recording session not found: ${sessionId}`);
    }

    const tab = this.window.getTab(session.tabId);
    if (!tab) {
      throw new Error(`Tab not found: ${session.tabId}`);
    }

    session.isRecording = true;
    this.startPolling(sessionId, tab);
    console.log(`▶️  Resumed recording session: ${sessionId}`);

    this.notifyRecordingStatus(sessionId, true);
  }

  /**
   * Delete a recording session
   */
  deleteSession(sessionId: string): void {
    this.stopPolling(sessionId);
    this.sessions.delete(sessionId);
    console.log(`🗑️  Deleted recording session: ${sessionId}`);
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Handle recorded event from content script
   */
  handleRecordedEvent(sessionId: string, event: RecordedEvent): void {
    const session = this.sessions.get(sessionId);

    if (!session || !session.isRecording) {
      return;
    }

    session.events.push(event);

    // Convert event to action
    const action = this.eventToAction(event);

    if (action) {
      session.actions.push(action);
      console.log(`📝 Recorded action: ${action.type}`);

      // Notify renderer of new action
      this.notifyActionRecorded(sessionId, action);
    }
  }

  /**
   * Convert recorded event to AgentAction
   */
  private eventToAction(event: RecordedEvent): AgentAction | null {
    const timestamp = new Date();

    switch (event.type) {
      case "click":
        return {
          type: "click" as ActionType.CLICK,
          parameters: {
            selector: event.data.selector,
          },
          timestamp,
          reasoning: `Click on ${event.data.tagName}${event.data.text ? `: "${event.data.text}"` : ""}`,
        };

      case "input":
      case "type":
        return {
          type: "type" as ActionType.TYPE,
          parameters: {
            selector: event.data.selector,
            text: event.data.value,
            clear: false,
          },
          timestamp,
          reasoning: `Type into ${event.data.tagName}`,
        };

      case "select":
        return {
          type: "select" as ActionType.SELECT,
          parameters: {
            selector: event.data.selector,
            value: event.data.value,
          },
          timestamp,
          reasoning: `Select option in ${event.data.tagName}`,
        };

      case "scroll":
        return {
          type: "scroll" as ActionType.SCROLL,
          parameters: {
            direction: event.data.direction,
            amount: event.data.amount,
          },
          timestamp,
          reasoning: `Scroll ${event.data.direction}`,
        };

      case "navigation":
        return {
          type: "navigate" as ActionType.NAVIGATE,
          parameters: {
            url: event.data.url,
          },
          timestamp,
          reasoning: "Navigate to new page",
        };

      case "hover":
        return {
          type: "hover" as ActionType.HOVER,
          parameters: {
            selector: event.data.selector,
          },
          timestamp,
          reasoning: `Hover over ${event.data.tagName}`,
        };

      default:
        console.warn(`Unknown event type: ${event.type}`);
        return null;
    }
  }

  // ============================================================================
  // SCRIPT INJECTION
  // ============================================================================

  /**
   * Inject recording script into the page
   */
  private async injectRecordingScript(tab: Tab): Promise<void> {
    const recordingScript = `
      (function() {
        if (window.__recordingEnabled) return;
        window.__recordingEnabled = true;
        window.__recordedEvents = [];

        console.log('🎬 Recording script injected');

        // Helper function to generate CSS selector
        function getSelector(element) {
          if (element.id) return '#' + element.id;

          if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              return element.tagName.toLowerCase() + '.' + classes.join('.');
            }
          }

          // Try to find unique attributes
          if (element.name) return \`\${element.tagName.toLowerCase()}[name="\${element.name}"]\`;
          if (element.type) return \`\${element.tagName.toLowerCase()}[type="\${element.type}"]\`;

          // Use nth-child as fallback
          const parent = element.parentElement;
          if (parent) {
            const index = Array.from(parent.children).indexOf(element) + 1;
            return \`\${element.tagName.toLowerCase()}:nth-child(\${index})\`;
          }

          return element.tagName.toLowerCase();
        }

        // Helper to store events
        function recordEvent(event) {
          window.__recordedEvents.push(event);
        }

        // Track click events
        document.addEventListener('click', (e) => {
          const target = e.target;
          const selector = getSelector(target);
          const text = target.textContent?.trim().substring(0, 50) || '';

          recordEvent({
            type: 'click',
            timestamp: Date.now(),
            data: {
              selector,
              tagName: target.tagName.toLowerCase(),
              text,
              x: e.clientX,
              y: e.clientY,
            }
          });

          console.log('🖱️ Recorded click:', selector);
        }, true);

        // Track input events with debouncing
        let inputTimeout;
        document.addEventListener('input', (e) => {
          const target = e.target;

          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            clearTimeout(inputTimeout);

            inputTimeout = setTimeout(() => {
              const selector = getSelector(target);

              recordEvent({
                type: 'input',
                timestamp: Date.now(),
                data: {
                  selector,
                  tagName: target.tagName.toLowerCase(),
                  value: target.value,
                  inputType: target.type,
                }
              });

              console.log('⌨️ Recorded input:', selector);
            }, 500); // Debounce 500ms
          }
        }, true);

        // Track select events
        document.addEventListener('change', (e) => {
          const target = e.target;

          if (target.tagName === 'SELECT') {
            const selector = getSelector(target);

            recordEvent({
              type: 'select',
              timestamp: Date.now(),
              data: {
                selector,
                tagName: target.tagName.toLowerCase(),
                value: target.value,
              }
            });

            console.log('📋 Recorded select:', selector);
          }
        }, true);

        // Track scroll events with debouncing
        let scrollTimeout;
        let lastScrollY = window.scrollY;

        window.addEventListener('scroll', () => {
          clearTimeout(scrollTimeout);

          scrollTimeout = setTimeout(() => {
            const currentScrollY = window.scrollY;
            const direction = currentScrollY > lastScrollY ? 'down' : 'up';
            const amount = Math.abs(currentScrollY - lastScrollY);

            if (amount > 50) { // Only record significant scrolls
              recordEvent({
                type: 'scroll',
                timestamp: Date.now(),
                data: {
                  direction,
                  amount,
                  scrollY: currentScrollY,
                }
              });

              console.log('📜 Recorded scroll:', direction, amount);
            }

            lastScrollY = currentScrollY;
          }, 300); // Debounce 300ms
        });

        // Track navigation (page changes)
        let currentUrl = window.location.href;
        setInterval(() => {
          if (window.location.href !== currentUrl) {
            recordEvent({
              type: 'navigation',
              timestamp: Date.now(),
              data: {
                url: window.location.href,
                from: currentUrl,
              }
            });

            console.log('🔗 Recorded navigation:', window.location.href);
            currentUrl = window.location.href;
          }
        }, 1000);

        console.log('✅ Recording listeners attached');
      })();
    `;

    try {
      await tab.runJs(recordingScript);
      console.log("✅ Recording script injected successfully");
    } catch (error) {
      console.error("Error injecting recording script:", error);
      throw error;
    }
  }

  // ============================================================================
  // SESSION QUERIES
  // ============================================================================

  /**
   * Get recording session
   */
  getSession(sessionId: string): RecordingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): RecordingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active recording session
   */
  getActiveSession(): RecordingSession | null {
    for (const session of this.sessions.values()) {
      if (session.isRecording) {
        return session;
      }
    }
    return null;
  }

  // ============================================================================
  // IPC NOTIFICATIONS
  // ============================================================================

  private notifyRecordingStatus(sessionId: string, isRecording: boolean): void {
    if (!this.webContents) return;

    this.webContents.send("recording-status-update", {
      sessionId,
      isRecording,
    });
  }

  private notifyActionRecorded(sessionId: string, action: AgentAction): void {
    if (!this.webContents) return;

    this.webContents.send("recording-action-recorded", {
      sessionId,
      action,
    });
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private generateSessionId(): string {
    return `recording_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    console.log("🧹 Cleaning up RecordingManager...");

    // Clear all polling intervals
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    this.sessions.clear();
  }

  // ============================================================================
  // EVENT POLLING
  // ============================================================================

  /**
   * Start polling for recorded events from the tab
   */
  private startPolling(sessionId: string, tab: Tab): void {
    // Poll every 500ms for new events
    const interval = setInterval(async () => {
      try {
        await this.pollEvents(sessionId, tab);
      } catch (error) {
        console.error(`Error polling events for session ${sessionId}:`, error);
      }
    }, 500);

    this.pollingIntervals.set(sessionId, interval);
    console.log(`📡 Started polling for session: ${sessionId}`);
  }

  /**
   * Stop polling for events
   */
  private stopPolling(sessionId: string): void {
    const interval = this.pollingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(sessionId);
      console.log(`🛑 Stopped polling for session: ${sessionId}`);
    }
  }

  /**
   * Poll and retrieve events from the tab
   */
  private async pollEvents(sessionId: string, tab: Tab): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRecording) {
      return;
    }

    try {
      // Retrieve and clear events from the page
      const eventsJson = await tab.runJs(`
        (function() {
          if (!window.__recordedEvents || window.__recordedEvents.length === 0) {
            return JSON.stringify([]);
          }

          const events = [...window.__recordedEvents];
          window.__recordedEvents = [];
          return JSON.stringify(events);
        })();
      `);

      if (!eventsJson) {
        return;
      }

      const events: RecordedEvent[] = JSON.parse(eventsJson);

      // Process each event
      for (const event of events) {
        this.handleRecordedEvent(sessionId, event);
      }
    } catch (error) {
      console.error(`Error retrieving events from tab:`, error);
    }
  }
}
