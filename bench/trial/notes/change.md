# Change request for the notes app

The app in this directory already implements the notes app. Everything it does today must keep working, with and
without JavaScript. Add the following.

## 1. Pinned notes
- Each note's `<li>` gets a button `Pin` (unpinned note) or `Unpin` (pinned note).
- Pinned notes are listed before the others, and their `<li>` contains the text `pinned`.
- Pinning is stored on the server per user: it survives a reload, and other users are not affected.
- Pinning and unpinning also work with JavaScript disabled.

## 2. Search
- A text input with the accessible label `Search` above the list.
- Typing filters the list in the browser to notes whose text contains the search text (case-insensitive).
- When no note matches, show the text `No notes match` instead of the list.
- `Notes: <count>` still shows the total number of the user's notes, not the number of matches.
