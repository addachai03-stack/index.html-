/**
 * CutNova static project dashboard.
 * Local-first: own video files are segmented into editable cut suggestions on-device.
 * Social links are preview-only; CORS-enabled direct media URLs may be fetched
 * locally. No GitHub Issue is opened by the main Generate button.
 */
const ACTIONS_URL = "https://github.com/addachai03-stack/index.html-/actions/workflows/shorts.yml";
const EXAMPLE_URL = "https://youtu.be/XD-6LDZzXJ0";
const SAMPLE_URL = "https://remotion.media/video-1m.mp4";
const byId = id => document.getElementById(id);
const elements = {
  form: byId("url-form"), input: byId("video-url"), panel: byId("source-panel"),
  provider: byId("source-provider"), original: byId("source-original"),
  frame: byId("embed-wrapper"), message: byId("message"), rights: byId("rights-confirm"),
  rightsTip: byId("rights-tip"), action: byId("submit-request"),
  clips: byId("clips-count"), min: byId("min-seconds"), max: byId("max-seconds"),
  style: byId("highlight-style"), language: byId("speech-language"), crop: byId("smart-crop"), script: byId("caption-script"), captionStyle: byId("caption-style"), pacing: byId("pacing")
};
let current = null;
const quick = {
  file: byId("quick-file"),count: byId("quick-count"),length: byId("quick-length"),
  rights: byId("quick-rights"),start: byId("quick-generate"),
  status: byId("quick-status"),results: byId("quick-results"),
  advanced: byId("owner-github-render")
};
let quickFile = null, quickBusy = false, awaitingSocialFile = false;
function quickMessage(message) { quick.status.textContent = message; }
function cutWindows(duration,count,maxLength,minLength=15) {
  if(!Number.isFinite(duration)||duration<1)throw Error("Video must be at least 1 second.");
  const requested=Math.max(1,Math.min(10,Math.trunc(Number(count)||1)));
  const maximum=Math.max(1,Math.min(60,Number(maxLength)||15));
  const minimum=Math.max(1,Math.min(maximum,Number(minLength)||15));
  // Choose feasible, mostly non-overlapping sections. Never return the whole
  // 60-second source as the only cut when multiple 15s cuts can be made.
  const feasible=Math.max(1,Math.floor(duration/minimum));
  const n=Math.min(requested,feasible);
  const clipLength=Math.min(maximum,duration/n);
  const space=Math.max(0,duration-clipLength);
  return Array.from({length:n},(_,i)=>{
    const start=Number((n===1?0:space*i/(n-1)).toFixed(2));
    const end=Number(Math.min(duration,start+clipLength).toFixed(2));
    return {start,end};
  });
}
function readVideoDuration(file){
  return new Promise((resolve,reject)=>{
    const video=document.createElement("video"),url=URL.createObjectURL(file);
    let done=false;
    const cleanup=()=>{video.removeAttribute("src");video.load();URL.revokeObjectURL(url)};
    const finish=(value,error)=>{
      if(done)return;done=true;clearTimeout(timer);cleanup();
      if(error)reject(error);else resolve(value);
    };
    const timer=setTimeout(()=>finish(0,Error("Video metadata timed out. Try a browser-compatible MP4.")),25000);
    video.preload="metadata";
    video.onloadedmetadata=()=>{
      if(!Number.isFinite(video.duration)||video.duration<1)finish(0,Error("Video duration is unavailable or too short."));
      else finish(video.duration);
    };
    video.onerror=()=>finish(0,Error("Cannot read video. Try an MP4 with H.264/AAC encoding."));
    video.src=url;video.load();
  });
}
function showQuickCuts(file,windows){
  quick.results.replaceChildren();
  windows.forEach((segment,index)=>{
    const item=document.createElement("div");item.className="quick-cut";
    const info=document.createElement("div"),name=document.createElement("strong"),detail=document.createElement("small");
    name.textContent="CUT "+String(index+1).padStart(2,"0");
    detail.textContent=time(segment.start)+"–"+time(segment.end)+" · "+(segment.end-segment.start).toFixed(1)+" sec";
    info.append(name,detail);
    const button=document.createElement("button");button.className="btn btn-lime";
    button.type="button";button.textContent="EDIT & EXPORT";
    button.addEventListener("click",()=>{
      window.dispatchEvent(new CustomEvent("cutnova:open-cut",{detail:{file,start:segment.start,end:segment.end}}));
      location.hash="#local-editor";
    });
    item.append(info,button);quick.results.append(item);
  });
  quick.results.hidden=false;
}
async function prepareLocal(file,count,length,minLength=15){
  if(!file)throw Error("Choose your own video from your phone first.");
  if(file.size>500*1024*1024)throw Error("Video must be under 500 MB for mobile editing.");
  if(!/^video\//i.test(file.type||"")&&!/\.(mp4|mov|webm|m4v)$/i.test(file.name))throw Error("Select an MP4, MOV, M4V or WebM video.");
  quickMessage("Reading video duration on this phone…");
  const duration=await readVideoDuration(file);
  const windows=cutWindows(duration,count,length,minLength);
  quickFile=file;showQuickCuts(file,windows);
  quickMessage("Prepared "+windows.length+" of "+Math.min(10,Math.max(1,Number(count)||1))+" requested timed cut"+(windows.length===1?"":"s")+". "+(windows.length<Number(count)?"Video is too short for more distinct cuts at the selected minimum length. ":"")+"Tap EDIT & EXPORT on each cut to make a video file. AI highlight selection is not enabled in this local mode.");
  return windows;
}
async function fetchDirectMedia(url){
  const limit=100*1024*1024, controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),60000);
  try{
    let response;
    try{response=await fetch(url,{method:"GET",mode:"cors",credentials:"omit",signal:controller.signal});}
    catch(error){throw Error(controller.signal.aborted?"Video download timed out after 60 seconds. Try a smaller MP4.":"Browser cannot access this video URL. Host CORS policy, a private link or network issue may be blocking it.");}
    if(!response.ok)throw Error("HTTP "+response.status);
    const reported=Number(response.headers.get("content-length")||0);
    if(reported>limit)throw Error("Video exceeds the 100 MB direct-link limit.");
    const contentType=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    if(contentType&&!contentType.startsWith("video/")&&contentType!=="application/octet-stream")
      throw Error("That URL did not return a video.");
    const chunks=[];let bytes=0;
    if(response.body&&response.body.getReader){
      const reader=response.body.getReader();
      while(true){
        const {done,value}=await reader.read();if(done)break;
        bytes+=value.byteLength;
        if(bytes>limit){controller.abort();throw Error("Video exceeds the 100 MB direct-link limit.")}
        chunks.push(value);
      }
    }else{
      const blob=await response.blob();bytes=blob.size;if(bytes>limit)throw Error("Direct video is too large.");chunks.push(blob);
    }
    if(bytes<1024)throw Error("The video file is empty.");
    const rawName=url.split("/").pop().split("?")[0]||"source.mp4";
    const safeName=rawName.replace(/[^a-zA-Z0-9_.-]/g,"_").slice(0,80)||"source";
    const extension=contentType==="video/webm"?".webm":contentType==="video/quicktime"?".mov":".mp4";
    const filename=/\.(mp4|mov|m4v|webm)$/i.test(safeName)?safeName:(safeName.replace(/\.[a-z0-9]{1,8}$/i,"")||"source")+extension;
    return new File(chunks,filename,{type:contentType==="application/octet-stream"?"video/mp4":(contentType||"video/mp4")});
  } finally{clearTimeout(timeout)}
}
quick.file.addEventListener("change",async()=>{
  const file=quick.file.files?.[0]||null;
  if(!file)return;
  quickFile=file;
  quick.results.hidden=true;
  quick.results.replaceChildren();
  if(awaitingSocialFile){
    awaitingSocialFile=false;
    quick.rights.checked=!!elements.rights.checked;
    if(!quick.rights.checked){quickMessage("Confirm video rights before preparing cuts.");return}
    if(quickBusy)return;
    quickBusy=true;quick.start.disabled=true;
    quickMessage("Saved video selected. Preparing editable local Shorts…");
    try{
      await prepareLocal(file,quick.count.value,quick.length.value,elements.min.value);
      byId("quick-shorts").scrollIntoView({behavior:"smooth",block:"start"});
      showMessage("Saved video ready! Tap EDIT & EXPORT on a cut below. Video stays on your phone.",true);
    }catch(e){quickMessage(e.message||"Could not prepare the selected video.");}
    finally{quickBusy=false;quick.start.disabled=false;}
    return;
  }
  quickMessage(file.name+" selected. Confirm rights and tap PREPARE SHORTS ON PHONE.");
});
quick.start.addEventListener("click",async()=>{
  if(quickBusy)return;
  if(!quick.rights.checked){quickMessage("Confirm your editing rights first.");return}
  const file=quickFile||quick.file.files?.[0];
  if(!file){quickMessage("Choose a video file from your phone first.");quick.file.click();return}
  quickBusy=true;quick.start.disabled=true;
  try{await prepareLocal(file,quick.count.value,quick.length.value)}
  catch(e){quickMessage(e.message||"Could not prepare this video.")}
  finally{quickBusy=false;quick.start.disabled=false}
});

