/** 기기 성능·절전·동작 축소에 맞춰 연출 품질을 고른다. DPR은 1.0~1.5. */

export type QualityLevel = 'static' | 'low' | 'medium' | 'high';

export type QualityProfile = {
  level: QualityLevel;
  dpr: number;
  particleCount: number;
  useWorker: boolean;
  useWebGL: boolean;
  targetFps: number;
};

export function clampDpr(raw: number): number {
  const value = Number(raw) || 1;
  return Math.min(1.5, Math.max(1, value));
}

export function detectQuality(input: {
  reducedMotion?: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
  webgl2?: boolean;
  hidden?: boolean;
} = {}): QualityProfile {
  if (input.reducedMotion || input.hidden) {
    return {
      level: 'static',
      dpr: 1,
      particleCount: 0,
      useWorker: false,
      useWebGL: false,
      targetFps: 1
    };
  }

  const cores = Number(input.hardwareConcurrency || 4);
  const memory = Number(input.deviceMemory || 4);
  const saveData = input.saveData === true;
  const webgl2 = input.webgl2 !== false;

  if (saveData || cores <= 2 || memory <= 2) {
    return {
      level: 'low',
      dpr: 1,
      particleCount: 24,
      useWorker: true,
      useWebGL: webgl2,
      targetFps: 30
    };
  }

  if (cores <= 6 || memory <= 4) {
    return {
      level: 'medium',
      dpr: 1.25,
      particleCount: 48,
      useWorker: true,
      useWebGL: webgl2,
      targetFps: 45
    };
  }

  return {
    level: 'high',
    dpr: 1.5,
    particleCount: 96,
    useWorker: true,
    useWebGL: webgl2,
    targetFps: 60
  };
}

export function readBrowserQualityHints(): {
  reducedMotion: boolean;
  hardwareConcurrency: number;
  deviceMemory: number;
  saveData: boolean;
  hidden: boolean;
} {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const connection = nav && 'connection' in nav
    ? (nav as Navigator & { connection?: { saveData?: boolean } }).connection
    : undefined;

  return {
    reducedMotion: typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
    hardwareConcurrency: Number(nav?.hardwareConcurrency || 4),
    deviceMemory: Number((nav as Navigator & { deviceMemory?: number })?.deviceMemory || 4),
    saveData: connection?.saveData === true,
    hidden: typeof document !== 'undefined' ? document.hidden : false
  };
}
