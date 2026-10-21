import { contextBridge } from "electron";

// The renderer receives a frozen, read-only marker only. No IPC channel,
// filesystem, shell, or process access is exposed across this boundary.
contextBridge.exposeInMainWorld(
  "tasmacDesktop",
  Object.freeze({
    isDesktop: true,
  }),
);
