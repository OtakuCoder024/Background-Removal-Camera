/// <reference types="vite/client" />

export interface AkvcamResolveResult {
  managerPath: string | null;
  installerPath: string | null;
  hasManager: boolean;
  hasInstaller: boolean;
  version: string;
}

export interface AkvcamStartResult {
  ok: boolean;
  error?: string;
}

export interface AkvcamApi {
  resolve: () => Promise<AkvcamResolveResult>;
  start: (opts: {
    width: number;
    height: number;
    fps?: number;
    deviceId?: string;
  }) => Promise<AkvcamStartResult>;
  stop: () => Promise<{ ok: boolean }>;
  openInstaller: () => Promise<{ ok: boolean; reason?: string }>;
  pushFrame: (arrayBuffer: ArrayBuffer) => void;
}

declare global {
  interface Window {
    akvcam?: AkvcamApi;
  }
}

export {};
