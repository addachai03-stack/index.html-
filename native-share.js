/* CutNova V4.0 — user-initiated iPhone Share Sheet for the exact current export.
 * No background share, auto-save, storage, analytics, or upload. The user chooses
 * Save to Files or a third-party share target using the OS's own UI.
 */
(function(root){
  "use strict";
  function exportFile(blob,filename,FileType=File){
    if(!(blob instanceof Blob)||blob.size<1024)throw Error("No valid exported video");
    if(!/\.((mp4)|(webm))$/i.test(filename))throw Error("Unknown output file type");
    return new FileType([blob],filename,{type:blob.type||(/\.mp4$/i.test(filename)?"video/mp4":"video/webm")});
  }
  function supportsShare(navigatorObject,file){
    if(!navigatorObject||typeof navigatorObject.share!=="function"||typeof navigatorObject.canShare!=="function")return false;
    try{return !!navigatorObject.canShare({files:[file]})}catch(_){return false}
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={exportFile,supportsShare};
    return;
  }
  const button=document.getElementById("edit-share-file");
  const status=document.getElementById("edit-share-status");
  const fallback=document.getElementById("edit-download");
  if(!button||!status||!fallback)return;
  let blob=null,busy=false,revision=0;
  function say(message){status.textContent=message}
  function reset(){
    revision++;
    blob=null;
    button.disabled=true;
    say("Share is available after exporting a Short. The iPhone Share Sheet requires your tap.");
  }
  root.addEventListener("cutnova:export-reset",reset);
  root.addEventListener("cutnova:export-ready",event=>{
    revision++;
    const next=event.detail?.blob;
    blob=next instanceof Blob&&next.size>=1024?next:null;
    button.disabled=!blob;
    say(blob
      ?"Export ready. Tap SHARE / SAVE TO FILES, then choose Save to Files in the iPhone Share Sheet. This does not automatically save or upload anything."
      :"No valid exported video available to share.");
  });
  button.addEventListener("click",async()=>{
    if(busy)return;
    const current=blob;
    const href=fallback.getAttribute("href")||"";
    if(!current||!href.startsWith("blob:")){
      say("NO CURRENT EXPORT — export a Short first, then try Share or DOWNLOAD SHORT.");
      return;
    }
    let file;
    try{file=exportFile(current,fallback.download||"CutNova_Manual_Short.mp4",root.File)}
    catch(e){say("Cannot prepare file for native sharing: "+(e.message||e));return}
    if(!supportsShare(root.navigator,file)){
      say("NATIVE FILE SHARE UNAVAILABLE in this browser. Tap DOWNLOAD SHORT instead; if a preview opens use Share → Save to Files. No file was shared.");
      return;
    }
    const version=revision;
    busy=true;button.disabled=true;
    say("Opening iPhone Share Sheet. Choose Save to Files yourself; do not select another app unless you want to share with it.");
    try{
      // navigator.share MUST execute directly within this user-click activation.
      // No promises, uploads or clipboard operations before this call.
      await root.navigator.share({files:[file]});
      if(version===revision)say("SHARE SHEET CLOSED ✓ — the browser handed the video to the system sheet. CutNova cannot confirm which destination you selected or whether Files saved it. Select the saved file below to verify.");
    }catch(e){
      if(version!==revision)return;
      if(e?.name==="AbortError")say("SHARING CANCELLED — no Files save confirmed. Use SHARE / SAVE TO FILES again or DOWNLOAD SHORT.");
      else say("NATIVE SHARE FAILED — "+String(e?.message||"iPhone refused file sharing").slice(0,170)+". Use DOWNLOAD SHORT instead.");
    }finally{
      busy=false;
      button.disabled=!blob;
    }
  });
})(typeof window!=="undefined"?window:null);
