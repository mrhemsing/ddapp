import type { RoutePack } from "@/lib/route-data";
import { getRouteAssetUrls } from "@/lib/route-data";

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

export async function isRouteCached(route: RoutePack) {
  if (!("caches" in window)) {
    return false;
  }

  const cache = await caches.open(routeCacheName(route.id));
  const urls = getRouteAssetUrls(route);
  const matches = await Promise.all(urls.map((url) => cache.match(url)));
  return matches.every(Boolean);
}

export async function cacheRouteAudio(
  route: RoutePack,
  onProgress: (progress: CacheProgress) => void
) {
  if (!("caches" in window)) {
    throw new Error("Cache API is not available in this browser.");
  }

  await registerServiceWorker();

  const cache = await caches.open(routeCacheName(route.id));
  const urls = getRouteAssetUrls(route);
  let complete = 0;

  onProgress({ complete, total: urls.length, percent: 0 });

  for (const url of urls) {
    onProgress({
      complete,
      total: urls.length,
      percent: Math.round((complete / urls.length) * 100),
      currentUrl: url
    });

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
      total: urls.length,
      percent: Math.round((complete / urls.length) * 100),
      currentUrl: url
    });
  }

  return true;
}

export async function fetchCachedAsset(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      return response.arrayBuffer();
    }
  } catch {
    // Offline playback falls back to Cache API storage below.
  }

  if ("caches" in window) {
    const response = await caches.match(url);
    if (response) {
      return response.arrayBuffer();
    }
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Audio asset unavailable: ${url}`);
  }
  return response.arrayBuffer();
}
