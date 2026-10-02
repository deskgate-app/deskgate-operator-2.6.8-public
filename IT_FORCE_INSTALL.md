# DeskGate Operator Runtime 2.6.8 — IT install (one page)

Extension ID (this build, signed with DeskGate’s packing key):

```
bdhbnbpkkcageebgfabcecolflgembfe
```

CRX file in this package: `deskgate-operator-2.6.8.crx`  
Update feed (host this XML next to the CRX on HTTPS):

```
https://deskgate.app/ext/updates.xml
```

This runtime does **not** require Developer mode when IT force-installs it.
Do not ask coordinators to “Load unpacked” on a locked floor.

Same extension ID as the prior 2.6.4 partner pack: the 2.6.8 CRX is signed with the same packing key, so existing Intune / CBCM / GPO force-install lines keep working. Only bump the CRX filename and the `version` in `updates.xml`.

## Who this is for

Offshore / nearshore RCM floors filing US prior auth on **Availity Essentials**
and **UHC Provider Portal**. Ops-led buyer, high volume, measured handling time.
Not a US hospital CISO package. Not a Chrome Web Store listing.

Human Submit stays on the coordinator. DeskGate does not file the auth.

## Edge (typical on Windows floors) — Intune

Settings catalog → Microsoft Edge → Extensions:

1. **ExtensionInstallForcelist** (one line):

```
bdhbnbpkkcageebgfabcecolflgembfe;https://deskgate.app/ext/updates.xml
```

2. **ExtensionInstallSources**:

```
https://deskgate.app/ext/*
```

3. Leave Developer mode **off**. Force-install does not use it.

If you already default-deny extensions (`ExtensionInstallBlocklist = *`),
also add this ID to **ExtensionInstallAllowlist**.

## Chrome — Google Admin / CBCM / GPO

Same two values.

`updates.xml` (host next to the CRX):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="bdhbnbpkkcageebgfabcecolflgembfe">
    <updatecheck
      codebase="https://deskgate.app/ext/deskgate-operator-2.6.8.crx"
      version="2.6.8"/>
  </app>
</gupdate>
```

After policy sync: open `edge://policy` or `chrome://policy` and confirm the
ID is not marked `[BLOCKED]`. `[BLOCKED]` means the PC is **not**
enterprise-managed. Then either enroll the device, or use the fallback below.

## Fallback when the floor PC is not managed

Many India / Philippines delivery centers do **not** run Intune on every
seat. Then:

- Edge → `edge://extensions` → Developer mode → Load unpacked → this folder
- Or drag `deskgate-operator-2.6.8.crx` onto that page if the browser still accepts it

This fallback is a pilot path (one pod, 14 days), not a 200-seat rollout.

## What IT should expect in the manifest

| Permission | Why |
| --- | --- |
| sidePanel, storage, scripting | Console + inject the staging script |
| tabs, activeTab | See which payer tab is focused |
| host access | Payer portals are many subdomains; Availity widgets run in iframes |
| content script, all frames | Availity / UHC forms are not always in the top frame |

Not included: `debugger`, cookie read, webRequest log, Meet caption scrape
as a shipping pitch.

## Floor setup after install

1. Pin the action. Open CONFIG.
2. Backend: `https://deskgate.app`
3. Desk Key: the key DeskGate issued to this desk. It is tied to the desk's lane (the payer portal and chart sites agreed before the test). The panel refuses to read or stage on any other site.
4. Engine: with a desk key every screen read goes to Google Gemini on Vertex AI (`deskgate-production`, under the executed Google Cloud HIPAA BAA), whatever engine is selected
5. Reload the Availity tab once so the content script attaches
6. STAGE PORTAL → coordinator reviews outlined fields → coordinator clicks Submit

## Updates

Send a new CRX packed with the **same offline packing key**. Bump `version`
in `manifest.json` and in `updates.xml`. Managed browsers pick it up on the
next policy/update check. Do not re-pack with a new key or the ID changes
and every policy line breaks.

The packing private key is **not** in this repository.