const clipsExample = [
  {title:"Shinchan ki asli awaaz!", start:189, end:223,
   hook:"Shinchan ki shararati voice ke peeche kaun hai?", label:"MOST SURPRISING"},
  {title:"Motu Patlu, ek hi voice artist?", start:9, end:43,
   hook:"Aapko pata tha Motu aur Patlu ki awaaz kaun deta hai?", label:"VOICE REVEAL"},
  {title:"Oggy ka Bollywood connection", start:232, end:264,
   hook:"Oggy ke famous characters ki dubbing Bollywood se judi?", label:"CURIOSITY"},
  {title:"Doraemon ki voice badli!", start:119, end:157,
   hook:"Doraemon ki awaaz 2020 ke baad kisne di?", label:"NOSTALGIA"},
  {title:"Chhota Bheem behind the voice", start:52, end:95,
   hook:"Chhota Bheem ki powerful awaaz ke peeche kaun?", label:"BIG REVEAL"},
  {title:"Oggy ke funny character voices", start:261, end:314,
   hook:"Oggy ki ek voice artist itne saare characters?", label:"FUNNY MOMENTS"}
];

function time(sec) {
  const n = Math.floor(Number(sec) || 0);
  return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
}

function providerFor(raw) {
  let url;
  try { url = new URL(raw.trim()); }
  catch { throw new Error("Valid full link paste karo (https://...)"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port) {
    throw new Error("Sirf public HTTPS video links supported hain; login credentials aur ports nahi.");
  }
  if ([...url.searchParams.keys()].some(k=>["token","access_token","auth","authorization","password","key","api_key","signature","sig","credential","expires"].includes(k.toLowerCase())||/^(x-amz-|x-goog-)/i.test(k))) throw new Error("Private or signed URL parameters are unsafe in this public project.");
  url.hash="";
  const host = url.hostname.toLowerCase().replace(/^www\./,"").replace(/^m\./,"");
  if (host === "youtu.be" || host === "youtube.com" || host === "music.youtube.com" ||
      host === "youtube-nocookie.com") {
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/")[1] || "";
    else if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else if (/^\/(shorts|live|embed)\//.test(url.pathname)) id = url.pathname.split("/")[2] || "";
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error("YouTube single video link chahiye, playlist nahi.");
    return {url, kind:"youtube", name:"YouTube", id};
  }
  if (host === "instagram.com" || host === "instagr.am") {
    const match = url.pathname.match(/^\/(reel|p|tv)\/([a-zA-Z0-9_-]+)/);
    if (!match) throw new Error("Instagram Reel / Post ka public URL paste karo.");
    return {url, kind:"instagram", name:"Instagram", id:match[2], type:match[1]};
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = url.pathname.match(/\/(?:video\/)?(\d+)/);
    return {url, kind:"vimeo", name:"Vimeo", id:match ? match[1] : null};
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return {url, kind:"tiktok", name:"TikTok"};
  }
  if (host === "facebook.com" || host === "fb.watch" || host === "fb.com") {
    return {url, kind:"facebook", name:"Facebook"};
  }
  if (["dailymotion.com","dai.ly","x.com","twitter.com"].includes(host)) {
    return {url, kind:"social", name:host};
  }
  if (host === "github.com" &&
      /^\/user-attachments\/assets\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/?$/i.test(url.pathname)) {
    return {url, kind:"github-upload", name:"Your public GitHub video attachment"};
  }
  if (/\.(mp4|mov|m4v|webm)$/i.test(url.pathname)) {
    return {url, kind:"video", name:"Direct video file"};
  }
  // CDN download endpoints may not end in .mp4; validate the response MIME on import.
  return {url, kind:"candidate", name:"Direct video link (unverified)"};
}

function showMessage(message, success=false) {
  elements.message.textContent = message;
  elements.message.hidden = false;
  elements.message.classList.toggle("ok", success);
}
function clearMessage() { elements.message.hidden = true; }

function makeFrame(type, src) {
  const frame = document.createElement("iframe");
  frame.title = type+" original source video";
  frame.src = src;
  frame.allow = "autoplay; encrypted-media; picture-in-picture; web-share; fullscreen";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  frame.loading = "lazy";
  return frame;
}

function drawSource(source) {
  elements.panel.hidden = false;
  const editable=["video","candidate","github-upload"].includes(source.kind);
  elements.provider.textContent = source.name.toUpperCase()+(editable?" · DIRECT MP4 / CLOUD AI":" · PREVIEW / CLOUD AI ATTEMPT");
  const clarity=byId("source-clarity");
  if(clarity)clarity.textContent=editable?
    "Direct video-file import works only if the host allows browser downloads (CORS). For actual AI-selected Shorts, use the secure owner cloud renderer below with permission to edit the video.":
    "Preview only: this iPhone browser cannot extract YouTube/Instagram MP4s. The separate owner cloud renderer can TRY to fetch permitted public videos, but social-site anti-bot, sign-in and DRM blocks may stop it. If blocked, use an authorized saved copy in local editing below (local cuts are not AI-selected).";
  elements.original.href = source.url.href;
  elements.frame.replaceChildren();
  elements.frame.hidden = false;
  const videoURL = source.url.href;
  let frame = null;
  if (source.kind === "youtube") {
    frame = makeFrame("YouTube", "https://www.youtube-nocookie.com/embed/"+source.id+"?playsinline=1&rel=0");
  } else if (source.kind === "instagram") {
    frame = makeFrame("Instagram", "https://www.instagram.com/"+source.type+"/"+source.id+"/embed/");
  } else if (source.kind === "vimeo" && source.id) {
    frame = makeFrame("Vimeo", "https://player.vimeo.com/video/"+source.id);
  } else if (source.kind === "facebook") {
    frame = makeFrame("Facebook", "https://www.facebook.com/plugins/video.php?href="+encodeURIComponent(videoURL));
  } else if (source.kind === "video") {
    const video = document.createElement("video");
    video.src = videoURL;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    frame = video;
  } else {
    elements.frame.hidden = true;
  }
  if (frame) elements.frame.append(frame);
  updateRights();
  elements.panel.scrollIntoView({behavior:"smooth", block:"start"});
}

function buildIssueUrl() {
  if (!current) return "#";
  const body = [
    "CUTNOVA_REQUEST_V1",
    "URL: "+current.url.href,
    "CLIPS: "+elements.clips.value,
    "MIN_SECONDS: "+elements.min.value,
    "MAX_SECONDS: "+elements.max.value,
    "STYLE: "+elements.style.value,
    "LANGUAGE: "+elements.language.value,
    "CROP: "+elements.crop.value,
    "CAPTION_SCRIPT: "+elements.script.value,
    "CAPTION_STYLE: "+elements.captionStyle.value,
    "PACING: "+elements.pacing.value,
    "RIGHTS: YES",
    "",
    "I own this video or have permission to edit and republish its content.",
    "I understand this GitHub Issue is public and source access may be blocked."
  ].join("\n");
  return "https://github.com/addachai03-stack/index.html-/issues/new?title="+
    encodeURIComponent("[CutNova] Generate Shorts")+
    "&body="+encodeURIComponent(body);
}

function updateRights() {
  const min=Number(elements.min.value),max=Number(elements.max.value),count=Number(elements.clips.value);
  const validDuration = Number.isInteger(min)&&Number.isInteger(max)&&min>=15&&max<=60&&min<=max&&Number.isInteger(count)&&count>=1&&count<=10;
  const accepted = !!(current && elements.rights.checked && validDuration);
  const downloadable=!!(current&&["video","candidate","github-upload"].includes(current.kind));
  elements.action.textContent=downloadable?"✦ IMPORT VIDEO & PREPARE CUTS →":"✂ CHOOSE SAVED VIDEO TO EDIT →";
  elements.action.disabled = !accepted;
  elements.action.setAttribute("aria-disabled", String(!accepted));
  quick.advanced.classList.toggle("disabled-link", !accepted);
  quick.advanced.setAttribute("aria-disabled", String(!accepted));
  quick.advanced.href = accepted ? buildIssueUrl() : "#";
  elements.rightsTip.textContent = !validDuration
    ? "Use 1–10 clips and min/max lengths from 15–60 seconds. Set both to 30 for exact 30-second clips."
    : accepted
      ? (downloadable ? "Imports an authorized video into CutNova if the source allows browser downloads (CORS). No GitHub redirect." : "Social URL can be previewed but not converted here. This button opens your phone's file picker for your own saved video.")
      : "Confirm rights to enable local editing. Social links need an authorized saved video; direct links need browser CORS access.";
}

elements.form.addEventListener("submit", event => {
  event.preventDefault();
  clearMessage();
  try {
    current=providerFor(elements.input.value);
    awaitingSocialFile=false;
    drawSource(current);
    const downloadable=["video","candidate","github-upload"].includes(current.kind);
    if(!elements.rights.checked){
      showMessage("Local cuts need your editing rights. For cloud AI use ✦ AI SHORTS FROM URL. Tick the URL form rights checkbox above only for footage you may edit; a YouTube preview cannot be downloaded locally.",false);
      elements.rights.focus({preventScroll:true});
      return;
    }
    if(downloadable){
      showMessage("Direct video URL identified. Importing the file and preparing cuts on your phone…",true);
      elements.action.click();
    }else{
      quick.count.value=String(elements.clips.value);
      quick.length.value=String(Number(elements.max.value));
      quick.rights.checked=true;
      awaitingSocialFile=true;
      showMessage("This is a social video page, not an MP4 file. CutNova cannot auto-download its video. Choose an authorized saved video from your phone to create timed cuts now.",false);
      quick.file.click();
    }
  }catch(error){
    current=null;
    elements.panel.hidden=true;
    awaitingSocialFile=false;
    showMessage(error.message||"Invalid URL. Paste a full public HTTPS link.",false);
  }
});


// Separate owner-only server-side AI path. Social URLs may be blocked upstream.
byId("ai-url-start")?.addEventListener("click",()=>{
  clearMessage();
  try{
    current=providerFor(elements.input.value);
    awaitingSocialFile=false;
    drawSource(current);
    const ownerPanel=byId("owner-render-tools");
    if(ownerPanel)ownerPanel.open=true;
    if(!elements.rights.checked){
      showMessage("AI not started: tick the URL form's editing-rights checkbox (directly below PASTE LONG VIDEO LINK) for footage you can lawfully edit. The local backup checkbox is separate.",false);
      elements.rights.focus({preventScroll:true});
      elements.rights.scrollIntoView({block:"center",behavior:"smooth"});
    }else{
      showMessage("Owner AI settings opened. Set the clip count/seconds, paste your saved owner key, then START PRIVATE AI RENDER. A public social link is not guaranteed downloadable; GitHub will show real success or failure.",true);
    }
    if(elements.rights.checked)(ownerPanel||elements.panel).scrollIntoView({block:"start",behavior:"smooth"});
  }catch(error){current=null;elements.panel.hidden=true;showMessage(error.message||"Enter a valid public HTTPS video URL.",false);}
});

elements.rights.addEventListener("change", updateRights);
[elements.clips,elements.min,elements.max,elements.style,elements.language,elements.crop,elements.script,elements.captionStyle,elements.pacing].forEach(field => field.addEventListener("change", updateRights));
elements.action.addEventListener("click", async () => {
  if(!current||!elements.rights.checked||!Number.isInteger(Number(elements.min.value))||Number(elements.min.value)<15||Number(elements.max.value)>60||Number(elements.min.value)>Number(elements.max.value)||!Number.isInteger(Number(elements.clips.value))||Number(elements.clips.value)<1||Number(elements.clips.value)>10){
    showMessage("Choose a valid source and confirm rights.",false);return;
  }
  quick.count.value=String(Number(elements.clips.value));
  quick.length.value=String(Number(elements.max.value));
  quick.rights.checked=true;
  if(!["video","candidate","github-upload"].includes(current.kind)){
    awaitingSocialFile=true;
    showMessage("Social links cannot supply editable video bytes here. Choose your own saved copy from Files or Photos; CutNova will prepare the selected video automatically.",false);
    quick.file.click();return;
  }
  if(quickBusy)return;
  elements.action.disabled=true;quickBusy=true;
  showMessage("Trying to load this direct video on your phone. Host CORS rules apply…",true);
  try{
    const file=await fetchDirectMedia(current.url.href);
    await prepareLocal(file,quick.count.value,quick.length.value,elements.min.value);
    document.getElementById("quick-shorts").scrollIntoView({block:"start",behavior:"smooth"});
    showMessage("Video loaded locally. Choose EDIT & EXPORT above. GitHub was not opened.",true);
  }catch(e){
    showMessage("Could not import this URL: "+(e.message||"browser blocked it")+". Try a public CORS-enabled MP4 link or choose your own saved video above.",false);
  }finally{quickBusy=false;updateRights();}
});
quick.advanced.addEventListener("click",event=>{
  if(!current||!elements.rights.checked||!Number.isInteger(Number(elements.min.value))||Number(elements.min.value)<15||Number(elements.max.value)>60||Number(elements.min.value)>Number(elements.max.value)||!Number.isInteger(Number(elements.clips.value))||Number(elements.clips.value)<1||Number(elements.clips.value)>10){
    event.preventDefault();showMessage("Confirm rights first. GitHub is public.",false);
  }
});
byId("copy-url").addEventListener("click", async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(current.url.href);
    showMessage("Source URL copied.", true);
  } catch (error) {
    const temp = document.createElement("textarea");
    temp.value = current.url.href;
    temp.setAttribute("readonly","");
    document.body.append(temp);
    temp.select();
    const copied = document.execCommand("copy");
    temp.remove();
    showMessage(copied ? "Link copied." : "Browser clipboard blocked; URL field se manually copy karo.",copied);
  }
});
byId("load-ai-test-video")?.addEventListener("click",()=>{
  // Select an original authorized fixture; do not imply rights or start cloud jobs.
  elements.input.value=SAMPLE_URL;
  elements.clips.value="2";
  elements.min.value="30";
  elements.max.value="30";
  elements.style.value="engagement";
  elements.crop.value="center";
  current=providerFor(SAMPLE_URL);
  awaitingSocialFile=false;
  drawSource(current);
  const ownerPanel=byId("owner-render-tools");
  if(ownerPanel)ownerPanel.open=true;
  updateRights();
  if(!elements.rights.checked){
    showMessage("Royalty-free sample MP4 selected: 2 Shorts × 30 seconds. Review and tick the URL form's rights checkbox just below the link, then enter your Owner Access Key and press START PRIVATE AI RENDER. No render has started.",true);
    elements.rights.focus({preventScroll:true});
    elements.rights.scrollIntoView({block:"center",behavior:"smooth"});
  }else{
    showMessage("Sample MP4 selected: 2 × 30 seconds. Enter your Owner Access Key in the expanded panel and press START PRIVATE AI RENDER. No render has started.",true);
    ownerPanel?.scrollIntoView({block:"start",behavior:"smooth"});
  }
});
byId("load-example").addEventListener("click", () => {
  elements.input.value = EXAMPLE_URL;
  elements.form.requestSubmit();
});
byId("load-test-video").addEventListener("click", () => {
  elements.input.value = SAMPLE_URL;
  elements.form.requestSubmit();
});

const cutsArea = byId("example-cuts");
clipsExample.forEach((cut, index) => {
  const article = document.createElement("article");
  article.className = "cut-card";
  const top = document.createElement("div");
  top.className = "cut-top";
  const tag = document.createElement("span");
  tag.className = "cut-tag";
  tag.textContent = String(index+1).padStart(2,"0")+" / "+cut.label;
  const timeRange = document.createElement("span");
  timeRange.className = "cut-time";
  timeRange.textContent = time(cut.start)+"—"+time(cut.end);
  top.append(tag,timeRange);
  const title = document.createElement("h3");
  title.textContent = cut.title;
  const hook = document.createElement("p");
  hook.textContent = "HOOK: "+cut.hook;
  const link = document.createElement("a");
  link.href = "https://www.youtube.com/watch?v=XD-6LDZzXJ0&t="+cut.start+"s";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "CHECK SOURCE AT "+time(cut.start)+"  ↗";
  article.append(top,title,hook,link);
  cutsArea.append(article);
});

const params = new URLSearchParams(location.search);
if (params.get("video") === "cartoon") {
  elements.input.value = EXAMPLE_URL;
  elements.form.requestSubmit();
}
