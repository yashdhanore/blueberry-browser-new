/**
 * Chrome Recorder
 *
 * Records user interactions using Chrome DevTools Protocol (CDP).
 * Captures clicks, typing, navigation, and generates Puppeteer Replay format output.
 */

import { WebContents } from "electron";
import type {
  PuppeteerRecording,
  PuppeteerStep,
  ChromeRecordingSession,
  AssertedEvent,
} from "./types";
import type { Tab } from "../Tab";

// Injected script that generates selectors for elements
const SELECTOR_GENERATOR_SCRIPT = `
(function() {
  if (window.__chromeRecorderHelpers) return;

  window.__chromeRecorderHelpers = {
    generateSelectors: function(element) {
      const selectors = [];

      // 1. ARIA selector
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        selectors.push(['aria/' + ariaLabel]);
      }

      // 2. CSS with ID
      if (element.id) {
        selectors.push(['#' + element.id]);
      }

      // 3. CSS selector based on unique attributes
      const cssPath = this.getCSSPath(element);
      if (cssPath) {
        selectors.push([cssPath]);
      }

      // 4. XPath
      const xpath = this.getXPath(element);
      if (xpath) {
        selectors.push(['xpath/' + xpath]);
      }

      // 5. Text content
      const text = element.textContent?.trim();
      if (text && text.length > 0 && text.length < 50) {
        selectors.push(['text/' + text]);
      }

      return selectors.length > 0 ? selectors : [['body']];
    },

    getCSSPath: function(element) {
      if (element.id) return '#' + element.id;

      const path = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase();

        if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\\s+/).filter(c => c);
          if (classes.length > 0) {
            selector += '.' + classes.join('.');
          }
        }

        path.unshift(selector);

        if (current.id) break;
        current = current.parentElement;

        if (path.length > 3) break; // Limit depth
      }

      return path.join(' > ');
    },

    getXPath: function(element) {
      if (element.id) {
        return '//*[@id="' + element.id + '"]';
      }

      const paths = [];
      for (; element && element.nodeType === Node.ELEMENT_NODE; element = element.parentElement) {
        let index = 0;
        let sibling = element.previousSibling;

        while (sibling) {
          if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
            index++;
          }
          sibling = sibling.previousSibling;
        }

        const tagName = element.nodeName.toLowerCase();
        const pathIndex = index > 0 ? '[' + (index + 1) + ']' : '';
        paths.unshift(tagName + pathIndex);

        if (paths.length > 5) break; // Limit depth
      }

      return '//' + paths.join('/');
    },

    getElementInfo: function(element) {
      const rect = element.getBoundingClientRect();
      return {
        selectors: this.generateSelectors(element),
        offsetX: Math.round(rect.width / 2),
        offsetY: Math.round(rect.height / 2),
        tagName: element.tagName.toLowerCase(),
        text: element.textContent?.trim().substring(0, 50),
      };
    }
  };

  console.log('Chrome Recorder helpers injected');
})();
`;

export class ChromeRecorder {
  private sessions: Map<string, ChromeRecordingSession> = new Map();
  private debuggerAttached: Map<string, boolean> = new Map();

