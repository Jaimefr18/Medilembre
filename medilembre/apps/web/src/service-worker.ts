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
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => sw.skipWaiting()),
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
// Casca em cache; a API vai sempre à rede.
sw.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api")) return;
  e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request)));
});

// Notificação discreta no ecrã bloqueado.
sw.addEventListener("push", (e) => {
  const d = e.data?.json() ?? { title: "MediLembre", body: "Hora do seu lembrete" };
  e.waitUntil(
    sw.registration.showNotification(d.title, {
      body: d.body,
      icon: "/icon.svg",
      tag: "lembrete",
    } as NotificationOptions),
  );
});
sw.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(sw.clients.openWindow("/"));
});
