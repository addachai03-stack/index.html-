/* Device-only decoded playback check for exported CutNova videos.
 * A successful recorder stop is not proof of playable media, so validate a
 * real local blob by observing video metadata and time advancing on user tap.
 * No upload, networking, or fabricated "saved in Files" confirmation.
 */
(function(root){
  "use strict";
  function metadata(v){
    const width=Number(v?.videoWidth)||0;
    const height=Number(v?.videoHeight)||0;
    const duration=Number(v?.duration);
    return {width,height,duration};
  }
  function validPortrait(v){
    const m=metadata(v);
    return m.width===720&&m.height===1280&&Number.isFinite(m.duration)&&m.duration>=1;
  }
  function playbackProgress(start,current){
    return Number.isFinite(start)&&Number.isFinite(current)&&current-start>=0.25;
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={metadata,validPortrait,playbackProgress};
    return;
  }
  const btn=document.getElementById("edit-verify-playback");
  const status=document.getElementById("edit-verify-status");
  const video=document.getElementById("edit-output");
  const download=document.getElementById("edit-download");
  if(!btn||!status||!video||!download)return;
  let verifying=false;
  const say=msg=>{status.textContent=msg};
  function reset(){
    if(!verifying)say("Not verified. Test playback here; then download and open the saved file in Files.");
  }
  video.addEventListener("emptied",reset);
  video.addEventListener("loadstart",reset);
  btn.addEventListener("click",async()=>{
    if(verifying)return;
    const link=download.getAttribute("href")||"";
    if(!link.startsWith("blob:")||!video.src.startsWith("blob:")){
      say("NOT READY — export a Short first. No saved video has been verified.");
      return;
    }
    verifying=true;btn.disabled=true;
    say("Checking actual exported video decode, 9:16 metadata and playback…");
    let cleanup=()=>{};
    try{
      if(video.readyState<1){
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>done(Error("Video metadata did not load")),7000);
          function done(error){clearTimeout(timer);video.removeEventListener("loadedmetadata",ready);video.removeEventListener("error",failed);error?reject(error):resolve();}
          const ready=()=>done();
          const failed=()=>done(Error("Video decoder failed"));
          video.addEventListener("loadedmetadata",ready,{once:true});
          video.addEventListener("error",failed,{once:true});
          video.load();
        });
      }
      const m=metadata(video);
      if(!validPortrait(video))throw Error("Export metadata is not usable 720×1280 portrait video (received "+m.width+"×"+m.height+", "+(Number.isFinite(m.duration)?m.duration.toFixed(2):"unknown")+" sec)");
      video.pause();
      if(video.currentTime>0.1)video.currentTime=0;
      const start=video.currentTime;
      const progressed=new Promise((resolve,reject)=>{
        let completed=false;
        const timer=setTimeout(()=>done(Error("Video did not advance during playback")),7000);
        const sample=setInterval(()=>{
          if(playbackProgress(start,video.currentTime))done();
          else if(video.error)done(Error("Browser could not decode the exported video"));
        },100);
        const onError=()=>done(Error("Browser could not decode the exported video"));
        const onTime=()=>{if(playbackProgress(start,video.currentTime))done();};
        function done(error){
          if(completed)return;completed=true;
          clearTimeout(timer);clearInterval(sample);
          video.removeEventListener("error",onError);
          video.removeEventListener("timeupdate",onTime);
          error?reject(error):resolve();
        }
        video.addEventListener("error",onError);
        video.addEventListener("timeupdate",onTime);
        cleanup=()=>done(Error("Playback interrupted"));
      });
      try{await video.play();await progressed}
      catch(error){cleanup();try{await progressed}catch(_){}throw error}
      const end=metadata(video);
      say("LOCAL PLAYBACK PASS ✓ — "+end.width+"×"+end.height+" portrait, "+end.duration.toFixed(2)+" sec; decoded video advanced. Audio audibility and saving to iPhone Files are NOT verified. Tap DOWNLOAD SHORT, then open that saved file.");
    }catch(error){
      say("LOCAL PLAYBACK FAILED — "+String(error?.message||"Video could not be verified").slice(0,220)+". Try another browser or authorized cloud render; do not assume the file plays.");
    }finally{
      try{video.pause()}catch(_){}
      verifying=false;btn.disabled=false;
    }
  });
})(typeof window!=="undefined"?window:null);
