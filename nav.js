/* CutNova v2.6 mobile navigation. Input elements stay mounted while switching screens. */
(function(){
  "use strict";
  const nav=document.getElementById("mobile-nav"),shell=document.querySelector(".app-shell");
  if(!nav||!shell)return;
  const screens=new Set(["home","ai","editor","projects","results"]);
  const routes={home:"#home",ai:"#studio",editor:"#local-editor",projects:"#projects",results:"#render-history"};
  const views=Array.from(document.querySelectorAll("[data-mobile-screen]"));
  const drafts=document.getElementById("project-manager");
  const workspace=document.querySelector(".editor-workspace");
  const quick=document.getElementById("mobile-edit-actions");
  const preview=document.getElementById("edit-play"),exportBtn=document.getElementById("edit-export"),cancel=document.getElementById("edit-cancel");
  const navMessage=document.getElementById("mobile-nav-message");
  const isMobile=window.matchMedia("(max-width: 800px)");
  const quickPreview=document.getElementById("mobile-preview"),quickExport=document.getElementById("mobile-export");
  let current=null;
  function route(){
    const hash=location.hash.toLowerCase();
    if(hash==="#local-editor"||hash==="#editor")return "editor";
    if(hash==="#studio"||hash==="#ai")return "ai";
    if(hash==="#render-history"||hash==="#results")return "results";
    if(hash==="#projects"||hash==="#project-manager")return "projects";
    return "home";
  }
  function message(value){navMessage.textContent=value}
  function syncQuick(){
    if(!quick)return;
    const editing=isMobile.matches&&current==="editor";
    quick.hidden=!editing;
    if(!editing)return;
    quickPreview.disabled=preview.disabled;
    quickExport.disabled=false;
    quickExport.textContent=!cancel.disabled?"CANCEL EXPORT":exportBtn.disabled?"EXPORT SHORT":"EXPORT SHORT ✓";
  }
  function activate(next,resetScroll=true){
    if(!screens.has(next))next="home";
    if(isMobile.matches&&current!==next&&!cancel.disabled){
      message("Export in progress. Cancel or finish export before switching tabs.");
      if(location.hash!==routes[current||"editor"])history.replaceState(null,"",routes[current||"editor"]);
      return;
    }
    current=next;
    const mobile=isMobile.matches;
    for(const view of views){
      const allowed=view.dataset.mobileScreen.split(/\s+/).includes(next);
      view.hidden=mobile&&!allowed;
    }
    if(drafts)drafts.hidden=mobile&&next!=="projects";
    if(workspace)workspace.hidden=mobile&&next==="projects";
    for(const button of nav.querySelectorAll("[data-nav]")){
      const active=button.dataset.nav===next;
      button.classList.toggle("active",active);
      if(active)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");
    }
    shell.dataset.activeTab=next;
    syncQuick();
    if(mobile&&resetScroll)window.scrollTo({top:0,behavior:"instant"});
    message(next.toUpperCase()+" tab");
  }
  function onNavigate(next){
    if(!screens.has(next))return;
    if(isMobile.matches&&!cancel.disabled)return message("Finish or cancel the export first.");
    if(location.hash===routes[next])activate(next,true);
    else location.hash=routes[next];
  }
  nav.querySelectorAll("[data-nav]").forEach(button=>button.addEventListener("click",()=>onNavigate(button.dataset.nav)));
  window.addEventListener("hashchange",()=>activate(route(),true));
  if(typeof isMobile.addEventListener==="function")isMobile.addEventListener("change",()=>activate(route(),false));
  else isMobile.addListener(()=>activate(route(),false));
  // Resume completes asynchronously; take the user to the actual editor.
  window.addEventListener("cutnova:draft-loaded",()=>onNavigate("editor"));
  function pointTo(target){
    onNavigate("editor");
    requestAnimationFrame(()=>target?.scrollIntoView({block:"center",behavior:"smooth"}));
  }
  quickPreview?.addEventListener("click",()=>{
    if(!preview.disabled)preview.click();
    else pointTo(document.getElementById("edit-file"));
  });
  quickExport?.addEventListener("click",()=>{
    if(!cancel.disabled){cancel.click();return}
    if(!exportBtn.disabled){exportBtn.click();return}
    pointTo(document.getElementById("edit-rights").checked?document.getElementById("edit-file"):document.getElementById("edit-rights"));
  });
  if(preview&&exportBtn&&cancel){
    const observer=new MutationObserver(syncQuick);
    [preview,exportBtn,cancel].forEach(element=>observer.observe(element,{attributes:true,attributeFilter:["disabled"]}));
  }
  activate(route(),false);
})();