  /**
   * Start recording on a tab
   */
  async startRecording(tab: Tab): Promise<string> {
    const sessionId = this.generateSessionId();
    const webContents = tab.webContents;

    console.log(`🎥 Starting recording session ${sessionId} on tab ${tab.id}`);

    // Create session
    const session: ChromeRecordingSession = {
      id: sessionId,
      tabId: tab.id,
      startTime: Date.now(),
      isRecording: true,
      isPaused: false,
      recording: {
        title: `Recording ${new Date().toISOString()}`,
        steps: [],
      },
    };

    this.sessions.set(sessionId, session);

    try {
      // Attach debugger
      await this.attachDebugger(webContents, sessionId);

      // Enable CDP domains
      await this.sendDebuggerCommand(webContents, "Input.enable");
      await this.sendDebuggerCommand(webContents, "Page.enable");
      await this.sendDebuggerCommand(webContents, "Runtime.enable");
      await this.sendDebuggerCommand(webContents, "DOM.enable");

      // Inject selector generator script
      await this.injectHelperScript(webContents);

      // Capture initial viewport
      const viewport = await this.captureViewport(webContents);
      if (viewport) {
        session.recording.steps.push(viewport);
      }

      // Capture initial navigation
      const currentUrl = tab.url;
      if (currentUrl && currentUrl !== "about:blank") {
        session.recording.steps.push({
          type: "navigate",
          url: currentUrl,
          assertedEvents: [
            {
              type: "navigation",
              url: currentUrl,
              title: tab.title,
            },
          ],
        });
      }

      // Set up CDP event listeners
      this.setupEventListeners(webContents, sessionId);

      console.log(`✅ Recording session ${sessionId} started`);

      return sessionId;
    } catch (error) {
      console.error("Error starting recording:", error);
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Stop recording and return the recording
   */
  async stopRecording(sessionId: string): Promise<PuppeteerRecording> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Recording session ${sessionId} not found`);
    }

    console.log(`⏹️ Stopping recording session ${sessionId}`);

    session.isRecording = false;

    // Detach debugger
    const webContents = this.getWebContentsByTabId(session.tabId);
    if (webContents) {
      await this.detachDebugger(webContents, sessionId);
    }

    const recording = session.recording;
    this.sessions.delete(sessionId);

    console.log(
      `✅ Recording session ${sessionId} stopped. Captured ${recording.steps.length} steps`
    );

    return recording;
  }

  /**
   * Pause recording (stop capturing but keep session alive)
   */
  pauseRecording(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Recording session ${sessionId} not found`);
    }

