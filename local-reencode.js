/* CutNova V4.4 — optional second-pass LOCAL re-encode of an exported Short.
 * Browser MediaRecorder is the encoder; no wasm download, network upload,
 * GitHub/Cloudflare request, hidden processing or social upload.
 * Strict H.264/AAC must be supported and then separately verified by the
 * existing real MP4 sample-description inspector after user-triggered export.
 */
(function(root){
  "use strict";
  const H264AAC=[
    "video/mp4;codecs=avc1.42001f,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.424028,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2"
  ];
  function strictSupported(w){
    if(!w?.MediaRecorder||typeof w.MediaRecorder.isTypeSupported!=="function")return false;
    try{return H264AAC.some(type=>w.MediaRecorder.isTypeSupported(type))}catch{return false}
  }
  function allowableLocalSource(blob,cap=150*1024*1024){
    return !!blob&&blob instanceof Blob&&blob.size>=1024&&blob.size<=cap;
  }
  function fileNameFor(blob){
    return "CutNova_Private_Reencode_Source."+(blob.type.includes("webm")?"webm":"mp4");
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={strictSupported,allowableLocalSource,fileNameFor};
    return;
  }
  const button=document.getElementById("edit-reencode-local");
  const status=document.getElementById("edit-reencode-status");
  const output=document.getElementById("edit-output");
  if(!button||!status||!output)return;
  let original=null,busy=false,revision=0;
  const say=x=>{status.textContent=x};
  function refresh(){
    const supported=strictSupported(root);
    button.disabled=busy||!supported||!allowableLocalSource(original);
    if(!supported){
      say("UNSUPPORTED ON THIS BROWSER — native H.264/AAC recording is unavailable. No on-device conversion was performed. Private files are never sent to GitHub.");
      return;
    }
    if(!allowableLocalSource(original)){
      say("Export a Short first (up to 150 MiB), then choose this option to prepare a private H.264/AAC second-pass recording.");
      return;
    }
    say("READY — Use this to reopen the exported Short in the editor, then confirm rights and tap EXPORT SHORT with strict H.264/AAC selected. Re-recording is real-time and may reduce quality.");
  }
  root.addEventListener("cutnova:export-reset",()=>{
    original=null;revision++;refresh();
  });
  root.addEventListener("cutnova:export-ready",event=>{
    const blob=event.detail?.blob;
    original=allowableLocalSource(blob)?blob:null;
    revision++;refresh();
  });
  root.addEventListener("cutnova:reencode-ready",event=>{
    if(!event.detail?.strictSocial)return;
    say("PRIVATE SOURCE LOADED ✓ — H.264/AAC strict recording selected. Confirm rights (unchecked), tap EXPORT SHORT, and verify the actual codec result. This has not converted the video yet.");
  });
  button.addEventListener("click",async()=>{
    if(busy||!strictSupported(root)||!allowableLocalSource(original)){
      refresh();return;
    }
    const source=original,version=revision;
    busy=true;button.disabled=true;
    say("Preparing local exported video for strict re-recording. No upload or automatic export…");
    try{
      if(output.readyState<1||!Number.isFinite(output.duration)){
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>finish(Error("Exported video duration unavailable")),8000);
          function finish(err){clearTimeout(timeout);output.removeEventListener("loadedmetadata",good);output.removeEventListener("error",bad);err?reject(err):resolve();}
          function good(){finish()}
          function bad(){finish(Error("Exported video cannot be decoded by this browser"))}
          output.addEventListener("loadedmetadata",good);
          output.addEventListener("error",bad);
          output.load();
        });
      }
      if(version!==revision)throw Error("Export changed; retry with the newest video");
      const seconds=Number(output.duration);
      if(!Number.isFinite(seconds)||seconds<1||seconds>65)
        throw Error("Export duration must be between 1 and 65 seconds");
      // User explicitly clicked to enter the editor: rights remain unchecked
      // and the actual recording never starts without another user click.
      const file=new root.File([source],fileNameFor(source),{type:source.type});
      const details={file,start:0,end:Math.min(60,seconds),strictSocial:true,reencode:true};
      root.dispatchEvent(new CustomEvent("cutnova:open-cut",{detail:details}));
      // open-cut may invoke confirm to prevent overwriting unsaved changes.
      // A confirmed load triggers cutnova:reencode-ready from editor metadata.
      if(revision===version)
        say("Requested local editor import. If prompted, confirm replacing unsaved edits. Then confirm rights and tap EXPORT SHORT. No conversion has run yet.");
    }catch(error){
      say("LOCAL RE-ENCODE NOT PREPARED — "+String(error?.message||"Browser could not open this media").slice(0,175)+". Original export remains available unless you explicitly replaced it.");
    }finally{
      busy=false;
      button.disabled=!strictSupported(root)||!allowableLocalSource(original);
    }
  });
  refresh();
})(typeof window!=="undefined"?window:null);
