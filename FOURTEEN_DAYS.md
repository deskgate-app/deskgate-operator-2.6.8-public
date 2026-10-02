# What this test collects

✓ GATE sends the row. No spreadsheet required.

## Before day 1
Ops lead signs:

    Lane:       Availity / CoverMyMeds / UHC / named regional
    Pod:        n named coordinators
    Baseline:   completed cases / coordinator-day from their prior period
    Exclusions: listed up front

No baseline → do not start.

## Wedge
CMS-0057-F covers a slice of PA with APIs. Self-funded ERISA commercial plans and a large share of drug PA (including GLP-1) remain portal work. Denials and reconsiderations on those same portals are residual work. This test measures that residue on their tab.

## Day 1
Rows appear at `/pilot`. If STAGE never fires or every row is submit-without-hash, intervene that day.

## Day 14 block
    Desk / lane / completed (Submit + hash) / coordinator-day vs signed baseline
    Gate-accept = submitted / (submitted + refuse)
    Material-edit = edited / staged
    Miss-after-stage = notes miss:N / req_empty:N
    Vision used = notes vision:tab | vision:glass | vision:none
    Appeal rows = notes appeal_staged / appeal_quoted_ram_draft / appeal_miss:N
    Autonomous Submit = 0

## Appeal staging
STAGE APPEAL drafts a rebuttal from (a) the denial letter already in RAM and (b) chart facts already in RAM.
Every line is quoted. Missing keys become `[MISS]` and stay empty on the form.
This is not a medical-necessity determination. The coordinator edits and clicks Submit on the portal.

## Tuesday-DOM rule
A selector miss is not a failed pilot by itself. It is a measured miss.
Live inventory is the default motor. One-frame vision is operator-initiated.
Do not treat vision facts as certified chart data.

## Never sent
Member ID, name, DOB, notes, screenshots, raw tracking ID, raw appeal prose.
Hash is computed in the browser. Server rejects a raw ID if one is posted.
Viewport / Glass frames stay in RAM for the STAGE that follows. They are not attached to GATE.

LEDGER.csv is fallback if the panel cannot reach the server.

## Honest limit
Availity / CMM / UHC maps in lanes.js are starting selectors and hints, not a certified Schedule I mapping. Live STAGE fills from facts on the tab, from the planner, or from an operator frame. It will not invent Jane Rivera on a payer form. It will not invent a trial date on an appeal.
