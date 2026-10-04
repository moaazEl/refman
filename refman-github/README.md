# Refman

**Keep your research, notes and references together—and bring editable citations into Word.**

Refman is a desktop reference organiser built around a student workflow: collect potential sources, write your own notes, choose which sources you actually cited, and update your reference list as the assignment develops.

![Refman in dark mode, showing a demonstration project](images/refman-dark.png)

## Download and open

1. Open **Releases** on the right side of this GitHub project page.
2. Download **Refman-0.1.0-mac-arm64.zip** from the release's **Assets** list. The automatic “Source code” downloads are for developers; they are not the ready-to-open app.
3. Double-click the downloaded ZIP file.
4. Open the extracted folder and drag **Refman.app** to **Applications**.
5. Open Refman from Applications. You can keep it in your Dock.

**No Terminal or programming knowledge is needed to use the downloaded app.** If Releases is empty, the first app download has not been published yet.

### Will it work on my computer?

| Requirement | This release |
|---|---|
| Computer | Apple Silicon Mac: M1, M2, M3, M4 or later Apple chip |
| Check your chip | Apple menu → About This Mac → Chip |
| Intel Mac / Windows / phone | No ready-made build in this release |
| Word features | Desktop Microsoft Word for Mac required |
| Other features | Collecting sources, notes, copying citations and exporting references work without Word |
| Internet | Required for DOI/web imports and optional ChatGPT features |
| Cost | No charge from Refman; Word and optional ChatGPT access are your own |

This is an early **beta**, tested on the developer's Mac; it is not signed or notarised for public distribution. macOS may block the first launch. If you trust the download, follow Apple's [instructions for opening an unidentified app](https://support.apple.com/en-au/102445): after trying to open it, go to **System Settings → Privacy & Security → Open Anyway**, when that option is offered. Do not disable your Mac's security settings. If macOS reports damage or malware, stop and report the message rather than removing security checks.

## What you can do

- Keep separate projects for different essays and assignments.
- Add sources by DOI or URL, then review the imported metadata and its evidence.
- Attach PDFs, screenshots, text files and Word documents.
- Keep personal notes alongside the source's text and attachments.
- Copy parenthetical and narrative citations, or combine several sources into one citation.
- Choose **Include in references** only for sources you used. Potential sources stay in the library without appearing in the reference list.
- Review Griffith APA 7 references, missing details and publication-date warnings.
- Edit metadata and save manual citation/reference overrides.
- Insert ordinary editable text into Word and update a selected References region.
- Export a Word reference document and run an advisory citation check.
- Use Light, Dark or Follow Mac appearance.
- Keep automatically updated text backups, the project database, original attachments and earlier versions.

Refman is an independent project. It is not affiliated with Griffith University, Microsoft, OpenAI or EndNote.

## Your first project: five minutes

1. Choose **Create your first project**, enter its name and choose where to save it.
2. In **Project brief**, add the assignment question, publication-year range and any specific referencing rules.
3. Choose **Add source**, paste a DOI or URL, and check the imported details. You can also add or correct a source manually.
4. Add your own notes under **Notes & reading**. Check **Include in references** when you use the source in your essay.
5. Open **Citation preview** to copy a citation, or **Citations & Word** to combine citations and prepare your reference list.

Adding or copying a citation does not automatically check the source as included. You control the checkbox.

### Update references in Word

First try it in a **copy** of your assignment. Open it in Word and select only the existing reference entries, keeping the heading outside the selection. If there are no entries yet, place the cursor where they should go. Choose **Update references in Word** and review the confirmation.

Refman remembers that region for later updates. If you edit those entries manually, it asks before replacing them. Save lasting corrections in Refman as well. macOS may ask you to allow Refman to control Word. Font, size and spacing are chosen in the Citations & Word view.

### Optional ChatGPT features

The app includes a connection intended to use your own ChatGPT subscription through the official Codex runtime. It does not ask for an API key or charge separate API fees. Each person must sign in with their **own** account, and their plan allowance applies.

**Live sign-in, summaries and GPT corrections have not yet been verified end to end.** Treat them as experimental in this beta. You can use source organisation, notes, citation formatting, manual corrections, Word updates and backups without connecting ChatGPT. The AI integration has unit coverage; this does not replace a live account test.

When you request AI help, supplied assignment context, source material and recent conversation are sent to the service. Refman does not upload projects simply because you open them. DOI and webpage imports contact Crossref and the selected source website.

## Keep your work safe

A project is a folder ending in `.refman`. Keep the **whole folder** when backing up or moving it: it holds the database, readable `project.txt`, original attachments and saved versions. A text file alone cannot carry the original PDFs and images.

Use **Backups & restore** for an earlier version. **Open project** can recover a text or JSON backup. A copy of a complete project can be opened in another location; physical second-Mac testing is still pending. Do not edit the same synced folder on two computers at once.

No one else's projects, documents, notes or login details are included in this download. Your friends start with an empty library.

## What still needs care

- Check references against your assignment's Griffith guidance. Covered examples are tested; unusual cases may need an override.
- An imported record is not proof that every field is correct. Missing or unverified details remain visible.
- Clinical databases require their actual update and retrieval dates. Enter retrieval dates as **YYYY-MM-DD**.
- Scanned PDFs may need pasted text or screenshots; Refman preserves the original and warns when text extraction fails.
- Citation auditing cannot prove that a source supports a claim, or recognise every unusual citation.
- Cloud collaboration, automatic citation-use tracking, automatic app updates, Intel/Windows builds and signed public distribution are not included.

## Help and feedback

Read the [full user guide](docs/USER-GUIDE.md) and [testing notes](docs/TESTING.md). If something goes wrong, open an **Issue** on this GitHub project with what you clicked, what you expected, and the error message. Redact personal information; do not attach your assignment, project backup or account credentials.

## For developers

Use Node.js 22 or newer. On a compatible Mac:

```sh
npm ci
npm test
npm start
```

Build the Apple Silicon app with `npm run package`. The output is `dist/Refman-darwin-arm64/Refman.app`. Explicit desktop checks use Playwright's Electron integration; they create disposable projects. Do not run `npm run package` while using an app from that same build folder.

The source has no open-source license selected yet. Third-party components retain their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md). Do not assume that publishing the repository grants unrestricted reuse rights.
