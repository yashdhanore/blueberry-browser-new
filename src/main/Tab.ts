import { NativeImage, WebContentsView } from "electron";

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _isVisible: boolean = false;

  constructor(id: string, url: string = "https://www.google.com") {
    this._id = id;
    this._url = url;
    this._title = "New Tab";

    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.setupEventListeners();
    this.loadURL(url);
  }

  private setupEventListeners(): void {
    this.webContentsView.webContents.on("page-title-updated", (_, title) => {
      this._title = title;
    });

    this.webContentsView.webContents.on("did-navigate", (_, url) => {
      this._url = url;
    });

    this.webContentsView.webContents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
    });
  }

  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get webContents() {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async runJs(code: string): Promise<any> {
    try {
      if (this.webContentsView.webContents.isDestroyed()) {
        return null;
      }

      const url = this._url;
      if (
        !url ||
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("about:") ||
        url.startsWith("file://")
      ) {
        return null;
      }

      if (!this.webContentsView.webContents.isLoading()) {
        return await this.webContentsView.webContents.executeJavaScript(code);
      }

      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.webContentsView.webContents.removeListener(
            "did-finish-load",
            onLoad
          );
          reject(new Error("Page load timeout"));
        }, 5000);

        const onLoad = () => {
          clearTimeout(timeout);
          this.webContentsView.webContents.removeListener(
            "did-finish-load",
            onLoad
          );
          this.webContentsView.webContents
            .executeJavaScript(code)
            .then(resolve)
            .catch(reject);
        };

        if (!this.webContentsView.webContents.isLoading()) {
          clearTimeout(timeout);
          this.webContentsView.webContents
            .executeJavaScript(code)
            .then(resolve)
            .catch(reject);
        } else {
          this.webContentsView.webContents.once("did-finish-load", onLoad);
        }
      });
    } catch (error) {
      console.debug(`Script execution failed for ${this._url}:`, error);
      return null;
    }
  }

  async getTabText(): Promise<string> {
    const result = await this.runJs(
      "return document.documentElement.innerText"
    );
    return result || "";
  }

  async getTabHtml(): Promise<string> {
    const result = await this.runJs(
      "return document.documentElement.outerHTML"
    );
    return result || "";
  }

  loadURL(url: string): Promise<void> {
    this._url = url;
    return this.webContentsView.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }
}
