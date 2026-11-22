/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `shell-${version}`;
const SHELL = [...build, ...files];

sw.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL);
      await c.add("/404.html").catch(() => {}); // shell SPA (fallback do adapter-static)
      await sw.skipWaiting();
    }),
  );
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== sw.location.origin ||
    url.pathname.startsWith("/api")
  )
    return;
  e.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === "navigate") {
          const shell = await caches.match("/404.html");
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});

sw.addEventListener("push", (e) => {
  let d: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    d = e.data?.json() ?? {};
  } catch {}
  e.waitUntil(
    sw.registration.showNotification(d.title ?? "MediLembre", {
      body: d.body ?? "Hora do seu lembrete",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: d.tag ?? "lembrete",
      renotify: true,
      requireInteraction: true,
      silent: false, // som do sistema (o Web Push não permite toque próprio)
      vibrate: [300, 150, 300, 150, 600],
      timestamp: Date.now(),
      data: { url: d.url ?? "/" },
    } as NotificationOptions),
  );
});

sw.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data as { url?: string })?.url ?? "/";
  e.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      const w = all[0];
      return w ? w.focus() : sw.clients.openWindow(url);
    }),
  );
});
