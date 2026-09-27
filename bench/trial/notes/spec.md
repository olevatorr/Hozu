# Personal notes — specification

Build a small server-rendered notes app with simple accounts. Style it with Tailwind so it looks clean; the exact
look is up to you. The DOM contract below (text, roles, labels) is fixed because automated checks use it.

## Accounts and data
- A user signs in with a name only (no password). A name is 2–20 letters; any such name signs in, and a new name
  starts with no notes.
- The signed-in user is kept in a session cookie. The cookie must be `HttpOnly`.
- Notes live in an in-memory store on the server, per user, seeded with:

| user | notes (newest first) |
|---|---|
| ada | `Buy milk`, `Call Bob` |
| bob | `Bob's secret` |

- Data changes persist across page reloads while the server runs.
- **Every user sees only their own notes**, also when several users are signed in at the same time from different
  browsers.

## Page `/login`
- `<h1>` with the text `Sign in`.
- A form with a text input with the accessible label `Name` (use a `<label>`) and a submit button `Sign in`.
- On success the browser ends up on `/`.

## Page `/`
- When nobody is signed in, the request is redirected to `/login`.
- `<h1>` with the text `Notes`, and a paragraph with the text `Signed in as <name>`.
- A `Sign out` button. After signing out the browser ends up on `/login`, and `/` redirects to `/login` again.
- A paragraph with the text `Notes: <count>` (the number of the user's notes).
- A form to add a note:
  - a text input with the accessible label `New note`, and a submit button `Add`;
  - notes are trimmed and must be 1–100 characters; the browser should block longer input;
  - the **server** rejects a note the user already has (case-insensitive, after trimming). The page then shows the
    text `You already have this note` in an element with `role="alert"`;
  - on success the input is cleared and the new note appears first in the list.
- The notes are a `<ul>`; each note is an `<li>` containing the note text and a button `Delete` that removes it.
- **Everything on this page and on `/login` must also work with JavaScript disabled**: signing in and out, adding
  (including the duplicate message) and deleting.
- **With JavaScript enabled, clicking `Add` twice quickly must add the note only once.**

## Done means
- The framework's own checks pass (type checking and any validator the framework provides).
- The server starts with a single command and honours the `PORT` environment variable.
