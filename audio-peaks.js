/* CutNova V4.8 — optional on-device audio energy review for short OWNED videos.
 * This is waveform loudness analysis, not speech recognition, emotion detection,
 * live-stream capture, virality prediction, a published Short, or an upload.
 */
(function(root){
"use strict";
const MAX_AUDIO_BYTES=20*1024*1024;
const MAX_AUDIO_SECONDS=180;
const ENERGY_STEP_SECONDS=0.5;

function energySeries(buffer,maxSeconds=MAX_AUDIO_SECONDS){
  if(!buffer||!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<=0||
     !Number.isFinite(buffer.duration)||buffer.duration<=0||
     !Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||
     typeof buffer.getChannelData!=="function")return [];
  const channelCount=Math.min(2,buffer.numberOfChannels);
  const channels=[];
  try{for(let c=0;c<channelCount;c++)channels.push(buffer.getChannelData(c));}
  catch{return [];}
  const length=Math.max(0,Math.min(buffer.length,Math.floor(Math.min(maxSeconds,buffer.duration)*buffer.sampleRate)));
  const framesPerWindow=Math.max(1,Math.round(ENERGY_STEP_SECONDS*buffer.sampleRate));
  // Sample at most 1,200 sample instants per second, irrespective of codec rate.
  const stride=Math.max(1,Math.floor(buffer.sampleRate/1200));
  const series=[];
  for(let start=0;start<length;start+=framesPerWindow){
    const finish=Math.min(length,start+framesPerWindow);
    let sumSquares=0,n=0;
    for(let pos=start;pos<finish;pos+=stride){
      let sampleSquared=0;
      for(const channel of channels){
        const x=channel[pos]||0;
        sampleSquared+=Math.min(1,x*x);
      }
      sumSquares+=sampleSquared/channels.length;n++;
    }
    if(n){
      const energy=Math.sqrt(sumSquares/n);
      series.push({time:Number(((start+finish)/2/buffer.sampleRate).toFixed(2)),
        energy:Math.max(0,Math.min(1,energy))});
    }
  }
  return series;
}

function peakWindows(series,duration,wanted=3,length=30){
  if(!Array.isArray(series)||!Number.isFinite(duration)||duration<15)return [];
  const count=Math.max(1,Math.min(6,Math.trunc(Number(wanted)||3)));
  const seconds=Math.max(15,Math.min(60,Number(length)||30));
  const width=Math.min(seconds,duration);
  const valid=series.filter(p=>p&&Number.isFinite(p.time)&&Number.isFinite(p.energy)&&
    p.time>=0&&p.time<=duration&&p.energy>=0&&p.energy<=1);
  if(valid.length<4)return [];
  const sorted=valid.map(p=>p.energy).sort((a,b)=>a-b);
  const baseline=sorted[Math.floor(sorted.length/2)];
  const maximum=sorted.at(-1);
  // Distinguish peaks from constant speech/music/noise; require contrast.
  const threshold=Math.max(0.02,baseline*1.3+0.012);
  if(maximum<=threshold)return [];
  const peaks=[];
  for(let i=0;i<valid.length;i++){
    const p=valid[i],previous=valid[Math.max(0,i-1)].energy,next=valid[Math.min(i+1,valid.length-1)].energy;
    if(p.energy<threshold||p.energy<previous||p.energy<next)continue;
    const start=Math.max(0,Math.min(duration-width,p.time-width/2));
    peaks.push({
      start:Number(start.toFixed(2)),end:Number((start+width).toFixed(2)),
      level:p.energy,time:p.time,
      score:Math.max(1,Math.min(100,Math.round(100*(p.energy-baseline)/(maximum-baseline)))),
      signal:"Relative audio energy peak (not speech recognition)"
    });
  }
  peaks.sort((a,b)=>b.score-a.score||a.start-b.start);
  const selected=[];
  for(const p of peaks){
    if(selected.some(x=>p.start<x.end-0.02&&p.end>x.start+0.02))continue;
    selected.push({start:p.start,end:p.end,score:p.score,signal:p.signal});
    if(selected.length>=count)break;
  }
  return selected;
}

if(typeof module!=="undefined"&&module.exports){
  module.exports={energySeries,peakWindows,MAX_AUDIO_BYTES,MAX_AUDIO_SECONDS};
  return;
}
if(root)root.CutNovaAudioMath=Object.freeze({energySeries,peakWindows});
if(!root?.document)return;
const d=root.document,by=id=>d.getElementById(id);
const videoInput=by("quick-file"),audioInput=by("audio-peaks-source"),rights=by("quick-rights"),
  start=by("audio-peaks-start"),cancelBtn=by("audio-peaks-cancel"),
  status=by("audio-peaks-status"),results=by("audio-peaks-results"),
  count=by("audio-peaks-count"),length=by("audio-peaks-length");
if(!videoInput||!audioInput||!rights||!start||!cancelBtn||!status||!results)return;
let controller=null,nonce=0,working=false;

function say(s){status.textContent=s;}
function cancelled(signal,job){return signal.aborted||nonce!==job;}
function checkAbort(signal,job){if(cancelled(signal,job))throw Error("Audio scan cancelled.");}
function clearResults(){results.replaceChildren();results.hidden=true;}

function metadata(file,kind,signal,job){
 return new Promise((resolve,reject)=>{
  if(cancelled(signal,job))return reject(Error("Audio scan cancelled."));
  const node=d.createElement(kind),url=URL.createObjectURL(file);
  let finished=false;
  const timer=root.setTimeout(()=>finish(Error("Local media metadata timed out.")),12000);
  function finish(error){
    if(finished)return;finished=true;
    root.clearTimeout(timer);
    node.removeEventListener("loadedmetadata",onReady);
    node.removeEventListener("error",onError);
    signal.removeEventListener("abort",onAbort);
    node.removeAttribute("src");node.load();URL.revokeObjectURL(url);
    if(error)reject(error);else resolve(duration);
  }
  let duration=0;
  function onReady(){
    duration=Number(node.duration);
    if(!Number.isFinite(duration)||duration<15)finish(Error("Video/audio must be at least 15 seconds."));
    else finish();
  }
  function onError(){finish(Error("Your browser cannot read this file's metadata."));}
  function onAbort(){finish(Error("Audio scan cancelled."));}
  node.preload="metadata";
  node.addEventListener("loadedmetadata",onReady,{once:true});
  node.addEventListener("error",onError,{once:true});
  signal.addEventListener("abort",onAbort,{once:true});
  node.src=url;node.load();
 });
}

function display(candidates,source,mode){
 clearResults();results.hidden=false;
 const notice=d.createElement("p");notice.className="footnote";
 notice.textContent="Found relative audio peaks from "+mode+". Sound spikes can be music, noise or shouting, NOT necessarily good moments. Review in editor; manual export required.";
 results.append(notice);
 for(let i=0;i<candidates.length;i++){
  const c=candidates[i],row=d.createElement("div"),info=d.createElement("div"),
    title=d.createElement("strong"),detail=d.createElement("small"),button=d.createElement("button");
  row.className="quick-cut";
  title.textContent="AUDIO PICK "+String(i+1).padStart(2,"0");
  detail.textContent=c.start.toFixed(1)+"–"+c.end.toFixed(1)+"s · relative audio peak score "+c.score+"/100";
  info.append(title,detail);
  button.type="button";button.className="btn btn-lime";button.textContent="REVIEW IN EDITOR";
  button.addEventListener("click",()=>{
    if(!rights.checked){say("Reconfirm rights before editing.");return;}
    if(videoInput.files?.[0]!==source){say("Selected video changed. Run the audio scan again.");return;}
    root.dispatchEvent(new CustomEvent("cutnova:open-cut",{detail:{file:source,start:c.start,end:c.end}}));
    root.location.hash="#local-editor";
  });
  row.append(info,button);results.append(row);
 }
}

async function run(signal,job,ctx){
 const videoFile=videoInput.files?.[0];
 if(!videoFile)throw Error("Choose a video above before checking audio peaks.");
 if(!/^video\//i.test(videoFile.type||"")&&!/\.(mp4|mov|webm|m4v)$/i.test(videoFile.name||""))
    throw Error("Please select an MP4, MOV or WebM video.");
 if(videoFile.size>500*1024*1024||videoFile.size<1024)throw Error("Video must be between 1 KiB and 500 MB.");
 say("Checking video duration locally…");
 const videoDuration=await metadata(videoFile,"video",signal,job);
 checkAbort(signal,job);
 if(videoDuration>MAX_AUDIO_SECONDS)
   throw Error("Audio energy scan is limited to videos up to 3 minutes. Use Visual Moments or timed cuts for longer videos.");
 const separate=audioInput.files?.[0]||null;
 const source=separate||videoFile;
 if(source.size>MAX_AUDIO_BYTES)
   throw Error("Audio decoding is limited to 20 MB. Choose a smaller video, or select a matching extracted MP3/M4A/WAV track.");
 if(source.size<1024)throw Error("Audio source is empty.");
 if(separate){
   if(!/^audio\//i.test(separate.type||"")&&!/\.(mp3|m4a|wav|aac|ogg)$/i.test(separate.name||""))
     throw Error("Optional source must be an audio file (MP3/M4A/WAV/AAC/OGG).");
   const audioDuration=await metadata(separate,"audio",signal,job);
   checkAbort(signal,job);
   if(Math.abs(audioDuration-videoDuration)>2)
     throw Error("Separate audio duration differs by over 2 seconds. Use an audio track aligned to the full selected video.");
 }
 try{
   say("Decoding a local audio track (no upload). iPhone codec support may vary…");
   const bytes=await source.arrayBuffer();
   checkAbort(signal,job);
   const decoded=await ctx.decodeAudioData(bytes);
   checkAbort(signal,job);
   if(!decoded||!Number.isFinite(decoded.duration)||decoded.duration<15||
      decoded.duration>MAX_AUDIO_SECONDS+2)
      throw Error("The decoded audio is not within the 15–180 second limit.");
   if(Math.abs(decoded.duration-videoDuration)>2)
      throw Error("Decoded audio length does not match the selected video. Cannot align the suggested cuts safely.");
   say("Measuring short audio energy windows locally…");
   const series=energySeries(decoded,Math.min(decoded.duration,videoDuration));
   checkAbort(signal,job);
   const picks=peakWindows(series,Math.min(decoded.duration,videoDuration),count.value,length.value);
   if(!picks.length){
      say("No distinct audio-energy spikes found. Constant background music or normal dialogue may not produce candidates. Try Visual Moments.");
      return;
   }
   display(picks,videoFile,separate?"matched selected audio file":"selected video audio (if browser decoded it)");
   say("Found "+picks.length+" local sound peak suggestion(s). Select one to review; no Shorts or captions were generated.");
 }catch(error){
   if(error?.name==="EncodingError"||error?.name==="NotSupportedError")
     throw Error("This iPhone/browser cannot decode the video audio track. Select a matching MP3/M4A/WAV file or use Visual Moments.");
   throw error;
 }
}

function stopScan(clear=true){
 nonce++;
 if(controller)controller.abort();
 // decodeAudioData() cannot be forcibly stopped in every browser. Keep a
 // second scan locked until the previous decoder's finally has closed it.
 start.disabled=working;cancelBtn.disabled=true;
 if(clear){clearResults();say("Cancelling scan; waiting for local audio decoder to release. Nothing was uploaded.");}
}
start.addEventListener("click",async()=>{
 if(working)return;
 if(!rights.checked){say("Confirm video editing rights above first.");return;}
 if(!videoInput.files?.[0]){say("Choose a local video above first.");return;}
 // Create AudioContext synchronously from the explicit click for iPhone Safari.
 const AudioContextClass=root.AudioContext||root.webkitAudioContext;
 if(typeof AudioContextClass!=="function"){say("Web Audio unavailable. Try Visual Moments or timed cuts.");return;}
 let ctx;
 try{ctx=new AudioContextClass();}
 catch{say("This browser could not start a local audio decoder. Try Visual Moments.");return;}
 const job=++nonce,c=new AbortController();
 working=true;controller=c;start.disabled=true;cancelBtn.disabled=false;clearResults();
 try{await run(c.signal,job,ctx);}
 catch(error){if(job===nonce)say("Audio scan stopped: "+String(error?.message||"Unsupported source").slice(0,210));}
 finally{
   try{await ctx.close();}catch{}
   working=false;controller=null;start.disabled=false;cancelBtn.disabled=true;
 }
});
cancelBtn.addEventListener("click",()=>stopScan());
videoInput.addEventListener("change",()=>{stopScan(false);clearResults();say("Video changed. Confirm rights and start audio peak scan when ready.");});
audioInput.addEventListener("change",()=>{stopScan(false);clearResults();say("Audio source changed. Confirm it belongs to the selected video before starting.");});
root.addEventListener("pagehide",()=>{if(controller)stopScan(false);});
})(typeof window!=="undefined"?window:null);
