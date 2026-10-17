import {
    resolveLane,
    isShowroomLocation,
    FIELD_KEY_ALIASES,
    stageActionsForLane,
    isShowroomLane,
    DEFAULT_HINTS,
    parseVisionFacts,
    extractDenialFacts,
    draftAppealFromRam,
    mergeFacts,
    stageActionsFromInventory,
    leftoverHintActions,
    hostOf,
    isAppealSurface,
    classifySurface,
    samePatient,
    identityMismatches,
    looksLikeTrackingId,
    extractPayerReference,
    splitTrials,
    parseCptPairs,
    isSentinelValue,
    normalizeDob,
    isLookupBox,
    ean13Ok,
    parseTardocPairs,
} from './lanes.js';

const SERVER_URL = 'https://deskgate.app';
const VERSION = '2.6.8';
const BUILD = '2.6.8-client-runtime';
const DEFAULT_DESK_CODE = 'DG-INTERNAL';

const SESSION_KEYS = {};
const PHI_KEY_NAMES = new Set([
    'extAnthropicKey', 'extGeminiKey', 'extGrokKey',
]);

let lastDomSnapshot = null;
let lastVisionText = '';
let lastGlassMeta = '';
let lastActionLog = [];
let lastInventoryTabId = null;
let lastPortalTabId = null;
let motorTabId = null;
// Two namespaces: chart facts (ramFacts) and the payer letter (ramDenial).
// A denial letter never writes into chart facts.
let ramFacts = {};
let ramDenial = {};
let ramSources = {};     // chart key -> 'dom' | 'vision'
let denialSources = {};  // letter key -> 'dom' | 'vision'
let lastAppealDraft = null;
// Denial reference of the last appeal gated; its letter facts were cleared from RAM at the gate.
let lastClosedAppealRef = '';
// The letter of the last gated appeal. Used again only on an appeal form that prints the same reference.
let lastClosedLetter = null;

let autoLogActive = true;
let autoLogPollInterval = null;

// Per-desk key: the desk and lane deskgate.app reported for it ({ org, deskCode, allowed }).
// Stays null for the shared internal key, which has no lane.
let deskLane = null;
let deskLaneAnnounced = '';

let caseSession = newCaseSession();

function newCaseSession(host) {
    return {
        id: 'case_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        startedAt: new Date().toISOString(),
        readAt: null,
        stagedAt: null,
        host: host || '',
        events: [],
        stagedSelectors: [],
        materialEdit: false,
        edits: {},
        editAnnounced: [],
        readback: null,
        humanSubmitAt: null,
        payerReference: '',
        completed: false,
        postedPilotId: '',
        fieldsTotal: 0,
        fieldsEmpty: 0,
        requiredEmptyBefore: 0,
        requiredEmptyAfter: 0,
        fillOk: 0,
        fillMiss: 0,
        skippedFilled: 0,
        visionUsed: '',
        appealStaged: false,
        appealMiss: 0,
        appealChecks: 0,
        mismatch: 0,
        missMarkersSent: false,
        visionPasses: 0,
        visionUnresolved: [],
        readChecks: [],
        stagedFrames: [],
        uploads: {},              // `${frameId}|${selector}` -> { label, required, attached } (counts only)
        attachmentsMissing: false,
        kind: 'pa',
    };
}

function clearRam(reason) {
    ramFacts = {};
    ramDenial = {};
    ramSources = {};
    denialSources = {};
    lastVisionText = '';
    lastAppealDraft = null;
    lastClosedAppealRef = '';
    lastClosedLetter = null;
    if (reason) appendTranscript('System', reason);
}

const transcriptBox = document.getElementById('transcript');
const mediaStatusText = document.getElementById('mediaStatusText');
const telemetryLatency = document.getElementById('telemetryLatency');
const settingsDrawer = document.getElementById('settingsDrawer');

function safeSetVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val != null ? String(val) : '';
}

function safeGetVal(id) {
    const el = document.getElementById(id);
    return el && el.value ? el.value.trim() : '';
}

function setBusy(isBusy, msg = 'Processing...') {
    const bar = document.getElementById('livePipelineBar');
    const barMsg = document.getElementById('livePipelineMsg');
    if (bar) bar.classList.toggle('active', !!isBusy);
    if (barMsg && isBusy) barMsg.textContent = msg;
    ['btnReadChart', 'btnStagePortal', 'btnStageAppeal', 'btnMarkSubmitted'].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = isBusy;
    });
    if (isBusy) setStatus(`⏳ ${msg}`);
}

/**
 * Schweiz-Modus: patient data stays in the browser. READ CHART uses the page text only (no frame is
 * captured or sent) and STAGE matches boxes with the word list only (/api/map-fields is not called).
 * What still leaves: the licence check (host name) and the GATE row (hash of the reference).
 */
function swissMode() {
    return !!document.getElementById('chkSwissMode')?.checked;
}

/**
 * Schweiz-Modus screen read: switched off until frames go straight to Vertex AI in europe-west6.
 * Always false, so a saved setting from an earlier build cannot switch it back on (Schedule CH § 3.1).
 */
function swissVisionAllowed() {
    return false;
}

function zrmOn() {
    return !!(document.getElementById('chkEnterprisePlan')?.checked
        && document.getElementById('chkSignedBAA')?.checked
        && document.getElementById('chkZeroRetention')?.checked);
}

async function purgePhiFromDisk() {
    const keys = Array.from(PHI_KEY_NAMES);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
    }
    keys.forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
}

function refreshHipaaBadge() {
    const ok = zrmOn();
    const badge = document.getElementById('hipaaStatusBadge');
    if (!badge) return;
    badge.textContent = ok ? 'STATUS: ZRM ELIGIBLE (BAA CHAIN ACTIVE)' : 'STATUS: NOT YET ELIGIBLE';
    badge.style.color = ok ? 'var(--neon)' : 'var(--danger)';
    badge.style.borderColor = ok ? 'var(--neon)' : 'var(--danger)';
    badge.style.background = ok ? 'rgba(0,255,65,0.08)' : 'rgba(239,68,68,0.1)';
}

async function getSavedKey(key) {
    if (PHI_KEY_NAMES.has(key) && Object.prototype.hasOwnProperty.call(SESSION_KEYS, key)) {
        return SESSION_KEYS[key] || '';
    }
    if (PHI_KEY_NAMES.has(key) && zrmOn()) {
        return SESSION_KEYS[key] || '';
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => resolve(result[key] || ''));
        });
    }
    return localStorage.getItem(key) || '';
}

async function saveKey(key, value) {
    if (PHI_KEY_NAMES.has(key)) SESSION_KEYS[key] = value;
    // When ZRM is active, strictly intercept PHI keys in RAM and purge from disk
    if (PHI_KEY_NAMES.has(key) && zrmOn()) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            await new Promise((resolve) => chrome.storage.local.remove([key], resolve));
        }
        try { localStorage.removeItem(key); } catch (_) {}
        return;
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [key]: value });
    } else {
        localStorage.setItem(key, value);
    }
}

function appendTranscript(role, text) {
    if (!transcriptBox) return;
    const div = document.createElement('div');
    // Attention: something the operator should look at before Submit (orange).
    // Stopped: DeskGate typed nothing on purpose (red). Error: something technical failed (red).
    const color = role === 'System' ? '#00e5ff' : role === 'Success' ? '#00ff41'
        : role === 'Fact' ? '#f59e0b' : role === 'AutoLog' ? '#a855f7' : role === 'Appeal' ? '#c084fc'
        : role === 'Progress' ? '#38bdf8' : role === 'Attention' ? '#fb923c'
        : (role === 'Stopped' || role === 'Error') ? '#ef4444' : '#94a3b8';
    const tint = role === 'Attention' ? 'rgba(251,146,60,0.08)' : (role === 'Stopped' || role === 'Error') ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.03)';
    div.style.cssText = `margin-bottom:8px; padding:10px; background:${tint}; border:1px solid rgba(255,255,255,0.08); border-left:3px solid ${color}; border-radius:6px; font-size:0.8rem; line-height:1.45;`;
    const clean = String(text || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = `
        <div style="font-size:0.62rem; color:${color}; font-weight:800; text-transform:uppercase; margin-bottom:3px;" class="mono">${role}</div>
        <div style="white-space:pre-wrap;">${clean}</div>
    `;
    transcriptBox.appendChild(div);
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function setStatus(text) {
    if (mediaStatusText) mediaStatusText.innerText = text;
}

function deskKeyRefusal(resp, data) {
    if (!resp || resp.status !== 401) return null;
    if (data && data.error && data.error !== 'desk_key_required') return null;
    return 'Desk key missing or wrong. Open CONFIG and paste the desk key DeskGate sent you.';
}

/** Host of the focused web tab. Empty for file:// practice pages and browser pages. */
async function focusedWebHost() {
    try {
        const tab = await getActiveTab();
        return tab?.url && /^https?:/i.test(tab.url) ? (hostOf(tab.url) || '') : '';
    } catch (_) {
        return '';
    }
}

async function getAuthHeaders() {
    const deskKey = (await getSavedKey('extAccessKey')).trim();
    const host = await focusedWebHost();
    return {
        'Content-Type': 'application/json',
        ...(deskKey ? { 'X-DeskGate-Key': deskKey } : {}),
        // Host only, never a path. deskgate.app refuses a desk key outside its lane.
        'X-DeskGate-Domain': host || 'none',
    };
}

function hostInLane(host, allowed) {
    const h = String(host || '').toLowerCase().replace(/^www\./, '');
    return (allowed || []).some((d) => {
        const a = String(d || '').toLowerCase().trim().replace(/^www\./, '');
        return !!a && (a === '*' || h === a || h.endsWith('.' + a));
    });
}

function rememberDeskLane(data) {
    if (!data || !data.org || !Array.isArray(data.allowed_domains) || !data.allowed_domains.length) return;
    deskLane = {
        org: String(data.org),
        deskCode: String(data.desk_code || ''),
        allowed: data.allowed_domains.map(String),
    };
    const tag = `${deskLane.deskCode}|${deskLane.allowed.join(',')}`;
    if (tag === deskLaneAnnounced) return;
    deskLaneAnnounced = tag;
    appendTranscript('System',
        `Desk ${deskLane.deskCode || deskLane.org} (${deskLane.org}) · lane: ${deskLane.allowed.join(', ')}. ` +
        'Screen reads go to Google Cloud (deskgate-production) only.');
}

/** Learn this key's desk and lane once, so the panel shows them and applies PHI rules from the first read. */
async function primeDeskLane() {
    const deskKey = (await getSavedKey('extAccessKey')).trim();
    if (!deskKey) return;
    try {
        const resp = await fetch(`${await serverBase()}/api/verify-license`, {
            headers: { ...(await getAuthHeaders()), 'X-DeskGate-Domain': 'none' },
        });
        rememberDeskLane(await resp.json().catch(() => null));
    } catch (_) {
        // checkLane() asks again before any read or stage on a web page.
    }
}

/**
 * Per-desk key: confirm the focused tab is inside the desk's lane before anything is read or staged.
 * File:// practice pages and deskgate.app have no lane to check. The shared internal key has no lane.
 */
async function checkLane(action) {
    const host = await focusedWebHost();
    if (!host || host === 'deskgate.app' || host.endsWith('.deskgate.app')) return true;
    const deskKey = (await getSavedKey('extAccessKey')).trim();
    if (!deskKey) return true; // No key: deskgate.app refuses the read on its own.
    let data = null;
    try {
        const resp = await fetch(`${await serverBase()}/api/verify-license`, { headers: await getAuthHeaders() });
        data = await resp.json().catch(() => null);
    } catch (_) {
        data = null;
    }
    if (data) rememberDeskLane(data);
    let refusal = '';
    if (data && (data.error === 'wrong_lane' || data.reason === 'outside_desk_lane')) {
        refusal = data.detail || `This desk key is not set up for ${host}. Nothing was read or staged.`;
    } else if (!data && deskLane && !hostInLane(host, deskLane.allowed)) {
        refusal = `This desk key is set up for ${deskLane.allowed.join(', ')}. The focused tab is ${host}. Nothing was read or staged.`;
    } else if (!data && !deskLane) {
        refusal = `Could not reach ${await serverBase()} to confirm this desk's lane. Nothing was read or staged.`;
    }
    if (!refusal) return true;
    appendTranscript('Stopped', `${action} stopped. ${refusal}`);
    setStatus(`${action} stopped — see the panel.`);
    return false;
}

async function serverBase() {
    return ((await getSavedKey('extServerUrl')) || SERVER_URL).replace(/\/+$/, '');
}

async function resolveSelectedProvider() {
    const saved = String(await getSavedKey('extModelProvider') || 'gemini').trim().toLowerCase();
    if (saved === 'claude') return 'anthropic';
    if (saved === 'google') return 'gemini';
    if (saved === 'xai') return 'grok';
    if (saved === 'gemini' || saved === 'grok' || saved === 'anthropic') return saved;
    return 'gemini';
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

async function refreshHostChip() {
    const chip = document.getElementById('activeHostChip');
    if (!chip) return;
    const tab = await getActiveTab();
    const host = tab?.url
        ? (hostOf(tab.url) || (tab.url.startsWith('file:') ? fileHost(tab.url) : 'TAB'))
        : 'NO TAB';
    chip.textContent = host;
}

function fileHost(url) {
    const s = String(url || '').split(/[?#]/)[0];
    const base = s.slice(s.lastIndexOf('/') + 1).toLowerCase();
    if (base.includes('denial')) return 'healthpayer.denial';
    if (base.includes('appeal')) return 'healthpayer.appeal';
    if (base.includes('portal') || base.includes('healthpayer')) return 'healthpayer.portal';
    if (base.includes('chart')) return 'apexcare.chart';
    return 'file';
}

function paintMissChip() {
    const chip = document.getElementById('missChip');
    if (!chip) return;
    const miss = caseSession.fillMiss || caseSession.requiredEmptyAfter || caseSession.appealMiss;
    const vis = caseSession.visionUsed ? ` · ${caseSession.visionUsed}` : '';
    if (caseSession.mismatch) {
        chip.textContent = `ID MISMATCH · ${caseSession.mismatch}`;
        chip.style.color = '#ff3b30';
        return;
    }
    if (!caseSession.stagedAt) {
        chip.textContent = 'MISS · —';
        chip.style.color = '';
        return;
    }
    const edits = Object.values(caseSession.edits || {}).filter((e) => e.staged && e.material).length;
    chip.textContent = `MISS · ${miss || 0}${edits ? ` · EDIT ${edits}` : ''}${vis}`;
    chip.style.color = miss > 0 ? '#ff3b30' : 'var(--neon)';
}

function recordMotorEvent(entry) {
    const row = {
        at: new Date().toISOString(),
        action: entry.action || '',
        hint: entry.hint || entry.label || '',
        ok: !!entry.ok,
        selector: entry.selector || '',
    };
    lastActionLog.push(row);
    if (lastActionLog.length > 80) lastActionLog = lastActionLog.slice(-80);
    caseSession.events.push(row);
    if (row.selector && row.action === 'type_text') {
        if (!caseSession.stagedSelectors.includes(row.selector)) {
            caseSession.stagedSelectors.push(row.selector);
        }
    }
}

/** frameId: send to that one frame. Without it, Chrome returns whichever frame answers first. */
async function sendToTab(tabId, action, data = {}, frameId = null) {
    try {
        const res = frameId == null
            ? await chrome.tabs.sendMessage(tabId, { action, data })
            : await chrome.tabs.sendMessage(tabId, { action, data }, { frameId });
        return res || { ok: false, status: 'NO_FRAME_RESPONDED' };
    } catch (err) {
        const msg = err.message || String(err);
        // Content script is present but no frame had the target (frames stay silent on NOT_FOUND).
        if (/message port closed|before a response/i.test(msg)) {
            return { ok: false, status: 'NO_FRAME_RESPONDED', error: msg };
        }
        return { ok: false, status: 'CONTENT_SCRIPT_UNREACHABLE', error: msg };
    }
}

async function sendToTabReady(tabId, action, data = {}, frameId = null) {
    if (!tabId) return { ok: false, status: 'NO_TAB' };
    let res = await sendToTab(tabId, action, data, frameId);
    if (res.status === 'CONTENT_SCRIPT_UNREACHABLE') {
        try {
            await chrome.scripting.executeScript({
                target: frameId == null ? { tabId, allFrames: true } : { tabId, frameIds: [frameId] },
                files: ['content.js'],
            });
            res = await sendToTab(tabId, action, data, frameId);
        } catch (e) {
            return { ok: false, status: 'INJECT_FAILED', error: e.message };
        }
    }
    return res;
}

/**
 * Runs inside every frame (content-script world) through chrome.scripting.
 * Must stay self-contained: Chrome serializes this function into each frame.
 */
function frameProbe(mode, caseId) {
    try {
        const api = window.__DESKGATE_API__;
        if (!api) return { missing: true };
        return mode === 'verify' ? api.verifyStaged(caseId) : api.getDomState();
    } catch (e) {
        return { error: String((e && e.message) || e) };
    }
}

/** One answer per frame, top frame first. Throws when the tab cannot be scripted (chrome://, Web Store). */
async function probeFrames(tabId, mode, caseId = '') {
    const run = () => chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: frameProbe,
        args: [mode, caseId],
    });
    let results = await run();
    const missing = (results || []).filter((r) => r?.result?.missing).map((r) => r.frameId);
    if (missing.length && mode !== 'verify') {
        // Frames that loaded before the extension (or after a reload) get the content script now.
        await chrome.scripting.executeScript({ target: { tabId, frameIds: missing }, files: ['content.js'] }).catch(() => {});
        results = await run();
    }
    return (results || [])
        .filter((r) => r && r.result && !r.result.missing && !r.result.error)
        .sort((a, b) => a.frameId - b.frameId);
}

/**
 * The whole tab: fields and text from every frame, merged. A broadcast GET_DOM_STATE returns only
 * the first frame to answer — on a desk Chrome that is the top frame, so a form inside an iframe
 * (Availity-style workbench) read as "0 fields", its printed reference was never seen and its
 * receipt never auto-gated. Each field keeps its frameId so the fill goes to the frame that owns it.
 */
async function readTabState(tabId) {
    if (!tabId) return { ok: false, status: 'NO_TAB' };
    let frames = [];
    for (let attempt = 0; attempt < 2 && !frames.length; attempt += 1) {
        // A frame mid-navigation rejects the whole call; one short retry covers it.
        if (attempt) await sleep(250);
        try {
            frames = await probeFrames(tabId, 'state');
        } catch (_) {
            frames = [];
        }
    }
    if (!frames.length) {
        // Never a broadcast here (that is the race this replaced): the top frame only, marked partial.
        // Unscriptable tabs (chrome://, Web Store) still come back CONTENT_SCRIPT_UNREACHABLE / INJECT_FAILED.
        const res = await sendToTabReady(tabId, 'GET_DOM_STATE', {}, 0);
        if (res && res.ok) res.partial = true;
        return res;
    }
    const top = (frames.find((f) => f.frameId === 0) || frames[0]).result;
    const fields = [];
    const uploads = [];
    const texts = [];
    frames.forEach(({ frameId, result }) => {
        (result.fields || []).forEach((f) => fields.push({ ...f, frameId }));
        (result.uploads || []).forEach((u) => uploads.push({ ...u, frameId }));
        const t = String(result.text || '').trim();
        if (t) texts.push(t);
    });
    const isPdf = (r) => /\bpdf\b/i.test(String(r?.content_type || ''));
    const live = (f) => !f.readonly && !f.disabled;
    return {
        ok: true,
        url: top.url,
        title: top.title,
        frame: 'top',
        text: texts.join('\n\n').slice(0, 32000),
        fields,
        uploads,
        // Chrome's PDF viewer keeps the document's text out of reach: only the screen read sees it.
        pdf: frames.some((f) => isPdf(f.result)),
        pdfTop: isPdf(top),
        frames: frames.map(({ frameId, result }) => ({ frameId, url: result.url, fields: (result.fields || []).length })),
        field_summary: {
            total: fields.length,
            empty: fields.filter((f) => f.empty && live(f)).length,
            required_empty: fields.filter((f) => f.empty && f.required && live(f)).length,
        },
    };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function downscaleImageBase64(dataUrl, maxDim = 1280, quality = 0.65) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                else { w = Math.round((w * maxDim) / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
        };
        img.onerror = () => resolve(dataUrl.split(',')[1]);
        img.src = dataUrl;
    });
}

async function captureActiveTabBase64() {
    const tab = await getActiveTab();
    if (tab?.url) {
        const u = tab.url.toLowerCase();
        if (u.startsWith('chrome://') || u.startsWith('edge://') || u.startsWith('chrome-extension://')) {
            throw new Error('Cannot capture Chrome system tab.');
        }
    }
    const rawDataUrl = await chrome.tabs.captureVisibleTab(tab?.windowId ?? null, { format: 'jpeg', quality: 80 });
    return downscaleImageBase64(rawDataUrl, 1280, 0.65);
}

async function captureDisplayGlassBase64() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('getDisplayMedia is not available in this browser.');
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 4 },
        audio: false,
        preferCurrentTab: false,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('No video track from display picker.');
    const settings = track.getSettings() || {};
    lastGlassMeta = [
        settings.displaySurface || 'surface',
        settings.label || track.label || 'display',
        `${settings.width || '?'}x${settings.height || '?'}`,
    ].join(' · ');

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth) await sleep(200);

    let w = video.videoWidth || 1280;
    let h = video.videoHeight || 720;
    const maxDim = 1280;
    if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    try { track.stop(); } catch (_) {}
    stream.getTracks().forEach((tr) => { try { tr.stop(); } catch (_) {} });
    video.srcObject = null;
    return dataUrl.split(',')[1];
}

