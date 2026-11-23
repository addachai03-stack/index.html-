/* CutNova V4.6 — local review workflow for public Twitch clip metadata.
 * NOT video/highlight AI. The site never records, downloads or reposts streams.
 * Queue edits, draft copies and plan downloads require deliberate user action.
 */
(function(root){
  "use strict";
  const KEY="cutnova-moment-review-v1",MAX_QUEUE=20;
  function officialClipURL(uri){
    try{
      if(typeof uri!=="string")return null;
      // Parse the raw path before URL() normalizes dot segments like /../.
      const match=uri.match(/^https:\/\/[^/?#]+(\/[^?#]*)?/);
      if(!match)return null;
      const segments=(match[1]||"/").split("/");
      if(segments.some(part=>{
        try{return ["..","."].includes(decodeURIComponent(part));}
        catch{return true;}
      }))return null;
      const u=new URL(uri);
      if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash)return null;
      if(u.hostname==="clips.twitch.tv" && /^\/[A-Za-z0-9_-]{3,150}\/?$/.test(u.pathname))return u.href;
      if(["www.twitch.tv","twitch.tv"].includes(u.hostname) &&
          /^\/[A-Za-z0-9_]{3,25}\/clip\/[A-Za-z0-9_-]{3,150}\/?$/.test(u.pathname))return u.href;
    }catch{}
    return null;
  }
  function normalizeMoment(raw){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
    const id=String(raw.id||"").trim();
    const url=officialClipURL(raw.url);
    const duration=Number(raw.duration),views=Number(raw.view_count),score=Number(raw.review_score);
    const created=String(raw.created_at||"");
    const date=Date.parse(created);
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||!url||
        !Number.isFinite(duration)||duration<15||duration>60||
        !Number.isSafeInteger(views)||views<0||
        !Number.isInteger(score)||score<0||score>100||
        !Number.isFinite(date)||created.length>40)return null;
    const title=String(raw.title||"Untitled clip").replace(/[\r\n\u0000-\u001f\u007f]/g," ").trim().slice(0,140);
    const reasons=Array.isArray(raw.review_reasons)
      ?raw.review_reasons.filter(x=>typeof x==="string").slice(0,4).map(x=>x.replace(/[\r\n\u0000-\u001f\u007f]/g," ").slice(0,70)):[];
    return {id,url,duration,view_count:views,review_score:score,created_at:created,
      title:title||"Untitled clip",review_reasons:reasons};
  }
  function queueKey(target,moment){return target.platform+":"+target.channel+":"+moment.id;}
  function cleanQueue(raw){
    if(!Array.isArray(raw))return [];
    const seen=new Set(),out=[];
    for(const item of raw.slice(0,MAX_QUEUE*3)){
      if(!item||typeof item!=="object")continue;
      const platform=String(item.platform||"");
      const channel=String(item.channel||"");
      if(platform!=="twitch"||!/^[A-Za-z0-9_]{3,25}$/.test(channel))continue;
      const moment=normalizeMoment(item);
      if(!moment)continue;
      const key=queueKey({platform,channel},moment);
      if(seen.has(key))continue;
      seen.add(key);out.push({platform,channel,...moment});
      if(out.length===MAX_QUEUE)break;
    }
    return out;
  }
  function postingDraft(moment){
    const m=normalizeMoment(moment);
    if(!m)throw Error("No valid official clip selected.");
    return m.title+"\n\n"+
      "Original Twitch clip: "+m.url+"\n"+
      "Draft caption: A moment from the stream. Watch the original clip and add an accurate description before posting.\n"+
      "Suggested tags: #TwitchClips #Livestream #Shorts\n\n"+
      "Metadata-based shortlist only. Check context, creator permission, credits and platform rules. "+
      "No video, transcript, new clip or auto-post was generated.";
  }
  function reviewPlan(queue){
    const entries=cleanQueue(queue);
    if(!entries.length)throw Error("Review queue is empty.");
    return "CUTNOVA / LOCAL REVIEW PLAN\n"+
      "Existing Twitch clips. Metadata-ranked; not video AI or upload-ready licensed footage.\n"+
      "Before republishing, confirm broadcaster permission and clip context.\n\n"+
      entries.map((m,i)=>String(i+1)+". "+m.title+"\nChannel: "+m.channel+"\nOriginal: "+m.url+"\n"+
        "Length: "+m.duration+"s | Views at check: "+m.view_count+" | Review score: "+m.review_score+"/100\n"+
        "Why shortlisted: "+(m.review_reasons.join("; ")||"Official clip metadata")+"\n").join("\n");
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={officialClipURL,normalizeMoment,cleanQueue,queueKey,postingDraft,reviewPlan};
    return;
  }
  if(!root||!root.document)return;
  const d=root.document,by=id=>d.getElementById(id);
  const container=by("moment-list"),info=by("moment-status"),queueBox=by("moment-queue"),
    queueInfo=by("queue-status"),draft=by("moment-draft"),download=by("queue-download"),
    clear=by("queue-clear"),copyDraft=by("moment-copy"),showCount=by("moment-count"),rights=by("live-rights");
  if(!container||!queueBox||!download||!rights)return;
  let candidates=[],target=null,stale=true;
  let queue=[];
  function say(msg){info.textContent=msg;}
  function queueSay(msg){queueInfo.textContent=msg;}
  function loadQueue(){
    try{queue=cleanQueue(JSON.parse(root.localStorage.getItem(KEY)||"[]"));}
    catch{queue=[];}
  }
  function persist(){
    try{root.localStorage.setItem(KEY,JSON.stringify(queue));return true;}
    catch{queueSay("Browser storage unavailable. Queue is only in this open tab.");return false;}
  }
  function plain(text,cls="mini",tag="p"){
    const element=d.createElement(tag);element.className=cls;element.textContent=text;return element;
  }
  function button(label,onclick,cls="btn"){
    const b=d.createElement("button");b.type="button";b.className=cls;b.textContent=label;b.addEventListener("click",onclick);return b;
  }
  function renderQueue(){
    queueBox.replaceChildren();
    if(!queue.length){queueBox.append(plain("No saved moments. Add official Twitch clips from the review shortlist."));}
    for(const moment of queue){
      const card=d.createElement("article");card.className="clip";
      const title=plain(moment.title,"clip-title","h3");
      const subtitle=plain(moment.channel+" · "+moment.duration+"s · review score "+moment.review_score+"/100");
      const actions=d.createElement("div");actions.className="clip-actions";
      const original=d.createElement("a");original.href=moment.url;original.target="_blank";original.rel="noopener noreferrer";
      original.className="btn";original.textContent="VIEW SOURCE ↗";
      actions.append(original,
        button("PREPARE POST DRAFT",()=>{
          if(!rights.checked){queueSay("Confirm editing/reposting rights in section 01 before preparing a post draft.");return;}
          try{draft.value=postingDraft(moment);draft.hidden=false;copyDraft.disabled=false;draft.focus();queueSay("Draft prepared for review. Nothing was posted or downloaded.");}
          catch(e){queueSay(e.message);}
        }),
        button("REMOVE",()=>{
          queue=queue.filter(x=>queueKey(x,x)!==queueKey(moment,moment));
          persist();renderQueue();queueSay("Removed from local review queue.");
        }));
      card.append(title,subtitle,actions);queueBox.append(card);
    }
    download.disabled=!queue.length;
    clear.disabled=!queue.length;
  }
  function addToQueue(moment){
    if(!target||target.platform!=="twitch"){say("First select a Twitch channel and fetch an official result.");return;}
    const m=normalizeMoment(moment);if(!m)return;
    const entry={platform:target.platform,channel:target.channel,...m};
    const key=queueKey(entry,entry);
    if(queue.some(x=>queueKey(x,x)===key)){say("This clip is already in your review queue.");return;}
    if(queue.length>=MAX_QUEUE){say("Queue limit reached (20). Remove an older item first.");return;}
    queue.unshift(entry);persist();renderQueue();
    say("Saved "+m.title+" to this phone's review queue. No video was downloaded or processed.");
  }
  function showCandidates(){
    container.replaceChildren();
    const limit=Math.max(1,Math.min(6,Number(showCount?.value)||3));
    const selected=candidates.slice(0,limit);
    if(!selected.length){container.append(plain("No eligible official Twitch moments found. Configure the API and wait for public 15–60 second clips published in the last 48 hours."));return;}
    for(const [i,m] of selected.entries()){
      const card=d.createElement("article");card.className="clip";
      const header=d.createElement("div");header.className="clip-top";
      header.append(plain(m.title,"clip-title","h3"),plain("#"+(i+1)+" · "+m.review_score+"/100","clip-num","span"));
      const note=plain(m.duration+"s · "+m.view_count.toLocaleString()+" public views · "+
        m.review_reasons.join(" · ")+(stale?" · OLD MONITOR RESULT":""));
      const actions=d.createElement("div");actions.className="clip-actions";
      const view=d.createElement("a");view.href=m.url;view.className="btn";view.target="_blank";view.rel="noopener noreferrer";view.textContent="VIEW CLIP ↗";
      actions.append(view,button("ADD TO REVIEW QUEUE",()=>addToQueue(m),"btn primary"));
      card.append(header,note,actions);container.append(card);
    }
  }
  root.addEventListener("cutnova:live-status",event=>{
    const result=event.detail?.result,targetValue=event.detail?.target;
    if(!result||!targetValue){target=null;candidates=[];stale=true;showCandidates();say("No verified metadata for this channel yet.");return;}
    target=targetValue;
    const checked=Date.parse(result.checked_at||"");
    stale=!Number.isFinite(checked)||Math.abs(Date.now()-checked)>90*60*1000;
    candidates=target.platform==="twitch"&&Array.isArray(result.moment_candidates)
      ?result.moment_candidates.map(normalizeMoment).filter(Boolean).slice(0,6):[];
    say(target.platform==="youtube"?"YouTube public live metadata does not provide Twitch clips for ranking.":
      stale?"Showing previously checked clip metadata; scheduled monitor is stale. No fresh/live claim.":
      candidates.length+" existing Twitch clip(s) shortlisted using metadata only. Not content analysis or auto-generated Shorts.");
    showCandidates();
  });
  showCount?.addEventListener("change",()=>showCandidates());
  copyDraft?.addEventListener("click",async()=>{
    if(!rights.checked){queueSay("Confirm editing/reposting rights before copying the draft.");return;}
    if(!draft.value){queueSay("Select PREPARE POST DRAFT first.");return;}
    try{
      if(!root.navigator?.clipboard?.writeText)throw Error("Clipboard unavailable");
      await root.navigator.clipboard.writeText(draft.value);
      queueSay("Draft copied. Edit and verify context before any manual posting.");
    }catch{
      draft.hidden=false;draft.focus();draft.select();
      queueSay("Clipboard permission unavailable. The draft is selected; use iPhone Copy manually.");
    }
  });
  clear.addEventListener("click",()=>{
    if(!queue.length||!root.confirm("Clear saved review queue on this browser?"))return;
    queue=[];persist();renderQueue();queueSay("Review queue cleared on this browser.");
  });
  download.addEventListener("click",()=>{
    if(!rights.checked){queueSay("Confirm editing/reposting rights before exporting a review plan.");return;}
    try{
      const text=reviewPlan(queue),blob=new Blob([text],{type:"text/plain;charset=utf-8"});
      const url=URL.createObjectURL(blob),a=d.createElement("a");
      a.href=url;a.download="CutNova_Review_Plan.txt";d.body.append(a);a.click();a.remove();
      root.setTimeout(()=>URL.revokeObjectURL(url),30000);
      queueSay("Review-plan download requested. Check iPhone Files / Downloads. No video file was generated.");
    }catch(e){queueSay(e.message||"Could not prepare review plan.");}
  });
  loadQueue();renderQueue();showCandidates();
  queueSay(queue.length+" item(s) saved on this device only. No cloud queue and no automatic publishing.");
})(typeof window!=="undefined"?window:null);
