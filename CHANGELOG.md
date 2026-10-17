# DeskGate Operator v2.6.8 (Client Runtime)

## Appeals
- Quoted denial staging. Chart facts and letter facts stay in separate stores. Missing items stay `[MISS]`.
- The appeal letter answers each item the denial asks for with a quote from the chart. No model writes clinical claims.
- A letter already read is used again on the next appeal form that shows the same payer reference. A form with a different reference gets an ATTENTION message instead.
- After a new READ, DeskGate replaces its own unedited `[MISS]` text. A box the coordinator touched is left alone.
- Rich-text appeal editors receive the letter as a real edit (paste / insertText), so the page's own Submit accepts it.

## Dental
- Dental charts: probing depths by tooth, bone loss, periodontal diagnosis, teeth treated and the charting date are kept word for word from the chart page (`dental_lines`, `teeth`). CDT codes read with their units, like CPT codes.
- Dental requests in a denial letter (periodontal charting, radiographs showing bone loss, tooth numbers, periodontal diagnosis) are answered with quotes of those lines and the X-ray and charting files named on the chart. A request the chart cannot answer stays `[MISS]`.
- Tooth / quadrant boxes on a carrier's appeal form fill from the teeth on the chart. A box labeled with a claim number takes the claim reference.
- `#` before a number (tooth #3, claim #...) is kept when the page is read; other `#` marks are still dropped.
- Imaging requests worded in the plural ("X-rays", "radiographs") now match the imaging files on the chart.
- Dentists and hygienists (DDS, DMD, RDH) are recognised as providers, never as the patient.
- Showcase: 3 dental tests (chart, carrier denial, appeal form) and two synthetic attachments for the X-ray upload box (`SYN_FMX_radiographs_0820.pdf`, `SYN_perio_chart_0820.pdf`).

## Filling forms
- Form matching by Gemini on Vertex AI (`/api/map-fields`): box labels and fact names only, never patient values. Values are typed from RAM and every box is read back.
- `lanes.js` word lists are the backup when Vertex does not answer within 15 seconds, and a second opinion: disagreements are shown before Submit.
- Iframe reach: inventory and verify probe every frame. Typing goes to the frame that owns the box. No broadcast, so a desk Chrome cannot answer from the shell first.
- STAGE types only into empty boxes. The extension does not click anything, Submit included.
- Date pickers get `yyyy-mm-dd`. A value the portal refuses counts as missed; a value the portal reformats is flagged.
- CPT codes parse as code and units. Placeholder vision answers are dropped.
- Showroom shortcuts (the synthetic packets) apply only on local files and deskgate.app, never on a live portal.

## Uploads and PDFs
- Upload boxes are counted (files picked, file names listed), never touched. An empty required upload is named at STAGE and flagged at GATE.
- A PDF in the tab or inside a frame is detected; the panel says only the screen read can see it.

## Panel and ledger
- Messages: ATTENTION (orange) for things to check, STOPPED for a halted step, ERROR only for technical failures.
- Desk keys: the panel confirms the site is in the desk's list before every read and stage.
- Coordinator edits on staged boxes are counted as lengths and flags only.
- Human Submit. GATE hashes the payer reference in the browser.
- Showcase pages post under `<desk>-SYN`. Default desk code is `DG-INTERNAL`.

Showcase: 12 tests plus 3 dental tests in `showcase/`. See `SIMULATION_WALKTHROUGH.md`.
