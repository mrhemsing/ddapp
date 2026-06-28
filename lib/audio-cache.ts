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

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return registration;
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
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not cache ${url}`);
    }
    await cache.put(url, response.clone());

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