function fieldInventoryLines(fields) {
    if (!Array.isArray(fields) || !fields.length) return '(no visible fields)';
    return fields.slice(0, 80).map((f) => {
        const flags = [
            f.empty ? 'empty' : 'filled',
            f.required ? 'required' : '',
            f.readonly ? 'readonly' : '',
            f.disabled ? 'disabled' : '',
        ].filter(Boolean).join(',');
        return `${f.frameId ? 'iframe › ' : ''}${f.selector} :: "${f.label}" (${f.type}; ${flags})`;
    }).join('\n');
}

/** Fields that live inside an embedded frame, for the inventory line. */
function framedCount(fields) {
    return (fields || []).filter((f) => f.frameId).length;
}

async function readLiveInventory(tabId) {
    const id = tabId || motorTabId || (await getActiveTab())?.id;
    const res = await readTabState(id);
    if (res && (res.fields || res.url || res.text)) {
        lastDomSnapshot = res;
        if ((res.fields || []).length) {
            lastInventoryTabId = id;
            motorTabId = id;
        }
    }
    return res;
}

async function runActions(actions, tabId = null, formFrameId = 0) {
    let ok = 0;
    let miss = 0;
    const skipped = [];
    const rejected = [];
    const changed = [];
    const target = tabId || motorTabId || (await getActiveTab())?.id;
    // Every action goes to exactly one frame: an inventory box to the frame that owns it, a hint or a
    // lane selector map to the frame that holds the form. A broadcast lets every frame type its own best
    // guess (a portal shell's search or notes box included) and reports whichever frame answered first.
    const send = async (a, action, data) => {
        if (!target) return { ok: false, status: 'NO_TAB' };
        const frameId = a.frameId ?? formFrameId;
        const res = await sendToTabReady(target, action, data, frameId);
        if (res && res.ok && !caseSession.stagedFrames.includes(frameId)) caseSession.stagedFrames.push(frameId);
        return res;
    };
    for (const a of actions) {
        const name = a.action || a.type;
        if (name === 'skip_filled') {
            skipped.push(a.selector);
            continue;
        }
        if (name === 'fill_fields') {
            const res = await send(a, 'FILL_FIELDS', { fields: a.fields || {}, case_id: caseSession.id });
            const rows = res?.fields || [];
            if (rows.length) {
                rows.forEach((r) => {
                    if (r.ok) ok += 1; else miss += 1;
                    recordMotorEvent({ action: 'type_text', selector: r.resolved || r.selector, ok: !!r.ok });
                });
            } else {
                miss += Object.keys(a.fields || {}).length || 1;
            }
            continue;
        }
        const hint = a.field_hint || a.label || a.selector || '';
        const res = await send(a, 'TYPE_TEXT', {
            text: a.text,
            field_hint: hint,
            selector: a.selector,
            label: a.label,
            key: a.key || a.field_hint || '',
            case_id: caseSession.id,
            replace_miss: !!a.replace_miss,
        });
        const good = !!(res && res.ok === true);
        if (good) ok += 1; else miss += 1;
        if (res && res.status === 'REJECTED') rejected.push(`${res.selector || a.selector}${res.why ? ` (${res.why})` : ''}`);
        else if (good && res.verified === false) changed.push(res.selector || a.selector);
        recordMotorEvent({ action: 'type_text', hint, selector: res?.selector || a.selector || '', ok: good });
    }
    if (rejected.length) {
        appendTranscript('Attention', `The portal did not accept what DeskGate typed in: ${rejected.join(', ')}. Those boxes are empty and counted as missed. Fill them by hand.`);
    }
    if (changed.length) {
        appendTranscript('Attention', `The portal reformatted what DeskGate typed in: ${changed.join(', ')}. Check those boxes on screen before Submit.`);
    }
    caseSession.skippedFilled = skipped.length;
    if (skipped.length) {
        appendTranscript('System', `Already filled — left untouched: ${skipped.join(', ')}. Clear those boxes first if DeskGate should stage them.`);
    }
    return { ok, miss, skipped: skipped.length };
}

/**
 * A box DeskGate itself filled with a [MISS] line, untouched by the coordinator since, is typed again
 * once the missing fact is in RAM. So it does not matter whether the letter is read before or after
 * STAGE APPEAL. A box the coordinator edited is never replaced.
 */
function restageOwnMissBoxes(actions, fields, facts) {
    const byBox = new Map((fields || []).map((f) => [`${f.frameId ?? ''}|${f.selector}`, f]));
    const replaced = [];
    const out = actions.map((a) => {
        if (a.action !== 'skip_filled') return a;
        const f = byBox.get(`${a.frameId ?? ''}|${a.selector}`);
        const key = a.field_hint || '';
        const value = facts[key];
        if (!f || !f.deskgate_miss || value == null || value === '' || /\[(?:MISS|FEHLT)\b/i.test(String(value))) return a;
        replaced.push(a.selector);
        return {
            action: 'type_text', selector: a.selector, field_hint: key, key, text: String(value), replace_miss: true,
            ...(a.frameId != null ? { frameId: a.frameId } : {}),
        };
    });
    if (replaced.length) {
        appendTranscript('System', `Replacing the [MISS] text DeskGate typed earlier in ${replaced.join(', ')}: the missing facts are in RAM now.`);
    }
    return out;
}

/* ---------- Gemini field matching: which fact goes in which box (names only, never values) ---------- */

/** Fact names Gemini may pick from, with what each means. Values never leave the panel. */
const FACT_MEANINGS = {
    patient_name: 'patient full name, usually "Last, First M."',
    patient_first_name: 'patient first (given) name only',
    patient_last_name: 'patient last (family) name only',
    dob: 'patient date of birth (full date)',
    dob_month: 'month of the date of birth only (MM)',
    dob_day: 'day of the date of birth only (DD)',
    dob_year: 'year of the date of birth only (YYYY)',
    member_id: 'health plan member / subscriber ID',
    group_number: 'health plan group number',
    payer: 'health plan / payer name',
    plan: 'plan type, e.g. Commercial PPO',
    address: 'patient / subscriber home address',
    npi: 'rendering or ordering provider NPI (10 digits)',
    provider_name: 'rendering or ordering provider name',
    icd10: 'ICD-10 diagnosis codes',
    cpt: 'requested CPT / HCPCS (or dental CDT) procedure codes with units',
    teeth: 'dental: tooth numbers and quadrants treated',
    clinical: 'medical necessity statement / clinical rationale (long text)',
    attachments: 'names of the supporting documents on the chart (typed text, not a file upload)',
    appeal: 'the full appeal / reconsideration letter, or the Swiss Stellungnahme / ärztliche Begründung (long text)',
    denial_reason: 'the denial or cut reason quoted from the payer letter (Kürzungsgrund)',
    denial_code: 'the denial, reason or remark code printed on the payer letter (Bemerkungscode)',
    tracking_id: 'payer reference of the denied or cut request (tracking, claim or Leistungsabrechnung number)',
    // Swiss lane. There is deliberately no fact for the WZW confirmation (Art. 32 KVG) or for the
    // Art. 42 Abs. 5 KVG choice: those are checkboxes, which DeskGate never touches, and the physician decides.
    gln: 'provider GLN (13-digit Swiss Global Location Number of the practice or physician)',
    zsr: 'provider ZSR number (Swiss payment-register number, a letter and 6 digits)',
    ahv: 'patient AHV / AVS number (13-digit Swiss social insurance number starting 756)',
    veka: 'Swiss health insurance card number (Versichertenkarte, 20 digits)',
    law_type: 'Swiss social insurance law the case falls under: KVG, UVG, IVG, MVG or VVG',
    invoice_no: "the provider's own invoice number (Rechnungsnummer), not the payer's reference",
    treatment_date: 'date of treatment (Behandlungsdatum)',
    tardoc: 'all TARDOC tariff positions billed, each with its quantity',
    tardoc_disputed: 'the TARDOC position(s) the insurer cut or rejected, with quantity',
    consult_minutes: 'consultation length in minutes, as documented in the chart (number only)',
};

/** Part facts a portal may ask for separately: first / last name, DOB month / day / year. */
function withPartFacts(facts) {
    const f = { ...facts };
    const name = String(f.patient_name || '').trim();
    if (name && !f.patient_first_name && !f.patient_last_name) {
        let first = '';
        let last = '';
        if (name.includes(',')) {
            const [l, rest] = name.split(',');
            last = (l || '').trim();
            first = String(rest || '').trim().split(/\s+/)[0] || '';
        } else {
            const parts = name.split(/\s+/).filter(Boolean);
            if (parts.length >= 2) { first = parts[0]; last = parts[parts.length - 1]; }
        }
        if (first) f.patient_first_name = first;
        if (last) f.patient_last_name = last;
    }
    const m = String(f.dob || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        f.dob_month = m[1].padStart(2, '0');
        f.dob_day = m[2].padStart(2, '0');
        f.dob_year = m[3];
    }
    // A Swiss date is day first: 07.03.1961 is 7 March.
    const ch = String(f.dob || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (ch) {
        f.dob_day = ch[1].padStart(2, '0');
        f.dob_month = ch[2].padStart(2, '0');
        f.dob_year = ch[3];
    }
    return f;
}

/** DeskGate's word-list guess for one box (the same scoring STAGE used before Gemini). */
function wordListKey(field) {
    // A portal's own search or lookup box is never a form box.
    if (isLookupBox(field)) return null;
    const blob = `${field.selector || ''} ${field.label || ''} ${field.type || ''}`.toLowerCase();
    let key = null;
    let best = 0;
    Object.entries(FIELD_KEY_ALIASES).forEach(([k, aliases]) => {
        aliases.forEach((a) => { if (blob.includes(a) && a.length > best) { best = a.length; key = k; } });
    });
    return key;
}

const boxId = (f) => `${f.frameId ?? ''}|${f.selector}`;
const aiMapCache = new Map();

/** Ask Gemini (Vertex, deskgate-production) which fact name belongs in which box. */
async function aiFieldMap(fields, facts, surface) {
    const usable = (fields || []).filter((f) => !f.readonly && !f.disabled);
    const keys = {};
    Object.keys(FACT_MEANINGS).forEach((k) => {
        if (facts[k] != null && facts[k] !== '' && !isSentinelValue(facts[k])) keys[k] = FACT_MEANINGS[k];
    });
    if (!usable.length || !Object.keys(keys).length) return { ok: true, map: new Map() };
    const boxes = usable.map((f, i) => ({
        id: `b${i}`,
        label: f.label || '',
        kind: f.type || f.tag || 'text',
        required: isRequiredField(f),
        options: f.options || [],
        hint: wordListKey(f) || '',
        framed: !!f.frameId,
    }));
    const sig = JSON.stringify([surface, usable.map(boxId), boxes.map((b) => [b.label, b.kind, b.options.join('|')]), Object.keys(keys)]);
    let mapping = aiMapCache.get(sig);
    if (!mapping) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
            const resp = await fetch(`${await serverBase()}/api/map-fields`, {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ boxes, keys, surface }),
                signal: ctrl.signal,
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !Array.isArray(data.mapping)) {
                return { ok: false, why: data.detail || data.error || `the server answered ${resp.status}` };
            }
            mapping = data.mapping;
            aiMapCache.set(sig, mapping);
            if (aiMapCache.size > 30) aiMapCache.delete(aiMapCache.keys().next().value);
        } catch (e) {
            return { ok: false, why: e.name === 'AbortError' ? 'no answer within 15 seconds' : (e.message || String(e)) };
        } finally {
            clearTimeout(timer);
        }
    }
    const map = new Map();
    mapping.forEach((m) => {
        const i = Number(String(m.box || '').slice(1));
        const f = usable[i];
        if (!f || `b${i}` !== m.box) return;
        map.set(boxId(f), m.key && keys[m.key] ? m.key : null);
    });
    return { ok: true, map };
}

