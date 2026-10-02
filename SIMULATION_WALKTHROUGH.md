# Offline simulation walkthrough

These pages exercise the complete operator loop without live payer credentials and without live PHI. Enable **Allow access to file URLs** on the extension card before opening `file://` pages.

## Pages

1. `showcase-denial.html` — Adverse determination letter (tracking `BCBS-TN-PA-88429117`, policy ORT-PT-2026 §4.2).
2. `showcase-appeal.html` — Reconsideration form.
3. `showcase-chart.html` — ApexCare outpatient chart (Vargas, Elena M.).
4. `showcase-portal.html` — HealthPayer Essentials prior-authorization form.

## Primary workflow — Denial recovery & appeal staging (Loop 2)

This is the found-cash path. Run it first.

1. Open `showcase-denial.html`. Focus that tab. In the side panel click **READ CHART**. Accept the display picker if prompted, or allow fallback to the tab viewport.
2. Confirm denial keys in the transcript (reason, code, policy cite, missing items, tracking ID). Chart facts from a prior READ stay in RAM and merge.
3. Open `showcase-appeal.html`. Focus that tab. Click **STAGE APPEAL**.
4. Read the quoted draft. Any key not in RAM appears as `[MISS]` and must stay empty unless the coordinator supplies it. DeskGate does not invent trial dates.
5. Click **Submit Appeal to Payer** on the page (not in the extension). Auto-log accepts `APL-` receipt prefixes. **GATE** is the manual override if auto-log does not fire.

## Secondary workflow — First-pass prior auth (Loop 1)

Residual portal labor on the same runtime. Not the GTM wedge.

1. Open `showcase-chart.html`. Focus that tab. Click **READ CHART**.
2. Confirm parsed keys (name, DOB, member ID, CPT units, ICD-10, attachments, rationale).
3. Open `showcase-portal.html`. Focus that tab. Click **STAGE PORTAL**.
4. Review green-bordered staged fields. Edit anything that is wrong. Click **Submit Authorization Request** on the page. Confirm the human-gate modal on the page.
5. Watch the panel auto-detect the tracking reference and hash it.

## What success looks like

- Denial reason quoted into the appeal form without inventing a trial date.
- Chart facts typed into labeled portal fields without inventing a member.
- Appeal narrative composed only from RAM quotes.
- Extension never presses Submit.
- Ledger / `/api/pilot-event` receives a hash, not the raw tracking ID.

## Honest limits

Availity / CoverMyMeds / UHC maps in `lanes.js` are starting selectors and hints, not a certified Schedule I mapping. Live STAGE fills from facts on the tab, from the planner, or from an operator frame. It will not invent Jane Rivera on a live payer form. It will not invent a trial date on an appeal.
