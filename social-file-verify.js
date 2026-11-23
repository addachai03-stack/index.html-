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
  playbackBtn=by("social-file-play"),audioBtn=by("social-file-audio"),audioStatus=by("social-file-audio-status"),audioHeard=by("social-file-audio-heard"),audioSilent=by("social-file-audio-silent"),reportBtn=by("social-file-report"),reportStatus=by("social-file-report-status"),reportDownload=by("social-file-report-download"),status=by("social-file-status"),playbackStatus=by("social-file-play-status"),player=by("social-file-preview");
if(!fileInput||!check||!playbackBtn||!audioBtn||!audioStatus||!audioHeard||!audioSilent||!reportBtn||!reportStatus||!reportDownload||!status||!playbackStatus||!player)return;
let objectURL="",revision=0,inspecting=false,playing=false,audioTesting=false;
function say(msg,code){
  status.textContent=msg;
  status.dataset.result=code;
}
function release(){
  revision++;
  try{player.pause();}catch{}
  player.removeAttribute("src");player.load();
  player.hidden=true;playbackBtn.disabled=true;audioBtn.disabled=true;audioHeard.disabled=true;audioSilent.disabled=true;reportBtn.disabled=true;reportDownload.hidden=true;audioStatus.textContent="AUDIO NOT TESTED. Select a local video and play the audio check.";audioStatus.dataset.result="not-tested";
  if(objectURL){URL.revokeObjectURL(objectURL);objectURL="";}
  playbackStatus.textContent="PLAYBACK NOT VERIFIED. Select a local video and separately test it.";playbackStatus.dataset.result="not-tested";
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
  playbackBtn.disabled=false;audioBtn.disabled=false;reportBtn.disabled=false;
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
    playbackStatus.textContent="LOCAL PLAYBACK PASS — 9:16 metadata present and video frames advanced. Audio audibility and social upload NOT verified. This does not transcode the file.";playbackStatus.dataset.result="pass";
  }catch(error){
    try{await progress;}catch{}
    if(version===revision)
      playbackStatus.textContent="LOCAL PLAYBACK FAILED — "+String(error?.message||"Cannot play file").slice(0,150)+". This browser did not verify playback.";playbackStatus.dataset.result="failed";
  }finally{
    try{player.pause();}catch{}
    playing=false;playbackBtn.disabled=!objectURL;
  }
});

audioBtn.addEventListener("click",async()=>{
  if(audioTesting)return;
  if(!objectURL||!fileInput.files?.[0]){audioStatus.textContent="NOT TESTED — select a video from Files first.";audioStatus.dataset.result="not-tested";return;}
  audioTesting=true;audioBtn.disabled=true;audioHeard.disabled=true;audioSilent.disabled=true;
  const version=revision,priorMuted=player.muted,priorVolume=player.volume,start=Number(player.currentTime);
  player.muted=false;player.volume=1;
  audioStatus.textContent="PLAYING LOCAL VIDEO WITH AUDIO ENABLED. Listen on this device; this page cannot detect audible sound.";
  const progress=waitToAdvance(start,version);
  try{
    await player.play();await progress;
    if(version!==revision)throw Error("Selected file changed.");
    audioStatus.textContent="PLAYBACK ADVANCED WITH AUDIO ENABLED. Did you actually hear sound? Confirm below; this is your manual observation.";
    audioStatus.dataset.result="needs-user-confirmation";audioHeard.disabled=false;audioSilent.disabled=false;
  }catch(error){
    try{await progress}catch{}
    if(version===revision){audioStatus.textContent="AUDIO PLAYBACK TEST FAILED — "+String(error?.message||"video did not play").slice(0,120)+". Sound is not verified.";audioStatus.dataset.result="failed";}
  }finally{try{player.pause()}catch{}player.muted=priorMuted;player.volume=priorVolume;audioTesting=false;audioBtn.disabled=!objectURL;}
});
function setAudioConfirmation(heard){
  if(!objectURL||audioStatus.dataset.result!=="needs-user-confirmation")return;
  audioStatus.dataset.result=heard?"user-heard":"user-no-sound";
  audioStatus.textContent=heard?"USER CONFIRMED: you heard sound on this device during the local check. This is a manual listening result, not automated AAC or platform validation.":"USER CONFIRMED: you did not hear sound. Check the file, device volume and output route before sharing.";
  audioHeard.disabled=true;audioSilent.disabled=true;
}
audioHeard.addEventListener("click",()=>setAudioConfirmation(true));
audioSilent.addEventListener("click",()=>setAudioConfirmation(false));

reportBtn.addEventListener("click",()=>{
  const file=fileInput.files?.[0];
  if(!file||!objectURL){reportStatus.textContent="Select a local video first. No report created.";return;}
  const metadata=validPortraitMetadata(player);
  const format=status.dataset.result==="basic-match";
  const playback=playbackStatus.dataset.result==="pass";
  const heard=audioStatus.dataset.result==="user-heard";
  const noSound=audioStatus.dataset.result==="user-no-sound";
  const rows=[
    "CUTNOVA — LOCAL SHARE PREPARATION CHECKLIST",
    "Generated locally: "+new Date().toISOString(),
    "Privacy: this report contains no filename or file path. Video was not uploaded.",
    "",
    "FILE TECHNICAL CHECKS",
    "File selected: YES (name omitted)",
    "File size: "+(Number(file.size)/1048576).toFixed(2)+" MiB",
    "Portrait 9:16 and 1–65 seconds metadata: "+(metadata?"PASS":"NOT VERIFIED"),
    "Basic AVC + mp4a sample-entry match: "+(format?"PASS (basic match only)":"NOT VERIFIED"),
    "Browser playback advanced: "+(playback?"PASS":"NOT VERIFIED"),
    "Audio manually heard by user: "+(heard?"USER CONFIRMED":noSound?"USER REPORTED NO SOUND":"NOT CONFIRMED"),
    "",
    "BEFORE SHARING — USER REVIEW",
    "[ ] I watched the entire exported clip and checked start/end cuts.",
    "[ ] I checked captions, spelling, crop and orientation.",
    "[ ] I confirmed I have permission/rights to publish this media.",
    "[ ] I checked the destination app's current upload requirements.",
    "[ ] I chose and reviewed the final export file in Files.",
    "",
    "LIMIT: This is a local checklist, not a transcode, upload, social-platform acceptance test or guarantee. H.264/MP4A sample entries do not prove AAC profile/bitrate or actual platform compatibility."
  ];
  const blob=new Blob([rows.join("\\n")],{type:"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  if(reportDownload.dataset.url)URL.revokeObjectURL(reportDownload.dataset.url);
  reportDownload.href=url;reportDownload.dataset.url=url;reportDownload.hidden=false;
  reportStatus.textContent="LOCAL CHECKLIST CREATED. Tap Save checklist report; review remaining boxes yourself. No video was uploaded.";
  reportStatus.dataset.result="created";
});


root.addEventListener("pagehide",()=>{release();if(reportDownload.dataset.url)URL.revokeObjectURL(reportDownload.dataset.url);});
})(typeof window!=="undefined"?window:null);
