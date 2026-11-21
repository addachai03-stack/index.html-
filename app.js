/**
 * CutNova static project dashboard.
 * The browser does NOT download social-platform videos or start GitHub Actions.
 * It validates/embeds public links and directs users to the authorized GitHub Action.
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
  style: byId("highlight-style"), language: byId("speech-language"), crop: byId("smart-crop")
};
let current = null;

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
  throw new Error("Public social video link, GitHub video upload, ya direct MP4/MOV/WebM URL paste karo.");
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
  elements.provider.textContent = source.name.toUpperCase()+" · ORIGINAL SOURCE";
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
  const validDuration = Number(elements.min.value) <= Number(elements.max.value);
  const accepted = !!(current && elements.rights.checked && validDuration);
  elements.action.classList.toggle("disabled-link", !accepted);
  elements.action.setAttribute("aria-disabled", String(!accepted));
  elements.action.href = accepted ? buildIssueUrl() : "#";
  elements.rightsTip.textContent = !validDuration
    ? "Minimum clip length maximum se badi nahi ho sakti."
    : accepted
      ? "Generate My Shorts opens a pre-filled PUBLIC GitHub Issue. Tap Submit new issue to trigger owner-only processing. No token or password needed."
      : "Confirm content rights to unlock the Generate button. Public GitHub Issues will show your URL/settings. Do not share private links or GitHub tokens.";
}

elements.form.addEventListener("submit", event => {
  event.preventDefault();
  clearMessage();
  try {
    current = providerFor(elements.input.value);
    elements.rights.checked = false;
    drawSource(current);
    showMessage(current.kind === "youtube" ? "YouTube link format valid hai, lekin YouTube GitHub downloads ko bot verification se block kar sakta hai. Agar blocked ho, neeche UPLOAD OWN VIDEO option se apni MP4 upload karo." : "Public source recognized: "+current.name+". GitHub Issue submit karne par authorized media process hogi. Ye original preview hai, rendered Short nahi.",true);
  } catch (error) {
    current = null;
    elements.panel.hidden = true;
    showMessage(error.message || "Invalid URL");
  }
});

elements.rights.addEventListener("change", updateRights);
[elements.clips,elements.min,elements.max,elements.style,elements.language,elements.crop].forEach(field => field.addEventListener("change", updateRights));
elements.action.addEventListener("click", event => {
  if (!current || !elements.rights.checked || Number(elements.min.value) > Number(elements.max.value)) {
    event.preventDefault();
    showMessage("Valid clip duration aur video editing rights confirm karo.",false);
  }
});
byId("copy-url").addEventListener("click", async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(current.url.href);
    showMessage("URL copied. GitHub Action ke manual URL field mein paste kar sakte ho.", true);
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
