# FTC Team 37055 Website

Static site: runs on GitHub Pages with no build step.

| Page | What it is |
|---|---|
| `index.html` | Public homepage: rookie-team intro and subteams |
| `signin.html` | Member sign in |
| `dashboard.html` | Attendance and task pages (requires sign in) |

## Logo / theme
The logo is `img/logo.png`. The site colors are set to match it in `css/style.css` (`:root`).

## Logins
Logins are in `data/users.json` (plain text, not secure by design). Add or remove entries there.

## Where the data is saved
- `data/attendance.json`: `{ date, names[], submittedBy, submittedAt }`
- `data/tasks.json`: `{ title, assignees[], description, done, createdBy, createdAt }`

A static site can't write to the repo by itself. To save to these files, sign in, open **Settings**, and paste a GitHub
fine-grained token (limited to this repo, **Contents: Read and write**). After that, every submit makes a commit
to the branch set in Settings (default `main`). The token is stored only in that browser.
Without a token, data is saved in that browser only.

## Running locally
```
python3 -m http.server
```
Then open http://localhost:8000. Opening the files directly (`file://`) won't work because the site loads JSON with `fetch`.
