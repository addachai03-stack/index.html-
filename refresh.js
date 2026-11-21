/* Explicit user-initiated service-worker update; preserve IndexedDB drafts. */
(function(){
  "use strict";
  const button=document.getElementById("repair-button");
  const status=document.getElementById("repair-status");
  const returnToApp=()=>window.location.replace("./#studio");
  function say(message){status.textContent=message}
  function waitForInstalled(registration){
    return new Promise(resolve=>{
      if(registration.waiting){resolve(registration.waiting);return}
      let finished=false;
      const done=worker=>{if(finished)return;finished=true;clearTimeout(timer);resolve(worker)};
      const inspect=()=>{
        if(registration.waiting){done(registration.waiting);return}
        const worker=registration.installing;
        if(!worker)return;
        if(worker.state==="installed"){done(registration.waiting||worker);return}
        worker.addEventListener("statechange",()=>{
          if(worker.state==="installed")done(registration.waiting||worker);
          if(worker.state==="redundant")done(null);
        });
      };
      const timer=setTimeout(()=>done(null),12000);
      registration.addEventListener("updatefound",inspect);
      inspect();
    });
  }
  button.addEventListener("click",async()=>{
    button.disabled=true;say("Checking CutNova updates…");
    try{
      if(!navigator.onLine)throw Error("Internet connection is required.");
      if(!("serviceWorker" in navigator)){returnToApp();return}
      let registration=await navigator.serviceWorker.getRegistration("./");
      if(!registration)registration=await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
      const pending=waitForInstalled(registration);
      await registration.update();
      const worker=registration.waiting||await pending;
      if(worker){
        say("Applying the new app shell…");
        const changed=new Promise(resolve=>{
          const timer=setTimeout(()=>resolve(false),11000);
          navigator.serviceWorker.addEventListener("controllerchange",()=>{
            clearTimeout(timer);resolve(true);
          },{once:true});
        });
        worker.postMessage({type:"CUTNOVA_ACTIVATE_UPDATE"});
        const success=await changed;
        if(!success&&registration.waiting)throw Error("Update waiting. Close other CutNova tabs and retry.");
      }
      say("Updated! Opening CutNova V2.7.1…");
      returnToApp();
    }catch(error){
      say("Could not update: "+(error.message||"unknown browser error")+". Try again with internet.");
      button.disabled=false;
    }
  });
})();