/**
 * Actions from Gemini's answer. Gemini decides the box; the value is always the fact from RAM.
 * A box Gemini did not answer for falls back to the word list.
 */
function actionsFromAiMap(fields, facts, aiMap) {
    const actions = [];
    const disagree = [];
    const matched = [];
    (fields || []).forEach((f) => {
        if (f.readonly || f.disabled) return;
        const listKey = wordListKey(f);
        const hasAi = aiMap.has(boxId(f));
        const key = hasAi ? aiMap.get(boxId(f)) : listKey;
        const where = `${f.frameId ? 'iframe › ' : ''}"${f.label || f.selector}"`;
        if (hasAi && listKey && key !== listKey && facts[listKey] != null && facts[listKey] !== '') {
            disagree.push(`${where} (Gemini: ${key || 'leave empty'}, word list: ${listKey})`);
        }
        if (!key) return;
        const value = facts[key];
        if (value == null || value === '' || isSentinelValue(value)) return;
        if (key === 'tracking_id' && !looksLikeTrackingId(value)) return;
        const by = !hasAi ? 'word list' : (listKey === key ? 'Gemini + word list' : 'Gemini');
        const frame = f.frameId == null ? {} : { frameId: f.frameId };
        if (f.tag !== 'select' && f.empty === false) {
            actions.push({ action: 'skip_filled', selector: f.selector, field_hint: key, label: f.label, ...frame });
            return;
        }
        matched.push(`${where} → ${key} [${by}]`);
        actions.push({ action: 'type_text', selector: f.selector, field_hint: key, key, text: String(value), by, ...frame });
    });
    return { actions, disagree, matched };
}

/** Plan what to type: Gemini first, DeskGate's word list as its hint and as the fallback. */
async function planStageActions(fields, facts, surface) {
    const all = withPartFacts(facts);
    if (swissMode()) {
        appendTranscript('System', 'Schweiz-Modus: Felder mit der Wortliste im Browser zugeordnet. Gemini wurde nicht gefragt.');
        return { actions: stageActionsFromInventory(fields, all), usedAi: false, facts: all };
    }
    const ai = await aiFieldMap(fields, all, surface);
    if (!ai.ok) {
        appendTranscript('System', `Gemini field matching unavailable (${ai.why}). DeskGate's word list was used.`);
        return { actions: stageActionsFromInventory(fields, all), usedAi: false, facts: all };
    }
    const r = actionsFromAiMap(fields, all, ai.map);
    if (r.matched.length) appendTranscript('Tool', 'Matched (box → fact):\n' + r.matched.join('\n'));
    if (r.disagree.length) {
        appendTranscript('Attention', `Gemini and DeskGate's word list read ${r.disagree.length === 1 ? 'this box' : 'these boxes'} differently. Gemini's choice was used; check on screen:\n• ${r.disagree.join('\n• ')}`);
    }
    return { actions: r.actions, usedAi: true, facts: all };
}

/* ---------- upload boxes: DeskGate never attaches a file; it only says what is still empty ---------- */

/** Merge what the page shows now. A box seen with a file stays "attached" for this case. */
function rememberUploads(uploads) {
    (uploads || []).forEach((u) => {
        const k = `${u.frameId ?? 0}|${u.selector}`;
        const was = caseSession.uploads[k];
        caseSession.uploads[k] = {
            label: u.label || (was && was.label) || u.selector,
            required: !!(u.required || (was && was.required)),
            attached: !!(u.attached || (was && was.attached)),
        };
    });
}

function uploadStatus() {
    const all = Object.values(caseSession.uploads || {});
    return {
        total: all.length,
        attached: all.filter((u) => u.attached).length,
        requiredEmpty: all.filter((u) => u.required && !u.attached).map((u) => u.label),
    };
}

function chartAttachmentNames() {
    return String(ramFacts.attachments || '').replace(/\s+/g, ' ').trim();
}

/** At STAGE: count the upload boxes and name any required one that is still empty. */
function reportUploadsAtStage(inv) {
    const ups = inv?.uploads || [];
    if (!ups.length) return;
    rememberUploads(ups);
    const st = uploadStatus();
    const names = chartAttachmentNames();
    const empty = st.total - st.attached;
    const head = `Upload boxes: ${st.total}, ${empty ? `${empty} with no file yet` : 'all have a file'}. DeskGate never attaches files.`;
    if (st.requiredEmpty.length) {
        appendTranscript('Attention', `Required upload still empty: ${st.requiredEmpty.join(', ')}. Attach the file on the portal before Submit.`
            + (names ? `\nThe chart names: ${names}.` : ''));
    } else if (empty && !st.attached && names) {
        appendTranscript('System', `${head}\nThe chart names: ${names}. Attach them on the portal before Submit.`);
    } else {
        appendTranscript('System', head);
    }
}

/** At the gate: DeskGate's last look before Submit. Logged as att_empty, never blocks the Submit. */
function checkUploadsAtGate() {
    const st = uploadStatus();
    if (!st.total) return;
    const names = chartAttachmentNames();
    if (st.requiredEmpty.length) {
        caseSession.attachmentsMissing = true;
        appendTranscript('Attention', `Submitted with a required upload empty (${st.requiredEmpty.join(', ')}) at DeskGate's last look. This row is logged as att_empty.`);
    } else if (!st.attached && names) {
        caseSession.attachmentsMissing = true;
        appendTranscript('Attention', `Submitted with no file in any upload box at DeskGate's last look, while the chart names ${names}. This row is logged as att_empty.`);
    }
}

/**
 * The frame that holds the form being staged: most inventory matches, then most open boxes;
 * the top frame when nothing is editable. Hint and lane-map fills go only there.
 */
function formFrameOf(fields, actions = []) {
    const score = new Map();
    const add = (id, n) => score.set(id, (score.get(id) || 0) + n);
    (fields || []).forEach((f) => { if (!f.readonly && !f.disabled) add(f.frameId ?? 0, 1); });
    (actions || []).forEach((a) => {
        if (a.frameId != null && (a.action === 'type_text' || a.action === 'skip_filled')) add(a.frameId, 10);
    });
    let best = 0;
    let bestScore = -1;
    score.forEach((v, id) => {
        if (v > bestScore || (v === bestScore && id < best)) { best = id; bestScore = v; }
    });
    return best;
}

/**
 * A fact matched both inside the form's frame and in another frame (a portal shell's "Member ID lookup"
 * or search box): the form's box is typed, the other is left alone. Single-frame pages are unchanged.
 */
function keepFormFrameOnly(actions, formFrameId) {
    const keyOf = (a) => a.key || a.field_hint || '';
    const inForm = new Set(actions.filter((a) => (a.frameId ?? formFrameId) === formFrameId && keyOf(a)).map(keyOf));
    const outside = [];
    const kept = actions.filter((a) => {
        if (a.action !== 'type_text' || a.frameId == null || a.frameId === formFrameId || !inForm.has(keyOf(a))) return true;
        outside.push(a.selector);
        return false;
    });
    if (outside.length) {
        appendTranscript('System', `Left empty outside the form frame (same fact is staged in the form): ${outside.join(', ')}.`);
    }
    return kept;
}

/** The embedded frames could not be read: say so and type nothing, rather than guess at the top page. */
function stopOnPartialRead(inv, what) {
    if (!inv?.partial) return false;
    appendTranscript('Stopped', `${what} stopped. The embedded frames on this page could not be read, only the top page, so nothing was typed. `
        + `This usually means the page was still loading: wait a moment and press ${what} again. If it repeats, reload the portal tab.`);
    setStatus(`${what} stopped — press again.`);
    paintMissChip();
    return true;
}

/** Required = the HTML attribute, or a label ending in "*" (how most payer portals mark it). */
function isRequiredField(f) {
    return !!(f && (f.required || /\*\s*$/.test(String(f.label || ''))));
}

function requiredEmptyCount(fields) {
    return (fields || []).filter((f) => f.empty && isRequiredField(f) && !f.readonly && !f.disabled).length;
}

/** Anything the screen read could not settle is repeated at staging time, next to the boxes. */
function reportOpenReadItems() {
    const items = [];
    if (caseSession.visionUnresolved.length) items.push(`left empty by the screen read: ${caseSession.visionUnresolved.join(', ')}`);
    caseSession.readChecks.forEach((c) => items.push(c));
    if (items.length) appendTranscript('Attention', 'Before Submit, check on screen:\n• ' + items.join('\n• '));
}

/** Read back every box DeskGate typed in this case and compare with what was staged. */
async function verifyStaged(tabId) {
    const target = tabId || motorTabId;
    if (!target) return null;
    // Every frame that holds a staged box answers; a broadcast would return only the first frame.
    let rows = [];
    try {
        const frames = await probeFrames(target, 'verify', caseSession.id);
        frames.forEach(({ frameId, result }) => (result.rows || []).forEach((r) => rows.push({ ...r, frameId })));
    } catch (_) {
        // Probe unavailable: ask each frame DeskGate typed in, one at a time (never a broadcast).
        for (const frameId of caseSession.stagedFrames) {
            const res = await sendToTab(target, 'VERIFY_STAGED', { case_id: caseSession.id }, frameId);
            (Array.isArray(res?.rows) ? res.rows : []).forEach((r) => rows.push({ ...r, frameId }));
        }
    }
    if (!rows.length) return null;
    return {
        total: rows.length,
        ok: rows.filter((r) => r.ok).length,
        changed: rows.filter((r) => r.present && !r.ok).map((r) => r.selector),
        missMarkers: rows.filter((r) => r.miss_marker).length,
        rows,
    };
}

const CHART_KEY_ORDER = [
    'patient_name', 'dob', 'ahv', 'member_id', 'veka', 'group_number', 'payer', 'plan', 'law_type', 'address', 'npi',
    'provider_name', 'gln', 'zsr', 'icd10', 'cpt', 'cpt_conflict', 'tardoc', 'tardoc_conflict', 'treatment_date', 'consult_minutes',
    'invoice_no', 'teeth', 'attachments', 'note_date', 'rationale', 'plan_of_care',
];
const LETTER_KEY_ORDER = [
    'decision', 'tracking_id', 'denial_code', 'denial_reason', 'policy_cite', 'missing_items',
    'patient_name', 'dob', 'ahv', 'member_id', 'cpt', 'icd10', 'tardoc_disputed', 'tardoc', 'invoice_no', 'treatment_date',
    'law_type', 'gln', 'zsr',
];

/** Two payer references are the same when they match ignoring case, spaces and dashes. */
function sameRef(a, b) {
    const n = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return !!n(a) && n(a) === n(b);
}

/** An appeal form says so somewhere: in its address, title, box labels or page text (English or German). */
function looksLikeAppealPage(inv, tab) {
    const blob = [inv?.url || tab?.url || '', inv?.title || tab?.title || '',
        (inv?.fields || []).map((f) => f.label).join(' '), inv?.text || ''].join(' ');
    return /appeal|rebuttal|reconsider|reopen|overturn|redetermin|dispute|grievance|stellungnahme|rechnungsk(?:ü|ue)rzung|beanstandung|einsprache|wiedererw(?:ä|ae)gung/i.test(blob);
}

/** True when the payer letter itself was read (a tracking reference alone is not a letter). */
function letterInRam() {
    return ['denial_reason', 'denial_code', 'policy_cite', 'missing_items', 'decision'].some((k) => ramDenial[k]);
}

function factLines(obj, order, prefix = '') {
    const out = [];
    order.forEach((k) => {
        if (obj[k] == null || obj[k] === '') return;
        out.push(`• ${prefix}${k}: ${String(obj[k]).replace(/\s+/g, ' ').slice(0, 110)}`);
    });
    return out;
}

function trialLinesFor(obj) {
    const trials = splitTrials(obj.trial_lines && obj.trial_lines.length ? obj.trial_lines : obj.prev);
    const dental = Array.isArray(obj.dental_lines) ? obj.dental_lines : [];
    const kg = Array.isArray(obj.kg_lines) ? obj.kg_lines : [];
    return trials.map((t, i) => `• trial ${i + 1}: ${t.slice(0, 140)}`)
        .concat(dental.map((t, i) => `• dental ${i + 1}: ${t.slice(0, 140)}`))
        .concat(kg.map((t, i) => `• KG ${i + 1}: ${t.slice(0, 140)}`));
}

function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function normForCompare(v) {
    return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Keys that came from literal page text are not overwritten by a screen read. */
function domKeys(sources) {
    return new Set(Object.entries(sources).filter(([, s]) => s === 'dom').map(([k]) => k));
}

function noteSources(sources, before, after, tag) {
    Object.keys(after).forEach((k) => {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) sources[k] = tag;
    });
}

function readConflicts(current, incoming, sources, literal) {
    if (literal) return [];
    const out = [];
    ['patient_name', 'dob', 'member_id', 'group_number', 'npi', 'icd10', 'cpt', 'payer', 'ahv', 'gln', 'zsr'].forEach((k) => {
        const a = current[k];
        const b = incoming[k];
        if (!a || !b || sources[k] !== 'dom') return;
        const na = normForCompare(a);
        const nb = normForCompare(b);
        if (na === nb || na.includes(nb) || nb.includes(na)) return;
        out.push(`${k}: page text "${String(a).slice(0, 60)}" kept; screen read "${String(b).slice(0, 60)}"`);
    });
    return out;
}

function startCaseClockOnRead() {
    if (caseSession.readAt) return;
    caseSession.readAt = new Date().toISOString();
    if (!caseSession.stagedAt) caseSession.startedAt = caseSession.readAt;
}

/* ---------- comparing two reads of the same field ---------- */

const CHART_VOTE_KEYS = [
    'patient_name', 'dob', 'member_id', 'group_number', 'address', 'payer', 'plan', 'npi',
    'provider_name', 'icd10', 'cpt', 'attachments', 'note_date', 'rationale', 'plan_of_care', 'trial_lines',
    // Swiss chart (a screen read of a US chart simply leaves these lines out).
    'ahv', 'veka', 'gln', 'zsr', 'law_type', 'invoice_no', 'treatment_date', 'consult_minutes', 'tardoc',
];
const LETTER_VOTE_KEYS = [
    'decision', 'tracking_id', 'denial_code', 'denial_reason', 'policy_cite', 'missing_items',
    'patient_name', 'dob', 'member_id', 'cpt', 'icd10',
    'ahv', 'gln', 'zsr', 'law_type', 'invoice_no', 'treatment_date', 'tardoc_disputed',
];
const LETTER_ONLY_KEYS = ['decision', 'tracking_id', 'denial_code', 'denial_reason', 'policy_cite', 'missing_items'];
const LONG_TEXT_KEYS = new Set(['rationale', 'plan_of_care', 'denial_reason', 'policy_cite', 'missing_items', 'address']);

const alnumKey = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const wordsKey = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digitsKey = (v) => (String(v || '').match(/\d+/g) || []).join(' ');
const setKey = (v) => String(v || '').toUpperCase().split(/[,;\s]+/).filter(Boolean).sort().join(',');
const nameKey = (v) => String(v || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1).sort().join(' ');

function cptKey(v) {
    const pairs = parseCptPairs(`CPT ${String(v || '').replace(/[,;&]\s*/g, '\nCPT ')}`).pairs;
    return pairs.map((p) => `${p.code}x${p.units}`).sort().join(',');
}

