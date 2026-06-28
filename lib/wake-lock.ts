export type WakeLockHandle = {
  request: () => Promise<void>;
  release: () => Promise<void>;
  supported: boolean;
};

type ScreenWakeLock = {
  request: (type: "screen") => Promise<WakeLockSentinel>;
};

export function createWakeLockHandle(): WakeLockHandle {
  let sentinel: WakeLockSentinel | null = null;
  const wakeNavigator = navigator as Navigator & { wakeLock?: ScreenWakeLock };
  const supported = Boolean(wakeNavigator.wakeLock);

  async function request() {
    if (!supported || document.visibilityState !== "visible") {
      return;
    }
    sentinel = await wakeNavigator.wakeLock!.request("screen");
  }

  async function release() {
    if (!sentinel) {
      return;
    }
    await sentinel.release();
    sentinel = null;
  }

  return { request, release, supported };
}
