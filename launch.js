/* Share the genuine CutNova beta link without sending private data. */
(function(){
  "use strict";
  const button=document.getElementById("share-cutnova");
  const status=document.getElementById("share-cutnova-status");
  if(!button||!status)return;
  const url="https://addachai03-stack.github.io/index.html-/";
  const apk="https://github.com/addachai03-stack/index.html-/releases/tag/cutnova-android-v2.6.2-beta";
  const message="🎉 CutNova public beta is live! Edit your own short videos on iPhone or Android. Free web editor: "+url+" Android beta APK: "+apk+" (AI rendering is owner-controlled; browser support varies.)";
  button.addEventListener("click",async()=>{
    try{
      if(typeof navigator.share==="function"){
        await navigator.share({title:"CutNova Beta",text:message,url});
        status.textContent="Share sheet opened. You choose where to send it.";
      } else if(navigator.clipboard&&typeof navigator.clipboard.writeText==="function"){
        await navigator.clipboard.writeText(message);
        status.textContent="Beta invite copied. Paste it into WhatsApp or Messages.";
      } else {
        const field=document.createElement("textarea");
        field.value=message;field.readOnly=true;field.style.width="100%";
        status.replaceChildren(field);field.focus();field.select();
      }
    }catch(error){
      if(error&&error.name==="AbortError"){status.textContent="Sharing cancelled.";return}
      status.textContent="Sharing unavailable. Copy this site link to invite friends: "+url;
    }
  });
})();