function tardocKey(v) {
    return parseTardocPairs(String(v || '').replace(/[,;]\s*/g, '\n')).pairs.map((p) => `${p.code}x${p.units}`).sort().join(',');
}

function tokenSimilarity(a, b) {
    const x = new Set(wordsKey(a).split(' ').filter(Boolean));
    const y = new Set(wordsKey(b).split(' ').filter(Boolean));
    let inter = 0;
    x.forEach((t) => { if (y.has(t)) inter += 1; });
    return inter / Math.max(x.size, y.size, 1);
}

function present(v) {
    return v != null && v !== '' && !isSentinelValue(v);
}

/** True when two reads of one field say the same thing (format differences ignored, digits never). */
function valuesAgree(key, a, b) {
    if (!present(a) || !present(b)) return false;
    switch (key) {
        case 'member_id': case 'group_number': case 'npi': case 'denial_code': case 'tracking_id':
        case 'ahv': case 'veka': case 'gln': case 'zsr': case 'invoice_no': case 'law_type': case 'consult_minutes':
            return alnumKey(a) === alnumKey(b);
        case 'dob': case 'treatment_date':
            return normalizeDob(a) === normalizeDob(b);
        case 'cpt':
            return cptKey(a) === cptKey(b);
        case 'tardoc': case 'tardoc_disputed':
            return tardocKey(a) === tardocKey(b);
        case 'icd10': case 'attachments':
            return setKey(a) === setKey(b);
        case 'patient_name':
            return nameKey(a) === nameKey(b);
        case 'payer': {
            const x = wordsKey(a);
            const y = wordsKey(b);
            return x === y || x.includes(y) || y.includes(x);
        }
        default:
            if (LONG_TEXT_KEYS.has(key) || key.startsWith('trial:')) {
                return digitsKey(a) === digitsKey(b) && tokenSimilarity(a, b) >= 0.9;
            }
            return wordsKey(a) === wordsKey(b);
    }
}

function preferValue(key, a, b) {
    if (!present(a)) return b;
    if (!present(b)) return a;
    if (key === 'payer') return wordsKey(a).length <= wordsKey(b).length ? a : b;
    return a;
}

function trialId(line) {
    const m = String(line || '').match(/^\s*trial\s*#?\s*(\d+)/i);
    return m ? `trial:${Number(m[1])}` : `trial:${wordsKey(line).slice(0, 32)}`;
}

function trialMap(lines) {
    const m = new Map();
    (Array.isArray(lines) ? lines : splitTrials(lines)).forEach((l) => {
        const id = trialId(l);
        if (!m.has(id)) m.set(id, String(l).replace(/\s+/g, ' ').trim());
    });
    return m;
}

function sortTrials(entries) {
    return entries.sort((x, y) => {
        const a = Number((x[0].match(/^trial:(\d+)$/) || [])[1] || 999);
        const b = Number((y[0].match(/^trial:(\d+)$/) || [])[1] || 999);
        return a - b;
    }).map(([, v]) => v);
}

function npiCheckDigitOk(npi) {
    const n = String(npi || '');
    if (!/^\d{10}$/.test(n)) return false;
    const s = '80840' + n.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < s.length; i += 1) {
        let d = Number(s[s.length - 1 - i]);
        if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return (10 - (sum % 10)) % 10 === Number(n[9]);
}

function dobPlausible(dob) {
    const m = normalizeDob(dob).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return false;
    const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 1900 && dt.getTime() <= Date.now();
}

function ensurePeriod(s) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return !t || /[.!?)"]$/.test(t) ? t : t + '.';
}

function capAtSentence(s, max) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const end = cut.lastIndexOf('.');
    return end > max * 0.5 ? cut.slice(0, end + 1) : cut;
}

/** Same composition lanes.js uses for page text: rationale + plan + dated trials. */
function recomposeDerived(f) {
    const trials = splitTrials(f.trial_lines && f.trial_lines.length ? f.trial_lines : f.prev);
    if (trials.length) {
        f.trial_lines = trials;
        f.prev = trials.map(ensurePeriod).join(' ');
    }
    const parts = [];
    if (f.rationale) parts.push(`Clinical rationale: ${ensurePeriod(f.rationale)}`);
    if (f.plan_of_care) parts.push(`Plan: ${ensurePeriod(f.plan_of_care)}`);
    if (trials.length) parts.push(`Step-therapy history: ${trials.map(ensurePeriod).join(' ')}`);
    if (parts.length) f.clinical = capAtSentence(parts.join(' '), 2000);
    return f;
}

function unionList(a, b) {
    const out = String(a || '').split(/,\s*/).map((x) => x.trim()).filter(Boolean);
    const seen = new Set(out.map((x) => x.toUpperCase()));
    String(b || '').split(/,\s*/).map((x) => x.trim()).filter(Boolean).forEach((x) => {
        if (!seen.has(x.toUpperCase())) { seen.add(x.toUpperCase()); out.push(x); }
    });
    return out.join(', ');
}

/**
 * Merge a later screen read into chart facts already in RAM (same patient).
 * Lists grow (trials, attachments, ICD-10, CPT); a value already in RAM is never replaced —
 * a different later reading is reported instead, so a scrolled second frame can add but not overwrite.
 */
function accumulateScreenRead(base, inc, keep, notes) {
    const out = mergeFacts(base, {});
    let derivedChanged = false;
    for (const [k, v] of Object.entries(inc || {})) {
        if (!present(v) || ['prev', 'clinical', 'cpt_conflict', 'tardoc_conflict'].includes(k)) continue;
        const has = present(out[k]);
        if (!has) {
            out[k] = v;
            if (['trial_lines', 'rationale', 'plan_of_care'].includes(k)) derivedChanged = true;
            continue;
        }
        if (keep.has(k)) continue;
        if (k === 'trial_lines') {
            const cur = trialMap(out.trial_lines || out.prev);
            for (const [id, line] of trialMap(v)) {
                if (!cur.has(id)) { cur.set(id, line); derivedChanged = true; }
                else if (!valuesAgree('trial:', cur.get(id), line)) notes.push(`${id.replace(':', ' ')}: first read kept; a later read differs`);
            }
            out.trial_lines = sortTrials(Array.from(cur.entries()));
            continue;
        }
        if (k === 'attachments' || k === 'icd10') {
            out[k] = unionList(out[k], v);
            continue;
        }
        if (k === 'dental_lines' || k === 'kg_lines') {
            const cur = Array.isArray(out[k]) ? out[k].slice() : [];
            const seen = new Set(cur.map((l) => String(l).toLowerCase()));
            (Array.isArray(v) ? v : []).forEach((l) => {
                if (cur.length < 24 && !seen.has(String(l).toLowerCase())) { seen.add(String(l).toLowerCase()); cur.push(l); }
            });
            out[k] = cur;
            continue;
        }
        if (k === 'tardoc') {
            const merged = parseTardocPairs(`${String(out.tardoc).replace(/,\s*/g, '\n')}\n${String(v).replace(/,\s*/g, '\n')}`);
            out.tardoc = merged.text;
            if (merged.conflicts.length) out.tardoc_conflict = merged.conflicts.map((c) => `${c.code}: x${c.kept} vs x${c.other}`).join('; ');
            continue;
        }
        if (k === 'cpt') {
            const merged = parseCptPairs(`CPT ${String(out.cpt).replace(/,\s*/g, '\nCPT ')}\nCPT ${String(v).replace(/,\s*/g, '\nCPT ')}`);
            out.cpt = merged.text;
            if (merged.conflicts.length) out.cpt_conflict = merged.conflicts.map((c) => `${c.code}: x${c.kept} vs x${c.other}`).join('; ');
            continue;
        }
        if (!valuesAgree(k, out[k], v)) notes.push(`${k}: first read "${String(out[k]).slice(0, 50)}" kept; a later read says "${String(v).slice(0, 50)}"`);
    }
    if (derivedChanged || !out.clinical) recomposeDerived(out);
    return out;
}

/**
 * Route one page-text read (or a single unverified text) into the right namespace.
 * ctx.literal = text came from the page DOM (exact).
 */
function ingestVisionText(text, source = 'Vision', ctx = {}) {
    const raw = String(text || '');
    if (!raw.trim()) return ramFacts;
    if (ctx.literal) lastVisionText = raw;
    const surface = classifySurface(raw, ctx.url || '', ctx.title || '');
    const facts = surface === 'denial' ? extractDenialFacts(raw) : parseVisionFacts(raw);
    let letterOnly = null;
    if (surface === 'unknown') {
        const letter = extractDenialFacts(raw);
        letterOnly = {};
        LETTER_ONLY_KEYS.forEach((k) => { if (letter[k]) letterOnly[k] = letter[k]; });
    }
    return ingestFacts(surface, facts, source, { ...ctx, letterOnly });
}

/** Store already-extracted facts. Screen-read facts arrive here only after the two-pass check. */
function ingestFacts(surface, facts, source = 'Vision', ctx = {}) {
    startCaseClockOnRead();
    const literal = !!ctx.literal;
    const tag = literal ? 'dom' : 'vision';

    if (surface === 'denial') {
        const letter = facts;
        const vsChart = samePatient(ramFacts, letter);
        if (vsChart.same === false) {
            ramFacts = {};
            ramSources = {};
            appendTranscript('Attention', `Letter is for a different patient than the chart in RAM (${vsChart.reason}). Chart facts cleared — READ CHART for this member before STAGE APPEAL.`);
            if (caseSession.stagedAt && !caseSession.humanSubmitAt) caseSession = newCaseSession();
        }
        if (samePatient(ramDenial, letter).same === false) {
            ramDenial = {};
            denialSources = {};
        }
        const before = { ...ramDenial };
        ramDenial = mergeFacts(ramDenial, letter, { keep: literal ? null : domKeys(denialSources) });
        noteSources(denialSources, before, ramDenial, tag);
        const changed = Object.keys(ramDenial).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(ramDenial[k])).length;
        appendTranscript('Success', `${source}: payer letter — ${plural(changed, 'key')} updated in the letter namespace. Chart facts untouched (${plural(Object.keys(ramFacts).length, 'key')} in RAM).`);
        const lines = factLines(ramDenial, LETTER_KEY_ORDER, 'letter.');
        if (changed && lines.length) appendTranscript('Fact', lines.join('\n'));
        return ramFacts;
    }

    if (surface === 'unknown' && ctx.letterOnly && ctx.letterOnly.denial_reason) {
        // Unclassified surface: only payer-letter-specific keys may fill gaps in the letter namespace.
        ramDenial = mergeFacts(ramDenial, ctx.letterOnly, { fillOnly: true });
        appendTranscript('System', `${source}: denial wording found on an unclassified surface — letter gaps filled only.`);
    }

    const chart = facts || {};
    if (!Object.keys(chart).length) {
        appendTranscript('System', `${source}: no chart facts recognised on this surface.`);
        return ramFacts;
    }
    const vsChart = samePatient(ramFacts, chart);
    if (vsChart.same === false) {
        const wasStaged = caseSession.stagedAt && !caseSession.humanSubmitAt;
        const keepLast = lastVisionText;
        clearRam(`New patient on this read (${vsChart.reason}). Previous patient's facts cleared from RAM${wasStaged ? '; the staged, un-gated case was dropped' : ''}.`);
        caseSession = newCaseSession();
        startCaseClockOnRead();
        if (literal) lastVisionText = keepLast;
    }
    if (samePatient(ramDenial, chart).same === false) {
        ramDenial = {};
        denialSources = {};
        appendTranscript('System', 'Payer letter in RAM belongs to a different patient — letter facts cleared.');
    }

    const conflicts = readConflicts(ramFacts, chart, ramSources, literal);
    const frameNotes = [];
    const before = { ...ramFacts };
    if (literal) {
        ramFacts = mergeFacts(ramFacts, chart, { fillOnly: surface !== 'chart' });
    } else {
        ramFacts = accumulateScreenRead(ramFacts, chart, domKeys(ramSources), frameNotes);
    }
    noteSources(ramSources, before, ramFacts, tag);
    if (ramFacts.npi && !npiCheckDigitOk(ramFacts.npi) && !caseSession.readChecks.some((c) => c.startsWith('NPI'))) {
        caseSession.readChecks.push(`NPI ${ramFacts.npi} fails the NPI check-digit test — confirm it on the chart before Submit.`);
        appendTranscript('Attention', `NPI ${ramFacts.npi} fails the NPI check-digit test (misread, or a synthetic number). Confirm it on the chart before Submit.`);
    }
    // Swiss numbers carry an EAN-13 check digit: a misread digit shows here, before anything is typed.
    [['ahv', 'AHV-Nr.'], ['gln', 'GLN']].forEach(([k, label]) => {
        if (!ramFacts[k] || ean13Ok(ramFacts[k]) || caseSession.readChecks.some((c) => c.startsWith(label))) return;
        caseSession.readChecks.push(`${label} ${ramFacts[k]} fails the EAN-13 check digit — confirm it on the chart before Submit.`);
        appendTranscript('Attention', `${label} ${ramFacts[k]} fails the EAN-13 check digit (misread, or a mistyped number). Confirm it on the chart before Submit.`);
    });
    if (frameNotes.length) {
        frameNotes.forEach((n) => caseSession.readChecks.push(n));
        appendTranscript('Attention', 'Earlier and later screen reads disagree — first read kept, confirm on screen:\n' + frameNotes.join('\n'));
    }

    const added = Object.keys(ramFacts).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(ramFacts[k]));
    appendTranscript('Success',
        `${source}: ${surface === 'chart' ? 'chart' : 'unclassified surface (gaps filled only)'} — ${plural(added.length, 'key')} updated, ${plural(Object.keys(ramFacts).length, 'chart key')} in RAM` +
        (Object.keys(ramDenial).length ? `, payer letter in RAM (${ramDenial.tracking_id || 'no ref'})` : '') + '.');
    if (added.length) {
        const lines = added.length === Object.keys(ramFacts).length
            ? factLines(ramFacts, CHART_KEY_ORDER).concat(trialLinesFor(ramFacts))
            : factLines(ramFacts, CHART_KEY_ORDER.filter((k) => added.includes(k)))
                .concat(added.includes('trial_lines') || added.includes('prev') || added.includes('dental_lines') || added.includes('kg_lines') ? trialLinesFor(ramFacts) : []);
        if (lines.length) appendTranscript('Fact', lines.join('\n'));
    }
    if (ramFacts.cpt_conflict) appendTranscript('Attention', `CPT units disagree inside the chart (${ramFacts.cpt_conflict}). Confirm units before staging.`);
    if (ramFacts.tardoc_conflict) appendTranscript('Attention', `TARDOC quantities disagree inside the chart (${ramFacts.tardoc_conflict}). Confirm before staging.`);
    if (conflicts.length) appendTranscript('System', 'Page text vs screen read:\n' + conflicts.join('\n'));
    return ramFacts;
}

/* ---------- screen read: two independent passes, a third only where they disagree ---------- */

