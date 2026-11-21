/* Read-only public GitHub Actions history; never request tokens or start runs. */
(function () {
  "use strict";
  const ROOT = "https://github.com/addachai03-stack/index.html-";
  const API = "https://api.github.com/repos/addachai03-stack/index.html-/actions/workflows/";
  const FILES = ["issue-shorts.yml", "shorts.yml"];

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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {labelFor, combineRuns};
    return;
  }
  const list = document.getElementById("job-results");
  const status = document.getElementById("job-status");
  const refresh = document.getElementById("refresh-jobs");
  if (!list || !status || !refresh) return;
  function el(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function draw(runs) {
    list.replaceChildren();
    for (const run of runs) {
      const row = el("article", "job-row");
      const info = el("div", "job-info");
      const [label, tone] = labelFor(run);
      const title = (run.event === "issues" ? "Video request" : "Manual render") + " #" + (run.run_number || run.id);
      const date = new Date(run.created_at);
      info.append(el("strong", "", title), el("span", "", Number.isNaN(date.getTime()) ? "" : date.toLocaleString()));
      const right = el("div", "job-actions");
      right.append(el("span", "job-badge job-" + tone, label));
      const link = el("a", "job-link", run.status === "completed" && run.conclusion === "success" ? "Open run & artifacts ↗" : "View run / logs ↗");
      link.href = ROOT + "/actions/runs/" + run.id;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      right.append(link);
      row.append(info,right);
      list.append(row);
    }
  }
  async function load() {
    refresh.disabled = true;
    status.textContent = "Checking GitHub Actions…";
    try {
      const res = await Promise.allSettled(FILES.map(async file => {
        const response = await fetch(API + file + "/runs?per_page=10", {
          headers: {"Accept":"application/vnd.github+json"},
          credentials:"omit", cache:"no-store"
        });
        if (!response.ok) throw new Error("GitHub HTTP " + response.status);
        return response.json();
      }));
      const good = res.filter(x => x.status === "fulfilled").map(x => x.value);
      if (!good.length) throw new Error("No GitHub response");
      const runs = combineRuns(good);
      draw(runs);
      status.textContent = (good.length < FILES.length ? "Partial history — one workflow unavailable. " : "") +
        (runs.length ? "Last checked " + new Date().toLocaleTimeString() + " · " + runs.length + " recent runs" : "No recent render jobs found.");
    } catch (_) {
      status.textContent = "Couldn't refresh GitHub history (network or API rate limit). Use Open GitHub Actions; previously shown results may be stale.";
    } finally { refresh.disabled = false; }
  }
  refresh.addEventListener("click", load);
  load();
})();
