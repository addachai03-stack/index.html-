/* Cache only the versioned public app shell, never user video, audio,
   GitHub API responses, uploads, credentials or external pages. */
const CACHE="cutnova-shell-v4.8-audio-peaks";
const ROOT=new URL("./",self.location.href);
const SHELL=["./","./index.html","./styles.css","./app.js","./local-highlights.js","./audio-peaks.js","./owner-render.js","./jobs.js","./editor.js","./export-check.js","./full-export-test.js","./playback-check.js","./saved-file-check.js","./native-share.js","./social-codec-check.js","./local-reencode.js","./autolive.html","./autolive.js","./moment_queue.js","./pwa.js","./nav.js","./launch.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png"].map(p=>new URL(p,ROOT).href);
const ALLOWED=new Set(SHELL);
function shellRequest(request){
  if(request.method!=="GET")return null;
  const url=new URL(request.url);
  if(url.origin!==ROOT.origin)return null;
  if(request.mode==="navigate"&&(url.pathname===ROOT.pathname||url.pathname===new URL("index.html",ROOT).pathname))
    return new URL("index.html",ROOT).href;
  if(!url.search&&ALLOWED.has(url.href))return url.href;
  return null;
}
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:"reload"})))));
  // Never activate across an in-progress recording without an explicit user action.
});
self.addEventListener("message",event=>{
  if(event.data?.type==="CUTNOVA_ACTIVATE_UPDATE")self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("cutnova-shell-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const key=shellRequest(event.request);
  if(!key)return;
  // Network first so outdated HTML and scripts cannot remain stuck on an old
  // shell after deployment. Offline fallback uses the last known-good shell.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6500);
    try{
      const response=await fetch(event.request,{signal:controller.signal});
      if(response.ok){
        try{await cache.put(key,response.clone())}catch(_){}
      }
      return response;
    }catch(_){
      return (await cache.match(key))||Response.error();
    }finally{clearTimeout(timeout)}
  })());
});