const VISION_LABEL_LINES = {
    patient_name: 'Patient Name: (patient full name)',
    dob: 'DOB: (date of birth)',
    member_id: 'Member ID: (member or subscriber ID)',
    group_number: 'Group Number: (group number)',
    address: 'Address: (patient home address)',
    payer: 'Primary Payer: (primary payer or health plan name)',
    plan: 'Plan Type: (plan type)',
    npi: 'Rendering NPI: (10-digit NPI)',
    provider_name: 'Provider: (rendering or treating provider name with credential)',
    icd10: 'ICD-10: (every ICD-10 code shown, comma separated)',
    cpt: 'CPT: (every CPT or HCPCS code shown, each followed by a space, the letter x and its unit count; comma separated)',
    attachments: 'Attachments: (every attachment file name shown, comma separated)',
    note_date: 'Note Signed: (date the clinical note was signed)',
    rationale: 'Clinical Rationale: (the clinical rationale or medical-necessity statement)',
    plan_of_care: 'Plan: (the plan or orders sentence)',
    trial_lines: 'Trial 1: (first conservative-therapy trial, word for word — then Trial 2:, Trial 3: and so on, one line per trial)',
    decision: 'Decision: (decision on the letter)',
    tracking_id: 'Tracking Reference: (tracking, authorization or reference number)',
    denial_code: 'Denial Code: (denial or reason code)',
    policy_cite: 'Policy: (policy cited)',
    denial_reason: 'Reason for Denial: (reason for denial)',
    missing_items: 'Missing Documentation Requested: (every item the payer lists as missing)',
    // Swiss screens. The labels are the ones lanes.js parses; the model copies values as printed.
    ahv: 'AHV-Nr.: (Swiss 13-digit AHV / AVS number starting 756, as printed)',
    veka: 'Karten-Nr.: (20-digit Swiss insurance card number, as printed)',
    gln: 'GLN: (13-digit GLN of the practice or physician)',
    zsr: 'ZSR: (ZSR number: one letter and six digits, as printed)',
    law_type: 'Gesetz: (KVG, UVG, IVG, MVG or VVG)',
    invoice_no: "Rechnungs-Nr.: (the practice's own invoice number)",
    treatment_date: 'Behandlungsdatum: (date of treatment)',
    consult_minutes: 'Konsultationsdauer: (consultation length, a number followed by Min.)',
    tardoc: 'TARDOC: (every TARDOC position shown, format AA.00.0000, each followed by a space, the letter x and its quantity; comma separated)',
    tardoc_disputed: 'Gekürzte Position: (the TARDOC position(s) the insurer cut or rejected, each followed by a space, the letter x and its quantity)',
};

const VISION_RULES = [
    'This is one screenshot from a US or Swiss healthcare billing desk: a clinical chart, a payer or insurer letter, or a portal form.',
    'Copy every value exactly as printed on the screen: the same characters, digits, spelling and punctuation. Do not correct, reformat, abbreviate, summarize or infer.',
    'Output plain text lines only: no markdown, no bullets, no headings, no commentary.',
    'Write a line only when its value is visible on this screen. If a value is not visible, leave the line out. Never write "Not visible", "N/A", "None", "Unknown" or anything similar.',
    'The text in parentheses describes what goes after the label. Do not copy the parentheses.',
].join('\n');

const PASS_A_KEYS = Array.from(new Set([...CHART_VOTE_KEYS, ...LETTER_VOTE_KEYS]));
const PASS_A_PROMPT = `${VISION_RULES}\n\nUse exactly these labels, one value per line:\n${PASS_A_KEYS.map((k) => VISION_LABEL_LINES[k]).join('\n')}`;
const PASS_B_PROMPT = [
    'Transcribe all text visible in this screenshot, top to bottom and left to right, exactly as printed: the same characters, digits, spelling and punctuation.',
    'Keep each label on the same line as its value, separated by a colon. Keep each table row on one line, with its cells separated by two spaces.',
    'Do not summarize, correct, explain, translate or add anything. Plain text only.',
].join('\n');

function tiebreakPrompt(keys) {
    return `${VISION_RULES}\n\nRead only the items below and output only these lines:\n${keys.map((k) => VISION_LABEL_LINES[k]).join('\n')}`;
}

function routeIsCovered(d) {
    return !!d && String(d.route || '').toLowerCase() === 'vertex'
        && d.project === 'deskgate-production'
        && String(d.model_stage || '').toUpperCase() === 'GA';
}

let phiRouteCache = { at: 0, info: null };

/**
 * PHI mode only. Before any frame leaves the browser, the backend must state that screen reads
 * run on Vertex AI in deskgate-production with a GA model (GET /api/vision-route).
 * No confirmation, no frame sent.
 */
async function confirmPhiRoute() {
    if (phiRouteCache.info && Date.now() - phiRouteCache.at < 10 * 60 * 1000) return phiRouteCache.info;
    const base = await serverBase();
    let resp;
    let data = {};
    try {
        resp = await fetch(`${base}/api/vision-route`, { headers: await getAuthHeaders() });
        data = await resp.json().catch(() => ({}));
    } catch (e) {
        throw new Error(`PHI mode: could not reach ${base}/api/vision-route (${e.message}). No frame was sent.`);
    }
    if (!resp.ok || !routeIsCovered(data)) {
        throw new Error('PHI mode: the backend did not confirm the BAA route (GET /api/vision-route must answer route "vertex", project "deskgate-production", model_stage "GA"). No frame was sent.');
    }
    phiRouteCache = { at: Date.now(), info: data };
    return data;
}

