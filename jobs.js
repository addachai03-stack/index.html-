/* Read-only public GitHub Actions history; never request tokens or start runs. */
(function () {
  "use strict";
  const ROOT = "https://github.com/addachai03-stack/index.html-";
  const API = "https://api.github.com/repos/addachai03-stack/index.html-/actions/workflows/";
  const FILES = ["issue-shorts.yml", "shorts.yml"];
  const RUN_API = "https://api.github.com/repos/addachai03-stack/index.html-/actions/runs/";

  function labelFor(run) {
    if (run.status !== "completed") {
      if (run.status === "in_progress") return ["PROCESSING", "working"];
      return ["QUEUED / WAITING", "working"];
    }
    switch (run.conclusion) {
      case "success": return ["SUCCESS", "success"];
      case "failure": return ["FAILED", "failed"];
      case "cancelled": return ["CANCELLED", "neutral"];
      case "skipped": return ["SKIPPED", "neutral"];
      case "timed_out": return ["TIMED OUT", "failed"];
      default: return [String(run.conclusion || "UNKNOWN").toUpperCase(), "neutral"];
    }
  }

  function combineRuns(results) {
    const unique = new Map();
    for (const result of results) {
      for (const run of (Array.isArray(result.workflow_runs) ? result.workflow_runs : [])) {
        if (Number.isSafeInteger(run.id) && run.id > 0) unique.set(run.id, run);
      }
    }
    return Array.from(unique.values()).sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0,10);
  }

  function artifactFor(item, now = Date.now()) {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0) return null;
    const expires = Date.parse(item.expires_at);
    const expired = item.expired === true || (Number.isFinite(expires) && expires <= now);
    const bytes = Number(item.size_in_bytes);
    return {
      id: item.id,
      name: String(item.name || "GitHub artifact"),
      size: Number.isFinite(bytes) && bytes >= 0 ? (bytes / 1048576).toFixed(2) + " MB" : "Size unknown",
      expiry: Number.isFinite(expires) ? new Date(expires).toLocaleString() : "Unknown expiry",
      expiresAt: Number.isFinite(expires) ? expires : null,
      expired,
      ready: !expired && item.expired === false
    };
  }

  function expiresSoon(file,now=Date.now()){
    if(!file||!file.ready||file.expired)return false;
    const ts=file.expiresAt;
    return Number.isFinite(ts)&&ts>now&&(ts-now)<=24*60*60*1000;
  }

  function artifactLabel(file,run){
    // GitHub workflow success + genuine archive metadata is not proof of MP4 content.
    if(!file?.ready)return "File unavailable";
    if(run?.conclusion==="success"&&/^(cutnova-shorts-|cutnova-issue-)/i.test(file.name))
      return "Open rendered files ZIP ↗";
    return "Open GitHub artifact ZIP ↗";
  }

  function matchingOwnerRun(runs,id) {
    if(!Array.isArray(runs)||typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return null;
    return runs.find(run=>run?.display_title==="CutNova owner "+id)||null;
  }

  function promoteTrackedRun(runs,id){
    if(!Array.isArray(runs))return [];
    const own=matchingOwnerRun(runs,id);
    return own?[own,...runs.filter(run=>run.id!==own.id)]:runs;
  }

  function pollingNeeded(runs,id,onResults,attempts){
    if(!onResults||attempts>=12||typeof id!=="string"||!id)return false;
    const own=matchingOwnerRun(runs,id);
    return !own||own.status!=="completed";
  }

  function failedJobSteps(jobs) {
    if(!Array.isArray(jobs))return [];
    return jobs.flatMap(job=>{
      const steps=Array.isArray(job.steps)?job.steps:[];
      return steps.filter(step=>step && step.conclusion==="failure").map(step=>({
        job:String(job.name||"Unnamed job"),step:String(step.name||"Unnamed step"),
      }));
    }).slice(0,8);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {labelFor, combineRuns, artifactFor, expiresSoon, artifactLabel, failedJobSteps, matchingOwnerRun, promoteTrackedRun, pollingNeeded};
    return;
  }
  const list = document.getElementById("job-results");
  const status = document.getElementById("job-status");
  const refresh = document.getElementById("refresh-jobs");
  if (!list || !status || !refresh) return;
  function trackedId(){
    try {return sessionStorage.getItem("cutnova-latest-request-id")||""}
    catch(_){return ""}
  }
  function el(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  async function readJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: {"Accept":"application/vnd.github+json"},
        credentials:"omit", cache:"no-store", signal:controller.signal
      });
      if (!response.ok) throw new Error("GitHub HTTP " + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function attachResults(run, right, row, autoInspect=false) {
    const button = el("button", "btn btn-outline artifact-toggle", "CHECK FILES ↓");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    const panel = el("div", "artifact-panel");
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    let checking = false;
    async function inspect() {
      if (checking) return;
      checking = true;
      panel.hidden = false;
      button.disabled = true;
      button.setAttribute("aria-expanded", "true");
      button.textContent = "HIDE FILES ↑";
      panel.textContent = "Checking actual GitHub ZIP artifacts and expiry…";
      try {
        const data = await readJson(RUN_API + run.id + "/artifacts?per_page=30");
        const files = (Array.isArray(data.artifacts) ? data.artifacts : []).map(item => artifactFor(item)).filter(Boolean);
        panel.replaceChildren();
        if (!files.length) {
          panel.textContent = "GitHub returned no downloadable artifacts for this run. A green SUCCESS badge alone does not verify MP4 files.";
        }
        for (const file of files) {
          const box = el("div", "artifact-file");
          box.append(el("strong", "", file.name),
            el("span", "", file.size + " · " + (file.expired ? "Expired" : file.ready ? "Expires " + file.expiry : "Availability not confirmed")));
          if (file.ready) {
            if(expiresSoon(file))box.append(el("span","artifact-expiring","Expires within 24 hours — save your ZIP now."));
            const anchor = el("a", "job-link", artifactLabel(file,run));
            anchor.href = ROOT + "/actions/runs/" + run.id + "/artifacts/" + file.id;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            box.append(anchor);
          } else if(!file.expired){
            box.append(el("small","","GitHub did not confirm this ZIP is available. Open the run in GitHub to verify."));
          }
          panel.append(box);
        }
        if (files.some(file => file.ready)) {
          panel.append(el("small", "", "GitHub may require sign-in to download. ZIP listing confirms an archived artifact, not the MP4 contents. Check video playback and captions after download."));
        }
      } catch (_) {
        panel.textContent = "Artifact check unavailable (GitHub network/rate limit). Open the run to inspect the real ZIP; do not assume a download exists.";
      } finally {checking = false;button.disabled = false;}
    }
    button.addEventListener("click", () => {
      if (!panel.hidden) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.textContent = "CHECK FILES ↓";
        return;
      }
      inspect();
    });
    right.append(button);
    row.append(panel);
    // Inspect only the session-matched successful owner render; never scrape every
    // successful/failed job or fabricate a link from the job's green badge.
    if(autoInspect && run.status==="completed" && run.conclusion==="success") inspect();
  }
  function attachDiagnosis(run, right, row) {
    if(run.conclusion!=="failure"&&run.conclusion!=="timed_out")return;
    const button=el("button","btn btn-outline artifact-toggle","WHY FAILED? ↓");
    button.type="button";
    button.setAttribute("aria-expanded","false");
    const panel=el("div","artifact-panel");
    panel.hidden=true;
    panel.setAttribute("aria-live","polite");
    button.addEventListener("click",async()=>{
      if(!panel.hidden){
        panel.hidden=true;button.textContent="WHY FAILED? ↓";
        button.setAttribute("aria-expanded","false");return;
      }
      panel.hidden=false;button.disabled=true;
      button.textContent="HIDE REASON ↑";button.setAttribute("aria-expanded","true");
      panel.textContent="Checking GitHub failed-step report…";
      try{
        const data=await readJson(RUN_API+run.id+"/jobs?per_page=30");
        const failed=failedJobSteps(data.jobs);
        panel.replaceChildren();
        if(!failed.length){
          panel.append(el("p","","GitHub returned no failed-step details. Open the run logs to see the error."));
        }
        for(const item of failed){
          const p=el("p","","Failed at: "+item.job+" → "+item.step+".");
          panel.append(p);
          if(item.step==="Generate real portrait Shorts"){
            panel.append(el("p","","Video fetching or rendering failed. YouTube may block automated download with a sign-in/bot check; see the actual log to confirm. Use only a permitted direct public MP4 or your authorized saved video if it blocks."));
          }
        }
        const a=el("a","job-link","Read exact error in GitHub logs ↗");
        a.href=ROOT+"/actions/runs/"+run.id;
        a.target="_blank";a.rel="noopener noreferrer";
        panel.append(a);
      }catch(_){
        panel.textContent="Could not load failed-step details from GitHub. Use View run / logs for the exact error.";
      }finally{button.disabled=false;}
    });
    right.append(button);row.append(panel);
  }

  function draw(runs) {
    list.replaceChildren();
    for (const run of runs) {
      const row = el("article", "job-row");
      const info = el("div", "job-info");
      const [label, tone] = labelFor(run);
      const title = (run.event === "issues" ? "Video request" : "AI render") + " #" + (run.run_number || run.id);
      const date = new Date(run.created_at);
      info.append(el("strong", "", title), el("span", "", Number.isNaN(date.getTime()) ? "" : date.toLocaleString()));
      const tracked=matchingOwnerRun([run],trackedId())!==null;
      if(tracked){
        row.classList.add("job-row-owned");
        info.append(el("small","job-owner-note","YOUR LATEST OWNER RENDER"));
      }
      const right = el("div", "job-actions");
      right.append(el("span", "job-badge job-" + tone, label));
      const link = el("a", "job-link", run.status === "completed" && run.conclusion === "success" ? "Open run & artifacts ↗" : "View run / logs ↗");
      link.href = ROOT + "/actions/runs/" + run.id;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      right.append(link);
      row.append(info,right);
      if (run.status === "completed"){ attachDiagnosis(run, right, row);attachResults(run, right, row, tracked); }
      list.append(row);
    }
  }
  let loading=false,pollTimer=null,pollAttempts=0;
  const onResults=()=>location.hash==="#render-history"||location.hash==="#results";
  function cancelPoll(){
    if(pollTimer!==null){clearTimeout(pollTimer);pollTimer=null;}
  }
  function schedulePoll(runs){
    cancelPoll();
    if(document.visibilityState==="hidden")return;
    if(!pollingNeeded(runs,trackedId(),onResults(),pollAttempts))return;
    // At most 12 bounded refreshes, and only while the owner views RESULTS.
    // GitHub data is a real run state, never an invented percentage/progress bar.
    pollTimer=setTimeout(()=>{pollTimer=null;pollAttempts++;load();},30000);
  }
  async function load() {
    if(loading)return;
    if(navigator.onLine===false){status.textContent="Offline — GitHub renders require internet.";return}
    loading=true;
    refresh.disabled = true;
    status.textContent = "Checking actual GitHub Actions runs…";
    try {
      const res = await Promise.allSettled(FILES.map(file => readJson(API + file + "/runs?per_page=10")));
      const good = res.filter(x => x.status === "fulfilled").map(x => x.value);
      if (!good.length) throw new Error("No GitHub response");
      const runs = combineRuns(good);
      const latest=trackedId(),own=matchingOwnerRun(runs,latest);
      draw(promoteTrackedRun(runs,latest));
      const trackedText=!latest?"":own
        ?" · YOUR RENDER: "+labelFor(own)[0]+(own.status==="completed"&&own.conclusion==="success"
          ?" — tap CHECK FILES to verify the actual ZIP."
          :own.status==="completed"&&own.conclusion==="failure"
            ?" — tap WHY FAILED? for GitHub diagnostics.":" — checking real GitHub status.")
        :" · Your submitted render is not listed yet (or is older than recent history). Use Refresh or Open Actions.";
      status.textContent = (good.length < FILES.length ? "Partial history — one workflow unavailable. " : "") +
        (runs.length ? "Last checked " + new Date().toLocaleTimeString() + " · " + runs.length + " recent runs" : "No recent render jobs found.") + trackedText;
      schedulePoll(runs);
    } catch (_) {
      cancelPoll();
      status.textContent = "Couldn't refresh GitHub history (network or API rate limit). Use Open GitHub Actions; previously shown results may be stale.";
    } finally { loading=false;refresh.disabled = false; }
  }
  refresh.addEventListener("click",()=>{pollAttempts=0;load();});
  window.addEventListener("hashchange",()=>{
    cancelPoll();
    if(onResults()){pollAttempts=0;load();}
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="hidden")cancelPoll();
    else if(onResults()){pollAttempts=0;load();}
  });
  load();
})();
