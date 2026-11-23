/* CutNova V4.9 SMART MIX: review candidates from local visual samples + optional
 * Web Audio energy. Source stays on device. Not AI transcription, video
 * understanding, autonomous livestream clipping, or a video-rendering engine.
 */
(function(root){
  "use strict";
  const MAX_SCAN=180, MAX_VIDEO_BYTES=500*1024*1024, MAX_AUDIO_BYTES=20*1024*1024;
  const MAX_CANDIDATES=6;

  function sanitizeWindows(rows,duration,width){
    return (Array.isArray(rows)?rows:[]).filter(x=>x &&
      Number.isFinite(x.start) && Number.isFinite(x.end) &&
      Number.isFinite(x.score) && x.score>=1 && x.score<=100 &&
      x.start>=0 && x.end<=duration+.02 &&
      Math.abs((x.end-x.start)-width)<.04
    ).slice(0,MAX_CANDIDATES);
  }
  function combineSignals(visual,audio,duration,wanted=3,length=30){
    if(!Number.isFinite(duration)||duration<15)return [];
    const width=Math.min(duration,Math.max(15,Math.min(60,Number(length)||30)));
    const limit=Math.max(1,Math.min(MAX_CANDIDATES,Math.trunc(Number(wanted)||3)));
    const vs=sanitizeWindows(visual,duration,width),as=sanitizeWindows(audio,duration,width);
    if(!vs.length&&!as.length)return [];
    const all=[...vs,...as],hasBoth=vs.length>0&&as.length>0;
    function proximity(source,at){
      let score=0;
      for(const x of source){
        const mid=(x.start+x.end)/2;
        const closeness=Math.max(0,1-Math.abs(mid-at)/Math.max(width*.75,1));
        score=Math.max(score,x.score*closeness);
      }
      return score;
    }
    const ranking=all.map(x=>{
      const mid=(x.start+x.end)/2,v=proximity(vs,mid),a=proximity(as,mid);
      const score=Math.max(1,Math.min(100,Math.round(hasBoth?
        .52*v+.43*a+(v>=25&&a>=25?10:0):Math.max(v,a))));
      const source=v>=25&&a>=25?"Visual change + sound peak":v>=a?"Visual changes":"Audio energy peaks";
      return {start:x.start,end:x.end,score,source,
        visual_score:Math.round(v),audio_score:Math.round(a),
        signal:"Relative sampled signals; not AI interpretation"};
    }).sort((a,b)=>b.score-a.score||a.start-b.start);
    const chosen=[];
    for(const clip of ranking){
      if(chosen.some(x=>clip.start<x.end-.03&&clip.end>x.start+.03))continue;
      chosen.push(clip);
      if(chosen.length>=limit)break;
    }
    return chosen;
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={combineSignals,sanitizeWindows,MAX_SCAN,MAX_AUDIO_BYTES};
    return;
  }
  if(!root?.document)return;
  const doc=root.document,by=id=>doc.getElementById(id);
  const fileInput=by("quick-file"),audioInput=by("audio-peaks-source"),
    rights=by("quick-rights"),go=by("smart-mix-start"),stop=by("smart-mix-stop"),
    status=by("smart-mix-status"),results=by("smart-mix-results"),
    count=by("smart-mix-count"),length=by("smart-mix-length");
  if(!fileInput||!rights||!go||!stop||!status||!results)return;
  let worker=null,jobId=0,running=false;

  function say(msg){status.textContent=msg;}
  function clear(){results.hidden=true;results.replaceChildren();}
  function guard(signal,id){
    if(signal.aborted||jobId!==id)throw Error("Scan cancelled.");
  }
  function eventReady(target,type,signal,timeoutMs){
    return new Promise((resolve,reject)=>{
      if(signal.aborted)return reject(Error("Scan cancelled."));
      let finished=false;
      const timer=root.setTimeout(()=>end(Error("Video metadata or frame seek timed out.")),timeoutMs);
      function end(error){
        if(finished)return;
        finished=true;root.clearTimeout(timer);
        target.removeEventListener(type,ok);target.removeEventListener("error",bad);
        signal.removeEventListener("abort",cancel);
        error?reject(error):resolve();
      }
      function ok(){end();}
      function bad(){end(Error("This iPhone/browser cannot decode or seek the selected video."));}
      function cancel(){end(Error("Scan cancelled."));}
      target.addEventListener(type,ok,{once:true});
      target.addEventListener("error",bad,{once:true});
      signal.addEventListener("abort",cancel,{once:true});
    });
  }

  async function collectVisual(file,signal,id,clipLength){
    const math=root.CutNovaVisualMath;
    if(!math)throw Error("Visual scanner module unavailable.");
    const url=URL.createObjectURL(file),video=doc.createElement("video");
    const canvas=doc.createElement("canvas");
    canvas.width=64;canvas.height=36;
    video.preload="auto";video.muted=true;video.playsInline=true;
    let previous=null,duration=0,issue="",samples=[];
    try{
      const ready=eventReady(video,"loadedmetadata",signal,20000);
      video.src=url;video.load();await ready;guard(signal,id);
      duration=Number(video.duration);
      if(!Number.isFinite(duration)||duration<15)
        throw Error("Video duration must be at least 15 seconds.");
      if(duration>MAX_SCAN)
        throw Error("Smart Mix is limited to videos of 3 minutes or less. Use Visual Moments or timed cuts for longer videos.");
      const context=canvas.getContext("2d",{willReadFrequently:true});
      if(!context){issue="Canvas unavailable";return {duration,visual:[],issue};}
      const times=math.planSampleTimes(duration).filter(t=>t<=MAX_SCAN);
      try{
        for(let i=0;i<times.length;i++){
          guard(signal,id);
          const pos=times[i];
          if(Math.abs(video.currentTime-pos)>.025||video.readyState<2){
            const sought=eventReady(video,"seeked",signal,6500);
            video.currentTime=pos;await sought;guard(signal,id);
          }
          context.drawImage(video,0,0,64,36);
          const current=context.getImageData(0,0,64,36).data;
          if(previous){
            const delta=math.frameDifference(previous,current);
            if(Number.isFinite(delta)){
              samples.push({time:Number(((pos+times[i-1])/2).toFixed(2)),delta});
            }
          }
          previous=new Uint8ClampedArray(current);
          say("Smart Mix · visual frame "+(i+1)+"/"+times.length+" · source stays on phone");
        }
      }catch(e){
        guard(signal,id);
        issue=String(e?.message||"Visual sampling unavailable").slice(0,100);
      }
      return {duration,visual:math.candidateWindows(samples,duration,MAX_CANDIDATES,clipLength),issue};
    }finally{
      previous=null;samples.length=0;
      video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(url);
    }
  }

  async function collectAudio(file,videoDuration,ctx,signal,id,clipLength){
    const math=root.CutNovaAudioMath;
    if(!ctx||!math)return {audio:[],issue:"Web Audio is unavailable on this device"};
    if(!file||file.size>MAX_AUDIO_BYTES||file.size<1024)
      return {audio:[],issue:"Audio source must be between 1 KiB and 20 MB"};
    if(!/^audio\//i.test(file.type||"")&&!/^video\//i.test(file.type||"")&&
       !/\.(mp3|m4a|wav|aac|ogg|mp4|mov|m4v|webm)$/i.test(file.name||""))
      return {audio:[],issue:"Unsupported audio file type"};
    guard(signal,id);
    try{
      say("Smart Mix · decoding local audio · no upload");
      const binary=await file.arrayBuffer();guard(signal,id);
      const buffer=await ctx.decodeAudioData(binary);guard(signal,id);
      if(!Number.isFinite(buffer.duration)||buffer.duration<15||
         Math.abs(buffer.duration-videoDuration)>2)
        return {audio:[],issue:"Audio track duration does not match selected video within 2 seconds"};
      if(buffer.duration>MAX_SCAN+2)
        return {audio:[],issue:"Audio is longer than the 3-minute scan limit"};
      const series=math.energySeries(buffer,Math.min(videoDuration,MAX_SCAN));
      guard(signal,id);
      return {audio:math.peakWindows(series,videoDuration,MAX_CANDIDATES,clipLength),issue:""};
    }catch(e){
      guard(signal,id);
      return {audio:[],issue:"Audio decoding unsupported for selected format; visual-only fallback"};
    }
  }

  function render(clips,source,hasVisual,hasAudio,notes){
    clear();results.hidden=false;
    const summary=doc.createElement("p");summary.className="footnote";
    summary.textContent=hasVisual&&hasAudio?
      "Fused sparse scene differences and audio loudness spikes. Scores are relative review priorities, NOT AI scene understanding or viral odds.":
      hasVisual?"Visual-only fallback: audio decode unavailable or no distinct audio peaks.":
      "Audio-only fallback: visual frames could not be sampled or had no distinct changes.";
    results.append(summary);
    if(notes){
      const notice=doc.createElement("p");notice.className="footnote";notice.textContent=notes;results.append(notice);
    }
    for(let i=0;i<clips.length;i++){
      const clip=clips[i],row=doc.createElement("div"),info=doc.createElement("div"),
        title=doc.createElement("strong"),sub=doc.createElement("small"),
        button=doc.createElement("button");
      row.className="quick-cut";
      title.textContent="SMART PICK "+String(i+1).padStart(2,"0");
      sub.textContent=clip.start.toFixed(1)+"–"+clip.end.toFixed(1)+"s · relative "+clip.score+
        "/100 · "+clip.source;
      info.append(title,sub);
      button.className="btn btn-lime";button.type="button";button.textContent="REVIEW IN EDITOR";
      button.addEventListener("click",()=>{
        if(!rights.checked){say("Reconfirm your editing rights first.");return;}
        if(fileInput.files?.[0]!==source){say("Selected file changed; run Smart Mix again.");return;}
        root.dispatchEvent(new CustomEvent("cutnova:open-cut",
          {detail:{file:source,start:clip.start,end:clip.end}}));
        root.location.hash="#local-editor";
      });
      row.append(info,button);results.append(row);
    }
  }

  function cancel(){
    jobId++;
    if(worker)worker.abort();
    stop.disabled=true;go.disabled=running;
    clear();say("Smart Mix cancelled. Waiting for local decoder cleanup; no upload or export.");
  }
  go.addEventListener("click",async()=>{
    if(running)return;
    if(!rights.checked){say("Confirm your footage editing rights above first.");return;}
    const source=fileInput.files?.[0];
    if(!source){say("Select your own video in CHOOSE VIDEO FROM PHONE first.");return;}
    if(source.size<1024||source.size>MAX_VIDEO_BYTES){
      say("Select a video between 1 KiB and 500 MB.");return;
    }
    if(!/^video\//i.test(source.type||"")&&!/\.(mp4|mov|m4v|webm)$/i.test(source.name||"")){
      say("Select a supported MP4, MOV or WebM video.");return;
    }
    // Safari: construct WebAudio during the direct user gesture (not after await).
    const Context=root.AudioContext||root.webkitAudioContext;
    let ctx=null;
    if(Context){
      try{ctx=new Context();}catch{}
    }
    const id=++jobId,controller=new AbortController();
    worker=controller;running=true;go.disabled=true;stop.disabled=false;clear();
    const clipLength=Math.min(60,Math.max(15,Number(length.value)||30));
    const wanted=Math.max(1,Math.min(6,Number(count.value)||3));
    try{
      const picture=await collectVisual(source,controller.signal,id,clipLength);
      guard(controller.signal,id);
      const audioSource=audioInput?.files?.[0]||source;
      const sound=await collectAudio(audioSource,picture.duration,ctx,controller.signal,id,clipLength);
      guard(controller.signal,id);
      const clips=combineSignals(picture.visual,sound.audio,picture.duration,wanted,clipLength);
      if(!clips.length){
        say("No clear visual or audio-energy changes found. Try timed cuts for this video. "+
          [picture.issue,sound.issue].filter(Boolean).join("; ").slice(0,150));
        return;
      }
      render(clips,source,picture.visual.length>0,sound.audio.length>0,
        [picture.issue,sound.issue].filter(Boolean).join("; ").slice(0,180));
      say("Smart Mix prepared "+clips.length+" review suggestion(s). "+
        (picture.visual.length&&sound.audio.length?"Visual + audio signals combined.":"Using available local signals only.")+
        " Tap REVIEW IN EDITOR; nothing has been rendered or uploaded.");
    }catch(e){
      if(id===jobId)say("Smart Mix unavailable: "+String(e?.message||"Unsupported local video").slice(0,180));
    }finally{
      if(ctx){try{await ctx.close();}catch{}}
      running=false;worker=null;go.disabled=false;stop.disabled=true;
    }
  });
  stop.addEventListener("click",cancel);
  fileInput.addEventListener("change",()=>{if(worker)cancel();clear();});
  audioInput?.addEventListener("change",()=>{if(worker)cancel();clear();});
  root.addEventListener("pagehide",()=>{if(worker)cancel();});
})(typeof window!=="undefined"?window:null);