/** One model call. In PHI mode no personal API keys are sent, so only the backend's own route can answer. */
async function callVision(b64, prompt) {
    // A per-desk key always means PHI rules: Google Cloud route only, no personal keys sent.
    const provider = deskLane ? 'gemini' : await resolveSelectedProvider();
    const phi = zrmOn() || !!deskLane;
    const body = { image: b64, prompt, provider };
    if (phi) {
        body.phi_mode = true;
        body.require_route = 'vertex:deskgate-production';
    } else {
        body.gemini_key = await getSavedKey('extGeminiKey');
        body.anthropic_key = await getSavedKey('extAnthropicKey');
        body.grok_key = await getSavedKey('extGrokKey');
    }
    const resp = await fetch(`${await serverBase()}/api/analyze-vision`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    const refusal = deskKeyRefusal(resp, data);
    if (refusal) throw new Error(refusal);
    if (data && (data.error === 'wrong_lane' || data.error === 'update_required') && data.detail) {
        throw new Error(data.detail);
    }
    if (!resp.ok) throw new Error(`analyze-vision answered ${resp.status}${data.error ? ` (${data.error})` : ''}`);
    if (phi && data.route && !routeIsCovered(data)) {
        throw new Error(`The backend answered from route "${data.route}" — not the BAA route. Result discarded.`);
    }
    return String(data.analysis || data.text || '');
}

function pickKeys(facts, keys) {
    const out = {};
    keys.forEach((k) => { if (present(facts[k])) out[k] = facts[k]; });
    return out;
}

function classifyPasses(textA, textB, ctx = {}) {
    const a = classifySurface(textA, ctx.url || '', ctx.title || '');
    const b = classifySurface(textB, ctx.url || '', ctx.title || '');
    if (a === b) return a;
    if (a === 'unknown') return b;
    if (b === 'unknown') return a;
    return classifySurface(`${textB}\n${textA}`, ctx.url || '', ctx.title || '');
}

/**
 * Field-by-field vote. A value is accepted only when two independent reads agree on it.
 * Round 1 compares pass A with pass B; round 2 (only if needed) lets pass C break the tie.
 * Anything still split is left out of RAM, so it stays empty on the portal and [MISS] in the appeal.
 */
function voteFacts(keys, A, B, C) {
    const facts = {};
    const agreed = [];
    const disputed = [];
    const resolved = [];
    const unresolved = [];

    for (const key of keys) {
        if (key === 'trial_lines') continue;
        const a = A[key];
        const b = B[key];
        if (!present(a) && !present(b)) continue;
        if (valuesAgree(key, a, b)) {
            facts[key] = preferValue(key, a, b);
            agreed.push(key);
            continue;
        }
        if (!C) { disputed.push(key); continue; }
        const c = C[key];
        const winner = [a, b].filter(present).find((v) => valuesAgree(key, v, c));
        if (winner) { facts[key] = winner; resolved.push(key); }
        else unresolved.push(`${key}${present(a) && present(b) ? ' (passes disagree)' : ' (seen in one pass only)'}`);
    }

    if (keys.includes('trial_lines')) {
        const ta = trialMap(A.trial_lines || []);
        const tb = trialMap(B.trial_lines || []);
        const tc = C ? trialMap(C.trial_lines || []) : null;
        const accepted = [];
        let trialDispute = false;
        for (const id of new Set([...ta.keys(), ...tb.keys()])) {
            const a = ta.get(id);
            const b = tb.get(id);
            if (valuesAgree('trial:', a, b)) { accepted.push([id, a]); continue; }
            if (!tc) { trialDispute = true; continue; }
            const winner = [a, b].filter(present).find((v) => valuesAgree('trial:', v, tc.get(id)));
            if (winner) { accepted.push([id, winner]); resolved.push(id.replace(':', ' ')); }
            else unresolved.push(`${id.replace(':', ' ')}${a && b ? ' (passes disagree)' : ' (seen in one pass only)'}`);
        }
        if (trialDispute) disputed.push('trial_lines');
        if (accepted.length) {
            facts.trial_lines = sortTrials(accepted);
            if (ta.size && tb.size && accepted.length === ta.size && ta.size === tb.size) agreed.push('trial_lines');
        }
    }
    return { facts, agreed, disputed, resolved, unresolved };
}

/** Deterministic checks on values that came only from a screen read. */
function validateScreenFacts(facts, unresolved, checks) {
    if (facts.dob && !dobPlausible(facts.dob)) {
        unresolved.push(`dob (read as "${facts.dob}", not a real date of birth)`);
        delete facts.dob;
    }
    if (facts.trial_lines) {
        facts.trial_lines.forEach((t) => {
            const m = t.match(/\b(\d{1,2})[-\/ ]([A-Za-z]{3})[a-z]*[-\/ ](\d{4})\b/);
            if (m) {
                const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
                const d = new Date(Date.UTC(Number(m[3]), mon, Number(m[1])));
                if (mon < 0 || d.getUTCDate() !== Number(m[1])) checks.push(`"${m[0]}" in ${t.slice(0, 12)} is not a real calendar date`);
            }
        });
    }
}

/**
 * Read one captured frame twice, independently:
 *   pass A — the model fills fixed labels, copied verbatim;
 *   pass B — the model transcribes the whole screen, and DeskGate's own parser extracts the fields.
 * Fields where A and B agree are accepted. Only disputed fields go to pass C.
 */
async function readFrameWithConsensus(b64, ctx = {}) {
    const [textA, textB] = await Promise.all([callVision(b64, PASS_A_PROMPT), callVision(b64, PASS_B_PROMPT)]);
    const surface = classifyPasses(textA, textB, ctx);
    const keys = surface === 'denial' ? LETTER_VOTE_KEYS : CHART_VOTE_KEYS;
    const extract = surface === 'denial' ? extractDenialFacts : parseVisionFacts;
    const A = pickKeys(extract(textA), keys);
    const B = pickKeys(extract(textB), keys);
    let round = voteFacts(keys, A, B, null);
    let passes = 2;
    let resolved = [];
    let unresolved = [];
    const agreed = round.agreed.slice();
    let facts = round.facts;

    if (round.disputed.length) {
        passes = 3;
        const textC = await callVision(b64, tiebreakPrompt(round.disputed));
        const C = pickKeys(extract(textC), keys);
        const second = voteFacts(round.disputed, A, B, C);
        facts = { ...facts, ...second.facts };
        if (second.facts.trial_lines) {
            const merged = trialMap(round.facts.trial_lines || []);
            trialMap(second.facts.trial_lines).forEach((v, id) => merged.set(id, v));
            facts.trial_lines = sortTrials(Array.from(merged.entries()));
        }
        resolved = second.resolved;
        unresolved = second.unresolved;
    }

    const checks = [];
    validateScreenFacts(facts, unresolved, checks);
    if (surface !== 'denial') recomposeDerived(facts);

    let letterOnly = null;
    if (surface === 'unknown') {
        const la = pickKeys(extractDenialFacts(textA), LETTER_ONLY_KEYS);
        const lb = pickKeys(extractDenialFacts(textB), LETTER_ONLY_KEYS);
        letterOnly = voteFacts(LETTER_ONLY_KEYS, la, lb, null).facts;
    }

    const fieldCount = new Set([...Object.keys(A), ...Object.keys(B)]).size;
    return { surface, facts, letterOnly, report: { passes, fieldCount, agreed, disputed: round.disputed, resolved, unresolved, checks } };
}

async function readChartData(opts = {}) {
    await runOneFrame('glass', opts);
}

/** Schweiz-Modus READ CHART: the page text is parsed in the browser. No frame is captured or sent. */
async function readPageTextOnly(screenOnly) {
    if (screenOnly) {
        appendTranscript('Stopped', 'Schweiz-Modus: keine Bildschirmlesung. Ohne Umschalttaste klicken: DeskGate liest dann den Seitentext. Für die Bildschirmlesung in CONFIG die Zusatzoption einschalten.');
        return;
    }
    setBusy(true, 'Schweiz-Modus: Seitentext lesen…');
    try {
        appendTranscript('System', '📸 READ CHART — Schweiz-Modus: nur Seitentext. Kein Bild verlässt den Browser.');
        const tab = await getActiveTab();
        const dom = tab?.id ? await readTabState(tab.id) : null;
        if (dom?.partial) appendTranscript('System', 'Seitentext nur von der obersten Seite: eingebettete Rahmen waren nicht lesbar.');
        if (dom?.pdfTop || dom?.pdf) {
            appendTranscript('Attention', 'Hier ist ein PDF. Im Schweiz-Modus liest DeskGate keine PDFs (nur die Bildschirmlesung sieht sie). Die Angaben von Hand übernehmen, oder in CONFIG die Zusatzoption «Bildschirmlesung erlauben» einschalten.');
        }
        if (dom?.text && dom.text.length > 80) {
            ingestVisionText(dom.text, 'Page text', { literal: true, url: dom.url || tab?.url || '', title: dom.title || tab?.title || '' });
            setStatus('Facts in RAM (Seitentext). STAGE PORTAL or STAGE APPEAL.');
        } else {
            appendTranscript('Attention', 'Kein lesbarer Seitentext (z. B. Citrix oder ein Bild). Die Bildschirmlesung ist im Schweiz-Modus aus; in CONFIG lässt sie sich mit der Zusatzoption einschalten.');
            setStatus('Nichts gelesen — kein Seitentext.');
        }
    } catch (e) {
        appendTranscript('Error', 'Seitentext nicht lesbar: ' + (e.message || e));
    } finally {
        setBusy(false);
    }
}

async function runOneFrame(source, opts = {}) {
    const t0 = performance.now();
    const screenOnly = !!opts.screenOnly;
    if (!(await checkLane('READ CHART'))) return;
    if (swissMode() && !swissVisionAllowed()) {
        await readPageTextOnly(screenOnly);
        return;
    }
    if (swissVisionAllowed()) {
        appendTranscript('Attention', 'Schweiz-Modus mit Bildschirmlesung (Zusatzoption): ein Bildausschnitt verlässt den Browser und geht über deskgate.app an das KI-Modell.');
    }
    setBusy(true, screenOnly ? 'Screen read only (page text ignored)…' : 'Capturing chart/denial frame + reading DOM…');
    appendTranscript('System', screenOnly
        ? '📸 READ CHART — screen read only (Shift-click). Page text is ignored, as on a Citrix desk.'
        : '📸 READ CHART — dual-stream capture started.');
    let domPromise = Promise.resolve();
    try {
        const tab = await getActiveTab();
        if (!screenOnly) {
            domPromise = (tab?.id ? readTabState(tab.id) : Promise.resolve(null))
                .then((dom) => {
                    if (dom?.partial) appendTranscript('System', 'Page text came from the top page only — embedded frames could not be read this time.');
                    const pdfHere = dom?.pdfTop || (dom?.partial && /\bpdf\b/i.test(String(dom?.content_type || '')));
                    if (pdfHere || dom?.pdf) {
                        appendTranscript('System', (pdfHere
                            ? 'This is a PDF. Its text is out of DeskGate\'s reach, so only the screen read sees it, and only the part on screen.'
                            : 'A PDF is open inside this page. Its text is out of DeskGate\'s reach, so only the screen read sees it, and only the part on screen.')
                            + ' For the next page, scroll and press 📸 READ CHART again; each read adds to the same letter or chart.');
                    }
                    if (dom?.text && dom.text.length > 80) {
                        ingestVisionText(dom.text, 'Page text', { literal: true, url: dom.url || tab?.url || '', title: dom.title || tab?.title || '' });
                    }
                }).catch(() => {});
        }

        // PHI mode: engine and backend route are confirmed before anything is captured or sent.
        // A per-desk key always runs under PHI rules on the Google Cloud route.
        if (zrmOn() || deskLane) {
            const selectedProvider = deskLane ? 'gemini' : await resolveSelectedProvider();
            if (selectedProvider !== 'gemini') {
                throw new Error('PHI mode is on and the selected engine has no DeskGate BAA. Only the Google Cloud route (deskgate-production) may carry PHI. Switch the Reasoning Engine to Google, or turn PHI mode off for synthetic pages.');
            }
            const info = await confirmPhiRoute();
            appendTranscript('System', `PHI mode: backend confirmed Vertex AI · ${info.project} · ${info.model || 'model'} (${info.model_stage}). Personal API keys are not sent.`);
        }

        let captureKind = source === 'glass' ? 'glass' : 'viewport';
        let b64 = '';
        try {
            if (source === 'glass') b64 = await captureDisplayGlassBase64();
            else b64 = await captureActiveTabBase64();
        } catch (capErr) {
            const msg = String(capErr && capErr.message || capErr);
            if (source === 'glass') {
                appendTranscript('System', 'Glass picker cancelled (' + msg + '). Falling back to tab viewport.');
                b64 = await captureActiveTabBase64();
                captureKind = 'viewport';
            } else {
                throw capErr;
            }
        }
        await domPromise;

        if (captureKind === 'glass' && lastGlassMeta) {
            appendTranscript('System', 'Glass surface: ' + lastGlassMeta + '. Stream stopped.');
        }

        const provider = deskLane ? 'gemini' : await resolveSelectedProvider();
        const kb = Math.round(b64.length * 0.75 / 1024);
        appendTranscript('Progress', `Vision AI (${provider.toUpperCase()}) reading the frame twice, independently (~${kb} KB)…`);
        const label = captureKind === 'glass' ? 'Glass' : 'Viewport';
        const read = await readFrameWithConsensus(b64, captureKind === 'glass' ? {} : { url: tab?.url || '', title: tab?.title || '' });
        caseSession.visionUsed = captureKind === 'glass' ? 'glass' : 'tab';
        caseSession.visionPasses = Math.max(caseSession.visionPasses, read.report.passes);
        const r = read.report;
        appendTranscript(r.unresolved.length ? 'Attention' : 'System',
            `${label} (${read.surface}): passes 1 and 2 agreed on ${r.agreed.length} of ${r.fieldCount} fields.` +
            (r.disputed.length ? ` Disputed: ${r.disputed.join(', ')} → pass 3 ${r.resolved.length ? `settled ${r.resolved.join(', ')}` : 'settled none'}.` : ' No third pass needed.') +
            (r.unresolved.length ? `\nLeft EMPTY (no two reads agree — type from the screen): ${r.unresolved.join(', ')}.` : ''));
        r.unresolved.forEach((u) => caseSession.visionUnresolved.push(u));
        r.checks.forEach((c) => { caseSession.readChecks.push(c); appendTranscript('Attention', `Check: ${c}.`); });
        ingestFacts(read.surface, read.facts, label, { letterOnly: read.letterOnly });
        if (telemetryLatency) telemetryLatency.textContent = Math.round(performance.now() - t0) + 'ms';
        setStatus(r.unresolved.length
            ? `Facts in RAM — ${r.unresolved.length} left empty. Type those from the screen.`
            : 'Facts in RAM. STAGE PORTAL or STAGE APPEAL.');
    } catch (e) {
        await domPromise;
        const kept = Object.keys(ramFacts).length || Object.keys(ramDenial).length;
        appendTranscript('Error', 'Screen read failed: ' + e.message + (kept ? ' Page-text facts above are still in RAM.' : ''));
        setStatus(kept ? 'Screen read failed — page-text facts in RAM.' : 'Read failed.');
    } finally {
        setBusy(false);
    }
}

async function stagePortal() {
    const t0 = performance.now();
    if (!(await checkLane('STAGE PORTAL'))) return;
    setBusy(true, 'Staging live portal fields…');
    try {
        const tab = await getActiveTab();
        const host = tab?.url ? (hostOf(tab.url) || fileHost(tab.url)) : '';
        // The case belongs to the site it was last staged on, so the row is filed under the right lane.
        if (host) caseSession.host = host;
        motorTabId = tab?.id || motorTabId;

        appendTranscript('System', '⚡ STAGE PORTAL — live inventory first.');
        const inv = await readLiveInventory(tab?.id);
        const fields = inv?.fields || [];
        const sum = inv?.field_summary || {};
        caseSession.fieldsTotal = sum.total || fields.length || 0;
        caseSession.fieldsEmpty = sum.empty || 0;
        caseSession.requiredEmptyBefore = Math.max(sum.required_empty || 0, requiredEmptyCount(fields));

        if (inv?.status === 'CONTENT_SCRIPT_UNREACHABLE' || inv?.status === 'INJECT_FAILED' || inv?.status === 'NO_TAB') {
            appendTranscript('System', 'No injectable DOM. READ CHART on the chart/Citrix surface, then STAGE again.');
            paintMissChip();
            return;
        }
        if (stopOnPartialRead(inv, 'STAGE PORTAL')) return;

        if (isAppealSurface(inv?.url || tab?.url, inv?.title, fields)) {
            appendTranscript('System', 'This tab looks like an appeal form. Use 📝 STAGE APPEAL.');
        }

        const framed = framedCount(fields);
        appendTranscript('System',
            `Live inventory: ${caseSession.fieldsTotal} fields${framed ? ` (${framed} inside an embedded frame)` : ''}, ${caseSession.fieldsEmpty} empty`
            + (caseSession.requiredEmptyBefore ? `, ${caseSession.requiredEmptyBefore} required-empty` : '') + '.');
        if (fields.length) appendTranscript('Tool', fieldInventoryLines(fields));
        reportUploadsAtStage(inv);

        const lane = resolveLane(inv?.url || tab?.url || '', hostOf(inv?.url || '') || host);
        if (!Object.keys(ramFacts).length && lastVisionText) ingestVisionText(lastVisionText, 'RAM Replay');
        const facts = { ...ramFacts };
        if (ramFacts.cpt_conflict) {
            appendTranscript('Attention', `CPT units disagree inside the chart (${ramFacts.cpt_conflict}). The CPT box is staged with the first value — confirm before Submit.`);
        }

        const plan = await planStageActions(fields, facts, 'portal');
        let actions = restageOwnMissBoxes(plan.actions, fields, plan.facts);
        const formFrame = formFrameOf(fields, actions);
        actions = keepFormFrameOnly(actions, formFrame);
        // Without Gemini, the old guesses (lane ID map, label hints) still apply.
        if (!actions.length && !plan.usedAi) {
            actions = stageActionsForLane(lane, plan.facts);
            if (Object.keys(facts).length) actions.push(...leftoverHintActions(plan.facts, actions));
        }

        if (!actions.some((a) => a.action !== 'skip_filled')) {
            caseSession.stagedAt = new Date().toISOString();
            caseSession.fillMiss = caseSession.fieldsEmpty || 1;
            if (actions.length) await runActions(actions, tab?.id, formFrame);
            appendTranscript('System', Object.keys(facts).length
                ? 'Nothing to type: every matching box already has a value.'
                : 'Nothing to type: no chart facts in RAM. READ CHART first.');
            paintMissChip();
            return;
        }

        const report = await runActions(actions, tab?.id, formFrame);
        await sleep(300);
        const after = await readLiveInventory(tab?.id);
        const afterSum = after?.field_summary || {};
        caseSession.stagedAt = new Date().toISOString();
        caseSession.kind = 'pa';
        caseSession.fillOk = report.ok;
        caseSession.fillMiss = report.miss;
        caseSession.requiredEmptyAfter = Math.max(afterSum.required_empty || 0, requiredEmptyCount(after?.fields));
        if (caseSession.requiredEmptyAfter) {
            const names = (after?.fields || []).filter((f) => f.empty && isRequiredField(f) && !f.readonly && !f.disabled).map((f) => f.selector);
            appendTranscript('Attention', `Required boxes still empty after staging: ${names.join(', ')}. Fill them from the chart on screen.`);
        }
        caseSession.readback = await verifyStaged(tab?.id);
        paintMissChip();
        if (telemetryLatency) telemetryLatency.textContent = Math.round(performance.now() - t0) + 'ms';
        const rb = caseSession.readback;
        appendTranscript('System',
            `Stage report: ${report.ok} filled, ${report.miss} missed, ${caseSession.requiredEmptyAfter} required-empty after fill.` +
            (rb ? ` Readback ${rb.ok}/${rb.total} boxes hold exactly what was staged${rb.changed.length ? ` (portal changed: ${rb.changed.join(', ')})` : ''}.` : '') +
            ' Review, then Submit on the portal.');
        reportOpenReadItems();
        setStatus('Staged. Submit on portal → Auto-Log armed.');
        startReceiptAutoWatcher();
    } finally {
        setBusy(false);
    }
}

async function stageAppeal() {
    const t0 = performance.now();
    if (!(await checkLane('STAGE APPEAL'))) return;
    setBusy(true, 'Drafting quoted appeal into live fields…');
    try {
        const tab = await getActiveTab();
        const host = tab?.url ? (hostOf(tab.url) || fileHost(tab.url)) : '';
        // The case belongs to the site it was last staged on, so the row is filed under the right lane.
        if (host) caseSession.host = host;
        motorTabId = tab?.id || motorTabId;

        appendTranscript('Appeal', '📝 STAGE APPEAL — quoted RAM facts only. No invented trials or dates.');

        const inv = await readLiveInventory(tab?.id);
        const fields = inv?.fields || [];

        // Wrong button: a form with nothing about an appeal anywhere on it gets nothing typed.
        const reachable = !['CONTENT_SCRIPT_UNREACHABLE', 'INJECT_FAILED', 'NO_TAB'].includes(inv?.status) && !inv?.partial;
        if (reachable && fields.length && !looksLikeAppealPage(inv, tab)) {
            appendTranscript('Stopped', 'STAGE APPEAL stopped: this tab looks like a prior-auth form. Nothing on it mentions an appeal, reconsideration or dispute, so nothing was typed. Use ⚡ STAGE PORTAL on this form.');
            setStatus('STAGE APPEAL stopped — use ⚡ STAGE PORTAL on this form.');
            return;
        }

        // The appeal form usually prints the original reference.
        const formRef = inv?.text ? extractPayerReference(inv.text) : '';
        if (!letterInRam() && lastClosedLetter && formRef && sameRef(formRef, lastClosedLetter.ref)) {
            // Same reference = same denial: the letter read for the last appeal is the right one.
            ramDenial = { ...lastClosedLetter.facts };
            denialSources = { ...lastClosedLetter.sources };
            appendTranscript('System', `Using the letter for ${lastClosedLetter.ref} again: this appeal form shows the same reference.`);
        }
        // Otherwise the form's reference only fills a gap in the letter namespace.
        if (formRef && !ramDenial.tracking_id) ramDenial = mergeFacts(ramDenial, { tracking_id: formRef }, { fillOnly: true });
        if (formRef && letterInRam() && ramDenial.tracking_id && !sameRef(formRef, ramDenial.tracking_id)) {
            appendTranscript('Attention', `This appeal form shows reference ${formRef}, but the letter in RAM is for ${ramDenial.tracking_id}. Check that the right letter was read before Submit.`);
        }

        if (!Object.keys(ramFacts).length && !Object.keys(ramDenial).length && lastVisionText) ingestVisionText(lastVisionText, 'RAM Replay');

        if (!letterInRam()) {
            // Said before anything is typed: the draft will carry [MISS] for the denial reason.
            appendTranscript('Attention',
                (lastClosedAppealRef
                    ? `No denial letter in RAM. The letter for ${lastClosedAppealRef} was cleared when that appeal was gated.`
                    : 'No denial letter in RAM.')
                + ' The appeal below quotes no denial reason and carries [MISS] for it.'
                + ' To fix: focus the payer letter, 📸 READ CHART, then 📝 STAGE APPEAL again.');
        }

        const draft = draftAppealFromRam(ramFacts, ramDenial);
        lastAppealDraft = draft;
        caseSession.appealStaged = true;
        caseSession.appealMiss = draft.missing.length;
        caseSession.appealChecks = draft.checks.length;
        caseSession.kind = 'appeal';
        caseSession.mismatch = identityMismatches(draft.crosscheck).length;

        appendTranscript('Appeal', draft.text);
        appendTranscript(draft.ok ? 'Success' : 'System', draft.review);

        if (draft.identityMismatch) {
            caseSession.stagedAt = new Date().toISOString();
            paintMissChip();
            appendTranscript('Stopped', 'The payer letter and the chart in RAM are different patients. Nothing was typed. Press NEW CASE, then READ the right chart and letter.');
            setStatus('Stopped: chart and letter do not match.');
            return;
        }

        if (['CONTENT_SCRIPT_UNREACHABLE', 'INJECT_FAILED', 'NO_TAB'].includes(inv?.status)) {
            appendTranscript('System', 'Draft is in RAM only — this surface has no injectable fields. Open the appeal form tab and STAGE APPEAL again.');
            paintMissChip();
            return;
        }
        if (stopOnPartialRead(inv, 'STAGE APPEAL')) return;
        reportUploadsAtStage(inv);

        const lane = resolveLane(inv?.url || tab?.url || '', hostOf(inv?.url || '') || host);
        const facts = {
            ...ramFacts,
            patient_name: ramFacts.patient_name || ramDenial.patient_name,
            dob: ramFacts.dob || ramDenial.dob,
            member_id: ramFacts.member_id || ramDenial.member_id,
            appeal: draft.text,
            denial_reason: ramDenial.denial_reason || '',
            denial_code: ramDenial.denial_code || '',
            tracking_id: ramDenial.tracking_id || ramFacts.tracking_id || '',
            // Swiss: what the chart lacks, the insurer's letter may print (never the other way round
            // for the cut position, which only the letter states).
            ahv: ramFacts.ahv || ramDenial.ahv,
            gln: ramFacts.gln || ramDenial.gln,
            zsr: ramFacts.zsr || ramDenial.zsr,
            law_type: ramFacts.law_type || ramDenial.law_type,
            invoice_no: ramFacts.invoice_no || ramDenial.invoice_no,
            treatment_date: ramFacts.treatment_date || ramDenial.treatment_date,
            tardoc_disputed: ramDenial.tardoc_disputed || '',
        };
        Object.keys(facts).forEach((k) => { if (facts[k] === '' || facts[k] == null) delete facts[k]; });
        const plan = await planStageActions(fields, facts, 'appeal');
        let actions = restageOwnMissBoxes(plan.actions, fields, plan.facts);
        const formFrame = formFrameOf(fields, actions);
        actions = keepFormFrameOnly(actions, formFrame);
        const hasAppealBox = actions.some((a) => a.field_hint === 'appeal' || /appeal|rebuttal/i.test(`${a.selector} ${a.field_hint}`));
        if (plan.usedAi) {
            // Gemini looked at every box: if none takes the letter, say so instead of guessing.
            if (!hasAppealBox) {
                appendTranscript('Attention', 'No box for the appeal letter was found on this form. The letter is in the panel above; paste it where the portal asks for it.');
            }
        } else {
            if (!actions.length) {
                actions = stageActionsForLane(lane, plan.facts);
                actions.push(...leftoverHintActions(plan.facts, actions));
            }
            // Always try the appeal box even if inventory matching missed it.
            if (!actions.some((a) => /appeal|rebuttal/i.test(`${a.selector} ${a.field_hint}`))) {
                actions.push({ action: 'type_text', field_hint: DEFAULT_HINTS.appeal, key: 'appeal', text: draft.text });
            }
        }

        const report = await runActions(actions, tab?.id, formFrame);
        await sleep(250);
        caseSession.stagedAt = new Date().toISOString();
        caseSession.fillOk = report.ok;
        caseSession.fillMiss = report.miss + draft.missing.length;
        caseSession.readback = await verifyStaged(tab?.id);
        paintMissChip();
        if (telemetryLatency) telemetryLatency.textContent = Math.round(performance.now() - t0) + 'ms';
        const rb = caseSession.readback;
        appendTranscript('System',
            `Appeal stage: ${report.ok} filled, ${report.miss} typed-miss, ${draft.missing.length} fact-miss, ${draft.checks.length} to check.` +
            (rb ? ` Readback ${rb.ok}/${rb.total}.` : '') +
            (draft.missing.length ? ' [MISS] / [FEHLT] lines stay in the appeal box until the letter is read and 📝 STAGE APPEAL is pressed again, or a person fills them.' : '') +
            ' Review, then Submit on the portal.');
        reportOpenReadItems();
        setStatus('Appeal staged. Human Submit on portal.');
        startReceiptAutoWatcher();
    } finally {
        setBusy(false);
    }
}

const RECEIPT_RE = /(?:Successfully Submitted|Submission Received|Request Acknowledged|Appeal Received|Transaction Received|Authorization (?:Approved|Confirmed)|Confirmation Number|Stellungnahme eingegangen|Eingangsbest(?:ä|ae)tigung|Erfolgreich (?:übermittelt|uebermittelt|eingereicht)|Eingang best(?:ä|ae)tigt)/i;

/**
 * Receipt reference after Submit. Prefers a reference printed near the receipt wording,
 * and never returns the reference DeskGate itself staged (the original denial ref).
 */
function extractPayerReferenceFromText(text, exclude = []) {
    const s = String(text || '');
    if (!s) return '';
    const skip = new Set(exclude.filter(Boolean).map((x) => String(x).toUpperCase()));
    const ok = (t) => t && looksLikeTrackingId(t) && !skip.has(String(t).toUpperCase());
    const m = s.match(RECEIPT_RE);
    const near = m ? s.slice(Math.max(0, m.index - 200), m.index + 400) : '';
    for (const w of [near, s].filter(Boolean)) {
        // Labeled or payer-prefixed references, scanning past any excluded ones.
        let rest = w;
        for (let i = 0; i < 6 && rest; i += 1) {
            const ref = extractPayerReference(rest);
            if (!ref) break;
            if (ok(ref)) return ref;
            const at = rest.indexOf(ref);
            rest = at >= 0 ? rest.slice(at + ref.length) : '';
        }
    }
    // Last resort: an ID-shaped token right next to the receipt wording.
    for (const t of near.match(/\b[A-Z][A-Z0-9]*[-_][A-Z0-9._-]{4,38}\b/gi) || []) {
        if (ok(t) && /\d{5,}/.test(t)) return t;
    }
    return '';
}

function referencesToExclude() {
    return [ramDenial.tracking_id, ramFacts.member_id, ramDenial.member_id, ramFacts.group_number];
}

function startReceiptAutoWatcher() {
    if (autoLogPollInterval) clearInterval(autoLogPollInterval);
    if (!autoLogActive) return;
    let checks = 0;
    autoLogPollInterval = setInterval(async () => {
        checks++;
        if (checks > 60 || caseSession.completed) {
            clearInterval(autoLogPollInterval);
            autoLogPollInterval = null;
            return;
        }
        const tabId = motorTabId || lastPortalTabId;
        if (!tabId) return;
        // Every frame: the receipt often prints inside the embedded workbench, not the top page.
        const dom = await readTabState(tabId);
        rememberUploads(dom?.uploads);
        const text = dom?.text || '';
        const isSubmitted = RECEIPT_RE.test(text);
        const ref = isSubmitted ? extractPayerReferenceFromText(text, referencesToExclude()) : '';
        if (isSubmitted && ref && looksLikeTrackingId(ref) && !caseSession.completed) {
            clearInterval(autoLogPollInterval);
            autoLogPollInterval = null;
            appendTranscript('AutoLog', `Auto-detected receipt: **${ref}**`);
            await executeAutoGate(ref);
        }
    }, 1500);
}

function editSummary() {
    const edits = Object.values(caseSession.edits || {});
    const stagedEdited = edits.filter((e) => e.staged && e.material);
    return {
        staged: caseSession.fillOk || caseSession.stagedSelectors.length,
        material: stagedEdited.length,
        cleared: stagedEdited.filter((e) => e.cleared).length,
        humanFilled: edits.filter((e) => !e.staged && e.now_len > 0).length,
        selectors: stagedEdited.map((e) => e.selector),
    };
}

async function closeGate(detectedRef, how) {
    caseSession.humanSubmitAt = new Date().toISOString();
    caseSession.payerReference = String(detectedRef || '').trim();
    caseSession.completed = !!caseSession.payerReference;
    // Last look at the staged boxes (only possible if the form is still on the page).
    const finalCheck = await verifyStaged(motorTabId || lastPortalTabId);
    if (finalCheck && finalCheck.missMarkers) {
        caseSession.missMarkersSent = true;
        appendTranscript('Attention', `Submitted with ${finalCheck.missMarkers} box(es) still holding a [MISS] or [FEHLT] marker. This row is logged as miss_sent.`);
    }
    checkUploadsAtGate();
    caseSession.materialEdit = Object.values(caseSession.edits || {}).some((e) => e.staged && e.material);
    const es = editSummary();
    appendTranscript('System',
        `Gate (${how}): ${es.material} of ${es.staged} staged boxes materially edited by the coordinator` +
        (es.selectors.length ? ` (${es.selectors.join(', ')})` : '') +
        `; ${es.humanFilled} box(es) DeskGate left empty were filled by hand.`);
}

async function executeAutoGate(detectedRef) {
    await closeGate(detectedRef, 'auto');
    recordMotorEvent({ action: 'auto_gate_logged', hint: detectedRef, ok: true });
    const hash = await sha256hex(caseSession.payerReference);
    appendTranscript('Success', `AUTO-GATE: ${caseSession.payerReference}\nSHA-256 ${hash.slice(0, 16)}…`);
    await postPilotEvent({ notes: 'auto' });
    resetAfterGate();
}

function resetAfterGate() {
    const wasAppeal = caseSession.kind === 'appeal';
    caseSession = newCaseSession();
    lastVisionText = '';
    lastAppealDraft = null;
    if (wasAppeal) {
        lastClosedAppealRef = ramDenial.tracking_id || '';
        lastClosedLetter = letterInRam() && ramDenial.tracking_id
            ? { facts: { ...ramDenial }, sources: { ...denialSources }, ref: ramDenial.tracking_id }
            : null;
        ramDenial = {};
        denialSources = {};
    }
    paintMissChip();
    const kept = Object.keys(ramFacts).length;
    setStatus('Case closed. Ready for next chart or denial.');
    if (kept) {
        appendTranscript('System', `Chart facts for ${ramFacts.patient_name || 'this patient'} stay in RAM for a follow-up appeal. They are cleared automatically when a different patient is read, or with NEW CASE.`);
    }
}

function newCaseManual() {
    if (autoLogPollInterval) {
        clearInterval(autoLogPollInterval);
        autoLogPollInterval = null;
    }
    const staged = caseSession.stagedAt && !caseSession.humanSubmitAt;
    caseSession = newCaseSession();
    clearRam(`NEW CASE — RAM cleared${staged ? '; the staged, un-gated case was dropped (no ledger row)' : ''}.`);
    paintMissChip();
    setStatus('Ready. 📸 Read → ⚡ Stage or 📝 Appeal.');
}

function laneFromHost(host, url = '') {
    const u = String(url || '').toLowerCase();
    // Showcase tags only for the showcase folder and deskgate.app. A live address that happens to
    // contain "appeal" or "denial" (Availity appeals, a payer's denial page) is a real desk row.
    if (isShowroomLocation(url, host)) {
        if (u.includes('appeal')) return 'showcase-appeal';
        if (u.includes('denial')) return 'showcase-denial';
        if (u.startsWith('file:')) return 'showcase-portal';
        return 'showroom';
    }
    const h = String(host || '').replace(/^www\./, '').toLowerCase();
    if (h.includes('availity')) return 'availity';
    if (h.includes('covermymeds')) return 'covermymeds';
    if (h.includes('uhcprovider') || h.includes('uhc.com')) return 'uhc';
    return h.split('.')[0] || 'unmapped';
}

function minutesBetween(a, b) {
    const x = Date.parse(a);
    const y = Date.parse(b);
    if (!x || !y || y < x) return 0;
    return Math.max(0, Math.min(240, Math.round((y - x) / 60000)));
}

async function sha256hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureDeskCode() {
    // A per-desk key already names the desk; deskgate.app files the row under it.
    if (deskLane && deskLane.deskCode) return deskLane.deskCode;
    let code = (await getSavedKey('extDeskCode')).trim();
    const box = document.getElementById('extDeskCode');
    if (box && box.value.trim()) code = box.value.trim();
    if (!code) {
        const typed = window.prompt(`Desk code for this 14-day test (internal runs: ${DEFAULT_DESK_CODE}):`, DEFAULT_DESK_CODE);
        if (!typed) return '';
        code = String(typed).trim().replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 40);
        await saveKey('extDeskCode', code);
        if (box) box.value = code;
    }
    return code;
}

