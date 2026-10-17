# Showcase walkthrough (12 tests + 3 dental tests + 3 Swiss tests)

The pages in `showcase/` run the whole operator loop with synthetic patients and no payer login. Zero live PHI.

## Before you start

1. Load the extension (see the README) and turn on **Allow access to file URLs** on its details card.
2. Open the side panel → **CONFIG**: Backend Host URL `https://deskgate.app`, a Desk code (for example `DG-INTERNAL`). Showcase rows post to the ledger as `<desk code>-SYN` and never count as desk results.
3. Open each page straight from the `showcase/` folder (`file://`). Every page shows a strip at the top: TEST NN OF 12, what it shows, what to watch. A page shown inside another page's frame has no strip of its own.
4. With the backend reachable, STAGE uses Gemini on Vertex AI to match boxes. Offline, it falls back to the `lanes.js` word list and says so in the panel.

Keep all 28 files together: the three `-form.html` pages and the denial PDF are loaded inside other tests, the two `SYN_*.pdf` files are the attachments for test D3, and the four Swiss PDFs (`KG_Auszug_…`, `Labor_HbA1c_…`, `Verordnung_Entlastungsschuh_…`, `Zuweisung_Podologie_…`) are the documents on the S1 chart.

## Prior authorization (tests 01–05)

| Test | Open | Press | What to watch |
| :--- | :--- | :--- | :--- |
| 01 | `showcase-chart.html` | READ CHART | Patient, trials, codes and attachment names go into the panel. Nothing was in RAM before. |
| 02 | `showcase-portal.html` | STAGE PORTAL | Every box fills from the chart. Click Submit on the page and confirm the page's own gate; the panel logs the receipt and hashes the reference. |
| 03 | `showcase-portal-iframe.html` | STAGE PORTAL | The form is inside an iframe, like Availity. Its boxes fill; the decoy Billing Tax ID box stays empty. |
| 04 | `showcase-portal-upload.html` | STAGE PORTAL | DeskGate names the empty required upload box and the files to attach. It never attaches a file. Submit once without a file to see the flag, then attach any PDF and run it again. |
| 05 | `showcase-portal-upload-iframe.html` | STAGE PORTAL | The same upload warning, for a form inside a frame. |

The chart from test 01 stays in RAM for tests 02–05.

## Denial letter (tests 06–08)

| Test | Open | Press | What to watch |
| :--- | :--- | :--- | :--- |
| 06 | `showcase-denial.html` | READ CHART | Reason, code, policy, missing items and reference are read. The letter's facts are kept apart from the chart's. |
| 07 | `showcase-denial.pdf` (open it in Chrome) | READ CHART | The same letter as a PDF. Only the screen read can see a PDF, and the panel says so. |
| 08 | `showcase-letter-pdf-frame.html` | READ CHART | A PDF inside a portal page. DeskGate spots it and says only the screen read can see it. |

## Appeals (tests 09–12)

Read the letter (test 06) before test 09. After an appeal is submitted, the letter is used again on the next appeal form that shows the same payer reference, and all four do, so you read it once.

| Test | Open | Press | What to watch |
| :--- | :--- | :--- | :--- |
| 09 | `showcase-appeal.html` | STAGE APPEAL | Reference, quoted denial reason, appeal letter and attachments all fill. Anything the chart does not show reads `[MISS]`. |
| 10 | `showcase-appeal-rich.html` | STAGE APPEAL | The letter goes into a rich-text editor as a real edit, so the page accepts Submit. |
| 11 | `showcase-appeal-iframe.html` | STAGE APPEAL | A rich-text editor inside a frame. The reference is taken from the form, the letter lands in the frame, and the receipt is logged. |
| 12 | `showcase-appeal-shell.html` | STAGE APPEAL | The portal's own search, lookup and notes boxes stay empty. Everything lands in the form inside the frame. |

To see the missing-letter warning: press **NEW CASE**, run test 01 again, skip test 06, then press STAGE APPEAL on any appeal page.

## Dental (tests D1–D3)

Press **NEW CASE** first if you ran the medical tests: the dental chart is a different patient, and DeskGate also clears the old facts on its own when it sees a new patient. The strip on each page reads DENTAL TEST 1 OF 3, and so on.