    session.isPaused = true;
    console.log(`⏸️ Recording session ${sessionId} paused`);
  }

  /**
   * Resume recording
   */
  resumeRecording(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Recording session ${sessionId} not found`);
    }

    session.isPaused = false;
    console.log(`▶️ Recording session ${sessionId} resumed`);
  }

  /**
   * Get current recording
   */
  getRecording(sessionId: string): PuppeteerRecording {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Recording session ${sessionId} not found`);
    }

    return session.recording;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ChromeRecordingSession[] {
    return Array.from(this.sessions.values());
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async attachDebugger(
    webContents: WebContents,
    sessionId: string
  ): Promise<void> {
    try {
      await webContents.debugger.attach("1.3");
      this.debuggerAttached.set(sessionId, true);
    } catch (error) {
      throw new Error(
        `Failed to attach debugger: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async detachDebugger(
    webContents: WebContents,
    sessionId: string
  ): Promise<void> {
    try {
      if (webContents.debugger.isAttached()) {
        webContents.debugger.detach();
      }
      this.debuggerAttached.delete(sessionId);
    } catch (error) {
      console.error("Error detaching debugger:", error);
    }
  }

  private async sendDebuggerCommand(
    webContents: WebContents,
    method: string,
    params?: any
  ): Promise<any> {
    try {
      return await webContents.debugger.sendCommand(method, params);
    } catch (error) {
      console.error(`Error sending debugger command ${method}:`, error);
      throw error;
    }
  }

  private async injectHelperScript(webContents: WebContents): Promise<void> {
    try {
      await webContents.executeJavaScript(SELECTOR_GENERATOR_SCRIPT);
    } catch (error) {
      console.error("Error injecting helper script:", error);
    }
  }

  private async captureViewport(
    webContents: WebContents
  ): Promise<PuppeteerStep | null> {
    try {
      const result = await webContents.executeJavaScript(`
        ({
          width: window.innerWidth,
          height: window.innerHeight,
          deviceScaleFactor: window.devicePixelRatio,
        })
      `);

      return {
        type: "setViewport",
        width: result.width,
        height: result.height,
        deviceScaleFactor: result.deviceScaleFactor || 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: result.width > result.height,
      };
    } catch (error) {
      console.error("Error capturing viewport:", error);
      return null;
    }
  }

  private setupEventListeners(
    webContents: WebContents,
    sessionId: string
  ): void {
    // Listen for navigation events
    webContents.debugger.on("message", async (_event, method, params) => {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isRecording || session.isPaused) return;

      try {
        if (method === "Page.frameNavigated" && params.frame.parentId == null) {
          // Main frame navigation
          const step: PuppeteerStep = {
            type: "navigate",
            url: params.frame.url,
            assertedEvents: [
              {
                type: "navigation",
                url: params.frame.url,
              },
            ],
          };
          session.recording.steps.push(step);
          console.log(`📝 Recorded navigation: ${params.frame.url}`);
        }
      } catch (error) {
        console.error("Error processing CDP event:", error);
      }
    });

    // Listen for DOM events via injected script
    // We'll use mutation observers and event listeners in the page context
    this.setupPageEventListeners(webContents, sessionId);
  }

  private async setupPageEventListeners(
    webContents: WebContents,
    sessionId: string
  ): Promise<void> {
    try {
      await webContents.executeJavaScript(`
        (function() {
          if (window.__chromeRecorderListenersSetup) return;
          window.__chromeRecorderListenersSetup = true;

          const recordEvent = (eventType, data) => {
            console.log('CHROME_RECORDER_EVENT:', JSON.stringify({ eventType, data }));
          };

          // Click events
          document.addEventListener('click', (e) => {
            if (e.target) {
              const info = window.__chromeRecorderHelpers.getElementInfo(e.target);
              recordEvent('click', info);
            }
          }, true);

          // Input events (typing)
          document.addEventListener('input', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
              const info = window.__chromeRecorderHelpers.getElementInfo(e.target);
              info.value = e.target.value;
              recordEvent('input', info);
            }
          }, true);

          // Change events (select, checkbox, radio)
          document.addEventListener('change', (e) => {
            if (e.target) {
              const info = window.__chromeRecorderHelpers.getElementInfo(e.target);
              info.value = e.target.value || e.target.checked;
              recordEvent('change', info);
            }
          }, true);

          console.log('Chrome Recorder event listeners set up');
        })();
      `);

      // Listen for console messages to capture recorded events
      webContents.on("console-message", (_event, _level, message) => {
        if (message.startsWith("CHROME_RECORDER_EVENT:")) {
          const session = this.sessions.get(sessionId);
          if (!session || !session.isRecording || session.isPaused) return;

          try {
            const eventData = JSON.parse(message.substring(22));
            this.processRecordedEvent(session, eventData);
          } catch (error) {
            // Ignore parsing errors
          }
        }
      });
    } catch (error) {
      console.error("Error setting up page event listeners:", error);
    }
  }

  private processRecordedEvent(
    session: ChromeRecordingSession,
    eventData: any
  ): void {
    const { eventType, data } = eventData;

    try {
      if (eventType === "click") {
        const step: PuppeteerStep = {
          type: "click",
          selectors: data.selectors,
          offsetX: data.offsetX,
          offsetY: data.offsetY,
          target: "main",
        };
        session.recording.steps.push(step);
        console.log(`📝 Recorded click on ${data.tagName}`);
      } else if (eventType === "input" || eventType === "change") {
        const step: PuppeteerStep = {
          type: "change",
          selectors: data.selectors,
          value: data.value,
        };
        session.recording.steps.push(step);
        console.log(`📝 Recorded input: ${data.value}`);
      }
    } catch (error) {
      console.error("Error processing recorded event:", error);
    }
  }

  private getWebContentsByTabId(tabId: string): WebContents | null {
    // This would need to be implemented by accessing the Window/Tab manager
    // For now, we'll return null and handle it gracefully
    return null;
  }

  private generateSessionId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup all sessions and detach debuggers
   */
  async cleanup(): Promise<void> {
    console.log("🧹 Cleaning up ChromeRecorder...");

    for (const [sessionId, session] of this.sessions.entries()) {
      const webContents = this.getWebContentsByTabId(session.tabId);
      if (webContents) {
        await this.detachDebugger(webContents, sessionId);
      }
    }

    this.sessions.clear();
    this.debuggerAttached.clear();
  }
}
