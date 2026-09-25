# Task board — specification

Build a small server-rendered task board. Style it with Tailwind so it looks clean and modern; the exact look is
up to you. The DOM contract below (text, roles, labels) is fixed because automated checks use it.

## Data
Tasks live in an in-memory store on the server (a module-level array is fine), seeded with:

| id | title | done |
|---|---|---|
| t1 | Write the spec | true |
| t2 | Build the app | false |
| t3 | Ship it | false |

New tasks get a unique id and `done: false`. Data changes persist across page reloads while the server runs.

## Page `/`
- `<h1>` with the text `Tasks`.
- A form to add a task:
  - a text input with the accessible label `New task` (use a `<label>`);
  - a submit button with the text `Add`.
  - Titles are trimmed and must be 3–80 characters; the browser should block shorter/longer input.
  - The **server** rejects a title that already exists (case-insensitive, after trimming). The page then shows
    the text `A task with this title already exists` in an element with `role="alert"`.
  - On success the input is cleared and the new task appears in the list (newest first).
- Three filter buttons with the texts `All`, `Open`, `Done`. The active one has `aria-pressed="true"`, the others
  `aria-pressed="false"`. `All` is active initially. Filtering happens in the browser.
- The list is a `<ul>`; each task is an `<li>` containing:
  - a link to `/tasks/<id>` whose text is the task title;
  - a status badge with the text `open` or `done`;
  - a button with the text `Mark done` (open task) or `Mark open` (done task) that toggles the task on the
    server. The change must survive a reload.
- When the current filter matches no task, show the text `No tasks` instead of the list.

## Page `/tasks/:id`
- `<h1>` with the task title, and a paragraph with the text `Status: open` or `Status: done`.
- A link with the text `Back` to `/`.
- The document `<title>` is the task title.
- An unknown id answers HTTP **404** and shows the text `Task not found`.

## Done means
- The framework's own checks pass (type checking and any validator the framework provides).
- The server starts with a single command and honours the `PORT` environment variable.