async function postPilotEvent(extra = {}) {
    const desk = await ensureDeskCode();
    if (!desk) {
        appendTranscript('System', 'No desk code — row kept in this panel only.');
        return { ok: false, error: 'no_desk_code' };
    }
    const tab = await getActiveTab();
    const currentUrl = tab?.url || '';
    const validHost = (caseSession.host && caseSession.host !== 'TAB') ? caseSession.host : '';
    const rawHost = validHost || hostOf(currentUrl) || fileHost(currentUrl) || 'portal';
    const stagedAt = caseSession.stagedAt || caseSession.startedAt;
    const submittedAt = caseSession.humanSubmitAt || new Date().toISOString();
    const ref = caseSession.payerReference || '';
    const lane = laneFromHost(rawHost, currentUrl);
    const laneObj = resolveLane(currentUrl, hostOf(currentUrl));
    const synthetic = /^(?:showcase|showroom)/.test(lane) || isShowroomLane(laneObj);
    // Showcase rows never land in a real desk's ledger: they post under <desk>-SYN.
    const deskCode = synthetic && !/-SYN$/i.test(desk) ? `${desk}-SYN`.slice(0, 40) : desk;
    const es = editSummary();
    const rb = caseSession.readback;
    const notes = [
        synthetic ? 'synthetic' : '',
        extra.notes || '',
        caseSession.appealStaged ? 'appeal' : 'pa',
        `edit:${es.material}/${es.staged}`,
        rb ? `rb:${rb.ok}/${rb.total}` : '',
        caseSession.missMarkersSent ? 'miss_sent' : '',
        caseSession.attachmentsMissing ? 'att_empty' : '',
        caseSession.visionUnresolved.length ? `vu:${caseSession.visionUnresolved.length}` : '',
        caseSession.visionPasses === 3 ? 'p3' : '',
        caseSession.visionUsed ? `v:${caseSession.visionUsed}` : 'v:none',
        caseSession.appealMiss ? `amiss:${caseSession.appealMiss}` : '',
        caseSession.fillMiss ? `miss:${caseSession.fillMiss}` : '',
        caseSession.appealChecks ? `chk:${caseSession.appealChecks}` : '',
        caseSession.readChecks.length ? `rchk:${caseSession.readChecks.length}` : '',
        es.humanFilled ? `hand:${es.humanFilled}` : '',
        caseSession.requiredEmptyAfter ? `req_empty:${caseSession.requiredEmptyAfter}` : '',
    ].filter(Boolean).join(' ').slice(0, 80);

    if (synthetic) {
        appendTranscript('System', `Showcase lane — row posts under ${deskCode} so it never counts toward a real desk's 14-day ledger.`);
    }

    const body = {
        desk_code: deskCode,
        lane,
        host: String(rawHost).replace(/^www\./, '').slice(0, 80),
        case_id: caseSession.id,
        build: BUILD,
        staged: !!(caseSession.stagedAt || caseSession.stagedSelectors.length),
        edited: !!caseSession.materialEdit,
        submitted: !!caseSession.humanSubmitAt && !extra.refuse,
        refuse: !!extra.refuse,
        auto_submit: false,
        has_tracking_id: !!ref,
        tracking_id_hash: ref ? await sha256hex(ref) : '',
        minutes_stage: minutesBetween(caseSession.startedAt, stagedAt),
        minutes_gate: minutesBetween(stagedAt, submittedAt),
        notes,
    };

    try {
        const headers = await getAuthHeaders();
        const resp = await fetch(`${await serverBase()}/api/pilot-event`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.ok) {
            caseSession.postedPilotId = data.id || 'ok';
            appendTranscript('System', `Test row sent (${data.id || 'ok'}). Completed: ${data.completed ? 'yes' : 'no'}.`);
            return data;
        }
        appendTranscript('Error', 'Test row not accepted: ' + (data.error || resp.status));
        return { ok: false, error: data.error || String(resp.status) };
    } catch (e) {
        appendTranscript('Error', 'Test row did not reach server: ' + e.message);
        return { ok: false, error: e.message };
    }
}

async function markHumanSubmit() {
    if (autoLogPollInterval) {
        clearInterval(autoLogPollInterval);
        autoLogPollInterval = null;
    }
    // Suggest the receipt on the page, never the denial reference DeskGate staged.
    let suggestedRef = caseSession.payerReference || '';
    if (!suggestedRef) {
        const tabId = motorTabId || lastPortalTabId;
        if (tabId) {
            const dom = await readTabState(tabId);
            rememberUploads(dom?.uploads);
            suggestedRef = extractPayerReferenceFromText(dom?.text || '', referencesToExclude());
        }
    }
    const ref = window.prompt('Payer reference shown after Submit? (blank if none):', suggestedRef);
    if (ref === null) return;
    await closeGate(String(ref || '').trim(), 'manual');
    recordMotorEvent({
        action: 'human_submit_marked',
        hint: caseSession.payerReference ? 'ref-present' : '(no ref)',
        ok: caseSession.completed,
    });
    appendTranscript('System', caseSession.completed
        ? 'Completed unit: Submit + reference (hash only).'
        : 'Submit marked without reference — not a completed Schedule M unit.');
    await postPilotEvent();
    resetAfterGate();
}

// Shift-click = screen read only (page text ignored) — the Citrix path, testable on any page.
document.getElementById('btnReadChart')?.addEventListener('click', (e) => readChartData({ screenOnly: !!e.shiftKey }));
document.getElementById('btnStagePortal')?.addEventListener('click', () => stagePortal());
document.getElementById('btnStageAppeal')?.addEventListener('click', () => stageAppeal());
document.getElementById('btnMarkSubmitted')?.addEventListener('click', () => markHumanSubmit());
document.getElementById('btnNewCase')?.addEventListener('click', () => newCaseManual());
const pilotOpsDrawer = document.getElementById('pilotOpsDrawer');
document.getElementById('btnToggleSettings')?.addEventListener('click', () => settingsDrawer?.classList.add('open'));
document.getElementById('btnHideSettings')?.addEventListener('click', () => settingsDrawer?.classList.remove('open'));
document.getElementById('btnTogglePilotOps')?.addEventListener('click', () => pilotOpsDrawer?.classList.add('open'));
document.getElementById('btnHidePilotOps')?.addEventListener('click', () => pilotOpsDrawer?.classList.remove('open'));
['chkEnterprisePlan', 'chkSignedBAA', 'chkZeroRetention'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', async () => {
        refreshHipaaBadge();
        await saveKey(id, document.getElementById(id).checked ? '1' : '0');
        if (zrmOn()) {
            await purgePhiFromDisk();
            appendTranscript('System', 'ZRM active — PHI keys retained in volatile RAM only. Persistent disk copies purged.');
        }
    });
});
document.getElementById('chkSwissMode')?.addEventListener('change', async () => {
    await saveKey('chkSwissMode', swissMode() ? '1' : '0');
    applyUiLanguage(swissMode());
    appendTranscript('System', swissMode()
        ? (swissVisionAllowed()
            ? 'Schweiz-Modus an, mit Bildschirmlesung: READ CHART liest den Seitentext und schickt einen Bildausschnitt über deskgate.app an das KI-Modell. STAGE ordnet mit der Wortliste zu.'
            : 'Schweiz-Modus an: READ CHART liest nur den Seitentext, STAGE ordnet mit der Wortliste zu. Keine Patientendaten verlassen den Browser.')
        : 'Schweiz-Modus aus: Bildschirmlesung und Feldzuordnung durch Gemini sind wieder an.');
});
document.getElementById('chkSwissVision')?.addEventListener('change', async () => {
    const on = !!document.getElementById('chkSwissVision')?.checked;
    await saveKey('chkSwissVision', on ? '1' : '0');
    if (!swissMode()) {
        appendTranscript('System', 'Die Zusatzoption gilt nur im Schweiz-Modus. Ohne Schweiz-Modus ist die Bildschirmlesung ohnehin an.');
        return;
    }
    appendTranscript(on ? 'Attention' : 'System', on
        ? 'Bildschirmlesung erlaubt: bei LESEN geht ein Bildausschnitt über deskgate.app an das KI-Modell. Die Feldzuordnung bleibt bei der Wortliste im Browser.'
        : 'Bildschirmlesung aus: READ CHART liest nur den Seitentext. Keine Patientendaten verlassen den Browser.');
});

