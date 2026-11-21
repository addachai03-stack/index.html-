/* Installation UX and honest online/offline status. */
(function(){
  "use strict";
  const button=document.getElementById("pwa-install"),status=document.getElementById("pwa-status"),
    instructions=document.getElementById("pwa-instructions");
  if(!button||!status)return;
  let prompt=null,ready=false;
  const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  function update(){
    const connected=navigator.onLine!==false;
    status.textContent=(connected?"Online":"Offline")+" · "+(ready?"Offline app shell ready":"Offline app shell not verified")+
      (standalone()?" · Installed mode":"");
    instructions.textContent=connected?
      "iPhone: open in Safari → Share → Add to Home Screen. AI processing and GitHub downloads need internet.":
      "Use local video files or saved drafts. Online AI processing and GitHub history are unavailable offline.";
    button.hidden=standalone();
  }
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();prompt=event;button.textContent="INSTALL CUTNOVA";update()});
  window.addEventListener("appinstalled",()=>{prompt=null;update()});
  button.addEventListener("click",async()=>{
    if(prompt){
      const p=prompt;prompt=null;
      try{await p.prompt();await p.userChoice}catch(_){}
      update();
    }else{
      instructions.textContent="On iPhone, open this website in Safari, tap Share, then Add to Home Screen. On other browsers, check the browser menu for Install app.";
    }
  });
  ["online","offline","pageshow"].forEach(event=>window.addEventListener(event,update));
  if("serviceWorker" in navigator&&window.isSecureContext){
    navigator.serviceWorker.register("./sw.js",{scope:"./"}).then(reg=>{
      navigator.serviceWorker.ready.then(()=>{ready=!!navigator.serviceWorker.controller;update()});
      reg.addEventListener("updatefound",()=>{
        const worker=reg.installing;if(!worker)return;
        worker.addEventListener("statechange",()=>{
          if(worker.state==="installed"&&navigator.serviceWorker.controller)
            instructions.textContent="Update downloaded. Save your draft, close all CutNova tabs, and reopen to use it.";
        });
      });
    }).catch(()=>{ready=false;update()});
    navigator.serviceWorker.addEventListener("controllerchange",()=>{ready=!!navigator.serviceWorker.controller;update()});
  }
  update();
})();