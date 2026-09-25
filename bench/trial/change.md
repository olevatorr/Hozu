# Change request for the task board

The app in this directory already implements the task board. Everything it does today must keep working.
Add the following:

1. **Priority.** Every task has a priority: `low`, `normal` or `high`.
   - Seeded tasks are `normal`.
   - The add form gets a `<select>` with the accessible label `Priority` and the options `low`, `normal`, `high`.
     `normal` is selected by default. The server stores the chosen priority with the new task.
   - Each list item shows a priority badge whose text is the priority (`low` / `normal` / `high`).
   - The detail page shows a paragraph with the text `Priority: <priority>`.
2. **Clear done.** A button with the text `Clear done` on `/` deletes every done task on the server. The list
   updates, and a deleted task's detail page answers 404 afterwards.

Done means: the framework's checks still pass and the server still starts with the same command.
