/* CutNova local editor: source files remain on this device. No media upload.
 * Real-time canvas + Web Audio recording; browser codec support varies.
 */
(function(){
  "use strict";
  function rangeValid(start,end,duration) {
    return [start,end,duration].every(Number.isFinite) &&
      start>=0 && end<=duration+.001 && end-start>=1 && end-start<=60.001;
  }
  function cover(w,h,ow,oh){
    if (![w,h,ow,oh].every(n=>Number.isFinite(n)&&n>0)) throw Error("Invalid video dimensions");
    const scale=Math.max(ow/w,oh/h), sw=ow/scale, sh=oh/scale;
    return [(w-sw)/2,(h-sh)/2,sw,sh];
  }
  function supportedType(recorder) {
    if (!recorder || typeof recorder.isTypeSupported!=="function") return "";
    return ["video/mp4;codecs=avc1.42001f,mp4a.40.2","video/mp4",
      "video/webm;codecs=vp8,opus","video/webm"].find(t=>recorder.isTypeSupported(t))||"";
  }
  if(typeof module!=="undefined"&&module.exports){module.exports={rangeValid,cover,supportedType};return}
  const id=name=>document.getElementById(name);
  const file=id("edit-file"),video=id("edit-video"),start=id("edit-start"),end=id("edit-end"),
    preview=id("edit-play"),save=id("edit-export"),cancel=id("edit-cancel"),
    message=id("edit-status"),result=id("edit-result"),download=id("edit-download"),
    progress=id("edit-progress"),fields=id("edit-fields"),durationLabel=id("edit-duration"),
    rights=id("edit-rights"),format=id("edit-format"),output=id("edit-output");
  if(!file||!video)return;
  let sourceUrl="",outputUrl="",audioContext=null,audioSource=null,audioDestination=null;
  let busy=false,previewEnd=null,recorder=null,aborted=false,finish=null,raf=0,stalledTimer=0;
  const canvas=document.createElement("canvas");
  canvas.width=720;canvas.height=1280;
  const ctx=canvas.getContext("2d",{alpha:false});
  const Audio=window.AudioContext||window.webkitAudioContext;
  const mime=supportedType(window.MediaRecorder);
  const compatible=!!(mime&&Audio&&ctx&&typeof canvas.captureStream==="function");
  format.textContent=compatible?(mime.startsWith("video/mp4")?"MP4 supported":"WebM supported — MP4 unavailable"):"Local preview supported; export not supported by this browser";
  function say(s){message.textContent=s}
  function times(){return [Number(start.value),Number(end.value),video.duration]}
  function valid(){return rangeValid(...times())}
  function update(){
    const d=video.duration;
    const ready=Number.isFinite(d)&&d>0;
    file.disabled=busy;start.disabled=busy;end.disabled=busy;rights.disabled=busy;
    preview.disabled=busy||!ready||!valid();
    save.disabled=busy||!ready||!valid()||!compatible||!rights.checked;
    cancel.disabled=!busy;
    durationLabel.textContent=valid()?(Number(end.value)-Number(start.value)).toFixed(2)+" sec selected":"Select 1–60 seconds within the video";
  }
  function clearOutput(){
    output.pause();output.removeAttribute("src");output.load();
    if(outputUrl)URL.revokeObjectURL(outputUrl);
    outputUrl="";result.hidden=true;download.removeAttribute("href");
  }
  function resetPreview(){previewEnd=null;video.pause()}
  function seek(t){
    return new Promise((resolve,reject)=>{
      if(Math.abs(video.currentTime-t)<.035){resolve();return}
      let timer;
      const clean=()=>{clearTimeout(timer);video.removeEventListener("seeked",done);video.removeEventListener("error",fail)};
      const done=()=>{clean();resolve()};
      const fail=()=>{clean();reject(Error("Could not seek to the requested trim point"))};
      video.addEventListener("seeked",done,{once:true});video.addEventListener("error",fail,{once:true});
      timer=setTimeout(fail,8000);
      try{video.currentTime=t}catch(e){fail()}
    })
  }
  file.addEventListener("change",()=>{
    if(busy)return;
    resetPreview();clearOutput();rights.checked=false;fields.hidden=true;
    video.removeAttribute("src");video.load();
    if(sourceUrl)URL.revokeObjectURL(sourceUrl);
    sourceUrl="";
    const selected=file.files[0];
    if(!selected){say("Choose a video from your device.");return}
    if(selected.size>500*1024*1024){say("Choose a video under 500 MB to reduce device memory pressure.");return}
    sourceUrl=URL.createObjectURL(selected);video.src=sourceUrl;video.load();
    say("Opening local file…");
  });
  video.addEventListener("loadedmetadata",()=>{
    if(!Number.isFinite(video.duration)||video.duration<1){say("Video duration unavailable or under one second.");return}
    start.value="0";end.value=String(Math.floor(Math.min(60,video.duration)*100)/100);
    start.max=String(video.duration);end.max=String(video.duration);
    fields.hidden=false;say("Local video ready. Set your trim in seconds.");
    update();
  });
  video.addEventListener("error",()=>{if(sourceUrl&&!busy)say("Cannot decode this video. Try an MP4 compatible with your browser.");});
  [start,end,rights].forEach(el=>el.addEventListener("input",()=>{if(!busy){resetPreview();clearOutput();update()}}));
  preview.addEventListener("click",async()=>{
    if(!valid()||busy)return;
    try{
      resetPreview();await seek(Number(start.value));previewEnd=Number(end.value);
      await video.play();say("Previewing selected 9:16 center crop.");
    }catch(e){previewEnd=null;say(e.message||"Preview could not start")}
  });
  video.addEventListener("timeupdate",()=>{
    if(previewEnd!==null&&video.currentTime>=previewEnd){video.pause();previewEnd=null}
    if(busy&&finish){
      const elapsed=Math.max(0,video.currentTime-Number(start.value));
      progress.value=Math.min(100,elapsed/(Number(end.value)-Number(start.value))*100);
      if(video.currentTime>=Number(end.value)-.02)finish(false);
    }
  });
  video.addEventListener("ended",()=>{if(busy&&finish)finish(false)});
  // Keep output audio connected to the selected local video. Reuse the
  // media-element source (a media element can only have one per context).
  function initAudio(){
    if(!audioContext){
      audioContext=new Audio();
      audioSource=audioContext.createMediaElementSource(video);
      audioDestination=audioContext.createMediaStreamDestination();
      audioSource.connect(audioDestination);
      audioSource.connect(audioContext.destination);
    }
    return audioContext.resume();
  }
  function paint(){
    if(!ctx||!video.videoWidth||!video.videoHeight)return;
    const [x,y,w,h]=cover(video.videoWidth,video.videoHeight,720,1280);
    ctx.drawImage(video,x,y,w,h,0,0,720,1280);
  }
  save.addEventListener("click",async()=>{
    if(busy||!compatible||!valid()||!rights.checked)return;
    // Start AudioContext from the user's click; never silently export
    // without the browser's required audio support.
    busy=true;aborted=false;progress.value=0;resetPreview();clearOutput();update();
    let stream=null,tracks=[],chunks=[];
    const [a,b]=times();
    const cleanup=()=>{
      clearTimeout(stalledTimer);cancelAnimationFrame(raf);
      finish=null;video.pause();video.controls=true;
      tracks.forEach(track=>track.stop());
      busy=false;recorder=null;update();
    };
    try{
      await initAudio();await seek(a);
      if(aborted){cleanup();say("Export cancelled.");return}
      paint();
      stream=canvas.captureStream(25);
      tracks=stream.getVideoTracks();
      // Clone the output track so stopping this export does not permanently
      // disable the shared Web Audio destination.
      const audioTracks=audioDestination.stream.getAudioTracks().map(t=>t.clone());
      tracks.push(...audioTracks);
      audioTracks.forEach(t=>stream.addTrack(t));
      if(!stream.getAudioTracks().length||!stream.getVideoTracks().length)throw Error("Audio/video capture unavailable.");
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000,audioBitsPerSecond:128000});
      const rec=recorder;
      rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
      rec.onerror=()=>{aborted=true;if(finish)finish(true);say("Recording error; no file created.")};
      rec.onstop=()=>{
        try{
          if(aborted||!chunks.length){say("Export cancelled or failed. No file created.");return}
          const type=rec.mimeType||chunks[0].type||mime;
          const blob=new Blob(chunks,{type});
          if(blob.size<1024)throw Error("Recorded output is empty.");
          const ext=type.toLowerCase().includes("mp4")?"mp4":type.toLowerCase().includes("webm")?"webm":"";
          if(!ext)throw Error("Unknown recording format.");
          outputUrl=URL.createObjectURL(blob);output.src=outputUrl;
          download.href=outputUrl;download.download="CutNova_Manual_Short."+ext;
          result.hidden=false;progress.value=100;
          say("Export recorded: "+ext.toUpperCase()+" · "+(blob.size/1048576).toFixed(2)+" MB. Preview before saving.");
        }catch(e){say(e.message||"Export failed.")}
        finally{cleanup()}
      };
      finish=(failed)=>{
        if(!finish)return;
        finish=null;aborted=aborted||failed;video.pause();cancelAnimationFrame(raf);
        clearTimeout(stalledTimer);
        if(rec.state!=="inactive")rec.stop();else cleanup();
      };
      video.controls=false;
      const draw=()=>{
        if(!busy||!finish)return;
        paint();
        if(video.currentTime>=b-.02){finish(false);return}
        raf=requestAnimationFrame(draw);
      };
      rec.start(500);
      say("Recording in real time. Keep this page open and screen awake.");
      await video.play();raf=requestAnimationFrame(draw);
      // Reject stalls rather than handing back a silently truncated file.
      stalledTimer=setTimeout(()=>{if(finish){finish(true);say("Export timed out. Try a shorter clip.")}},(b-a+20)*1000);
    }catch(e){
      aborted=true;
      if(finish){finish(true)}else cleanup();
      say("Export unavailable: "+(e.message||"browser capture failed"));
    }
  });
  cancel.addEventListener("click",()=>{aborted=true;if(finish)finish(true);say("Cancelling export…")});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&busy){aborted=true;if(finish)finish(true);say("Export cancelled when app went into background.")}});
  update();
})();
