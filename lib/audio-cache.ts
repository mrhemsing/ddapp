import type { RoutePack } from "@/lib/route-data";

export type CacheProgress = {
  complete: number;
  total: number;
  percent: number;
  currentUrl?: string;
};

export const routeCacheName = (routeId: string) => `dark-drives-route-${routeId}-v1`;

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => window.setTimeout(resolve, 5000))
    ]);
    return registration;
  } catch {
    return null;
  }
}

export async function cacheAudioUrls(
  route: RoutePack,
  urls: string[],
  onProgress: (progress: CacheProgress) => void
) {
  if (!("caches" in window)) {
    throw new Error("Cache API is not available in this browser.");
  }

  await registerServiceWorker();

  const cache = await caches.open(routeCacheName(route.id));
  const uniqueUrls = [...new Set(urls)];
  let complete = 0;

  onProgress({ complete, total: uniqueUrls.length, percent: 0 });

  for (const url of uniqueUrls) {
    onProgress({
      complete,
      total: uniqueUrls.length,
      percent: Math.round((complete / uniqueUrls.length) * 100),
      currentUrl: url
    });

    const cached = await cache.match(url);
    if (cached) {
      complete += 1;
      onProgress({
        complete,
        total: uniqueUrls.length,
        percent: Math.round((complete / uniqueUrls.length) * 100),
        currentUrl: url
      });
      continue;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Could not cache ${url} (${response.status})`);
      }
      await cache.put(url, response.clone());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Timed out downloading ${url}`);
      }
      throw error instanceof Error ? error : new Error(`Could not cache ${url}`);
    } finally {
      window.clearTimeout(timeoutId);
    }

    complete += 1;
    onProgress({
      complete,
      total: uniqueUrls.length,
      percent: Math.round((complete / uniqueUrls.length) * 100),
      currentUrl: url
    });
  }

  return true;
}

export async function prefetchRouteAudio(route: RoutePack, urls: string[]) {
  if (!("caches" in window) || urls.length === 0) {
    return false;
  }

  try {
    await cacheAudioUrls(route, urls, () => undefined);
    return true;
  } catch {
    return false;
  }
}

export async function isAudioUrlCached(route: RoutePack, url: string) {
  if (!("caches" in window)) {
    return false;
  }

  const cache = await caches.open(routeCacheName(route.id));
  return Boolean(await cache.match(url));
}

export async function fetchCachedAsset(url: string) {
  if ("caches" in window) {
    const response = await caches.match(url);
    if (response) {
      return response.arrayBuffer();
    }
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      return response.arrayBuffer();
    }
  } catch {
    // Offline playback falls back to Cache API storage below.
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Audio asset unavailable: ${url}`);
  }
  return response.arrayBuffer();
}
