import { app, BrowserWindow, session, utilityProcess, type UtilityProcess } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

const APP_NAME = "TASMAC Inventory";
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;
const SERVER_START_TIMEOUT_MS = 30_000;

let mainWindow: BrowserWindow | null = null;
let rendererServer: UtilityProcess | null = null;
let rendererOrigin = "";

app.setName(APP_NAME);

function writeDesktopLog(message: string): void {
  try {
    const userDataPath = app.getPath("userData");
    mkdirSync(userDataPath, { recursive: true });
    appendFileSync(
      path.join(userDataPath, "desktop.log"),
      `${new Date().toISOString()} ${message}\n`,
      "utf8",
    );
  } catch {
    // Diagnostics must never prevent the application from starting.
  }
}

writeDesktopLog(`Starting ${APP_NAME}; packaged=${app.isPackaged}; resources=${process.resourcesPath}`);

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a local renderer port."));
      });
    });
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Server is not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The TASMAC renderer did not start within ${SERVER_START_TIMEOUT_MS / 1000} seconds.`);
}

function resolvePackagedServerPath(): string {
  const rendererRoot = path.join(process.resourcesPath, "renderer");
  const manifestPath = path.join(rendererRoot, "tasmac-server.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { server: string };
  const serverPath = path.join(rendererRoot, manifest.server);
  if (!existsSync(serverPath)) {
    throw new Error("The packaged TASMAC renderer server is missing.");
  }
  return serverPath;
}

async function startPackagedRenderer(): Promise<string> {
  const port = await findFreePort();
  const serverPath = resolvePackagedServerPath();
  rendererServer = utilityProcess.fork(serverPath, [], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    serviceName: "TASMAC renderer server",
    stdio: "pipe",
  });
  rendererServer.stdout?.on("data", (chunk) => writeDesktopLog(`[renderer] ${String(chunk).trimEnd()}`));
  rendererServer.stderr?.on("data", (chunk) => writeDesktopLog(`[renderer:error] ${String(chunk).trimEnd()}`));
  rendererServer.on("spawn", () => writeDesktopLog(`Renderer process started from ${serverPath}`));
  rendererServer.on("exit", (code) => {
    writeDesktopLog(`Renderer process exited with code ${code}.`);
    rendererServer = null;
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

async function resolveRendererUrl(): Promise<string> {
  if (!app.isPackaged) {
    const devUrl = process.env["TASMAC_RENDERER_URL"];
    if (!devUrl) {
      throw new Error("TASMAC_RENDERER_URL is required in development. Run `npm run desktop:dev`.");
    }
    return devUrl;
  }
  return startPackagedRenderer();
}

function isAllowedUrl(target: string): boolean {
  try {
    return new URL(target).origin === rendererOrigin;
  } catch {
    return false;
  }
}

function applySecurityPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, target) => {
      if (!isAllowedUrl(target)) event.preventDefault();
    });
    contents.on("will-redirect", (event, target) => {
      if (!isAllowedUrl(target)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}

async function createMainWindow(): Promise<void> {
  const rendererUrl = await resolveRendererUrl();
  rendererOrigin = new URL(rendererUrl).origin;

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: "#0A0A0A",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`${rendererUrl}/dashboard`);
}

if (!app.requestSingleInstanceLock()) {
  writeDesktopLog("Another TASMAC instance owns the single-instance lock; exiting.");
  app.quit();
} else {
  writeDesktopLog("Single-instance lock acquired.");
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    applySecurityPolicy();
    try {
      await createMainWindow();
      writeDesktopLog("Main window loaded successfully.");
    } catch (error) {
      writeDesktopLog(`Startup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      console.error(error);
      app.exit(1);
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", () => {
    rendererServer?.kill();
    rendererServer = null;
  });
}
