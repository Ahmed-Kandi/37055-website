// Data layer. Attendance and tasks live as JSON files in the repo (data/*.json).
// Reading works for anyone. Saving commits the updated file through the GitHub
// API, which needs a GitHub token entered once per browser in the Settings tab.
// With no token, changes are kept in this browser only (localStorage).
var Store = (function () {
  var REPO = "Ahmed-Kandi/37055-website";
  var BRANCH = "main";
  var TOKEN_KEY = "gh_token";
  var cfgKey = "gh_config";

  function config() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(cfgKey)) || {}; } catch (e) {}
    return { repo: c.repo || REPO, branch: c.branch || BRANCH };
  }
  function setConfig(repo, branch) { localStorage.setItem(cfgKey, JSON.stringify({ repo: repo, branch: branch })); }
  function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
  function localKey(file) { return "local_" + file; }

  function apiUrl(file) {
    var c = config();
    return "https://api.github.com/repos/" + c.repo + "/contents/data/" + file + "?ref=" + encodeURIComponent(c.branch);
  }
  function headers() {
    return { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json" };
  }
  function b64decode(s) { return decodeURIComponent(escape(atob(s.replace(/\n/g, "")))); }
  function b64encode(s) { return btoa(unescape(encodeURIComponent(s))); }

  function repoApi(path) { return "https://api.github.com/repos/" + config().repo + path; }

  // Turns a failed GitHub response into an error message that says what to fix.
  async function ghError(res, action) {
    var detail = "";
    try { detail = (await res.json()).message || ""; } catch (e) {}
    var hint = {
      401: "The token is invalid or expired. Create a new one and paste it in Settings.",
      403: "The token is not allowed to write to this repository. Edit the token on GitHub and set Repository permissions > Contents to \"Read and write\", and make sure this repository is selected.",
      404: "GitHub could not find the repository or branch with this token. Check the Repository and Branch fields in Settings, and that the token has access to this repository."
    }[res.status] || "";
    return new Error("GitHub " + action + " failed (" + res.status + (detail ? ": " + detail : "") + "). " + hint);
  }

  // Returns { items, sha }.
  async function read(file) {
    if (token()) {
      var res = await fetch(apiUrl(file), { headers: headers(), cache: "no-store" });
      if (res.status === 404) return { items: [], sha: null };
      if (!res.ok) throw await ghError(res, "read");
      var json = await res.json();
      return { items: JSON.parse(b64decode(json.content) || "[]"), sha: json.sha };
    }
    var local = localStorage.getItem(localKey(file));
    if (local) return { items: JSON.parse(local), sha: null };
    try {
      var r = await fetch("data/" + file + "?t=" + Date.now(), { cache: "no-store" });
      return { items: r.ok ? await r.json() : [], sha: null };
    } catch (e) { return { items: [], sha: null }; }
  }

  // Applies `mutate(items)` to the latest copy of the file and saves it.
  // Retries once if someone else saved in between (sha conflict).
  async function update(file, mutate, message) {
    for (var attempt = 0; attempt < 2; attempt++) {
      var cur = await read(file);
      var items = mutate(cur.items) || cur.items;
      if (!token()) {
        localStorage.setItem(localKey(file), JSON.stringify(items));
        return items;
      }
      var body = {
        message: message,
        content: b64encode(JSON.stringify(items, null, 2) + "\n"),
        branch: config().branch
      };
      if (cur.sha) body.sha = cur.sha;
      var res = await fetch(repoApi("/contents/data/" + file), { method: "PUT", headers: headers(), body: JSON.stringify(body) });
      if (res.ok) return items;
      var conflict = res.status === 409;
      if (res.status === 422) {
        var err = await ghError(res.clone(), "save");
        if (!/sha/i.test(err.message)) throw err;
        conflict = true;
      }
      if (!conflict) throw await ghError(res, "save");
    }
    throw new Error("Save conflicted with another change. Please try again.");
  }

  // Checks the token can see the repo and branch, and can actually write.
  async function checkToken() {
    var res = await fetch(repoApi(""), { headers: headers() });
    if (!res.ok) throw await ghError(res, "repository check");
    res = await fetch(repoApi("/branches/" + encodeURIComponent(config().branch)), { headers: headers() });
    if (!res.ok) throw await ghError(res, "branch check");
    // Creating a git blob needs write access but does not change any file or branch.
    res = await fetch(repoApi("/git/blobs"), {
      method: "POST", headers: headers(), body: JSON.stringify({ content: "write check", encoding: "utf-8" })
    });
    if (!res.ok) throw await ghError(res, "write check");
    return true;
  }

  return { read: read, update: update, token: token, setToken: setToken, config: config, setConfig: setConfig, checkToken: checkToken };
})();

// ---------- Auth (intentionally simple - users are listed in data/users.json) ----------
var Auth = {
  async login(username, password) {
    var res = await fetch("data/users.json?t=" + Date.now(), { cache: "no-store" });
    var users = await res.json();
    var u = users.find(function (x) { return x.username.toLowerCase() === username.trim().toLowerCase() && x.password === password; });
    if (!u) return false;
    sessionStorage.setItem("user", u.username);
    sessionStorage.setItem("role", u.role || "member");
    return true;
  },
  // "admin" can view and edit everything; "member" can only view tasks and notes.
  user() { return sessionStorage.getItem("role") ? sessionStorage.getItem("user") : null; },
  role() { return sessionStorage.getItem("role"); },
  logout() { ["user", "role", "tab"].forEach(function (k) { sessionStorage.removeItem(k); }); location.href = "signin.html"; }
};
