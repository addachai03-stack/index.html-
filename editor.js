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
  const PRESETS=["original","vivid","warm","mono"];
  function bounded(value,low,high,fallback){
    const v=Number(value);return Number.isFinite(v)?Math.max(low,Math.min(high,v)):fallback;
  }
  function settings(raw={}){
    return {brightness:bounded(raw.brightness,60,140,100),
      contrast:bounded(raw.contrast,60,140,100),
      preset:PRESETS.includes(raw.preset)?raw.preset:"original",
      speed:[.75,1,1.25,1.5,2].includes(Number(raw.speed))?Number(raw.speed):1,
      text:String(raw.text??"").replace(/\s+/g," ").trim().slice(0,80),
      position:raw.position==="top"?"top":"bottom"};
  }
  function durationValid(a,b,d,speed){
    return rangeValid(a,b,d)&&[.75,1,1.25,1.5,2].includes(speed)&&(b-a)/speed>=1&&(b-a)/speed<=60.001;
  }
  function applyPixels(data,options){
    const o=settings(options), brightness=o.brightness/100, contrast=o.contrast/100;
    const saturation=o.preset==="mono"?0:o.preset==="vivid"?1.5:1;
    for(let i=0;i<data.length;i+=4){
      let r=data[i],g=data[i+1],b=data[i+2];
      const gray=.2126*r+.7152*g+.0722*b;
      r=gray+(r-gray)*saturation;g=gray+(g-gray)*saturation;b=gray+(b-gray)*saturation;
      if(o.preset==="warm"){r=r*1.06+5;g=g*1.015;b=b*.86;}
      data[i]=(r*brightness-128)*contrast+128;
      data[i+1]=(g*brightness-128)*contrast+128;
      data[i+2]=(b*brightness-128)*contrast+128;
    }
    return data;
  }
  function textLines(text,measure,maxWidth){
    const result=[];let line="";
    for(const word of text.split(" ").filter(Boolean)){
      if(line&&measure(line+" "+word)>maxWidth){result.push(line);line=""}
      if(measure(word)>maxWidth){
        for(const ch of Array.from(word)){
          if(line&&measure(line+ch)>maxWidth){result.push(line);line=""}
          line+=ch;
        }
      }else{line+=(line?" ":"")+word}
    }
    if(line)result.push(line);
    return result;
  }
  function mixGains(original,music,muted,hasMusic){
    const a=muted?0:bounded(original,0,100,100)/100;
    const b=hasMusic?bounded(music,0,100,20)/100:0;
    const headroom=Math.max(1,a+b);
    return {original:a/headroom,music:b/headroom};
  }
  function musicOffset(sourceTime,clipStart,speed,musicDuration,loop){
    if(!Number.isFinite(musicDuration)||musicDuration<=0||speed<=0)return null;
    const elapsed=Math.max(0,(sourceTime-clipStart)/speed);
    if(loop)return elapsed%musicDuration;
    return elapsed<musicDuration?elapsed:null;
  }
  function draftName(value){return String(value??"").trim().replace(/\s+/g," ").slice(0,60)||"Untitled Short"}
  function draftSettings(raw={}){
    return {...settings(raw),start:bounded(raw.start,0,86400,0),end:bounded(raw.end,0,86400,15),
      originalVolume:bounded(raw.originalVolume,0,100,100),musicVolume:bounded(raw.musicVolume,0,100,20),
      mute:raw.mute===true,loop:raw.loop!==false};
  }
  function nextHistory(previous,current,now){
    const history=Array.isArray(previous?.history)?previous.history.slice(-9):[];
    if(previous?.settings&&JSON.stringify(previous.settings)!==JSON.stringify(current))
      history.push({at:previous.updatedAt||now,settings:draftSettings(previous.settings)});
    return history.slice(-10);
  }
  if(typeof module!=="undefined"&&module.exports){module.exports={rangeValid,cover,supportedType,settings,durationValid,applyPixels,textLines,mixGains,musicOffset,draftName,draftSettings,nextHistory};return}
  const id=name=>document.getElementById(name);
  const file=id("edit-file"),video=id("edit-video"),start=id("edit-start"),end=id("edit-end"),
    preview=id("edit-play"),save=id("edit-export"),cancel=id("edit-cancel"),
    message=id("edit-status"),result=id("edit-result"),download=id("edit-download"),
    progress=id("edit-progress"),fields=id("edit-fields"),durationLabel=id("edit-duration"),
    rights=id("edit-rights"),format=id("edit-format"),output=id("edit-output"),
    brightness=id("edit-brightness"),contrast=id("edit-contrast"),preset=id("edit-preset"),speed=id("edit-speed"),
    overlay=id("edit-text"),position=id("edit-position"),reset=id("edit-reset-effects"),
    musicFile=id("edit-music-file"),musicVolume=id("edit-music-volume"),originalVolume=id("edit-original-volume"),
    mute=id("edit-mute"),loop=id("edit-music-loop"),removeMusic=id("edit-remove-music"),musicStatus=id("edit-music-status");
  if(!file||!video)return;
  let sourceUrl="",outputUrl="",audioContext=null,audioSource=null,audioDestination=null;
  let sourceFile=null,activeDraft=null,pendingDraft=null,pendingQuickCut=null,dbPromise=null,draftBusy=false;
  const drafts=id("edit-draft-list"),draftTitle=id("edit-draft-title"),draftSave=id("edit-draft-save"),draftNew=id("edit-draft-new"),draftStatus=id("edit-draft-status"),draftHistory=id("edit-draft-history"),draftRestore=id("edit-draft-restore");
  let busy=false,preparing=false,previewEnd=null,recorder=null,aborted=false,finish=null,raf=0,stalledTimer=0;
  let originalGain=null,musicGain=null,mixBus=null,music=null,musicBuffer=null,musicNode=null,mixStart=null;
  const canvas=id("edit-canvas");
  const buffer=document.createElement("canvas");buffer.width=360;buffer.height=640;
  const bctx=buffer.getContext("2d",{alpha:false,willReadFrequently:true});
  let previewRaf=0;
  canvas.width=720;canvas.height=1280;
  const ctx=canvas.getContext("2d",{alpha:false});
  const Audio=window.AudioContext||window.webkitAudioContext;
  const mime=supportedType(window.MediaRecorder);
  const compatible=!!(mime&&Audio&&ctx&&typeof canvas.captureStream==="function");
  format.textContent=compatible?(mime.startsWith("video/mp4")?"MP4 container supported — H.264/AAC codecs and social upload compatibility are not guaranteed; verify the saved file.":"WebM supported — MP4 unavailable. Social uploads may require conversion."):"Local preview supported, but export not supported by this browser (canvas recording/codec unavailable). For cloud AI export, use a permitted public HTTPS video URL in the AI tab. Saved phone files are not uploaded.";
  function say(s){message.textContent=s}
  function times(){return [Number(start.value),Number(end.value),video.duration]}
  function options(){return settings({brightness:brightness.value,contrast:contrast.value,preset:preset.value,speed:speed.value,text:overlay.value,position:position.value})}
  function valid(){return durationValid(...times(),options().speed)}
  function setSpeed(){video.playbackRate=options().speed;if("preservesPitch" in video)video.preservesPitch=true;if("webkitPreservesPitch" in video)video.webkitPreservesPitch=true;}
  function update(){
    const d=video.duration;
    const ready=Number.isFinite(d)&&d>0;
    const locked=busy||preparing||draftBusy||!!pendingDraft;
    draftSave.disabled=locked||!sourceFile||!ready||!valid()||!window.indexedDB;
    draftTitle.disabled=locked;draftNew.disabled=locked;draftHistory.disabled=locked;
    draftRestore.disabled=locked||!activeDraft||!draftHistory.value;
    drafts.querySelectorAll("button").forEach(b=>b.disabled=locked);
    file.disabled=locked;start.disabled=locked;end.disabled=locked;rights.disabled=locked;
    [musicFile,musicVolume,originalVolume,mute,loop].forEach(el=>el.disabled=locked||!Audio);
    removeMusic.disabled=locked||!music;
    id("edit-original-volume-value").textContent=mute.checked?"Muted":originalVolume.value+"%";
    id("edit-music-volume-value").textContent=musicVolume.value+"%";
    [brightness,contrast,preset,speed,overlay,position,reset].forEach(el=>el.disabled=locked);
    id("edit-brightness-value").textContent=brightness.value+"%";id("edit-contrast-value").textContent=contrast.value+"%";
    preview.disabled=locked||!ready||!valid();
    save.disabled=locked||!ready||!valid()||!compatible||!rights.checked;
    cancel.disabled=!busy;
    durationLabel.textContent=valid()?((Number(end.value)-Number(start.value))/options().speed).toFixed(2)+" sec estimated output at "+options().speed+"×":"Select a valid trim with 1–60 seconds output";
  }
  function clearOutput(){
    window.dispatchEvent(new Event("cutnova:export-reset"));
    output.pause();output.removeAttribute("src");output.load();
    if(outputUrl)URL.revokeObjectURL(outputUrl);
    outputUrl="";result.hidden=true;download.removeAttribute("href");
  }
  function stopMusic(){
    if(musicNode){try{musicNode.stop()}catch(_){};try{musicNode.disconnect()}catch(_){};musicNode=null;}
  }
  function resetPreview(){previewEnd=null;mixStart=null;stopMusic();video.pause();cancelAnimationFrame(previewRaf)}
  function applyMix(){
    if(!originalGain||!musicGain)return;
    const g=mixGains(originalVolume.value,musicVolume.value,mute.checked,!!music);
    originalGain.gain.value=g.original;musicGain.gain.value=g.music;
  }
  async function prepareMusic(){
    if(!music||musicBuffer)return;
    musicStatus.textContent="Decoding local audio…";
    try{
      const decoded=await audioContext.decodeAudioData(await music.arrayBuffer());
      if(!decoded||!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.duration>600)throw Error("Choose an audio file no longer than 10 minutes.");
      musicBuffer=decoded;
      musicStatus.textContent=music.name+" · "+decoded.duration.toFixed(1)+" s · ready";
    }catch(error){
      musicStatus.textContent="Audio could not be decoded. Remove it or try a different file.";
      throw Error("Background music unavailable: "+(error.message||"decode failed"));
    }
  }
  function startMusic(){
    stopMusic();
    if(mixStart===null||!musicBuffer||!audioContext||!musicGain||video.paused)return;
    const offset=musicOffset(video.currentTime,mixStart,options().speed,musicBuffer.duration,loop.checked);
    if(offset===null)return;
    musicNode=audioContext.createBufferSource();musicNode.buffer=musicBuffer;musicNode.loop=loop.checked;
    musicNode.connect(musicGain);musicNode.start(0,offset);
  }
  function clearMusic(){
    stopMusic();music=null;musicBuffer=null;musicFile.value="";
    musicStatus.textContent="No background track selected.";applyMix();update();
  }
  musicFile.addEventListener("change",()=>{
    if(busy||preparing)return;
    resetPreview();clearOutput();musicBuffer=null;music=null;
    const chosen=musicFile.files[0];
    if(chosen&&chosen.size<=20*1024*1024){music=chosen;musicStatus.textContent=chosen.name+" · selected; decode on preview/export.";}
    else{musicFile.value="";musicStatus.textContent=chosen?"Choose audio under 20 MB.":"No background track selected.";}
    applyMix();update();
  });
  removeMusic.addEventListener("click",()=>{if(!busy&&!preparing){resetPreview();clearOutput();clearMusic()}});
  [musicVolume,originalVolume,mute,loop].forEach(el=>el.addEventListener("input",()=>{
    if(!busy&&!preparing){resetPreview();clearOutput();applyMix();update()}
  }));
  video.addEventListener("playing",()=>{try{startMusic()}catch(error){if(busy&&finish)finish(true);else resetPreview();say("Music playback unavailable: "+error.message)}});
  video.addEventListener("waiting",stopMusic);
  video.addEventListener("pause",stopMusic);
  video.addEventListener("seeking",stopMusic);
  video.addEventListener("seeked",()=>{if(!video.paused)startMusic()});
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
  // A draft is one record, containing local media blobs and explicit settings.
  // No cloud synchronization and no automatic storage of media.
  function openDraftDB(){
    if(!window.indexedDB)return Promise.reject(Error("Local draft storage unavailable"));
    if(!dbPromise){
      dbPromise=new Promise((resolve,reject)=>{
        const req=indexedDB.open("CutNovaLocalDrafts",1);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("drafts"))req.result.createObjectStore("drafts",{keyPath:"id"})};
        req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null};resolve(db)};
        req.onerror=()=>reject(req.error||Error("Cannot open draft storage"));
        req.onblocked=()=>reject(Error("Close other CutNova tabs and retry"));
      }).catch(e=>{dbPromise=null;throw e});
    }
    return dbPromise;
  }
  async function localDraft(mode,operation){
    const db=await openDraftDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction("drafts",mode);
      const req=operation(tx.objectStore("drafts"));
      let value;
      req.onsuccess=()=>{value=req.result};
      req.onerror=()=>reject(req.error||Error("Draft request failed"));
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error||Error("Draft storage error"));
      tx.onabort=()=>reject(tx.error||Error("Draft storage aborted"));
    });
  }
  // Some WebKit storage environments reject cloning File/Blob records.
  // Retry with plain binary data only for bounded files; retain legacy Blob reads.
  async function packMedia(file){
    if(!file)return null;
    return {bytes:await file.arrayBuffer(),name:file.name||"Media",type:file.type||"",size:file.size,lastModified:file.lastModified||0};
  }
  function unpackMedia(value){
    if(value instanceof Blob)return value;
    if(value?.bytes instanceof ArrayBuffer&&value.bytes.byteLength===value.size){
      return new File([value.bytes],value.name||"Media",{type:value.type||"",lastModified:value.lastModified||0});
    }
    return null;
  }
  function draftSay(t){draftStatus.textContent=t}
  function snapshot(){
    return draftSettings({...options(),start:start.value,end:end.value,originalVolume:originalVolume.value,
      musicVolume:musicVolume.value,mute:mute.checked,loop:loop.checked});
  }
  function restoreSettings(raw){
    const o=draftSettings(raw);
    const d=video.duration;
    start.value=String(Math.min(o.start,Math.max(0,d-1)));
    end.value=String(Math.min(o.end,d));
    if(!durationValid(Number(start.value),Number(end.value),d,o.speed)){
      start.value="0";end.value=String(Math.min(60,d));o.speed=1;
    }
    brightness.value=o.brightness;contrast.value=o.contrast;preset.value=o.preset;speed.value=o.speed;
    overlay.value=o.text;position.value=o.position;originalVolume.value=o.originalVolume;musicVolume.value=o.musicVolume;
    mute.checked=o.mute;loop.checked=o.loop;rights.checked=false;
    resetPreview();clearOutput();setSpeed();applyMix();paint();update();
  }
  function historyUI(){
    draftHistory.replaceChildren();
    const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Choose a saved settings revision";draftHistory.append(placeholder);
    (activeDraft?.history||[]).forEach((item,i)=>{
      const option=document.createElement("option");option.value=String(i);
      option.textContent="Revision · "+new Date(item.at).toLocaleString();draftHistory.append(option);
    });
    update();
  }
  async function refreshDrafts(){
    try{
      const records=await localDraft("readonly",s=>s.getAll());
      drafts.replaceChildren();
      records.sort((a,b)=>b.updatedAt-a.updatedAt);
      if(!records.length){drafts.textContent="No saved drafts yet.";return}
      for(const row of records){
        const item=document.createElement("div");item.className="draft-row";
        const info=document.createElement("div");const title=document.createElement("strong");
        title.textContent=row.name;const date=document.createElement("small");
        date.textContent=new Date(row.updatedAt).toLocaleString()+" · "+((row.video.size+(row.music?.size||0))/1048576).toFixed(1)+" MB";
        info.append(title,date);
        const open=document.createElement("button");open.type="button";open.className="btn btn-outline";open.textContent="RESUME";
        open.addEventListener("click",()=>resumeDraft(row.id));
        const del=document.createElement("button");del.type="button";del.className="btn btn-outline";del.textContent="DELETE";
        del.addEventListener("click",async()=>{
          if(busy||preparing||draftBusy||!window.confirm("Delete this saved draft and its local media copy?"))return;
          draftBusy=true;update();
          try{await localDraft("readwrite",s=>s.delete(row.id));if(activeDraft?.id===row.id){activeDraft=null;historyUI()}await refreshDrafts();draftSay("Draft deleted. Original device files unchanged.")}
          catch(e){draftSay("Delete failed: "+e.message)}finally{draftBusy=false;update()}
        });
        item.append(info,open,del);drafts.append(item);
      }
    }catch(e){draftSay("Draft storage unavailable: "+e.message)}
    finally{update()}
  }
  function clearSource(){
    resetPreview();clearOutput();rights.checked=false;fields.hidden=true;clearMusic();
    if(ctx)ctx.clearRect(0,0,720,1280);
    video.removeAttribute("src");video.load();
    if(sourceUrl)URL.revokeObjectURL(sourceUrl);
    sourceUrl="";sourceFile=null;file.value="";
  }
  function loadSource(blob){
    sourceFile=blob;sourceUrl=URL.createObjectURL(blob);video.src=sourceUrl;video.load();
    say("Opening local file…");
  }
  async function resumeDraft(key){
    if(busy||preparing||draftBusy)return;
    if(sourceFile&&!window.confirm("Resume this draft? Unsaved edits in your current editor will be replaced."))return;
    draftBusy=true;update();
    try{
      const row=await localDraft("readonly",s=>s.get(key));
      if(!row)throw Error("Saved draft unavailable");
      const source=unpackMedia(row.video);if(!source)throw Error("Saved video unavailable");
      const restoredMusic=unpackMedia(row.music);if(row.music&&!restoredMusic)throw Error("Saved audio unavailable");
      clearSource();activeDraft=row;pendingDraft={...row,video:source,music:restoredMusic};draftTitle.value=row.name;
      loadSource(source);historyUI();draftSay("Opening saved draft…");
    }catch(e){pendingDraft=null;activeDraft=null;draftSay("Resume failed: "+e.message)}
    finally{draftBusy=false;update()}
  }
  draftSave.addEventListener("click",async()=>{
    if(busy||preparing||draftBusy||!sourceFile||!valid())return;
    if(sourceFile.size+(music?.size||0)>150*1024*1024){draftSay("Draft limit is 150 MB combined media. Use a smaller source file.");return}
    draftBusy=true;update();
    try{
      const now=Date.now(),current=snapshot();
      let previous=activeDraft?await localDraft("readonly",s=>s.get(activeDraft.id)):null;
      const row={id:previous?.id||(window.crypto?.randomUUID?.()||"draft-"+now+"-"+Math.random().toString(36).slice(2)),
        name:draftName(draftTitle.value),updatedAt:now,video:sourceFile,music:music||null,
        settings:current,history:nextHistory(previous,current,now)};
      // History only represents settings; it is reset if the media changes.
      if(previous&&(previous.video.size!==sourceFile.size||previous.video.name!==sourceFile.name||
          (previous.music?.size||0)!==(music?.size||0)||previous.music?.name!==music?.name))row.history=[];
      try{await localDraft("readwrite",s=>s.put(row))}catch(error){
        if(sourceFile.size+(music?.size||0)>50*1024*1024)throw error;
        row.video=await packMedia(sourceFile);row.music=await packMedia(music);
        await localDraft("readwrite",s=>s.put(row));
      }
      activeDraft=row;draftTitle.value=row.name;
      historyUI();await refreshDrafts();draftSay("Saved on this device. "+row.history.length+" previous settings revisions.");
    }catch(e){draftSay("Save failed (storage may be full): "+e.message)}
    finally{draftBusy=false;update()}
  });
  draftNew.addEventListener("click",()=>{
    if(busy||preparing||draftBusy)return;
    activeDraft=null;pendingDraft=null;draftTitle.value="";historyUI();draftSay("Save will create a separate draft from the current edit.");
  });
  draftHistory.addEventListener("change",update);
  draftRestore.addEventListener("click",()=>{
    if(busy||preparing||draftBusy||!activeDraft||!draftHistory.value)return;
    const rev=activeDraft.history[Number(draftHistory.value)];
    if(rev&&Number.isFinite(video.duration)){restoreSettings(rev.settings);draftSay("Revision restored in editor. Save draft to keep this change.")}
  });
  // Open a suggested time range from the on-device Quick Shorts generator.
  // Keep user media in memory; no upload to GitHub or third-party service.
  function openQuickCut(detail){
    const source=detail?.file;
    if(!(source instanceof Blob)||source.size>500*1024*1024||busy||preparing||draftBusy||pendingDraft){
      say("Cannot open this cut while exporting or saving. Try again.");return;
    }
    const a=Number(detail.start),b=Number(detail.end);
    if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b-a<1||b-a>60.001){
      say("Suggested segment has invalid time bounds.");return;
    }
    if(sourceFile===source&&Number.isFinite(video.duration)){
      resetPreview();clearOutput();
      start.value=String(Math.min(a,Math.max(0,video.duration-1)));
      end.value=String(Math.min(b,video.duration));
      rights.checked=false;update();paint();
      say("Suggested cut selected. Confirm rights, preview and tap EXPORT SHORT.");return;
    }
    if(sourceFile&&!window.confirm("Open a new suggested cut? Unsaved editor changes will be replaced."))return;
    clearSource();activeDraft=null;pendingDraft=null;draftTitle.value="";historyUI();
    pendingQuickCut={start:a,end:b};loadSource(source);
  }
  window.addEventListener("cutnova:open-cut",event=>openQuickCut(event.detail));
  file.addEventListener("change",()=>{
    if(busy||preparing)return;
    const selected=file.files[0];
    if(sourceFile&&!window.confirm("Replace current video? Unsaved edits will be lost.")){file.value="";return}
    clearSource();activeDraft=null;pendingDraft=null;draftTitle.value="";historyUI();
    if(!selected){say("Choose a video from your device.");return}
    if(selected.size>500*1024*1024){say("Choose a video under 500 MB to reduce device memory pressure.");return}
    loadSource(selected);
  });
  video.addEventListener("loadedmetadata",()=>{
    if(!Number.isFinite(video.duration)||video.duration<1){pendingDraft=null;say("Video duration unavailable or under one second.");update();return}
    start.value="0";end.value=String(Math.floor(Math.min(60,video.duration)*100)/100);
    start.max=String(video.duration);end.max=String(video.duration);
    fields.hidden=false;
    if(pendingDraft){
      const row=pendingDraft;pendingDraft=null;
      music=row.music instanceof Blob?row.music:null;musicBuffer=null;
      musicStatus.textContent=music?(music.name||"Saved audio")+" · restored; decode on preview/export.":"No background track selected.";
      restoreSettings(row.settings);historyUI();draftSay("Draft resumed. Reconfirm media rights before export.");say("Saved edit restored.");
      window.dispatchEvent(new Event("cutnova:draft-loaded"));
    }else if(pendingQuickCut){
      const cut=pendingQuickCut;pendingQuickCut=null;
      start.value=String(Math.min(cut.start,Math.max(0,video.duration-1)));
      end.value=String(Math.min(cut.end,video.duration));
      rights.checked=false;
      say("Short time range prepared on this device. Confirm rights, preview, then EXPORT SHORT.");
    }else say("Local video ready. Set your trim in seconds.");
    update();
  });
  video.addEventListener("error",()=>{if(sourceUrl&&!busy){pendingDraft=null;say("Cannot decode this video. Try an MP4 compatible with your browser.");update()}});
  [start,end,rights].forEach(el=>el.addEventListener("input",()=>{if(!busy){resetPreview();clearOutput();update()}}));
  [brightness,contrast,preset,speed,overlay,position].forEach(el=>el.addEventListener("input",()=>{
    if(!busy){clearOutput();try{setSpeed();paint()}catch(e){say("Effect preview unavailable: "+e.message)}update()}
  }));
  reset.addEventListener("click",()=>{
    if(busy)return;
    brightness.value="100";contrast.value="100";preset.value="original";speed.value="1";overlay.value="";position.value="bottom";
    clearOutput();setSpeed();paint();update();
  });
  ["loadeddata","seeked"].forEach(event=>video.addEventListener(event,()=>{if(!busy)paint()}));
  video.addEventListener("play",()=>{
    if(busy)return;
    cancelAnimationFrame(previewRaf);
    const drawPreview=()=>{if(busy)return;paint();if(!video.paused&&!video.ended)previewRaf=requestAnimationFrame(drawPreview)};
    drawPreview();
  });
  video.addEventListener("pause",()=>{cancelAnimationFrame(previewRaf);if(!busy)paint()});
  preview.addEventListener("click",async()=>{
    if(!valid()||busy||preparing||draftBusy||pendingDraft)return;
    preparing=true;update();
    try{
      resetPreview();setSpeed();
      if(Audio){await initAudio();await prepareMusic()}
      else if(music||mute.checked||originalVolume.value!=="100")throw Error("Audio mixing unavailable in this browser");
      await seek(Number(start.value));previewEnd=Number(end.value);mixStart=Number(start.value);
      await video.play();say("Previewing edited 9:16 selection and audio mix.");
    }catch(e){resetPreview();say(e.message||"Preview could not start")}
    finally{preparing=false;update()}
  });
  video.addEventListener("timeupdate",()=>{
    if(previewEnd!==null&&video.currentTime>=previewEnd){resetPreview()}
    if(busy&&finish){
      const elapsed=Math.max(0,video.currentTime-Number(start.value));
      progress.value=Math.min(100,elapsed/(Number(end.value)-Number(start.value))*100);
      if(video.currentTime>=Number(end.value)-.02)finish(false);
    }
  });
  video.addEventListener("ended",()=>{stopMusic();if(busy&&finish)finish(false);else mixStart=null});
  // Keep output audio connected to the selected local video. Reuse the
  // media-element source (a media element can only have one per context).
  function initAudio(){
    if(!audioContext){
      audioContext=new Audio();
      audioSource=audioContext.createMediaElementSource(video);
      audioDestination=audioContext.createMediaStreamDestination();
      originalGain=audioContext.createGain();musicGain=audioContext.createGain();mixBus=audioContext.createGain();
      audioSource.connect(originalGain);originalGain.connect(mixBus);musicGain.connect(mixBus);
      mixBus.connect(audioDestination);mixBus.connect(audioContext.destination);applyMix();
    }
    return audioContext.resume();
  }
  function paint(){
    if(!ctx||video.readyState<2||!video.videoWidth||!video.videoHeight)return;
    const o=options(),[x,y,w,h]=cover(video.videoWidth,video.videoHeight,720,1280);
    const active=o.preset!=="original"||o.brightness!==100||o.contrast!==100;
    if(active){
      // Pixel-based fallback works even where CanvasRenderingContext2D.filter
      // is missing (notably some Safari versions). 360p working buffer limits CPU.
      if(!bctx)throw Error("Color processing unavailable");
      bctx.drawImage(video,x,y,w,h,0,0,360,640);
      const frame=bctx.getImageData(0,0,360,640);
      applyPixels(frame.data,o);bctx.putImageData(frame,0,0);
      ctx.drawImage(buffer,0,0,720,1280);
    }else ctx.drawImage(video,x,y,w,h,0,0,720,1280);
    if(o.text){
      ctx.save();ctx.font="bold 44px system-ui, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.lineJoin="round";ctx.lineWidth=7;ctx.strokeStyle="#111111";ctx.fillStyle="#ffffff";
      const lines=textLines(o.text,t=>ctx.measureText(t).width,620);
      const y0=o.position==="top"?130:1110-(lines.length-1)*52;
      lines.forEach((line,i)=>{ctx.strokeText(line,360,y0+i*52);ctx.fillText(line,360,y0+i*52)});
      ctx.restore();
    }
  }
  save.addEventListener("click",async()=>{
    if(busy||preparing||draftBusy||pendingDraft||!compatible||!valid()||!rights.checked)return;
    // Start AudioContext from the user's click; never silently export
    // without the browser's required audio support.
    busy=true;aborted=false;progress.value=0;resetPreview();clearOutput();update();
    let stream=null,tracks=[],chunks=[];
    const [a,b]=times();
    const cleanup=()=>{
      clearTimeout(stalledTimer);cancelAnimationFrame(raf);
      finish=null;mixStart=null;stopMusic();video.pause();video.controls=true;
      tracks.forEach(track=>track.stop());
      busy=false;recorder=null;update();
    };
    try{
      await initAudio();await prepareMusic();setSpeed();await seek(a);
      if(aborted){cleanup();say("Export cancelled.");return}
      if(video.readyState<2)throw Error("Video frame not decoded. Preview first, then retry.");
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
          window.dispatchEvent(new CustomEvent("cutnova:export-ready",{detail:{blob}}));
          say("Export recorded: "+ext.toUpperCase()+" · "+(blob.size/1048576).toFixed(2)+" MiB. Preview and play the downloaded file. MP4 extension alone does not guarantee H.264/AAC or compatibility with every social platform.");
        }catch(e){say(e.message||"Export failed.")}
        finally{cleanup()}
      };
      finish=(failed)=>{
        if(!finish)return;
        finish=null;aborted=aborted||failed;mixStart=null;stopMusic();video.pause();cancelAnimationFrame(raf);
        clearTimeout(stalledTimer);
        if(rec.state!=="inactive")rec.stop();else cleanup();
      };
      video.controls=false;
      let lastPaint=0;
      const draw=(timestamp)=>{
        if(!busy||!finish)return;
        if(!lastPaint||timestamp-lastPaint>=38){lastPaint=timestamp;try{paint()}catch(e){finish(true);say("Frame processing failed: "+e.message);return}}
        if(video.currentTime>=b-.02){finish(false);return}
        raf=requestAnimationFrame(draw);
      };
      mixStart=a;
      rec.start(500);
      say("Recording edited video and audio mix in real time. Keep this page open and screen awake.");
      await video.play();raf=requestAnimationFrame(draw);
      // Reject stalls rather than handing back a silently truncated file.
      stalledTimer=setTimeout(()=>{if(finish){finish(true);say("Export timed out. Try a shorter clip.")}},((b-a)/options().speed+20)*1000);
    }catch(e){
      aborted=true;
      if(finish){finish(true)}else cleanup();
      say("Export unavailable: "+(e.message||"browser capture failed"));
    }
  });
  cancel.addEventListener("click",()=>{aborted=true;if(finish)finish(true);say("Cancelling export…")});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&busy){aborted=true;if(finish)finish(true);say("Export cancelled when app went into background.")}});
  update();
  refreshDrafts();
})();
