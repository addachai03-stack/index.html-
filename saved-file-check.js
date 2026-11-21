/* CutNova V3.9 — user-selected iPhone Files round-trip check.
 * No hidden access to Files, no uploads or storage. Compare the exported blob
 * with a user-selected downloaded file byte-for-byte, then observe playback.
 */
(function(root){
  "use strict";
  const BLOCK=1024*1024;
  const MAX_BYTES=512*1024*1024;
  function sameSize(a,b){
    return !!a&&!!b&&Number.isFinite(a.size)&&a.size===b.size;
  }
  async function equalMedia(a,b,blockSize=BLOCK){
    if(!sameSize(a,b))return false;
    if(a.size===0||a.size>MAX_BYTES)throw Error("File size must be between 1 byte and 512 MiB for this comparison.");
    if(!(Number.isInteger(blockSize)&&blockSize>0&&blockSize<=4*1024*1024))throw Error("Invalid comparison block size");
    for(let offset=0;offset<a.size;offset+=blockSize){
      const end=Math.min(offset+blockSize,a.size);
      const bytesA=new Uint8Array(await a.slice(offset,end).arrayBuffer());
      const bytesB=new Uint8Array(await b.slice(offset,end).arrayBuffer());
      if(bytesA.length!==bytesB.length)return false;
      for(let i=0;i<bytesA.length;i++)if(bytesA[i]!==bytesB[i])return false;
    }
    return true;
  }
  function playablePortrait(v){
    return Number(v?.videoWidth)===720&&Number(v?.videoHeight)===1280&&
      Number.isFinite(v?.duration)&&v.duration>=1;
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={equalMedia,sameSize,playablePortrait,MAX_BYTES};
    return;
  }
  const fileInput=document.getElementById("edit-saved-file");
  const button=document.getElementById("edit-saved-verify");
  const status=document.getElementById("edit-saved-status");
  const video=document.getElementById("edit-saved-preview");
  const exportLink=document.getElementById("edit-download");
  if(!fileInput||!button||!status||!video||!exportLink)return;
  let activeUrl="",busy=false,revision=0,originalBlob=null;
  const say=t=>{status.textContent=t};
  function clearSelected(){
    revision++;
    fileInput.value="";
    if(activeUrl){video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(activeUrl);activeUrl="";}
    video.hidden=true;
    say("Not verified. Download your Short, then select that exact file from iPhone Files.");
  }
  root.addEventListener("cutnova:export-reset",()=>{originalBlob=null;clearSelected()});
  root.addEventListener("cutnova:export-ready",event=>{
    // Keep only the original in-memory Blob while this tab has this export.
    // Do not fetch the blob: URL: iOS and download workflows may invalidate it.
    originalBlob=event.detail?.blob instanceof Blob?event.detail.blob:null;
    clearSelected();
  });
  fileInput.addEventListener("change",()=>{
    revision++;
    if(activeUrl){video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(activeUrl);activeUrl="";}
    video.hidden=true;
    const file=fileInput.files?.[0];
    if(!file){say("No file selected. Choose a downloaded video from Files.");return;}
    if(file.size>MAX_BYTES){say("File is larger than the 512 MiB on-device comparison limit. Cannot verify it.");return;}
    activeUrl=URL.createObjectURL(file);
    video.src=activeUrl;
    video.hidden=false;
    say("File selected ("+(file.size/1024).toFixed(0)+" KiB). Tap VERIFY SAVED FILE to compare the selected file with the latest exported Short and test playback.");
  });
  async function playForCheck(player){
    if(player.readyState<1){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>done(Error("Saved file metadata did not load")),8000);
        function done(err){clearTimeout(timer);player.removeEventListener("loadedmetadata",good);player.removeEventListener("error",bad);err?reject(err):resolve();}
        function good(){done()}
        function bad(){done(Error("Saved file cannot be decoded"))}
        player.addEventListener("loadedmetadata",good,{once:true});
        player.addEventListener("error",bad,{once:true});
        player.load();
      });
    }
    if(!playablePortrait(player))throw Error("Selected file has invalid 720×1280 video metadata or duration");
    player.pause();
    if(player.currentTime>.1)player.currentTime=0;
    const start=player.currentTime;
    let clean=()=>{};
    const advanced=new Promise((resolve,reject)=>{
      let done=false;
      const tick=setInterval(()=>{if(player.currentTime-start>=.25)finish();else if(player.error)finish(Error("Saved video decoder failed"));},100);
      const limit=setTimeout(()=>finish(Error("Saved video playback did not advance")),8000);
      function finish(e){
        if(done)return;done=true;clearInterval(tick);clearTimeout(limit);
        player.removeEventListener("error",onError);e?reject(e):resolve();
      }
      const onError=()=>finish(Error("Saved file decoder error"));
      player.addEventListener("error",onError);
      clean=()=>finish(Error("Playback interrupted"));
    });
    try{await player.play();await advanced}
    catch(e){clean();try{await advanced}catch(_){}throw e}
    finally{player.pause()}
  }
  button.addEventListener("click",async()=>{
    if(busy)return;
    const saved=fileInput.files?.[0];
    const currentHref=exportLink.getAttribute("href")||"";
    if(!saved){say("SELECT FILE FIRST — use CHOOSE SAVED VIDEO FROM FILES.");return;}
    if(!currentHref.startsWith("blob:")||!originalBlob){
      say("NO CURRENT EXPORT — create and download a Short in this same open editor tab, then choose its saved file.");
      return;
    }
    if(!activeUrl||video.src!==activeUrl){
      say("RESELECT SAVED FILE — preview is unavailable.");
      return;
    }
    busy=true;button.disabled=true;const version=revision;
    say("Comparing your selected saved file with the current export, one small chunk at a time. All processing stays on this phone…");
    try{
      if(saved.size===0||saved.size>MAX_BYTES)throw Error("Selected file is empty or larger than 512 MiB");
      // Compare against the exact in-memory export Blob from our recorder.
      // No fetch (not even blob:), networking, or credential access.
      const original=originalBlob;
      if(version!==revision)throw Error("File selection changed during verification");
      const matched=await equalMedia(original,saved);
      if(version!==revision)throw Error("File selection changed during verification");
      if(!matched){
        say("FILE MISMATCH — selected file is NOT byte-for-byte identical to this export. Re-download the current Short and select that saved copy.");
        return;
      }
      say("File contents match exactly. Now checking video decoding and playback…");
      await playForCheck(video);
      if(version!==revision)throw Error("File selection changed during verification");
      say("SAVED FILE VERIFIED ✓ — selected file matches the original export byte-for-byte and plays in this browser (720×1280). This confirms only the file you manually selected. Audible sound, Files storage persistence and social upload compatibility still require checking on iPhone.");
    }catch(e){
      say("SAVED FILE CHECK FAILED — "+String(e?.message||"Cannot verify this file").slice(0,200)+". No successful Files download is claimed.");
    }finally{
      busy=false;button.disabled=false;
    }
  });
})(typeof window!=="undefined"?window:null);
