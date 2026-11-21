/* Cache only the versioned public app shell, never user video, audio,
   GitHub API responses, uploads, credentials or external pages. */
const CACHE="cutnova-shell-v2.4";
const ROOT=new URL("./",self.location.href);
const SHELL=["./","./index.html","./styles.css","./app.js","./jobs.js","./editor.js","./pwa.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png"].map(p=>new URL(p,ROOT).href);
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
  // Do not force activation or reload while an editor may be recording.
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("cutnova-shell-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const key=shellRequest(event.request);
  if(!key)return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(key);
    if(hit)return hit;
    return fetch(event.request);
  }));
});