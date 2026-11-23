/* Private device-only recording probe.
 * Draws generated pixels and a quiet, original sine tone; never reads the
 * user's video, credentials, local drafts or network. Clears media after test.
 */
(function(root){
  "use strict";
  // Mirror all explicit H.264/AAC requests used by the actual editor.
  // Browsers may still output different codecs: inspect the RECORDED bytes.
  const TYPES=[
    "video/mp4;codecs=avc1.42001f,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.424028,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4","video/webm;codecs=vp8,opus","video/webm"
  ];
  function probeDecision(info,requestedMime){
    const basic=!!info&&info.container==="MP4"&&!info.incomplete&&
      Array.isArray(info.video)&&info.video.length>0&&
      info.video.every(t=>["avc1","avc3"].includes(t))&&
      Array.isArray(info.audio)&&info.audio.length>0&&
      info.audio.every(t=>t==="mp4a");
    const explicit=/^video\/mp4;codecs=avc1(?:\.[^,]+)?,mp4a\.40\.2$/i.test(String(requestedMime||""));
    const nonstandard=!!info&&(
      info.container==="WebM"||info.container==="unknown"||
      Array.isArray(info.video)&&info.video.some(t=>["vp09","vp08","av01","encv","hvc1","hev1"].includes(t))||
      Array.isArray(info.audio)&&info.audio.some(t=>["Opus","opus","ac-3","ec-3","enca"].includes(t))
    );
    return {code:basic?"basic-match":nonstandard?"not-recommended":"unverified",
      canEnableStrict:basic&&explicit,explicitRequest:explicit};
  }
  function capabilities(win){
    const canvas=win.document?.createElement?.("canvas");
    const recorder=win.MediaRecorder;
    const audio=win.AudioContext||win.webkitAudioContext;
    let drawing=false;
    try{drawing=!!canvas?.getContext?.("2d")}catch(_){}
    let mime="";
    if(recorder&&typeof recorder.isTypeSupported==="function"){
      try{mime=TYPES.find(t=>recorder.isTypeSupported(t))||""}catch(_){}
    }
    const capture=typeof canvas?.captureStream==="function";
    return {drawing,capture,recorder:typeof recorder==="function",audio:typeof audio==="function",mime,
      supported:!!(drawing&&capture&&recorder&&mime&&audio)};
  }
  function unsupportedReason(c){
    if(!c.drawing)return "Canvas drawing is not available in this browser.";
    if(!c.capture)return "Canvas.captureStream is unavailable. This Safari/browser cannot use the current local export engine.";
    if(!c.recorder)return "MediaRecorder is unavailable on this browser.";
    if(!c.mime)return "No MP4/WebM recording codec supported by CutNova was found.";
    if(!c.audio)return "Web Audio is unavailable; local video+audio export requires it.";
    return "";
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={capabilities,unsupportedReason,probeDecision};
    return;
  }
  const button=document.getElementById("edit-check-export");
  const status=document.getElementById("edit-check-status");
  const fallback=document.getElementById("edit-export-fallback");
  const codecStatus=document.getElementById("edit-check-codec");
  const strictAction=document.getElementById("edit-check-use-strict");
  const strictToggle=document.getElementById("edit-require-h264");
  const printCodec=(code,text)=>{
    if(!codecStatus)return;
    codecStatus.dataset.result=code;
    codecStatus.textContent=text;
  };
  const resetProbe=()=>{
    if(strictAction){strictAction.hidden=true;strictAction.disabled=true;}
    printCodec("unverified","NOT TESTED — supported MediaRecorder MIME does NOT prove H.264/AAC. Tap the 1-second recording test to inspect the actual sample.");
  };
  resetProbe();
  strictAction?.addEventListener("click",()=>{
    if(strictAction.disabled||!strictToggle)return;
    // An explicit owner action merely chooses strict mode; it never exports.
    strictToggle.checked=true;
    strictToggle.dispatchEvent(new Event("change",{bubbles:true}));
    strictToggle.scrollIntoView({block:"center",behavior:"smooth"});
    status.textContent="STRICT H.264/AAC REQUEST SELECTED. Confirm editing rights, then export the original video manually. Verify that export's actual codecs separately; the 1-second probe is not a guarantee.";
  });
  if(!button||!status)return;
  const c=capabilities(root);
  status.textContent=c.supported
    ?"This browser reports "+(c.mime.startsWith("video/mp4")?"MP4":"WebM")+" recording support. Tap TEST to try an actual 1-second local recording (no uploads)."
    :"Local export check: "+unsupportedReason(c)+" Preview and draft editing may still work.";
  if(fallback)fallback.hidden=c.supported;
  let busy=false;
  button.addEventListener("click",async()=>{
    if(busy)return;
    const features=capabilities(root);
    if(!features.supported){
      status.textContent="UNSUPPORTED — "+unsupportedReason(features)+" Use the AI tab only for videos you may edit and that have a publicly downloadable HTTPS URL; iPhone files are not automatically uploaded.";
      if(fallback)fallback.hidden=false;
      return;
    }
    busy=true;button.disabled=true;resetProbe();
    status.textContent="RECORDING 1-SECOND LOCAL TEST… Uses generated video/audio, not your files.";
    let stream,ctx,osc,gain,mediaRecorder=null,drawTimer=null,stopTimer=null;
    try{
      const canvas=document.createElement("canvas");canvas.width=180;canvas.height=320;
      const pen=canvas.getContext("2d",{alpha:false});
      if(!pen)throw Error("Canvas drawing could not start");
      let n=0;
      const draw=()=>{
        pen.fillStyle=n%2?"#283e4f":"#1c2d37";pen.fillRect(0,0,180,320);
        pen.fillStyle="#c9f65d";pen.fillRect((n*11)%145,120,35,80);
        n++;
      };
      draw();
      // Run only from the user's direct click, respecting iOS audio policies.
      const AudioContextCtor=root.AudioContext||root.webkitAudioContext;
      ctx=new AudioContextCtor();
      const dest=ctx.createMediaStreamDestination();
      gain=ctx.createGain();gain.gain.value=0.03;
      osc=ctx.createOscillator();osc.frequency.value=330;
      osc.connect(gain);gain.connect(dest);
      stream=canvas.captureStream(15);
      for(const track of dest.stream.getAudioTracks())stream.addTrack(track.clone());
      if(!stream.getVideoTracks().length||!stream.getAudioTracks().length)
        throw Error("Audio/video tracks could not be captured");
      mediaRecorder=new root.MediaRecorder(stream,{mimeType:features.mime,videoBitsPerSecond:350000,audioBitsPerSecond:48000});
      const chunks=[];
      const recording=new Promise((resolve,reject)=>{
        const deadline=setTimeout(()=>reject(Error("Device recorder did not finish within 6 seconds")),6000);
        mediaRecorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
        mediaRecorder.onerror=()=>{clearTimeout(deadline);reject(Error("Device MediaRecorder signaled an error"))};
        mediaRecorder.onstop=()=>{
          clearTimeout(deadline);
          const blob=new Blob(chunks,{type:mediaRecorder.mimeType||features.mime});
          if(blob.size<1000)reject(Error("Recorder produced an empty/too-small clip"));
          else resolve(blob);
        };
      });
      await ctx.resume();
      mediaRecorder.start(250);
      osc.start();
      drawTimer=setInterval(draw,65);
      stopTimer=setTimeout(()=>{try{if(mediaRecorder.state!=="inactive")mediaRecorder.stop()}catch(_){}},1350);
      const blob=await recording;
      const kind=blob.type.includes("mp4")?"MP4":blob.type.includes("webm")?"WebM":"unknown codec";
      status.textContent="RECORDED TEST CLIP ✓ — "+kind+" · "+(blob.size/1024).toFixed(0)+" KiB, generated locally. Recording alone does not prove H.264/AAC, full export, or Files saving. No media was uploaded.";
      const audit=root.CutNovaCodecAudit;
      if(audit&&typeof audit.inspect==="function"){
        try{
          printCodec("unverified","Inspecting the actual 1-second recording's codec entries on this phone…");
          const info=await audit.inspect(blob);
          const verdict=probeDecision(info,features.mime);
          const detected=audit.label(info);
          if(verdict.code==="basic-match"){
            printCodec("basic-match","BASIC H.264 + MP4 AUDIO TRACK MATCH — "+detected+". Actual sample entries match the usual social format. AAC profile, audio audibility, frame rate and uploads are NOT verified. This is only a tiny generated probe, NOT your exported Short.");
            if(verdict.canEnableStrict&&strictAction){
              strictAction.disabled=false;strictAction.hidden=false;
            }
          }else if(verdict.code==="not-recommended"){
            printCodec("not-recommended","H.264/AAC NOT VERIFIED — actual recording: "+detected+". A supported MP4 MIME can still produce VP9/Opus or another incompatible codec. Use strict export only if independently supported, or the owner FFmpeg converter for authorized PUBLIC footage; never upload private phone media.");
          }else{
            printCodec("unverified","ACTUAL CODECS UNKNOWN — "+detected+". The 1-second sample is not verified H.264/AAC; use the social format checker on each exported Short.");
          }
        }catch(error){
          printCodec("unverified","CODEC INSPECTION FAILED — "+String(error?.message||"Unknown local media format").slice(0,130)+". No H.264/AAC claim.");
        }
      }else{
        printCodec("unverified","CODEC INSPECTOR NOT LOADED — recording succeeded but H.264/AAC is NOT verified.");
      }
      if(fallback)fallback.hidden=true;
    }catch(error){
      status.textContent="RECORDING FAILED — "+String(error?.message||"Browser recording error").slice(0,240)+". Local export is not verified on this device. Use only authorized public video URLs in cloud AI if needed.";
      printCodec("unverified","RECORDING FAILED. No codec bytes exist to verify; do not infer H.264/AAC.");
      if(fallback)fallback.hidden=false;
    }finally{
      clearInterval(drawTimer);clearTimeout(stopTimer);
      try{if(mediaRecorder?.state&&mediaRecorder.state!=="inactive")mediaRecorder.stop()}catch(_){}
      try{osc?.stop()}catch(_){}
      try{osc?.disconnect();gain?.disconnect()}catch(_){}
      try{stream?.getTracks().forEach(t=>t.stop())}catch(_){}
      try{if(ctx?.state!=="closed")await ctx.close()}catch(_){}
      busy=false;button.disabled=false;
    }
  });
})(typeof window!=="undefined"?window:null);
