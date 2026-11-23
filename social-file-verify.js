/* CutNova V5.2 — independently check user-selected converted MP4 locally.
 * No cloud upload, no conversion pretending, no transcode, no source-name
 * reporting, no persistence. A basic H264/mp4a MP4 match is NOT proof of AAC
 * object type, bit rate, sound audibility or Instagram acceptance.
 */
(function(root){
"use strict";
const MAX_BYTES=250*1024*1024;
function acceptedSize(file){
  return !!file&&Number.isFinite(file.size)&&file.size>=1024&&file.size<=MAX_BYTES;
}
function formatVerdict(info){
  const good=!!info&&info.container==="MP4"&&!info.incomplete&&
    Array.isArray(info.video)&&info.video.length>0&&
    info.video.every(v=>v==="avc1"||v==="avc3")&&
    Array.isArray(info.audio)&&info.audio.length>0&&
    info.audio.every(a=>a==="mp4a");
  return good?{
    code:"basic-match",text:"BASIC H.264 + MP4 AUDIO ENTRY MATCH. The selected file contains AVC video and mp4a audio sample entries. AAC object type, video playback, audio audibility and platform upload acceptance are NOT verified. This tool did not convert the file."
  }:{
    code:"not-recommended",text:"NOT A VERIFIED H.264 + MP4 AUDIO MATCH. Do not rely on the .mp4 filename or claim Instagram compatibility. Keep your original and use a trusted offline encoder if available."
  };
}
function validPortraitMetadata(v){
  const duration=Number(v?.duration),w=Number(v?.videoWidth),h=Number(v?.videoHeight);
  return Number.isFinite(duration)&&duration>=1&&duration<=65&&
    Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0&&
    Math.abs(w/h-9/16)<0.012;
}
if(typeof module!=="undefined"&&module.exports){
  module.exports={acceptedSize,formatVerdict,validPortraitMetadata,MAX_BYTES};
  return;
}
if(!root?.document)return;
const doc=root.document,by=id=>doc.getElementById(id);
const fileInput=by("social-file-input"),check=by("social-file-check"),
  playbackBtn=by("social-file-play"),status=by("social-file-status"),
  playbackStatus=by("social-file-play-status"),player=by("social-file-preview");
if(!fileInput||!check||!playbackBtn||!status||!playbackStatus||!player)return;
let objectURL="",revision=0,inspecting=false,playing=false;
function say(msg,code){
  status.textContent=msg;
  status.dataset.result=code;
}
function release(){
  revision++;
  try{player.pause();}catch{}
  player.removeAttribute("src");player.load();
  player.hidden=true;playbackBtn.disabled=true;
  if(objectURL){URL.revokeObjectURL(objectURL);objectURL="";}
  playbackStatus.textContent="PLAYBACK NOT VERIFIED. Select a local video and separately test it.";
}
fileInput.addEventListener("change",()=>{
  release();
  say("FORMAT NOT VERIFIED — tap CHECK CONVERTED FILE for actual MP4 sample entries.","not-tested");
  const file=fileInput.files?.[0];
  if(!file)return;
  if(!acceptedSize(file)){
    say("FILE REJECTED — local verification is limited to 1 KiB–250 MiB. No upload.","unverified");
    return;
  }
  if(!/^video\//i.test(file.type||"")&&!/\.(mp4|mov|m4v|webm)$/i.test(file.name||"")){
    say("CHOOSE A VIDEO FILE. No media was inspected.","unverified");
    return;
  }
  objectURL=URL.createObjectURL(file);
  player.src=objectURL;
  player.hidden=false;
  playbackBtn.disabled=false;
});
check.addEventListener("click",async()=>{
  if(inspecting)return;
  const file=fileInput.files?.[0],engine=root.CutNovaCodecAudit;
  if(!file||!objectURL||!acceptedSize(file)){
    say("SELECT A LOCAL VIDEO FILE FIRST. Nothing was inspected.","not-tested");
    return;
  }
  if(!engine||typeof engine.inspect!=="function"){
    say("LOCAL CODEC INSPECTOR UNAVAILABLE — reload CutNova; no format verified.","unverified");
    return;
  }
  inspecting=true;check.disabled=true;
  const localRevision=revision;
  say("Checking actual local MP4 video/audio sample entries; no upload…","inspecting");
  try{
    const info=await engine.inspect(file);
    if(localRevision!==revision)return;
    const result=formatVerdict(info);
    const codecLabel=typeof engine.label==="function"?engine.label(info):"inspected sample entries";
    say(result.text+" Local result: "+codecLabel+".",""+result.code);
  }catch(error){
    if(localRevision!==revision)return;
    say("LOCAL FORMAT INSPECTION FAILED — "+String(error?.message||"invalid media").slice(0,120)+". No verified codecs.","unverified");
  }finally{inspecting=false;check.disabled=false;}
});
function waitToAdvance(start,version){
  return new Promise((resolve,reject)=>{
    let finished=false;
    const timer=root.setTimeout(()=>done(Error("Video playback did not advance.")),9000);
    const poll=root.setInterval(()=>{
      if(version!==revision)return done(Error("Different file selected."));
      if(player.error)return done(Error("Browser decoder error."));
      if(Number(player.currentTime)-start>=.25)return done();
    },100);
    const onError=()=>done(Error("Local file decoder error."));
    function done(e){
      if(finished)return;finished=true;
      root.clearTimeout(timer);root.clearInterval(poll);
      player.removeEventListener("error",onError);
      e?reject(e):resolve();
    }
    player.addEventListener("error",onError);
  });
}
playbackBtn.addEventListener("click",async()=>{
  if(playing)return;
  if(!objectURL||!fileInput.files?.[0]){
    playbackStatus.textContent="NOT TESTED — choose a converted video from Files first.";
    return;
  }
  if(!validPortraitMetadata(player)){
    playbackStatus.textContent="PLAYBACK NOT VERIFIED — source must have decoded 9:16 video metadata with a finite duration of 1–65 seconds. Wait for preview metadata to load or try a supported file.";
    return;
  }
  playing=true;playbackBtn.disabled=true;
  const version=revision,start=Number(player.currentTime);
  playbackStatus.textContent="Testing real local playback after your tap…";
  // Deliberately call play in the direct click activation for Safari.
  const progress=waitToAdvance(start,version);
  try{
    await player.play();
    await progress;
    if(version!==revision)throw Error("Selected file changed.");
    playbackStatus.textContent="LOCAL PLAYBACK PASS — 9:16 metadata present and video frames advanced. Audio audibility and social upload NOT verified. This does not transcode the file.";
  }catch(error){
    try{await progress;}catch{}
    if(version===revision)
      playbackStatus.textContent="LOCAL PLAYBACK FAILED — "+String(error?.message||"Cannot play file").slice(0,150)+". This browser did not verify playback.";
  }finally{
    try{player.pause();}catch{}
    playing=false;playbackBtn.disabled=!objectURL;
  }
});
root.addEventListener("pagehide",release);
})(typeof window!=="undefined"?window:null);
