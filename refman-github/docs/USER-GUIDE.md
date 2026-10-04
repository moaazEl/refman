# Refman

A local Mac workspace for collecting sources, writing notes, checking Griffith APA 7 references, and working with editable text in Microsoft Word.

## Open the app

Open `dist/Refman-darwin-arm64/Refman.app`. This build is for Apple Silicon Macs. You can drag it to Applications and keep it in the Dock. It is a local development build, not a signed public release.

Create a project and choose its folder. Use **Project brief** to save your assignment question, rubric, optional draft, acceptable publication years, and Griffith-specific rules. Keep your source library and Word document together in your usual assignment folder if convenient.

## Appearance

At the bottom of the sidebar, choose **Follow Mac**, **Light**, or **Dark**. Refman remembers your choice. Follow Mac updates when your system appearance changes. This affects only the organiser; your Word references retain their selected document formatting.

## Collect and read

Use **Add source** with a DOI or URL, or add a source manually. Check imported details and their verification evidence. A DOI lookup uses Crossref's actual record; webpages vary in how much reliable metadata they expose. Missing information stays visible. Enter retrieval dates as YYYY-MM-DD, such as 2026-10-05. Choose MIMS Online and eMIMSelite as distinct databases; a specific container name overrides the default. An imported abstract is source material, not an AI summary.

Attach PDFs, screenshots, text files or Word documents. Add your own notes separately. With ChatGPT connected, **Extract details** proposes metadata supported by supplied material, and **Summarise for essay** uses the project brief to explain relevance, aim, method and findings. Refman does not bypass paywalls or clinical database access: supply the material you can access. GPT replies identify the material available to them.

Use the research companion to request citation corrections. Review **Suggested correction** before applying it. Manual metadata edits and citation overrides are also available, and correction history records previous values. Save enduring Griffith exceptions in the Project brief rules as well as the relevant source override.

## Citations and references

Check **Include in references** only for sources used in your essay. Newly added sources start unchecked. Source tracking numbers stay in the organiser and are omitted from the reference list.

The APA preview offers parenthetical and narrative citations, including first-use organisational forms where relevant. Copy them or insert at the current Word selection. The Citations view combines selected sources in APA order. A copy or insertion does not automatically mark a source as used; the inclusion checkbox remains your decision.

Review warnings before copying, exporting, or updating the reference list. For a direct quotation, include its real page or paragraph locator in the editable citation text or source override. Do not use an invented locator.

## Microsoft Word

Open your assignment in Word. To create the managed References region, select only the existing reference entries (leave the heading outside the selection), or place the cursor where the entries should go. Choose **Update References** in Refman and review the confirmation. Refman bookmarks that region for later updates. It inserts ordinary editable text, rather than EndNote fields.

Font, size, spacing, italics and hanging indents are configurable. Refman asks before replacing a region you edited manually. Keep lasting reference corrections in Refman so subsequent updates preserve them. macOS may ask you to allow Refman to control Word; that access is required for insertion and updates. **Export Word file** works as a separate reference document.

**Audit Word** compares recognised citation text with your project sources and selected bibliography. It flags unmatched, ambiguous, excluded and apparently uncited entries. Review the results: a text-pattern audit cannot prove that a source supports an essay claim or recognise every unusual legal/secondary citation.

## ChatGPT connection

Connect from the research companion and complete official sign-in in your browser. Refman keeps its own protected sign-in, separate from this desktop coding session. It uses your ChatGPT subscription allowance through the bundled official Codex runtime, with no API key or separate paid API billing. Availability depends on your plan, model access and connection. Only supplied source/context material is sent for these requests; GPT has no browsing or file-editing tools in Refman.

## Keep and recover your work

Each `.refman` project folder contains `project.sqlite`, `project.json`, a readable `project.txt`, original attachments and earlier saved versions. The text file updates after project saves; source notes and forms save automatically. Use **Backups** to restore an earlier version. **Open project** can also restore an exported text or JSON record into a new folder.

Move or back up the entire project folder to retain attachments and history. You can choose a folder inside your existing synced storage and open it on another compatible computer after synchronization finishes. Do not edit the same project on two computers simultaneously. Automatic multi-device merging is future work.

A lone text file preserves the project records, notes and conversations, but original attached PDFs/images must be copied separately. Recovery reports missing originals rather than pretending they were restored. Do not manually edit the embedded recovery payload in `project.txt`.

## Verification and development

See [testing notes](TESTING.md) for checks and remaining work, and the repository README for build instructions. From the source directory: `npm test`, `npm start`, and `npm run package`.
