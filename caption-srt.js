(function(root){"use strict";
function timecode(seconds){
 const n=Number(seconds);if(!Number.isFinite(n)||n<0)throw Error("Time must be zero or greater.");
 const ms=Math.round(n*1000),hours=Math.floor(ms/3600000),minutes=Math.floor(ms/60000)%60,secs=Math.floor(ms/1000)%60,millis=ms%1000;
 return String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(secs).padStart(2,"0")+","+String(millis).padStart(3,"0");
}
function previewCue(rows,seconds){
 const cues=rows.map((r,i)=>({start:Number(r.start),end:Number(r.end),text:String(r.text||"").trim(),index:i})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start&&r.text).sort((a,b)=>a.start-b.start);
 const active=cues.find(c=>seconds>=c.start&&seconds<c.end);
 return {text:active?active.text:"",index:active?active.index:-1,next:cues.find(c=>c.start>seconds)?.start??null,end:cues.length?Math.max(...cues.map(c=>c.end)):0};
}
function timelineSegments(rows){return rows.map((r,i)=>({start:Number(r.start),end:Number(r.end),text:String(r.text||"").trim(),index:i})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.start>=0&&r.end>r.start&&r.text).sort((a,b)=>a.start-b.start);}
function buildSrt(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>12)throw Error("Add 1–12 captions.");
 const cleaned=rows.map((r,i)=>{
  const start=Number(r.start),end=Number(r.end),text=String(r.text||"").replace(/\r\n?/g,"\n").trim();
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error("Caption "+(i+1)+": end must be after start.");
  if(!text||text.length>500)throw Error("Caption "+(i+1)+": enter 1–500 characters.");
  return {start,end,text};
 }).sort((a,b)=>a.start-b.start);
 for(let i=1;i<cleaned.length;i++)if(cleaned[i].start<cleaned[i-1].end)throw Error("Caption timings overlap. Adjust the start or end.");
 return cleaned.map((r,i)=>(i+1)+"\n"+timecode(r.start)+" --> "+timecode(r.end)+"\n"+r.text).join("\n\n")+"\n";
}
if(typeof module!=="undefined"&&module.exports){module.exports={timecode,buildSrt,previewCue,timelineSegments};return;}
if(!root?.document)return;
const doc=root.document,by=id=>doc.getElementById(id),list=by("srt-caption-list"),add=by("srt-caption-add"),make=by("srt-caption-export"),status=by("srt-caption-status"),download=by("srt-caption-download");
if(!list||!add||!make||!status||!download)return;
let count=0,url="",previewFrame=0,previewStart=0,previewRows=[];
function clearUrl(){if(url)root.URL.revokeObjectURL(url);url="";download.hidden=true;download.removeAttribute("href");}
function readRows(){return [...list.querySelectorAll(".srt-caption-row")].map(el=>({start:el.querySelector("input").value,end:el.querySelectorAll("input")[1].value,text:el.querySelector("textarea").value}));}
const previewButton=doc.createElement("button");previewButton.type="button";previewButton.className="btn btn-outline";previewButton.textContent="▶ PLAY CAPTION TIMELINE";
const previewStatus=doc.createElement("p");previewStatus.className="srt-preview-status";previewStatus.setAttribute("role","status");previewStatus.setAttribute("aria-live","polite");previewStatus.textContent="Timeline preview runs captions against a timer only—no video is played or rendered.";
status.insertAdjacentElement("afterend",previewButton);previewButton.insertAdjacentElement("afterend",previewStatus);
const scrub=doc.createElement("input");scrub.type="range";scrub.min="0";scrub.max="6";scrub.step="0.1";scrub.value="0";scrub.setAttribute("aria-label","Seek caption preview time in seconds");scrub.className="srt-caption-scrubber";
const seekLabel=doc.createElement("p");seekLabel.className="srt-preview-seek-label";seekLabel.textContent="0.0s / 6.0s";
const markerRail=doc.createElement("div");markerRail.className="srt-caption-marker-rail";markerRail.setAttribute("aria-label","Caption cue markers");
const seekActions=doc.createElement("div");seekActions.className="srt-preview-seek-actions";
const previous=doc.createElement("button");previous.type="button";previous.className="btn btn-outline";previous.textContent="↶ PREVIOUS CAPTION";
const next=doc.createElement("button");next.type="button";next.className="btn btn-outline";next.textContent="NEXT CAPTION ↷";
seekActions.append(previous,next);previewStatus.insertAdjacentElement("afterend",scrub);scrub.insertAdjacentElement("afterend",markerRail);markerRail.insertAdjacentElement("afterend",seekLabel);seekLabel.insertAdjacentElement("afterend",seekActions);
let timelineRows=[],timelineEnd=6,seekSeconds=0;
function refreshTimeline(rows,seconds){
 timelineRows=rows.map((r,i)=>({start:Number(r.start),end:Number(r.end),text:String(r.text||"").trim(),index:i})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start&&r.text).sort((a,b)=>a.start-b.start);
 timelineEnd=Math.max(1,...timelineRows.map(r=>r.end));scrub.max=String(timelineEnd);scrub.value=String(Math.max(0,Math.min(timelineEnd,seconds)));seekSeconds=Number(scrub.value);
 const cue=previewCue(rows,seekSeconds);seekLabel.textContent=seekSeconds.toFixed(1)+"s / "+timelineEnd.toFixed(1)+"s · "+(cue.text||"No caption here");\n markerRail.replaceChildren();timelineRows.forEach((r,i)=>{const marker=doc.createElement("button");marker.type="button";marker.className="srt-caption-cue-marker";marker.style.left=(r.start/timelineEnd*100)+"%";marker.setAttribute("aria-label","Jump to caption "+(i+1)+" at "+r.start.toFixed(1)+" seconds");marker.title="Caption "+(i+1)+" · "+r.start.toFixed(1)+"s";marker.textContent=String(i+1);marker.addEventListener("click",()=>seekTo(r.start));markerRail.append(marker);});
}
function seekTo(seconds){const bounded=Math.max(0,Math.min(timelineEnd,Number(seconds)||0));scrub.value=String(bounded);seekSeconds=bounded;if(previewFrame)previewStart=Date.now()-bounded*1000;refreshTimeline(previewRows.length?previewRows:readRows(),bounded);previewStatus.textContent="TIMELINE "+bounded.toFixed(1)+"s · "+(previewCue(previewRows.length?previewRows:readRows(),bounded).text||"No caption at this time.");}
scrub.addEventListener("input",()=>seekTo(scrub.value));
previous.addEventListener("click",()=>{const rows=previewRows.length?previewRows:readRows(),cues=rows.map(r=>Number(r.start)).filter(n=>Number.isFinite(n)&&n<seekSeconds).sort((a,b)=>b-a);seekTo(cues[0]??0);});
next.addEventListener("click",()=>{const rows=previewRows.length?previewRows:readRows(),cues=rows.map(r=>Number(r.start)).filter(n=>Number.isFinite(n)&&n>seekSeconds).sort((a,b)=>a-b);seekTo(cues[0]??timelineEnd);});
function stopPreview(message){if(previewFrame)root.cancelAnimationFrame(previewFrame);previewFrame=0;previewButton.textContent="▶ PLAY CAPTION TIMELINE";if(message)previewStatus.textContent=message;}
function row(start="0",end="3",value=""){
 if(count>=12){status.textContent="Maximum 12 caption lines.";return;}
 count++;const box=doc.createElement("div");box.className="srt-caption-row";
 const label=(name,caption)=>{const l=doc.createElement("label");l.textContent=caption;const input=doc.createElement("input");input.type="number";input.min="0";input.max="3600";input.step="0.1";input.value=name;l.append(input);return {l,input};};
 const a=label(start,"START (SEC)"),b=label(end,"END (SEC)");const t=doc.createElement("label");t.textContent="CAPTION TEXT";const textarea=doc.createElement("textarea");textarea.maxLength=500;textarea.rows=2;textarea.placeholder="Type the words for this moment";textarea.value=value;t.append(textarea);
 const remove=doc.createElement("button");remove.type="button";remove.className="btn btn-outline";remove.textContent="REMOVE";remove.addEventListener("click",()=>{box.remove();count--;clearUrl();status.textContent="Caption removed. Export again to refresh the SRT.";});
 [a.l,b.l,t,remove].forEach(x=>box.append(x));list.append(box);[a.input,b.input,textarea].forEach(x=>x.addEventListener("input",()=>{clearUrl();previewRows=[];stopPreview("Caption changed. Restart preview to check the updated timing.");refreshTimeline(readRows(),seekSeconds);}));
}
row();row("3","6");
add.addEventListener("click",()=>row(String(count*3),String(count*3+3)));
previewButton.addEventListener("click",()=>{
 if(previewFrame){stopPreview("Timeline preview stopped.");return;}
 try{previewRows=readRows();buildSrt(previewRows);refreshTimeline(previewRows,0);}catch(e){previewStatus.textContent="PREVIEW UNAVAILABLE — "+e.message;return;}
 previewStart=Date.now()-seekSeconds*1000;refreshTimeline(previewRows,seekSeconds);previewButton.textContent="■ STOP PREVIEW";
 const tick=()=>{const seconds=(Date.now()-previewStart)/1000,cue=previewCue(previewRows,seconds);seekTo(seconds);previewStatus.textContent="TIMELINE "+seconds.toFixed(1)+"s · "+(cue.text||"No caption at this time.");if(seconds>=timelineEnd){stopPreview("Timeline preview complete. This was a text timing preview, not a video render.");return;}previewFrame=root.requestAnimationFrame(tick);};tick();
});
make.addEventListener("click",()=>{
 stopPreview("Caption export started.");
 try{
  const rows=readRows();
  const srt=buildSrt(rows),blob=new Blob([srt],{type:"text/plain;charset=utf-8"});
  clearUrl();url=URL.createObjectURL(blob);download.href=url;download.hidden=false;status.textContent="SRT CREATED LOCALLY. Save the file, then import it in a video editor that supports subtitles. No video or caption was uploaded.";
 }catch(e){clearUrl();status.textContent="NOT EXPORTED — "+e.message;}
});
root.addEventListener("pagehide",()=>{clearUrl();stopPreview();});
})(typeof window!=="undefined"?window:null);