| Test | Open | Press | What to watch |
| :--- | :--- | :--- | :--- |
| D1 | `showcase-dental-chart.html` | READ CHART | Patient, `cpt: D4341 x2`, `teeth`, `provider_name` (with DDS), and `dental 1` to `dental 13`: the charting date, probing depths for each tooth, bone loss, the diagnosis and the teeth treated, word for word. |
| D2 | `showcase-dental-denial.html` | READ CHART | Claim reference DPM-CLM-55021934, denial code, policy and the four requested items, kept apart from the chart's facts. |
| D3 | `showcase-dental-appeal.html` | STAGE APPEAL | Claim reference, member, patient, DOB, CDT codes, teeth and the quoted denial reason fill. The appeal answers all four requests with quotes; the panel review reads "covered 4". The required X-ray upload box gets an ATTENTION: DeskGate names the files and never attaches them. Attach `SYN_FMX_radiographs_0820.pdf` and `SYN_perio_chart_0820.pdf` from the showcase folder (the panel says the upload box now has a file), then click Submit on the page; the receipt shows 2 files and is logged. |

## Switzerland (tests S1–S3, TARDOC 2026)

Press **NEW CASE** first, or use the demo buttons under **🇨🇭 Schweiz** in CONFIG (button 1 starts a new case). With **Schweiz-Modus** on, the panel says it read the page text only and matched boxes with the word list; the results below are the same. A family doctor's practice (Praxis Dr. med. M. Keller) billed a 38-minute consultation for a diabetic foot ulcer under TARDOC. The insurer (AlpaCare, invented) paid the consultation minutes and cut the 18 minutes of hausärztliche Beratung (CA.00.0030). The strip on each page reads SCHWEIZ TEST 1 VON 3, and so on.

| Test | Open | Press | What to watch |
| :--- | :--- | :--- | :--- |
| S1 | `swiss-chart-denial.html#kg` | READ CHART | `ahv`, `member_id`, `veka`, `gln`, `zsr`, `law_type: KVG`, `tardoc` with quantities, `treatment_date: 15.09.2026`, `consult_minutes: 38`, `invoice_no`, `KG 1` to `KG 7` word for word, and `attachments` with the four PDF names from the Dokumente list. `dob` stays `07.03.1961`. |
| S2 | same page, tab **Eingang: Antwort AlpaCare** | READ CHART | The letter namespace gets the Leistungsabrechnung number, Bemerkungscode AC-TD-0412, `tardoc_disputed: CA.00.0030 x18`, the Kürzungsgrund, the Grundlage and the four requested items. The other tab is hidden, so its text is not read. |
| S3 | `swiss-appeal-portal.html` | STAGE APPEAL | The panel shows the German Stellungnahme and a PRÜFUNG block: "belegt 3 · fehlt 1". Items 1–3 quote the Konsultation, Beratung and Befund lines; item 4 (Fotodokumentation) reads `[FEHLT — …]`, because none of the four PDFs is a photo. The letter ends with a Beilagen line naming the four PDFs. 18 boxes fill; Readback 18/18. The search box, the WZW boxes and the Art. 42 Abs. 5 box stay empty. Click Submit: the page asks for the WZW confirmation. Tick the three boxes as the physician would, Submit again: the receipt STN-AC-… is auto-gated, logged with `miss_sent` because `[FEHLT]` was still in the text. |

`schweiz-compliance.html` explains the data flow for a Swiss practice. It is a page to read, not a test.

## What success looks like

- The appeal quotes the denial reason and the chart, and invents nothing: no trial date, no member, no policy text, no probing depth.
- Boxes fill on forms inside frames, and nothing lands in boxes that are not part of the form.
- Upload boxes and PDFs are named, never handled.
- The extension never presses Submit. The coordinator does, on the page.
- The ledger (`/api/pilot-event`) receives a hash of the reference, not the reference itself.

## Honest limits

- A live portal can still refuse a value (a date picker, a pick-from-list box) or show more boxes after "Next". The panel flags refused and reformatted values; the coordinator checks them on screen.
- DeskGate reads only what is on screen when READ CHART is pressed. It does not log into the EHR or the payer.
