# DeskGate Operator v2.6.8 (Client Runtime)

- Quoted denial staging. Chart facts and letter facts stay in separate stores. Missing items stay `[MISS]`.
- CPT codes parse as code and units. Placeholder vision answers are dropped.
- STAGE types only into empty boxes. The extension does not click Submit.
- Coordinator edits on staged boxes are counted as lengths and flags only.
- Showcase lanes post under `<desk>-SYN`. Default desk code is `DG-INTERNAL`.
- Human Submit. GATE hashes the tracking ID in the browser.

Tests: `node tests/lanes.test.mjs`
