(function(root){"use strict";
function timecode(seconds){
 const n=Number(seconds);if(!Number.isFinite(n)||n<0)throw Error("Time must be zero or greater.");
 const ms=Math.round(n*1000),hours=Math.floor(ms/3600000),minutes=Math.floor(ms/60000)%60,secs=Math.floor(ms/1000)%60,millis=ms%1000;
 return String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0")+":"+String(secs).padStart(2,"0")+","+String(millis).padStart(3,"0");
}
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
if(typeof module!=="undefined"&&module.exports){module.exports={timecode,buildSrt};return;}
if(!root?.document)return;
const doc=root.document,by=id=>doc.getElementById(id),list=by("srt-caption-list"),add=by("srt-caption-add"),make=by("srt-caption-export"),status=by("srt-caption-status"),download=by("srt-caption-download");
if(!list||!add||!make||!status||!download)return;
let count=0,url="";
function clearUrl(){if(url)root.URL.revokeObjectURL(url);url="";download.hidden=true;download.removeAttribute("href");}
function row(start="0",end="3",value=""){
 if(count>=12){status.textContent="Maximum 12 caption lines.";return;}
 count++;const box=doc.createElement("div");box.className="srt-caption-row";
 const label=(name,caption)=>{const l=doc.createElement("label");l.textContent=caption;const input=doc.createElement("input");input.type="number";input.min="0";input.max="3600";input.step="0.1";input.value=name;l.append(input);return {l,input};};
 const a=label(start,"START (SEC)"),b=label(end,"END (SEC)");const t=doc.createElement("label");t.textContent="CAPTION TEXT";const textarea=doc.createElement("textarea");textarea.maxLength=500;textarea.rows=2;textarea.placeholder="Type the words for this moment";textarea.value=value;t.append(textarea);
 const remove=doc.createElement("button");remove.type="button";remove.className="btn btn-outline";remove.textContent="REMOVE";remove.addEventListener("click",()=>{box.remove();count--;clearUrl();status.textContent="Caption removed. Export again to refresh the SRT.";});
 [a.l,b.l,t,remove].forEach(x=>box.append(x));list.append(box);[a.input,b.input,textarea].forEach(x=>x.addEventListener("input",clearUrl));
}
row();row("3","6");
add.addEventListener("click",()=>row(String(count*3),String(count*3+3)));
make.addEventListener("click",()=>{
 try{
  const rows=[...list.querySelectorAll(".srt-caption-row")].map(el=>({start:el.querySelector("input").value,end:el.querySelectorAll("input")[1].value,text:el.querySelector("textarea").value}));
  const srt=buildSrt(rows),blob=new Blob([srt],{type:"text/plain;charset=utf-8"});
  clearUrl();url=URL.createObjectURL(blob);download.href=url;download.hidden=false;status.textContent="SRT CREATED LOCALLY. Save the file, then import it in a video editor that supports subtitles. No video or caption was uploaded.";
 }catch(e){clearUrl();status.textContent="NOT EXPORTED — "+e.message;}
});
root.addEventListener("pagehide",clearUrl);
})(typeof window!=="undefined"?window:null);
