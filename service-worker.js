const CACHE_NAME="sorasukt-tarot-shell-v7-membership";
const APP_SHELL=[...new Set([
  "/tarot/",
  "/tarot/updates/",
  "/tarot/updates/updates.mjs",
  "/tarot/updates/feed.mjs",
  "/tarot/assets/css/components/actions.css",
  "/tarot/assets/css/pages/reading.css",
  "/tarot/assets/css/pages/updates.css",
  "/tarot/admin/admin-codes.css",
  "/tarot/admin/admin.css",
  "/tarot/assets/css/components/lucky-colors.css",
  "/tarot/assets/css/components/tabs.css",
  "/tarot/assets/css/core/design-system.css",
  "/tarot/assets/css/core/transitions.css",
  "/tarot/assets/css/core/enhancements.css",
  "/tarot/assets/css/core/experience.css",
  "/tarot/assets/css/core/interaction.css",
  "/tarot/assets/css/core/portal.css",
  "/tarot/assets/css/pages/billing.css",
  "/tarot/assets/css/pages/home-polish.css",
  "/tarot/assets/css/pages/home.css",
  "/tarot/assets/css/pages/me-billing.css",
  "/tarot/assets/css/pages/me.css",
  "/tarot/billing.css",
  "/tarot/experience.css",
  "/tarot/history/history.css",
  "/tarot/home-polish.css",
  "/tarot/home.css",
  "/tarot/interaction.css",
  "/tarot/lucky-colors.css",
  "/tarot/me/billing-phase2.css",
  "/tarot/me/me-polish.css",
  "/tarot/portal-enhancements.css",
  "/tarot/portal.css",
  "/tarot/redeem/redeem.css",
  "/tarot/shuffle.css",
  "/tarot/style.css",

  "/tarot/portal.css",
  "/tarot/experience.css",
  "/tarot/interaction.css",
  "/tarot/lucky-colors.css",
  "/tarot/portal.js",
  "/tarot/home.js",
  "/tarot/manifest.webmanifest",
  "/img/logo.png"
])];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).catch(()=>undefined));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("sorasukt-tarot-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith(fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
      return response;
    }).catch(async()=>{
      return (await caches.match(request))||(await caches.match("/tarot/"))||new Response("Offline",{status:503});
    }));
    return;
  }

  if(url.pathname.startsWith("/tarot/")||url.pathname==="/img/logo.png"){
    event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>{
      const network=fetch(request).then(response=>{
        if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
        return response;
      }).catch(()=>cached||new Response("Offline",{status:503}));
      return cached||network;
    }));
  }
});
