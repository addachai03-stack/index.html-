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
      expired,
      ready: !expired && item.expired === false
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {labelFor, combineRuns, artifactFor};
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
  function attachResults(run, right, row) {
    const button = el("button", "btn btn-outline artifact-toggle", "CHECK FILES ↓");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    const panel = el("div", "artifact-panel");
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    button.addEventListener("click", async () => {
      if (!panel.hidden) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.textContent = "CHECK FILES ↓";
        return;
      }
      panel.hidden = false;
      button.disabled = true;
      button.setAttribute("aria-expanded", "true");
      button.textContent = "HIDE FILES ↑";
      panel.textContent = "Checking actual GitHub artifacts…";
      try {
        const data = await readJson(RUN_API + run.id + "/artifacts?per_page=30");
        const files = (Array.isArray(data.artifacts) ? data.artifacts : []).map(item => artifactFor(item)).filter(Boolean);
        panel.replaceChildren();
        if (!files.length) {
          panel.textContent = "No artifacts returned by GitHub. Files may have expired or been deleted.";
        }
        for (const file of files) {
          const box = el("div", "artifact-file");
          box.append(el("strong", "", file.name),
            el("span", "", file.size + " · " + (file.expired ? "Expired" : file.ready ? "Expires " + file.expiry : "Availability unknown")));
          if (file.ready) {
            const anchor = el("a", "job-link", "Open ZIP artifact ↗");
            anchor.href = ROOT + "/actions/runs/" + run.id + "/artifacts/" + file.id;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            box.append(anchor);
          }
          panel.append(box);
        }
        if (files.some(file => file.ready)) panel.append(el("small", "", "GitHub sign-in may be required. Successful renders include MP4s; failed jobs may contain diagnostics only."));
      } catch (_) {
        panel.textContent = "Could not check files. Open the GitHub run to review Artifacts or logs.";
      } finally { button.disabled = false; }
    });
    right.append(button);
    row.append(panel);
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
      if (run.status === "completed") attachResults(run, right, row);
      list.append(row);
    }
  }
  async function load() {
    refresh.disabled = true;
    status.textContent = "Checking GitHub Actions…";
    try {
      const res = await Promise.allSettled(FILES.map(file => readJson(API + file + "/runs?per_page=10")));
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