// Swiss demo: the synthetic pages served from the backend host (deskgate.app/showcase/...).
const SWISS_DEMO_PAGES = {
    btnSwissDemoKg: 'swiss-chart-denial.html#kg',
    btnSwissDemoKuerzung: 'swiss-chart-denial.html#kuerzung',
    btnSwissDemoPortal: 'swiss-appeal-portal.html',
    btnSwissDemoInfo: 'schweiz-compliance.html',
};
Object.entries(SWISS_DEMO_PAGES).forEach(([id, page]) => {
    document.getElementById(id)?.addEventListener('click', async () => {
        // The demo starts with an empty panel, like pressing NEW CASE.
        if (id === 'btnSwissDemoKg') newCaseManual();
        settingsDrawer?.classList.remove('open');
        await chrome.tabs.create({ url: `${await serverBase()}/showcase/${page}` });
    });
});

document.getElementById('btnSaveConfig')?.addEventListener('click', async () => {
    await saveKey('extServerUrl', safeGetVal('extServerUrl'));
    await saveKey('extAccessKey', safeGetVal('extAccessKey'));
    await saveKey('extModelProvider', safeGetVal('extModelProvider') || 'gemini');
    await saveKey('extAnthropicKey', safeGetVal('extAnthropicKey'));
    await saveKey('extGeminiKey', safeGetVal('extGeminiKey'));
    await saveKey('extGrokKey', safeGetVal('extGrokKey'));
    await saveKey('extDeskCode', safeGetVal('extDeskCode'));
    // A new key may belong to another desk: forget the old lane until deskgate.app reports it.
    deskLane = null;
    deskLaneAnnounced = '';
    appendTranscript('System', 'Configuration saved.');
    settingsDrawer?.classList.remove('open');
    await primeDeskLane();
});
document.getElementById('btnSavePilotOps')?.addEventListener('click', async () => {
    await saveKey('pc_name', safeGetVal('pc_name'));
    await saveKey('pc_sponsor', safeGetVal('pc_sponsor'));
    await saveKey('pc_users', safeGetVal('pc_users'));
    await saveKey('pc_baseline', safeGetVal('pc_baseline'));
    appendTranscript('System', 'Pilot charter & baseline locked.');
    pilotOpsDrawer?.classList.remove('open');
});

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender) => {
        // content.js: the coordinator picked a file in an upload box (a count, never the file name).
        if (msg?.action === 'DESKGATE_UPLOAD') {
            const d = msg.data || {};
            if (!d.case_id || d.case_id !== caseSession.id || caseSession.humanSubmitAt) return;
            const k = `${sender?.frameId ?? 0}|${d.selector || '?'}`;
            const was = caseSession.uploads[k] || { label: d.selector || 'upload', required: false, attached: false };
            caseSession.uploads[k] = { ...was, attached: was.attached || Number(d.files) > 0 };
            if (!was.attached && Number(d.files) > 0) appendTranscript('System', `Upload: ${was.label} now has a file.`);
            return;
        }
        // content.js reports coordinator edits on the portal: lengths and flags only, never the text.
        if (msg?.action === 'DESKGATE_FIELD_EDIT') {
            const d = msg.data || {};
            if (!d.case_id || d.case_id !== caseSession.id || caseSession.humanSubmitAt) return;
            caseSession.edits[d.selector || '?'] = d;
            caseSession.materialEdit = Object.values(caseSession.edits).some((e) => e.staged && e.material);
            if (d.staged && d.material && !caseSession.editAnnounced.includes(d.selector)) {
                caseSession.editAnnounced.push(d.selector);
                appendTranscript('System', `Coordinator edited staged box ${d.selector}${d.key ? ` (${d.key})` : ''}: ${d.delta_chars} chars changed${d.cleared ? ', box cleared' : ''}. Counted as a material edit.`);
            }
            paintMissChip();
            return;
        }
        if (msg?.action === 'PASSIVE_FORM_UPDATE') {
            if (caseSession.stagedSelectors.length && !caseSession.humanSubmitAt) {
                caseSession.materialEdit = true;
            }
        }
    });
}

const READINESS_ITEMS = [
    'Executive sponsor engaged (P&L authority)',
    'Frontline coordinators named',
    'Portal family certified (Availity/Medicaid)',
    'Baseline cases/day certified in writing',
    'Failure threshold agreed (<55% gate accept)',
    'Cohort frozen & exceptions pre-registered',
    'Volatile RAM / zero-retention mode confirmed',
    'Mandatory 1-click human gate confirmed',
    'Coordinator onboarding session complete',
    'Rollback path active (zero data lock-in)',
    'Communication plan confirmed',
    '30-day conversion review date set',
];

function paintReadinessScore() {
    const score = document.getElementById('pilotReadyScore');
    if (!score) return;
    const n = READINESS_ITEMS.filter((_, i) => document.getElementById(`chk_rd_${i}`)?.checked).length;
    const total = READINESS_ITEMS.length;
    score.textContent = n === total
        ? `${n} of ${total} checks confirmed — ready for Day 1`
        : `${n} of ${total} checks confirmed — not ready for Day 1`;
    score.style.color = n === total ? 'var(--neon)' : 'var(--amber)';
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Restore HIPAA Checkbox States FIRST so zrmOn() is accurate immediately
    for (const id of ['chkEnterprisePlan', 'chkSignedBAA', 'chkZeroRetention']) {
        const val = await getSavedKey(id);
        const el = document.getElementById(id);
        if (el && val === '1') el.checked = true;
    }
    refreshHipaaBadge();
    if (zrmOn()) await purgePhiFromDisk();
    const swissBox = document.getElementById('chkSwissMode');
    if (swissBox) swissBox.checked = (await getSavedKey('chkSwissMode')) !== '0';
    const swissVisionBox = document.getElementById('chkSwissVision');
    if (swissVisionBox) swissVisionBox.checked = (await getSavedKey('chkSwissVision')) === '1';
    applyUiLanguage(swissMode());

    // 2. Now safely load URLs and Keys (ZRM RAM boundary is active)
    safeSetVal('extServerUrl', await getSavedKey('extServerUrl') || SERVER_URL);
    safeSetVal('extAccessKey', await getSavedKey('extAccessKey'));
    const savedProvider = await getSavedKey('extModelProvider') || 'gemini';
    const providerSelect = document.getElementById('extModelProvider');
    if (providerSelect) providerSelect.value = savedProvider;
    safeSetVal('extAnthropicKey', await getSavedKey('extAnthropicKey'));
    safeSetVal('extGeminiKey', await getSavedKey('extGeminiKey'));
    safeSetVal('extGrokKey', await getSavedKey('extGrokKey'));
    safeSetVal('extDeskCode', await getSavedKey('extDeskCode'));

    // 3. Restore Pilot Charter Parameters (empty until the desk states them — placeholders show examples)
    safeSetVal('pc_name', await getSavedKey('pc_name'));
    safeSetVal('pc_sponsor', await getSavedKey('pc_sponsor'));
    safeSetVal('pc_users', await getSavedKey('pc_users'));
    safeSetVal('pc_baseline', await getSavedKey('pc_baseline'));

    // 4. 12-Point Readiness Gate — unchecked until someone confirms each item
    const readyBox = document.getElementById('pilotReadyChecks');
    if (readyBox) {
        readyBox.innerHTML = READINESS_ITEMS.map((t, idx) => `
            <label style="display:flex; align-items:flex-start; gap:6px; font-size:0.63rem; margin:2px 0; cursor:pointer; text-transform:none;">
                <input type="checkbox" id="chk_rd_${idx}" style="width:auto; margin-top:2px; accent-color:var(--neon);">
                <span>${idx + 1}. ${t}</span>
            </label>
        `).join('');
        for (let idx = 0; idx < READINESS_ITEMS.length; idx += 1) {
            const el = document.getElementById(`chk_rd_${idx}`);
            if (!el) continue;
            el.checked = (await getSavedKey(`rd_${idx}`)) === '1';
            el.addEventListener('change', async () => {
                await saveKey(`rd_${idx}`, el.checked ? '1' : '0');
                paintReadinessScore();
            });
        }
        paintReadinessScore();
    }
    await refreshHostChip();
    paintMissChip();
    appendTranscript('System',
        `DeskGate v${VERSION} ready. Chart → 📸 READ CHART → portal → ⚡ STAGE PORTAL. Letter → 📸 READ CHART → appeal form → 📝 STAGE APPEAL. Chart and letter facts are kept apart; quoted facts only. Human Submit.\nScreen reads run twice; a field is kept only when two reads agree. Shift-click READ CHART to test the screen read alone (page text ignored).`
        + (swissMode()
            ? (swissVisionAllowed()
                ? '\nSchweiz-Modus an, mit Bildschirmlesung (Zusatzoption): ein Bildausschnitt geht über deskgate.app an das KI-Modell.'
                : '\nSchweiz-Modus an: nur Seitentext und Wortliste, keine Patientendaten verlassen den Browser.')
            : ''));
    await primeDeskLane();
});

setInterval(refreshHostChip, 4000);


/* ------------------------------------------------------------------ */
/* Optional German UI when Schweiz-Modus is active                    */
/* ------------------------------------------------------------------ */
const UI_I18N = {
  en: {
    btnNewCase: 'NEW CASE',
    btnTogglePilotOps: 'PILOT OPS',
    btnToggleSettings: 'CONFIG',
    scriptText: '1. Focus chart or denial letter → <strong>📸 READ CHART</strong> (chart and letter facts are kept apart)<br>2. Focus portal → <strong>⚡ STAGE PORTAL</strong> or <strong>📝 STAGE APPEAL</strong><br>3. Review and edit. Submit on the portal. Auto-log hashes the tracking ID and counts your edits.<br>Appeal drafts quote RAM facts only. Empty = [MISS]. Never click Submit here.',
    btnReadChart: '📸 READ CHART',
    btnStagePortal: '⚡ STAGE PORTAL',
    btnStageAppeal: '📝 STAGE APPEAL',
    btnMarkSubmitted: '✓ GATE (MANUAL OVERRIDE)',
    livePipelineMsg: 'Processing...',
    mediaStatusText: 'Ready. 📸 Read → ⚡ Stage or 📝 Appeal.',
    configHeader: 'CONFIG',
    lblBackend: 'Backend Host URL',
    lblDeskCode: 'Desk code',
    tinyDeskCode: 'Groups GATE rows on /pilot. Use the desk\'s own code only on its live portal; showcase pages post under <code>-SYN. No patient names.',
    lblDeskKey: 'Desk key',
    lblEngine: 'Reasoning Engine',
    lblAnthropic: 'Anthropic API Key',
    lblGemini: 'Google Gemini API Key',
    tinyGemini: 'An AI Studio key is not covered by the Google Cloud BAA. Use it with synthetic pages only.',
    lblGrok: 'xAI Grok API Key',
    hipaaTitle: '🛡️ HIPAA / Zero-Retention Mode (ZRM)',
    hipaaDesc: 'With all three checked, screen reads are refused on any engine except Google.',
    chkEnterprise: 'Enterprise Plan / Covered Organization',
    chkBAA: 'Executed BAA chain (desk ↔ DeskGate, DeskGate ↔ Google Cloud)',
    chkZRM: 'Volatile RAM Execution (Purge Disk Keys)',
    btnSaveConfig: 'Save Configuration',
    pilotHeader: '📋 PILOT OPS · SCHEDULE M GOVERNANCE',
    pilot1: '1 · Pilot Charter',
    lblPcName: 'Initiative / Pod Name',
    lblPcSponsor: 'Executive Sponsor (P&L Authority)',
    lblPcUsers: 'Dedicated Coordinators',
    lblPcBaseline: 'Certified Pre-Period Baseline',
    tinyBaseline: 'Required before Day 1. Denominator for capacity recovery.',
    pilot2: '2 · 12-Point Readiness Gate',
    pilot3: '3 · Spear of Medicine Scope',
    lblBoundary: 'Active Boundary',
    lblTip: 'Tip Restriction',
    btnSavePilot: 'Save Pilot Parameters',
  },
  de: {
    btnNewCase: 'NEUER FALL',
    btnTogglePilotOps: 'PILOT-BETRIEB',
    btnToggleSettings: 'KONFIG',
    scriptText: '1. Akte oder Ablehnung fokussieren → <strong>📸 AKTE LESEN</strong> (Akten- und Brief-Fakten bleiben getrennt)<br>2. Portal fokussieren → <strong>⚡ PORTAL BEFÜLLEN</strong> oder <strong>📝 STELLUNGNAHME</strong><br>3. Prüfen und bearbeiten. Einreichen auf dem Portal. Auto-Log hasht die Referenz und zählt Ihre Änderungen.<br>Entwürfe zitieren nur RAM-Fakten. Leer = [MISS] / [FEHLT]. Hier nie Submit klicken.',
    btnReadChart: '📸 AKTE LESEN',
    btnStagePortal: '⚡ PORTAL BEFÜLLEN',
    btnStageAppeal: '📝 STELLUNGNAHME',
    btnMarkSubmitted: '✓ TOR (MANUELL)',
    livePipelineMsg: 'Verarbeitung...',
    mediaStatusText: 'Bereit. 📸 Lesen → ⚡ Befüllen oder 📝 Stellungnahme.',
    configHeader: 'KONFIG',
    lblBackend: 'Backend-Host-URL',
    lblDeskCode: 'Desk-Code',
    tinyDeskCode: 'Gruppiert GATE-Zeilen auf /pilot. Nur den eigenen Desk-Code auf dem Live-Portal verwenden; Showcase-Seiten unter <code>-SYN. Keine Patientennamen.',
    lblDeskKey: 'Desk-Schlüssel',
    lblEngine: 'Reasoning-Engine',
    lblAnthropic: 'Anthropic API-Schlüssel',
    lblGemini: 'Google Gemini API-Schlüssel',
    tinyGemini: 'Ein AI-Studio-Schlüssel ist nicht durch die Google-Cloud-BAA abgedeckt. Nur mit synthetischen Seiten verwenden.',
    lblGrok: 'xAI Grok API-Schlüssel',
    hipaaTitle: '🛡️ HIPAA / Zero-Retention Mode (ZRM)',
    hipaaDesc: 'Wenn alle drei aktiv sind, werden Bildschirmlesungen auf allen Engines ausser Google abgelehnt.',
    chkEnterprise: 'Enterprise-Plan / abgedeckte Organisation',
    chkBAA: 'Ausgeführte BAA-Kette (Desk ↔ DeskGate, DeskGate ↔ Google Cloud)',
    chkZRM: 'Volatile RAM-Ausführung (Schlüssel von Disk löschen)',
    btnSaveConfig: 'Konfiguration speichern',
    pilotHeader: '📋 PILOT-BETRIEB · SCHEDULE M GOVERNANCE',
    pilot1: '1 · Pilot-Charter',
    lblPcName: 'Initiative / Pod-Name',
    lblPcSponsor: 'Executive Sponsor (P&L-Autorität)',
    lblPcUsers: 'Dedizierte Koordinatoren',
    lblPcBaseline: 'Zertifizierte Vorperioden-Baseline',
    tinyBaseline: 'Vor Tag 1 erforderlich. Nenner für Kapazitätsgewinn.',
    pilot2: '2 · 12-Punkte-Bereitschafts-Gate',
    pilot3: '3 · Spear of Medicine Scope',
    lblBoundary: 'Aktive Grenze',
    lblTip: 'Spitzen-Einschränkung',
    btnSavePilot: 'Pilot-Parameter speichern',
  }
};

function applyUiLanguage(isGerman) {
  const lang = isGerman ? 'de' : 'en';
  const dict = UI_I18N[lang];
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] != null) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        // placeholders only if present
        if (el.placeholder) el.placeholder = dict[key];
      } else {
        el.innerHTML = dict[key];
      }
    }
  });
  // Special cases that are not simple textContent
  const status = document.getElementById('mediaStatusText');
  if (status && !status.hasAttribute('data-i18n')) {
    // already handled
  }
  // Update document title optionally
  document.title = isGerman ? 'DeskGate Operator (DE)' : 'DeskGate Operator';
}

