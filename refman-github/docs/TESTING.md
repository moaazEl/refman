# What has been checked

This is a beta for friends to try, not a guarantee that every possible source or document works.

- 55 automated tests pass: reference formatting, source imports, citation matching, source correction validation, Word update safeguards, storage, recovery and attachment handling.
- 15 real desktop workflow checks pass, including project creation, edits, explicit reference inclusion, duplicate detection, earlier-version restoration, reopening, warning review, evidence display and preservation of partial correction overrides.
- The packaged Apple Silicon app opens, saves a project and produces readable backups.
- Real Microsoft Word scratch documents were used for insertion/update, manual-change conflicts, preserving a following Appendix, a mixed-source assignment and citation audit. Scratch documents were closed unsaved.
- DOCX export was inspected for italics and hanging indents.
- Forced process termination before and after the database commit left an openable project and recoverable prior versions. Readable exports may lag the database if a process dies between those writes; reopening and saving regenerates them.
- Complete project-folder transfer retained notes, originals and history after the original test folder was removed.
- Light/Dark/Follow Mac preference, reload persistence, system changes and the final packaged appearance passed desktop checks. Workspace and dialogs were visually inspected.
- Griffith's official APA 7 guide was checked for supported clinical and legal examples. MIMS Online and eMIMSelite have separate defaults; explicit database names take precedence.
- The runtime dependency audit reported no known advisories at the time of checking. That is a point-in-time check, not a permanent guarantee.

## Still unverified

Live ChatGPT sign-in and inference; use on a physical second Mac; the first internet-downloaded launch with macOS Gatekeeper; the user's real assignment; all possible Griffith exceptions; Intel Macs and Windows. No public GitHub release or GitHub-hosted build has been run yet.

The screenshot is a disposable demonstration project, not someone's assignment. Desktop tests use disposable projects and no real GPT inference. Native file-dialog choices may be supplied by the test runner; the renderer, IPC, storage and export implementations remain real.
