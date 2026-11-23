/* CutNova V5.0 — evidence-based iPhone readiness. Never claims recording,
 * playback or Files save from API support/metadata alone. This page runs only
 * on user interaction and collects no files, names, source URLs or uploads.
 */
(function(root){
"use strict";
const MAX_VIDEO=500*1024*1024;
function initialEvidence(){
  return {
    features:{status:"NOT TESTED",detail:"Feature detection not run."},
    source:{status:"NOT TESTED",detail:"No video source decoded during this check."},
    audio:{status:"NOT TESTED",detail:"No optional audio decoding attempted."},
    export:{status:"NOT TESTED",detail:"No completed local editor export observed in this tab."},
    playback:{status:"NOT TESTED",detail:"Use VERIFY EXPORTED VIDEO PLAYBACK after an actual export."},
    codec:{status:"NOT TESTED",detail:"Actual MP4 codec entries not inspected for this export."},
    files:{status:"NOT TESTED",detail:"Choose an exported file manually from iPhone Files; no automatic Files access."}
  };
}
function safeLine(x,max=180){
  return String(x??"").replace(/[\x00-\x1f\x7f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
}
function captureFeatures(browser){
  const rec=browser?.MediaRecorder,canvas=browser?.document?.createElement?.("canvas");
  const capture=typeof canvas?.captureStream==="function";
  const audio=!!(browser?.AudioContext||browser?.webkitAudioContext);
  let mime="";
  if(rec&&typeof rec.isTypeSupported==="function"){
    try{mime=[
      "video/mp4;codecs=avc1.424028,mp4a.40.2",
      "video/mp4;codecs=avc1.42001f,mp4a.40.2",
      "video/mp4","video/webm;codecs=vp8,opus","video/webm"
    ].find(t=>rec.isTypeSupported(t))||"";}catch{}
  }
  return {capture,audio,mime,supported:!!(capture&&audio&&mime)};
}
function buildReport(evidence){
  const rows=["CUTNOVA V5.0 / LOCAL DEVICE TEST REPORT",
    "Only this tab's explicitly run checks. No private video or file names.",
    "PASS means the specific step described, not full device/social compatibility.",
    ""];
  for(const [key,label] of Object.entries({
    features:"Browser APIs (declared support only)",
    source:"Selected source video: decoded frame",
    audio:"Optional audio: decoded locally",
    export:"Editor: completed export event",
    playback:"Export: actual 720x1280 video playback",
    codec:"Export: actual codec entries (basic check)",
    files:"Selected Files copy: byte match and playback"
  })){
    const item=evidence?.[key]||{};
    const status=["PASS","FAIL","NOT TESTED","RECORDED","UNVERIFIED","BASIC MATCH"].includes(item.status)?
      item.status:"UNVERIFIED";
    rows.push(label+": "+status);
    rows.push("  "+safeLine(item.detail,250));
  }
  rows.push("","No audio audibility, cloud upload, guaranteed MP4 compatibility or Files persistence is inferred.");
  return rows.join("\n");
}
if(typeof module!=="undefined"&&module.exports){
 module.exports={initialEvidence,safeLine,captureFeatures,buildReport};
 return;
}
if(!root?.document)return;
const doc=root.document,by=id=>doc.getElementById(id);
const run=by("qa-run"),copy=by("qa-copy"),output=by("qa-output"),
  sourceInput=by("quick-file"),editorInput=by("edit-file"),audioInput=by("audio-peaks-source"),
  summary=by("qa-summary"),prefill=by("qa-demo");
if(!run||!output||!summary)return;
let evidence=initialEvidence(),busy=false,current=0;
function mark(key,status,detail){
  evidence[key]={status,detail:safeLine(detail,250)};
  paint();
}
function paint(){
  output.replaceChildren();
  for(const [key,label] of Object.entries({
    features:"Browser APIs",source:"Source video",audio:"Audio decode",
    export:"Actual editor export",playback:"Export playback",codec:"Encoded format",
    files:"Saved Files copy"
  })){
    const entry=evidence[key],row=doc.createElement("div"),name=doc.createElement("strong"),
      state=doc.createElement("span"),note=doc.createElement("small");
    row.className="qa-row";
    name.textContent=label;state.textContent=entry.status;state.className="qa-state";
    note.textContent=entry.detail;
    row.append(name,state,note);output.append(row);
  }
}
function awaitMedia(element,event,signal,timeout=10000){
 return new Promise((resolve,reject)=>{
   if(signal?.aborted)return reject(Error("Cancelled."));
   let done=false;
   const timer=root.setTimeout(()=>end(Error(event+" timeout")),timeout);
   function end(error){
     if(done)return;done=true;root.clearTimeout(timer);
     element.removeEventListener(event,good);element.removeEventListener("error",bad);
     signal?.removeEventListener("abort",cancel);
     error?reject(error):resolve();
   }
   function good(){end()}
   function bad(){end(Error("Local video decode failed"))}
   function cancel(){end(Error("Cancelled."))}
   element.addEventListener(event,good,{once:true});
   element.addEventListener("error",bad,{once:true});
   signal?.addEventListener("abort",cancel,{once:true});
 });
}
async function checkSource(file,signal){
  if(!file)return {status:"NOT TESTED",detail:"Choose a video in the AI tab or Editor first."};
  if(!/^video\//i.test(file.type||"")&&!/\.(mp4|mov|m4v|webm)$/i.test(file.name||""))
    return {status:"FAIL",detail:"Selected item is not a supported video file."};
  if(file.size<1024||file.size>MAX_VIDEO)
    return {status:"FAIL",detail:"Selected file outside 1 KiB–500 MB local limit."};
  const video=doc.createElement("video"),canvas=doc.createElement("canvas"),
    url=URL.createObjectURL(file);
  canvas.width=32;canvas.height=18;
  video.muted=true;video.playsInline=true;video.preload="auto";
  try{
    const ready=awaitMedia(video,"loadedmetadata",signal,16000);
    video.src=url;video.load();await ready;
    const seconds=Number(video.duration);
    if(!Number.isFinite(seconds)||seconds<1)
      throw Error("Video duration is missing or invalid.");
    const target=Math.max(.1,Math.min(1,seconds-.1));
    if(Math.abs(video.currentTime-target)>.05){
      const seek=awaitMedia(video,"seeked",signal,10000);
      video.currentTime=target;await seek;
    }
    if(video.readyState<2)await awaitMedia(video,"loadeddata",signal,10000);
    if(!video.videoWidth||!video.videoHeight)throw Error("No decoded picture dimensions.");
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw Error("Canvas unavailable.");
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const bytes=ctx.getImageData(0,0,1,1).data;
    if(bytes.length!==4)throw Error("No readable decoded frame.");
    return {status:"PASS",detail:"Decoded one frame locally. "+video.videoWidth+"×"+video.videoHeight+
      ", duration "+seconds.toFixed(1)+"s. Full file export is not verified."};
  }catch(e){
    return {status:"FAIL",detail:"Source frame check failed: "+safeLine(e?.message||"Unknown decode issue",160)};
  }finally{
    video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(url);
  }
}
async function checkAudio(file,videoFile,ctx,signal){
  if(!file)return {status:"NOT TESTED",detail:"No audio file selected; audio within video not separately verified."};
  if(!ctx)return {status:"FAIL",detail:"Web Audio API unavailable."};
  if(file.size>20*1024*1024||file.size<1024)
    return {status:"NOT TESTED",detail:"Selected file outside 1 KiB–20 MB audio test limit."};
  if(file===videoFile&&!/^video\//i.test(file.type||"")&&!/\.(mp4|mov|m4v|webm)$/i.test(file.name||""))
    return {status:"FAIL",detail:"Invalid video container for audio decode."};
  try{
    const bytes=await file.arrayBuffer();
    if(signal.aborted)throw Error("Cancelled");
    const decoded=await ctx.decodeAudioData(bytes);
    if(signal.aborted)throw Error("Cancelled");
    if(!Number.isFinite(decoded.duration)||decoded.duration<.5||!decoded.numberOfChannels)
      throw Error("Decoded audio has no usable duration/channels.");
    return {status:"PASS",detail:"Audio decoded locally: "+decoded.numberOfChannels+
      " channel(s), "+decoded.duration.toFixed(1)+"s. Audibility not verified."};
  }catch(e){return {status:"FAIL",detail:"Audio decoding failed or unsupported: "+safeLine(e?.message||"error",160)};}
}
run.addEventListener("click",async()=>{
  if(busy)return;
  const version=++current,browser=captureFeatures(root);
  // AudioContext must be created synchronously with the user gesture on iOS.
  const ctor=root.AudioContext||root.webkitAudioContext;
  let ctx=null;
  if(ctor){try{ctx=new ctor();}catch{}}
  busy=true;run.disabled=true;
  summary.textContent="Checking browser capabilities and local media; no upload…";
  mark("features",browser.supported?"PASS":"FAIL",
    "Declared only: canvas capture "+(browser.capture?"yes":"no")+
    "; Web Audio "+(browser.audio?"yes":"no")+
    "; MediaRecorder format "+(browser.mime||"none")+
    ". Does NOT prove that the recorder produces playable media.");
  const signal=new AbortController().signal;
  try{
    const videoFile=sourceInput?.files?.[0]||editorInput?.files?.[0]||null;
    const result=await checkSource(videoFile,signal);
    if(version!==current)return;
    mark("source",result.status,result.detail);
    // Only attempt user-selected audio file, or small source video. Skip files
    // over 20 MB to avoid huge WebAudio decoding allocations on iPhone.
    const audio=audioInput?.files?.[0]||videoFile;
    const sound=await checkAudio(audio,videoFile,ctx,signal);
    if(version!==current)return;
    mark("audio",sound.status,sound.detail);
    summary.textContent="Local checks completed. To prove export, use PREPARE FULL EXPORT TEST VIDEO or your own media, then EXPORT SHORT, VERIFY PLAYBACK and VERIFY SAVED FILE.";
  }catch(e){summary.textContent="Device check interrupted: "+safeLine(e?.message||"error",160);}
  finally{
    if(ctx){try{await ctx.close()}catch{}}
    busy=false;run.disabled=false;
  }
});
if(prefill)prefill.addEventListener("click",()=>{
  const target=by("edit-prepare-test");
  target?.scrollIntoView({behavior:"smooth",block:"center"});
  summary.textContent="Use PREPARE FULL EXPORT TEST VIDEO, then manually confirm rights and tap EXPORT SHORT. The app will record real results here.";
});
copy?.addEventListener("click",async()=>{
  const content=buildReport(evidence);
  try{
    if(!root.navigator?.clipboard?.writeText)throw Error("Clipboard unavailable");
    await root.navigator.clipboard.writeText(content);
    summary.textContent="Device evidence report copied. No video, file name, token or local media was included.";
  }catch{
    summary.textContent="Clipboard unavailable. Read the checklist here or use iPhone screenshot. Nothing uploaded.";
  }
});
root.addEventListener("cutnova:export-reset",()=>{
  mark("export","NOT TESTED","Current editor export was cleared.");
  mark("playback","NOT TESTED","No current exported video playback check.");
  mark("codec","NOT TESTED","No current exported codec inspection.");
  mark("files","NOT TESTED","No current export/file round-trip check.");
});
root.addEventListener("cutnova:export-ready",e=>{
  const blob=e.detail?.blob;
  if(!(blob instanceof Blob)||blob.size<1024){
    mark("export","FAIL","Editor event did not contain a valid non-empty Blob.");return;
  }
  mark("export","RECORDED","Actual editor recorder produced "+(blob.size/1024).toFixed(0)+
    " KiB "+safeLine(blob.type,60)+" in this tab. Playback and Files copy not yet verified.");
});
root.addEventListener("cutnova:playback-check",e=>{
  mark("playback",e.detail?.ok===true?"PASS":"FAIL",
    safeLine(e.detail?.message||"No playback proof.",220));
});
root.addEventListener("cutnova:codec-check",e=>{
  const code=String(e.detail?.code||"unverified");
  mark("codec",code==="basic-match"?"BASIC MATCH":code==="not-recommended"?"FAIL":"UNVERIFIED",
    safeLine(e.detail?.message||"Inspect the video format panel for details.",220));
});
root.addEventListener("cutnova:saved-file-check",e=>{
  mark("files",e.detail?.ok===true?"PASS":"FAIL",
    safeLine(e.detail?.message||"The manually selected saved file was not verified.",220));
});
paint();
})(typeof window!=="undefined"?window:null);
