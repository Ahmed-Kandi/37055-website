(function () {
  var $ = function (id) { return document.getElementById(id); };
  var user = Auth.user();
  var tasks = [];
  var notes = [];
  var editingNote = null;
  var isAdmin = Auth.role() === "admin";

  // Notes is visible to everyone (read-only for members).
  document.querySelector('.tab[data-tab="notes"]').hidden = false;
  $("notes").hidden = false;

  // Members get read-only Tasks and Notes; everything else is admin only.
  if (!isAdmin) {
    ["attendance", "settings"].forEach(function (id) {
      document.querySelector('.tab[data-tab="' + id + '"]').hidden = true;
      $(id).hidden = true;
      $(id).classList.remove("active");
    });
    ["task-form", "note-form"].forEach(function (id) {
      $(id).hidden = true;
      $(id).parentNode.classList.add("single");
    });
    document.querySelector('.tab[data-tab="attendance"]').classList.remove("active");
    document.querySelector('.tab[data-tab="tasks"]').classList.add("active");
    $("tasks").classList.add("active");
  }

  $("who").textContent = user;
  $("logout").onclick = function (e) { e.preventDefault(); Auth.logout(); };

  function updateMode() {
    $("mode").textContent = !isAdmin ? "View only" : Store.token()
      ? "Saving to GitHub (" + Store.config().repo + ")"
      : "Saving in this browser only (add a GitHub token in Settings)";
  }
  updateMode();

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === btn.dataset.tab); });
      try { sessionStorage.setItem("tab", btn.dataset.tab); } catch (e) {}
    };
  });
  var saved = sessionStorage.getItem("tab");
  if (saved) { var b = document.querySelector('.tab[data-tab="' + saved + '"]:not([hidden])'); if (b) b.click(); }

  // ---------- Helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function splitNames(s) {
    var seen = {};
    return s.split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(function (x) {
      var k = x.toLowerCase();
      if (!x || seen[k]) return false;
      return (seen[k] = true);
    });
  }
  function msg(id, text, kind) {
    var el = $(id);
    el.textContent = text;
    el.className = "msg show " + kind;
    if (kind === "success") setTimeout(function () { el.classList.remove("show"); }, 3500);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmtDate(d) {
    var p = d.split("-");
    return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  }
  function busy(form, on) { form.querySelectorAll("button").forEach(function (b) { b.disabled = on; }); }
  function chips(names) { return '<div class="chips">' + names.map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div>"; }

  // ---------- Attendance ----------
  var today = new Date();
  $("att-date").value = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

  function renderAttendance(items) {
    var list = items.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    $("att-list").innerHTML = list.length ? list.map(function (r) {
      return '<div class="item"><div class="item-head"><h4>' + esc(fmtDate(r.date)) + '</h4><span class="meta">' +
        r.names.length + " present &middot; by " + esc(r.submittedBy) + "</span></div>" + chips(r.names) +
        '<div class="item-actions"><button class="btn small danger" data-del-att="' + esc(r.id) + '">Delete</button></div></div>';
    }).join("") : '<div class="empty">No attendance recorded yet.</div>';
  }

  async function loadAttendance() {
    try { renderAttendance((await Store.read("attendance.json")).items); }
    catch (e) { $("att-list").innerHTML = '<div class="empty">' + esc(e.message) + "</div>"; }
  }

  $("att-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var names = splitNames($("att-names").value);
    if (!names.length) return msg("att-msg", "Add at least one name.", "error");
    var rec = { id: uid(), date: $("att-date").value, names: names, submittedBy: user, submittedAt: new Date().toISOString() };
    busy(this, true);
    try {
      var items = await Store.update("attendance.json", function (list) { list.push(rec); return list; },
        "Attendance for " + rec.date + " (" + names.length + " present)");
      renderAttendance(items);
      $("att-names").value = "";
      msg("att-msg", "Attendance saved for " + names.length + " member" + (names.length === 1 ? "" : "s") + ".", "success");
    } catch (ex) { msg("att-msg", ex.message, "error"); }
    busy(this, false);
  });

  $("att-list").addEventListener("click", async function (e) {
    var id = e.target.dataset.delAtt;
    if (!id || !confirm("Delete this attendance record?")) return;
    e.target.disabled = true;
    try {
      renderAttendance(await Store.update("attendance.json", function (list) {
        return list.filter(function (r) { return r.id !== id; });
      }, "Delete attendance record"));
    } catch (ex) { alert(ex.message); e.target.disabled = false; }
  });

  // ---------- Tasks ----------
  function renderTasks() {
    var filter = $("task-filter").value;
    var q = $("task-search").value.trim().toLowerCase();
    var list = tasks.filter(function (t) {
      if (filter === "open" && t.done) return false;
      if (filter === "done" && !t.done) return false;
      if (q && !(t.title + " " + t.assignees.join(" ") + " " + t.description).toLowerCase().includes(q)) return false;
      return true;
    }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });

    $("task-list").innerHTML = list.length ? list.map(function (t) {
      return '<div class="item' + (t.done ? " done" : "") + '"><div class="item-head"><h4>' + esc(t.title) + '</h4><span class="meta">' +
        esc(new Date(t.createdAt).toLocaleDateString()) + " &middot; by " + esc(t.createdBy) + "</span></div>" +
        chips(t.assignees) + (t.description ? "<p>" + esc(t.description) + "</p>" : "") +
        (!isAdmin ? (t.done ? '<div class="meta" style="margin-top:10px">Completed</div>' : "") + "</div>" : "") +
        (isAdmin ? '<div class="item-actions"><button class="btn small secondary" data-toggle="' + esc(t.id) + '">' + (t.done ? "Reopen" : "Mark done") +
        '</button><button class="btn small danger" data-del-task="' + esc(t.id) + '">Delete</button></div></div>' : "");
    }).join("") : '<div class="empty">' + (tasks.length ? "No tasks match." : "No tasks yet.") + "</div>";
  }

  async function loadTasks() {
    try { tasks = (await Store.read("tasks.json")).items; renderTasks(); }
    catch (e) { $("task-list").innerHTML = '<div class="empty">' + esc(e.message) + "</div>"; }
  }

  $("task-filter").onchange = renderTasks;
  $("task-search").oninput = renderTasks;

  $("task-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var assignees = splitNames($("task-assignees").value);
    if (!assignees.length) return msg("task-msg", "Add at least one assignee.", "error");
    var t = {
      id: uid(), title: $("task-title").value.trim(), assignees: assignees,
      description: $("task-desc").value.trim(), done: false, createdBy: user, createdAt: new Date().toISOString()
    };
    busy(this, true);
    try {
      tasks = await Store.update("tasks.json", function (list) { list.push(t); return list; }, "Add task: " + t.title);
      renderTasks();
      this.reset();
      msg("task-msg", "Task created.", "success");
    } catch (ex) { msg("task-msg", ex.message, "error"); }
    busy(this, false);
  });

  $("task-list").addEventListener("click", async function (e) {
    var toggle = e.target.dataset.toggle, del = e.target.dataset.delTask;
    if (!toggle && !del) return;
    if (del && !confirm("Delete this task?")) return;
    e.target.disabled = true;
    try {
      tasks = await Store.update("tasks.json", function (list) {
        if (del) return list.filter(function (t) { return t.id !== del; });
        list.forEach(function (t) {
          if (t.id === toggle) { t.done = !t.done; t.completedAt = t.done ? new Date().toISOString() : null; }
        });
        return list;
      }, del ? "Delete task" : "Update task status");
      renderTasks();
    } catch (ex) { alert(ex.message); e.target.disabled = false; }
  });

  // ---------- Notes ----------
  function renderNotes() {
    var q = $("note-search").value.trim().toLowerCase();
    var list = notes.filter(function (n) {
      return !q || (n.title + " " + n.body).toLowerCase().includes(q);
    }).sort(function (a, b) { return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt); });

    $("note-list").innerHTML = list.length ? list.map(function (n) {
      var edited = n.updatedAt && n.updatedAt !== n.createdAt ? " (edited " + esc(new Date(n.updatedAt).toLocaleDateString()) + ")" : "";
      return '<div class="item"><div class="item-head"><h4>' + esc(n.title) + '</h4><span class="meta">' +
        esc(new Date(n.createdAt).toLocaleDateString()) + edited + " &middot; by " + esc(n.createdBy) + "</span></div>" +
        "<p>" + esc(n.body) + "</p>" + (!isAdmin ? "</div>" :
        '<div class="item-actions"><button class="btn small secondary" data-edit-note="' + esc(n.id) + '">Edit</button>' +
        '<button class="btn small danger" data-del-note="' + esc(n.id) + '">Delete</button></div></div>');
    }).join("") : '<div class="empty">' + (notes.length ? "No notes match." : "No notes yet.") + "</div>";
  }

  async function loadNotes() {
    try { notes = (await Store.read("notes.json")).items; renderNotes(); }
    catch (e) { $("note-list").innerHTML = '<div class="empty">' + esc(e.message) + "</div>"; }
  }

  function resetNoteForm() {
    editingNote = null;
    $("note-form").reset();
    $("note-form-title").textContent = "New Note";
    $("note-submit").textContent = "Save Note";
    $("note-cancel").hidden = true;
  }

  if (isAdmin) {
    $("note-search").oninput = renderNotes;
    $("note-cancel").onclick = resetNoteForm;

    $("note-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var title = $("note-title").value.trim(), body = $("note-body").value.trim();
      if (!title || !body) return msg("note-msg", "Add a title and a note.", "error");
      var now = new Date().toISOString(), id = editingNote;
      busy(this, true);
      try {
        notes = await Store.update("notes.json", function (list) {
          if (id) {
            list.forEach(function (n) { if (n.id === id) { n.title = title; n.body = body; n.updatedAt = now; } });
          } else {
            list.push({ id: uid(), title: title, body: body, createdBy: user, createdAt: now, updatedAt: now });
          }
          return list;
        }, (id ? "Edit note: " : "Add note: ") + title);
        resetNoteForm();
        renderNotes();
        msg("note-msg", id ? "Note updated." : "Note saved.", "success");
      } catch (ex) { msg("note-msg", ex.message, "error"); }
      busy(this, false);
    });

    $("note-list").addEventListener("click", async function (e) {
      var edit = e.target.dataset.editNote, del = e.target.dataset.delNote;
      if (edit) {
        var n = notes.find(function (x) { return x.id === edit; });
        if (!n) return;
        editingNote = n.id;
        $("note-title").value = n.title;
        $("note-body").value = n.body;
        $("note-form-title").textContent = "Edit Note";
        $("note-submit").textContent = "Update Note";
        $("note-cancel").hidden = false;
        $("note-title").focus();
        return;
      }
      if (!del || !confirm("Delete this note?")) return;
      e.target.disabled = true;
      try {
        notes = await Store.update("notes.json", function (list) {
          return list.filter(function (n) { return n.id !== del; });
        }, "Delete note");
        if (editingNote === del) resetNoteForm();
        renderNotes();
      } catch (ex) { alert(ex.message); e.target.disabled = false; }
    });
  }

  // ---------- Settings ----------
  var cfg = Store.config();
  $("gh-repo").value = cfg.repo;
  $("gh-branch").value = cfg.branch;
  $("gh-token").value = Store.token();

  $("settings-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    Store.setConfig($("gh-repo").value.trim(), $("gh-branch").value.trim());
    Store.setToken($("gh-token").value.trim());
    updateMode();
    if (!Store.token()) return msg("settings-msg", "No token set. Data will be saved in this browser only.", "info");
    msg("settings-msg", "Testing token...", "info");
    try {
      await Store.checkToken();
      msg("settings-msg", "Connected. Changes will now be committed to " + Store.config().repo + ".", "success");
      loadAttendance(); loadTasks(); loadNotes();
    } catch (ex) { msg("settings-msg", ex.message, "error"); }
  });

  $("gh-clear").onclick = function () {
    Store.setToken("");
    $("gh-token").value = "";
    updateMode();
    msg("settings-msg", "Token removed from this browser.", "info");
    loadAttendance(); loadTasks(); loadNotes();
  };

  if (isAdmin) loadAttendance();
  loadTasks();
  loadNotes();
})();
