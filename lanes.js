/**
 * DeskGate Operator — lanes + fact + appeal draft engine (v2.6.8)
 * Live lanes ship packet: {}. Jane Rivera stays on the showroom.
 * Appeal drafts quote RAM facts only. Missing keys stay empty.
 * 2.6.8: chart facts and payer-letter facts live in separate namespaces;
 *        CPT codes parse as (code, units) pairs; placeholder values never land;
 *        payer-requested items are checked one by one against the chart.
 */

export const HUMAN_GATE = 'Coordinator remains the filing actor. Never click Submit.';

export const GENERIC_TRACKING_WORDS = /^(request|standard|pending|completed|required|review|failed|none|number|format|status|inpatient|outpatient|commercial|decision|window|authorization|reference|confirmation|transaction|case|submit|received|acknowledged|appeal|documented|encounter|denied|policy|rationale|determination|utilization|management)$/i;

/**
 * True only for payer-style refs (BCBS-TN-PA-88429117, APL-TN-12345678).
 * Rejects prose tokens such as "Documented", "Encounter", "Required".
 */
export function looksLikeTrackingId(raw) {
    const candidate = String(raw || '').trim();
    if (candidate.length < 6 || candidate.length > 40) return false;
    if (!/\d/.test(candidate)) return false;
    if (GENERIC_TRACKING_WORDS.test(candidate)) return false;
    if (!/^[A-Z0-9][A-Z0-9._-]+$/i.test(candidate)) return false;
    if (!/[-_]/.test(candidate) && !(/[A-Z]/i.test(candidate) && /\d/.test(candidate))) return false;
    return true;
}

/** First candidate that passes looksLikeTrackingId, else ''. */
export function preferredTrackingId(...candidates) {
    for (const c of candidates) {
        if (looksLikeTrackingId(c)) return String(c).trim();
    }
    return '';
}

export const JANE_RIVERA_PACKET = {
    member_id: 'XJ9-442891',
    patient_name: 'Jane M. Rivera',
    patient_first_name: 'Jane',
    patient_last_name: 'Rivera',
    dob: '1978-04-12',
    npi: '1679576722',
    dos: '2026-09-14',
    cpt: 'Wegovy 0.25 mg',
    hcpcs: 'J3490',
    icd10: 'E66.01',
    address: '1600 Amphitheatre Parkway, Mountain View, CA 94043',
    payer: 'Blue Cross Blue Shield',
    plan: 'Commercial PPO',
    prev: 'Phentermine 37.5mg, Orlistat 120mg',
    duration: '> 6 months',
    channel: 'CoverMyMeds',
    phone: '+18005551234',
    clinical:
        'Patient has BMI >= 40 with documented failure of comprehensive lifestyle modification over 6 months. Prior trials of phentermine and orlistat were discontinued due to intolerable side effects (tachycardia and GI distress). Wegovy 0.25 mg is indicated for chronic weight management.',
    appeal:
        'CLINICAL STEP-THERAPY EXCEPTION REBUTTAL for Jane M. Rivera (XJ9-442891). Phentermine discontinued for tachycardia; Orlistat for GI intolerance. Request expedited exception. Human remains the Submit gate.',
};

export const VARGAS_PACKET = {
    member_id: 'SYN-884291-Q',
    patient_name: 'Vargas, Elena M.',
    patient_first_name: 'Elena',
    patient_last_name: 'Vargas',
    dob: '04/12/1979',
    npi: '1999999999',
    dos: '2026-09-18',
    cpt: '97110 x12, 97530 x8',
    hcpcs: '',
    icd10: 'M17.11, G89.4',
    address: '418 Willow Creek Rd, Apt 2B, Nashville, TN 37209',
    payer: 'Blue Cross Blue Shield of TN',
    plan: 'Commercial PPO',
    group_number: 'GRP-DEMO-014',
    prev: 'Meloxicam 15 mg daily x 8 weeks (GI distress); home PT 3x weekly x 6 weeks; right-knee corticosteroid injection 14-May-2026 with transient 4-week relief',
    duration: '6+ weeks conservative care',
    channel: 'Availity / HealthPayer Essentials',
    phone: '(800) 555-9201',
    clinical:
        'Documented failures of conservative management (failed 8-week oral NSAID trial due to adverse GI effect + transient response to steroid injection). Continued skilled intervention required to prevent surgical arthroplasty candidate escalation. CPT 97110 x12 and 97530 x8, 2x weekly x 6 weeks.',
    attachments: 'SYN_order_97110_signed.pdf, SYN_progress_note_0918.pdf, SYN_bcbs_card_front_back.png',
};

export const FIELD_KEY_ALIASES = {
    payer: ['target payer', 'primary payer', 'payer', 'health plan', 'insurance plan', 'f_payer'],
    npi: ['rendering / attending provider npi', 'rendering npi', 'attending npi', 'prescriber npi', 'f_npi', 'npi'],
    patient_name: ['patient full name', 'patient name', 'full name', 'subscriber name', 'f_name', 'patient'],
    patient_first_name: ['first name', 'patient first', 'f_first'],
    patient_last_name: ['last name', 'patient last', 'f_last'],
    dob: ['date of birth', 'birth date', 'birthdate', 'f_dob', 'dob'],
    member_id: ['member / subscriber id', 'subscriber id', 'member id', 'policy id', 'f_member'],
    group_number: ['group number', 'group id', 'f_group', 'grp', 'group'],
    address: ['subscriber home address', 'home address', 'patient address', 'street address', 'f_addr', 'address'],
    plan: ['plan type', 'coverage type', 'product type', 'plan name', 'f_plan'],
    icd10: ['primary & secondary icd-10', 'icd-10 codes', 'icd-10', 'icd10', 'diagnosis code', 'primary diagnosis', 'f_icd', 'diagnosis'],
    cpt: ['requested cpt / hcpcs', 'cpt / hcpcs', 'procedure code', 'requested procedure', 'f_cpt', 'cpt'],
    clinical: ['medical necessity statement', 'step-therapy rationale', 'clinical justification', 'clinical rationale', 'medical necessity', 'f_necessity', 'rationale'],
    attachments: ['attached document packets', 'supporting documentation', 'f_att', 'attachments', 'documents'],
    appeal: ['appeal narrative', 'rebuttal', 'appeal statement', 'appeal letter', 'f_appeal', 'appeal'],
    denial_reason: ['denial reason', 'reason for denial', 'adverse determination', 'f_denial_reason'],
    tracking_id: ['tracking', 'auth reference', 'confirmation', 'f_ref', 'reference'],
};

export const DEFAULT_HINTS = {
    patient_name: 'patient full name last first',
    dob: 'birth date dob date of birth',
    member_id: 'member id subscriber card id',
    group_number: 'group number grp',
    address: 'subscriber home address street',
    npi: 'rendering npi prescriber npi',
    icd10: 'primary secondary icd-10 diagnosis',
    cpt: 'cpt hcpcs procedure code units',
    clinical: 'medical necessity clinical rationale',
    attachments: 'attached documents packets pdf',
    payer: 'payer insurance plan',
    plan: 'plan type policy',
    appeal: 'appeal rebuttal narrative statement',
    denial_reason: 'denial reason adverse determination',
};

export const LANES = [
    {
        id: 'showroom-product',
        name: 'DeskGate /product workstation',
        family: 'showroom',
        hosts: ['deskgate.app', 'www.deskgate.app', 'localhost', '127.0.0.1'],
        paths: ['/product'],
        synthetic: true,
        packet: JANE_RIVERA_PACKET,
        fields: {
            f_patient: 'patient_name',
            f_dob: 'dob',
            f_member: 'member_id',
            f_med: 'cpt',
            f_payer: 'payer',
            f_plan: 'plan',
            f_address: 'address',
            f_dx: 'icd10',
            f_npi: 'npi',
            f_prev: 'prev',
            f_duration: 'duration',
            f_necessity: 'clinical',
            f_channel: 'channel',
            f_payer_phone: 'phone',
            f_appeal: 'appeal',
        },
        hints: DEFAULT_HINTS,
    },
    {
        id: 'showroom-healthpayer',
        name: 'HealthPayer Essentials showcase',
        family: 'showroom',
        hosts: ['deskgate.app', 'www.deskgate.app', 'localhost', '127.0.0.1'],
        paths: ['/showcase-portal', '/showcase-portal.html', '/healthpayer', '/portal', '/showcase-appeal', '/showcase-appeal.html'],
        synthetic: true,
        packet: VARGAS_PACKET,
        fields: {
            f_payer: 'payer',
            f_npi: 'npi',
            f_name: 'patient_name',
            f_dob: 'dob',
            f_member: 'member_id',
            f_group: 'group_number',
            f_addr: 'address',
            f_icd: 'icd10',
            f_cpt: 'cpt',
            f_necessity: 'clinical',
            f_att: 'attachments',
            f_appeal: 'appeal',
            f_denial_reason: 'denial_reason',
            f_ref: 'tracking_id',
        },
        hints: DEFAULT_HINTS,
    },
    {
        id: 'showroom-denial',
        name: 'HealthPayer denial letter (showcase)',
        family: 'showroom',
        hosts: ['deskgate.app', 'www.deskgate.app', 'localhost', '127.0.0.1'],
        paths: ['/showcase-denial', '/showcase-denial.html'],
        synthetic: true,
        packet: {},
        fields: {},
        hints: DEFAULT_HINTS,
    },
    {
        id: 'availity',
        name: 'Availity Essentials',
        family: 'availity',
        hosts: ['availity.com', 'essentials.availity.com', 'apps.availity.com'],
        synthetic: false,
        packet: {},
        fields: {
            memberId: 'member_id',
            patientMemberId: 'member_id',
            patientFirstName: 'patient_first_name',
            patientLastName: 'patient_last_name',
            patientBirthDate: 'dob',
            npi: 'npi',
            renderingNpi: 'npi',
            procedureCode: 'cpt',
            cptCode: 'cpt',
            diagnosisCode: 'icd10',
            primaryDiagnosis: 'icd10',
            clinicalNotes: 'clinical',
            justification: 'clinical',
        },
        hints: DEFAULT_HINTS,
    },
    {
        id: 'covermymeds',
        name: 'CoverMyMeds PA',
        family: 'covermymeds',
        hosts: ['covermymeds.com', 'portal.covermymeds.com', 'dashboard.covermymeds.com'],
        synthetic: false,
        packet: {},
        fields: {},
        hints: DEFAULT_HINTS,
    },
    {
        id: 'uhc',
        name: 'UnitedHealthcare provider portal',
        family: 'uhc',
        hosts: ['uhcprovider.com', 'secure.uhcprovider.com'],
        synthetic: false,
        packet: {},
        fields: {},
        hints: DEFAULT_HINTS,
    },
];

export function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (_) { return ''; }
}

export function pathOf(url) {
    try { return new URL(url).pathname || '/'; }
    catch (_) { return '/'; }
}

function hostMatches(laneHost, tabHost) {
    const a = String(laneHost || '').replace(/^www\./, '').toLowerCase();
    const b = String(tabHost || '').replace(/^www\./, '').toLowerCase();
    return b === a || b.endsWith('.' + a);
}

function fileBase(urlOrPath) {
    const s = String(urlOrPath || '').split(/[?#]/)[0];
    const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return (slash >= 0 ? s.slice(slash + 1) : s).toLowerCase();
}

export function resolveLane(tabUrl, tabHost) {
    const host = (tabHost || hostOf(tabUrl) || '').replace(/^www\./, '');
    const path = pathOf(tabUrl);
    const base = fileBase(tabUrl || path);
    const pathMatch = (lane) =>
        Array.isArray(lane.paths) &&
        lane.paths.some((p) => {
            const needle = String(p || '').toLowerCase();
            return (
                path === p ||
                path.startsWith(p + '/') ||
                path.toLowerCase().endsWith(needle) ||
                base === needle.replace(/^\//, '') ||
                base === fileBase(p)
            );
        });

    const byFile = LANES.find((lane) => pathMatch(lane) && (lane.family === 'showroom' || !host));
    if (byFile) return byFile;

    const candidates = LANES.filter((lane) =>
        (lane.hosts || []).some((h) => hostMatches(h, host))
    );
    const byPath = candidates.find((lane) => pathMatch(lane));
    return byPath || candidates[0] || null;
}

export function packetValues(lane, facts = {}) {
    return { ...(lane?.packet || {}), ...(facts || {}) };
}

export function fillFieldsFromLane(lane, facts = {}) {
    const packet = packetValues(lane, facts);
    const fields = {};
    Object.entries(lane?.fields || {}).forEach(([id, key]) => {
        if (packet[key] != null && packet[key] !== '') fields[id] = packet[key];
    });
    return fields;
}

export function hintActionsFromLane(lane, facts = {}) {
    const packet = packetValues(lane, facts);
    const hints = { ...DEFAULT_HINTS, ...(lane?.hints || {}) };
    const actions = [];
    Object.entries(hints).forEach(([key, hint]) => {
        if (packet[key] != null && packet[key] !== '') {
            actions.push({ action: 'type_text', field_hint: hint, text: packet[key] });
        }
    });
    return actions;
}

export function stageActionsForLane(lane, facts = {}) {
    if (!lane) return [];
    const actions = [];
    const fields = fillFieldsFromLane(lane, facts);
    if (Object.keys(fields).length) actions.push({ action: 'fill_fields', fields });
    if (lane.synthetic || Object.keys(fields).length === 0) {
        actions.push(...hintActionsFromLane(lane, facts));
    }
    return actions;
}

export function isShowroomLane(lane) {
    return !!(lane && (lane.synthetic || lane.family === 'showroom'));
}

/* ------------------------------------------------------------------ */
/* 2.6.8 parsing core                                                  */
/* ------------------------------------------------------------------ */

const MONTHS = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MON_SRC = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_SRC =
    `(?:\\d{1,2}[-\\/ ]${MON_SRC}[-\\/ ]\\d{2,4}` +
    `|${MON_SRC}\\s+\\d{1,2},?\\s+\\d{4}` +
    `|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}` +
    `|\\d{4}-\\d{2}-\\d{2}` +
    `|${MON_SRC}\\s+\\d{4})`;
const DATE_RE = new RegExp(`\\b${DATE_SRC}\\b`, 'i');
const RELIEF_RE = /\b\d+\s*-?\s*(?:weeks?|wks?|days?|months?|mos?)\b[^.\n]{0,30}?\brelief\b|\brelief\b[^.\n]{0,40}?\b\d+\s*-?\s*(?:weeks?|wks?|days?|months?)\b|\b(?:no|minimal|transient|temporary|partial|complete|sustained)\s+(?:\d+\s*-?\s*(?:weeks?|days?|months?)\s+)?relief\b/i;
const NSAID_RE = /\b(?:nsaids?|anti-?inflammator\w*|meloxicam|ibuprofen|naproxen|celecoxib|diclofenac|etodolac|nabumetone|indomethacin|ketorolac|piroxicam|oxaprozin|sulindac)\b/i;
const DENIAL_LINE_RE = /^(?:policy|denial|reason|missing|requested|insufficient|decision|determination|appeal|payer reference|trial failures\s*\(referenced\))\b|\b(?:denied|adverse determination|the submitted packet|did not include|was not documented)\b/i;

export function normalizeDob(raw) {
    const s = String(raw || '').replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}/${m[1]}`;
    m = s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,9})[\/\-. ](\d{2,4})/);
    if (m) {
        const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
        if (mon) {
            const y = m[3].length === 2 ? (Number(m[3]) > 30 ? '19' : '20') + m[3] : m[3];
            return `${mon}/${m[1].padStart(2, '0')}/${y}`;
        }
    }
    m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s+(\d{4})/);
    if (m) {
        const mon = MONTHS[m[1].toLowerCase().slice(0, 3)];
        if (mon) return `${mon}/${m[2].padStart(2, '0')}/${m[3]}`;
    }
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    return s.split(/\s+(?:age|y)\b/i)[0].trim();
}

function prettyDate(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,9})\.?[-\/ ](\d{4})$/);
    if (m) {
        const idx = Number(MONTHS[m[2].toLowerCase().slice(0, 3)]) - 1;
        if (idx >= 0) return `${m[1].padStart(2, '0')}-${MONTH_NAMES[idx]}-${m[3]}`;
    }
    return s;
}

function stripMarkup(s) {
    return String(s || '')
        .replace(/\r/g, '')
        .replace(/\*\*/g, '')
        .replace(/[*`#]/g, '')
        .replace(/^\s*[-•]\s+/gm, '')
        .replace(/ /g, ' ');
}

function clean(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function ensurePeriod(s) {
    const t = clean(s);
    return !t || /[.!?)"]$/.test(t) ? t : t + '.';
}

function capAtSentence(s, max) {
    const t = clean(s);
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
    return end > max * 0.5 ? cut.slice(0, end + 1) : cut;
}

function isPhysicianCredential(val) {
    return /,\s*(?:MD|DO|NP|PA-C|PA|RN|DPT|PT|DC|CRNA|PHD|FNP|APRN)\b/i.test(String(val || ''));
}

/**
 * True for placeholder answers a vision model writes when a value is absent:
 * "Not visible / Not provided", "N/A", "—", "Not", "unknown", our own [MISS] markers.
 */
export function isSentinelValue(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v !== 'string') return false;
    const s = v.trim().replace(/^[\[(]+|[\])]+$/g, '').trim();
    if (!s) return true;
    if (/^\[?MISS\b/i.test(v.trim())) return true;
    if (/^[\s\-–—_.?*\/]+$/.test(s)) return true;
    if (/^(?:n\/?a|na|none|nil|null|undefined|unknown|unavailable|illegible|unreadable|redacted|tbd|not|blank|empty)$/i.test(s)) return true;
    if (s.length <= 80 && /\bnot\s+(?:visible|provided|available|found|shown|legible|listed|documented|specified|present|applicable|stated|captured|readable|identified|seen|indicated|mentioned|included|on\s+(?:file|screen|page|form))\b/i.test(s)) return true;
    if (s.length <= 40 && /^(?:no|none)\s+(?:data|value|info|information|entry|record)\b/i.test(s)) return true;
    return false;
}

/* ---------------- CPT / HCPCS with units ---------------- */

const CPT_TOKEN_RE = /\b(\d{5}|\d{4}[FT]|[A-V]\d{4})\b/g;
const NON_CPT_LINE_RE = /\b(?:zip|postal|phone|fax|tel|npi|mrn|dob|birth|member|subscriber|group|grp|tin|ein|ssn|account|acct|address|addr|suite|apt|po box)\b/i;
const CPT_CONTEXT_RE = /\b(?:cpt|hcpcs|procedures?|proc|orders?|ordered|requested|services?|units?|codes?|billing)\b/i;
const STATE_BEFORE_RE = /\b(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\s*,?\s*$/;

function unitsAfter(seg) {
    const s = String(seg || '').slice(0, 120);
    let m = s.match(/^\s*(?:[x×]|times)\s*(\d{1,3})\b/i);
    if (m) return m[1];
    m = s.match(/^\s*\(?\s*(\d{1,3})\s*(?:units?|u)\b/i);
    if (m) return m[1];
    m = s.match(/^\s*\|(?:[^|\n]*\|){0,4}?\s*(\d{1,3})\s*(?:units?|u)?\s*\|/i);
    if (m) return m[1];
    m = s.match(/\b(\d{1,3})\s*(?:units?|u)\b/i);
    if (m) return m[1];
    m = s.match(/\bunits?\s*[:=]?\s*(\d{1,3})\b/i);
    if (m) return m[1];
    return '';
}

function unitsBefore(seg) {
    const m = String(seg || '').slice(-60).match(/\b(\d{1,3})\s*(?:units?|u)\s*(?:of|for|[x×])?\s*(?:cpt\s*)?$/i);
    return m ? m[1] : '';
}

/**
 * Parse CPT/HCPCS codes as (code, units) pairs.
 * "97110 x12 & 97530 x8" -> 97110 x12, 97530 x8 (each code keeps its own units).
 */
export function parseCptPairs(blob) {
    const order = [];
    const byCode = new Map();
    const conflicts = [];

    const add = (code, units) => {
        const c = String(code || '').trim().toUpperCase();
        const u = units ? String(Number(units)) : '';
        if (u === '0') return;
        if (!byCode.has(c)) {
            byCode.set(c, u);
            order.push(c);
            return;
        }
        const prev = byCode.get(c);
        if (!prev && u) byCode.set(c, u);
        else if (prev && u && prev !== u && !conflicts.some((x) => x.code === c)) {
            conflicts.push({ code: c, kept: prev, other: u });
        }
    };

    const scanLine = (line, requireUnits) => {
        const tokens = [...line.matchAll(CPT_TOKEN_RE)];
        if (!tokens.length) return;
        const cptLabelled = /\b(?:cpt|hcpcs)\b/i.test(line);
        const lineHasContext = CPT_CONTEXT_RE.test(line) && (cptLabelled || !NON_CPT_LINE_RE.test(line));
        tokens.forEach((m, i) => {
            const start = m.index;
            const end = start + m[0].length;
            const prevEnd = i > 0 ? tokens[i - 1].index + tokens[i - 1][0].length : 0;
            const nextStart = i + 1 < tokens.length ? tokens[i + 1].index : line.length;
            const before = line.slice(prevEnd, start);
            if (STATE_BEFORE_RE.test(line.slice(0, start))) return;
            const units = unitsAfter(line.slice(end, nextStart)) || unitsBefore(before);
            if (requireUnits && !units) return;
            if (!lineHasContext && !units) return;
            add(m[1], units);
        });
    };

    const lines = String(blob || '').split(/\n/);
    lines.forEach((line) => scanLine(line, false));
    if (!order.length) lines.forEach((line) => { if (!NON_CPT_LINE_RE.test(line)) scanLine(line, true); });

    const pairs = order.map((code) => ({ code, units: byCode.get(code) || '' }));
    return {
        pairs,
        conflicts,
        text: pairs.map((p) => (p.units ? `${p.code} x${p.units}` : p.code)).join(', '),
    };
}

export function collectCpt(blob) {
    return parseCptPairs(blob).text;
}

/* ---------------- ICD-10 ---------------- */

const ICD_RE = /\b([A-TV-Z]\d[0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/g;
const ICD_CONTEXT_RE = /\b(?:icd(?:-?10)?|diag\w*|dx|assessment|problems?|impression)\b/i;

function collectIcd(lines) {
    const out = [];
    for (const line of lines) {
        const startsWithCode = /^[A-TV-Z]\d[0-9A-Z](?:\.[0-9A-Z]{1,4})?\b/.test(line);
        if (!startsWithCode && !ICD_CONTEXT_RE.test(line)) continue;
        if (/\b(?:policy|guideline|npi|member|group|mrn|tin)\b/i.test(line) && !ICD_CONTEXT_RE.test(line)) continue;
        for (const m of line.matchAll(ICD_RE)) {
            if (!out.includes(m[1])) out.push(m[1]);
        }
    }
    return out.join(', ');
}

/* ---------------- identity (shared by chart + letter) ---------------- */

function cleanPersonName(val) {
    const s = clean(String(val || '').replace(/\s*\(.*$/, '').replace(/\s+[-–—]\s+.*$/, ''));
    if (!s || /\d/.test(s) || s.length > 80 || isSentinelValue(s)) return '';
    return s;
}

function firstIdToken(val) {
    const tok = String(val || '').trim().split(/[\s,;|]+/)[0].replace(/[.,;:]+$/, '');
    if (!tok || tok.length < 3 || tok.length > 30 || !/\d/.test(tok) || isSentinelValue(tok)) return '';
    return tok;
}

function kvSegments(lines) {
    const out = [];
    lines.forEach((line, i) => {
        line.split(/\s+[|·]\s+/).forEach((seg) => {
            const kv = seg.match(/^([^:]{2,48}):\s*(.+)$/);
            if (!kv) return;
            const key = kv[1].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            const val = kv[2].replace(/\t+/g, ' ').trim();
            out.push({ key, val, line: i });
        });
    });
    return out;
}

function extractIdentity(lines, blob) {
    const id = {};
    const pri = {};
    const set = (k, v, p = 1) => {
        if (!v || isSentinelValue(v)) return;
        if (id[k] && (pri[k] || 0) >= p) return;
        id[k] = v;
        pri[k] = p;
    };

    for (const { key, val } of kvSegments(lines)) {
        if (isSentinelValue(val)) continue;
        if (/^(?:patient|patient name|patient full name|full name|name|member name|subscriber name)$/.test(key)) {
            if (!isPhysicianCredential(val)) set('patient_name', cleanPersonName(val), 2);
        } else if (/\b(?:dob|date of birth|birth ?date|birthdate)\b/.test(key)) {
            const d = normalizeDob(val);
            if (/\d{2}\/\d{2}\/\d{4}/.test(d)) set('dob', d, 2);
        } else if (/^(?:member|member id|member subscriber id|subscriber id|member number|member no|policy id|policy number|insurance id|subscriber number)$/.test(key)) {
            set('member_id', firstIdToken(val), 2);
        } else if (key === 'id') {
            set('member_id', firstIdToken(val), 1);
        } else if (/^(?:group|grp|group number|group no|group id|group num)$/.test(key)) {
            set('group_number', firstIdToken(val), 2);
        } else if (/^(?:address|addr|home address|subscriber home address|patient address|street address|mailing address)$/.test(key)) {
            if (/\d/.test(val) && /[a-z]/i.test(val)) set('address', clean(val), 2);
        } else if (/\bnpi\b/.test(key)) {
            const n = val.match(/\b\d{10}\b/);
            if (n) set('npi', n[0], /rendering|attending/.test(key) ? 3 : 2);
        } else if (/^(?:primary payer|primary insurance)$/.test(key)) {
            set('payer', clean(val), 3);
        } else if (/^(?:health plan|insurance|insurance plan|carrier)$/.test(key)) {
            set('payer', clean(val), 2);
        } else if (key === 'payer') {
            set('payer', clean(val), 1);
        } else if (/^(?:plan|plan type|product|coverage|coverage type|plan name)$/.test(key)) {
            if (/\b(?:ppo|hmo|epo|pos|hdhp|commercial|medicare|medicaid|advantage|marketplace|exchange|indemnity)\b/i.test(val)) set('plan', clean(val), 2);
        } else if (/^(?:provider|rendering provider|attending|attending provider|treating provider|ordering provider|ref provider|referring provider|supervising|physician)$/.test(key)) {
            const p = clean(val.replace(/\s*\(.*$/, ''));
            if (isPhysicianCredential(p) && !/\d/.test(p)) set('provider_name', p, /rendering|treating|attending/.test(key) ? 2 : 1);
        }
    }

    // Heading-style payer: "PRIMARY PAYER" on one line, the plan name on the next.
    lines.forEach((line, i) => {
        if (/^primary\s+(?:payer|insurance)\s*:?$/i.test(line) && lines[i + 1] && !/:/.test(lines[i + 1])) {
            set('payer', clean(lines[i + 1]), 3);
        }
    });

    if (!id.patient_name) {
        const m = blob.match(/(?:Patient|Patient Name)\s*:?\s*([A-Z][A-Za-z.'-]+,\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z]\.?)?)/);
        if (m && !isPhysicianCredential(m[1])) set('patient_name', m[1].trim(), 1);
    }
    if (!id.dob) {
        const m = blob.match(/(?:dob|date of birth|birth date)\s*:?\s*([^\n(]+)/i);
        if (m) {
            const d = normalizeDob(m[1]);
            if (/\d{2}\/\d{2}\/\d{4}/.test(d)) set('dob', d, 1);
        }
    }
    if (!id.npi) {
        const m = blob.match(/\bNPI\b[^\d\n]{0,10}(\d{10})\b/);
        if (m) set('npi', m[1], 1);
    }
    return id;
}

/* ---------------- trials, rationale, plan ---------------- */

function isHeading(line) {
    return line.length < 90 && line === line.toUpperCase() && /[A-Z]{3}/.test(line) && !/\d{3}/.test(line);
}

export function splitTrials(prev) {
    if (Array.isArray(prev)) return prev.map(clean).filter(Boolean);
    const s = clean(prev);
    if (!s) return [];
    const parts = s.split(/\s+(?=Trial\s*#?\s*\d+\s*[:\-—(])/i).map(clean).filter(Boolean);
    return parts.length ? parts : [s];
}

function extractTrials(lines) {
    const out = [];
    const norm = (l) => clean(l.replace(/\t+/g, ' — '));
    for (const raw of lines) {
        const line = norm(raw);
        if (DENIAL_LINE_RE.test(line)) continue;
        if (/^trial\s*#?\s*\d+\b/i.test(line) && line.length > 12) out.push(line);
    }
    if (out.length) return out;

    // Fallback: lines under a conservative-therapy heading.
    const therapyish = /\b(?:\d+(?:\.\d+)?\s*mg|injection|corticosteroid|physical therapy|home exercise|discontinued|failed|weeks?|nsaid)\b/i;
    let inSection = false;
    for (const raw of lines) {
        const line = norm(raw);
        if (/\b(?:conservative|step[- ]therapy|trial failures?|prior treatments?|treatment history|failed therap)/i.test(line) && (isHeading(line) || /:$/.test(line))) {
            inSection = true;
            continue;
        }
        if (inSection && (isHeading(line) || /^[^:]{2,40}:$/.test(line))) inSection = false;
        if (inSection && therapyish.test(line) && !DENIAL_LINE_RE.test(line)) out.push(line);
    }
    return out;
}

function extractRationale(lines) {
    for (const { key, val } of kvSegments(lines)) {
        if (/(?:rationale|medical necessity|justification|clinical summary|necessity statement)/.test(key) &&
            !/denial|policy/.test(key) && !isSentinelValue(val) && !DENIAL_LINE_RE.test(val) && val.length >= 20) {
            return clean(val);
        }
    }
    return '';
}

function extractPlanLines(lines, exclude) {
    const out = [];
    for (const raw of lines) {
        const line = clean(raw.replace(/\t+/g, ' — '));
        if (line.length < 30 || isHeading(line) || DENIAL_LINE_RE.test(line)) continue;
        if (/^trial\s*#?\s*\d+/i.test(line) || exclude.some((x) => x && line.includes(x.slice(0, 40)))) continue;
        if (/^[^:]{2,40}:/.test(line) && !/^plan\b/i.test(line)) continue;
        if (/\b(?:indicated|prescribed|recommended)\b/i.test(line)) out.push(line.replace(/^plan\s*:\s*/i, ''));
        if (out.length >= 2) break;
    }
    return out.join(' ');
}

function extractNoteDate(blob) {
    const m = blob.match(new RegExp(`\\b(?:signed|e-signed|electronically signed)\\b[^\\n]{0,40}?(${DATE_SRC})`, 'i'));
    return m ? prettyDate(m[1]) : '';
}

export function extractClinicalFacts(rawText) {
    const facts = {};
    if (!rawText) return facts;
    const blob = stripMarkup(rawText);
    const lines = blob.split('\n').map((l) => l.trim()).filter(Boolean);

    Object.assign(facts, extractIdentity(lines, blob));

    const icd = collectIcd(lines);
    if (icd) facts.icd10 = icd;

    const cpt = parseCptPairs(blob);
    if (cpt.text) facts.cpt = cpt.text;
    if (cpt.conflicts.length) {
        facts.cpt_conflict = cpt.conflicts.map((c) => `${c.code}: x${c.kept} vs x${c.other}`).join('; ');
    }

    const docs = [...blob.matchAll(/\b([\w.-]+\.(?:pdf|png|jpe?g|tiff?|docx?))\b/gi)].map((m) => m[1]);
    if (docs.length) facts.attachments = Array.from(new Set(docs)).join(', ');

    const trials = extractTrials(lines);
    const rationale = extractRationale(lines);
    const plan = extractPlanLines(lines, [rationale, ...trials]);
    if (trials.length) {
        facts.trial_lines = trials;
        facts.prev = trials.map(ensurePeriod).join(' ');
    }
    if (rationale) facts.rationale = rationale;
    if (plan) facts.plan_of_care = plan;

    const parts = [];
    if (rationale) parts.push(`Clinical rationale: ${ensurePeriod(rationale)}`);
    if (plan) parts.push(`Plan: ${ensurePeriod(plan)}`);
    if (trials.length) parts.push(`Step-therapy history: ${trials.map(ensurePeriod).join(' ')}`);
    if (parts.length) facts.clinical = capAtSentence(parts.join(' '), 2000);

    const noteDate = extractNoteDate(blob);
    if (noteDate) facts.note_date = noteDate;

    Object.keys(facts).forEach((k) => { if (isSentinelValue(facts[k])) delete facts[k]; });
    return facts;
}

export const parseVisionFacts = extractClinicalFacts;

/* ---------------- payer letter ---------------- */

export function extractDenialFacts(rawText) {
    const out = {};
    if (!rawText) return out;
    const blob = stripMarkup(rawText);
    const lines = blob.split('\n').map((l) => l.trim()).filter(Boolean);
    const sep = '(?:\\s*[:\\-]\\s*|\\t+|\\s{2,})';
    const takeFirst = (key, patterns, accept = () => true) => {
        for (const re of patterns) {
            const m = blob.match(re);
            if (!m || !m[1]) continue;
            const v = m[1].replace(/\s+/g, ' ').trim().slice(0, 280);
            if (!isSentinelValue(v) && accept(v)) {
                out[key] = v;
                return;
            }
        }
    };

    takeFirst('denial_reason', [
        new RegExp('reason\\s*(?:for\\s*)?(?:the\\s*)?denial' + sep + '([^\\n]{8,280})', 'i'),
        new RegExp('denial\\s*(?:reason|rationale)' + sep + '([^\\n]{8,280})', 'i'),
        new RegExp('adverse determination\\s*(?:reason|rationale)?' + sep + '([^\\n]{8,280})', 'i'),
        new RegExp('\\bdetermination\\s*(?:reason|rationale)' + sep + '([^\\n]{8,280})', 'i'),
    ], (v) => v.length >= 8);
    takeFirst('denial_code', [
        new RegExp('(?:reason code|denial code|carc|rarc|remark code)' + sep + '([A-Z0-9][A-Z0-9.\\-]{1,23})\\b', 'i'),
    ], (v) => /\d/.test(v));
    takeFirst('policy_cite', [
        new RegExp('(?:medical policy|clinical policy|policy|guideline|criteria)' + sep + '([^\\n]{8,200})', 'i'),
    ]);
    takeFirst('missing_items', [
        new RegExp('(?:missing(?:[^\\n]{0,60}?)(?:requested|documentation|information)|additional(?:\\s*clinical)?\\s*(?:info|information|documentation)(?:\\s*(?:requested|needed|required))?|documentation\\s*(?:requested|needed|required)|not on file)' + sep + '([^\\n]{8,400})', 'i'),
    ]);
    takeFirst('decision', [
        new RegExp('(?:decision|determination status|determination|outcome)' + sep + '(denied|adverse|pended|overturned|upheld|approved|partially approved)\\b', 'i'),
    ]);

    // The letter's own identity block (kept in the letter namespace, never merged into chart facts).
    const ident = extractIdentity(lines, blob);
    ['patient_name', 'dob', 'member_id'].forEach((k) => { if (ident[k]) out[k] = ident[k]; });
    const cptLines = lines.filter((l) => /\b(?:cpt|hcpcs|procedure|requested|service)\b/i.test(l)).join('\n');
    const cpt = collectCpt(cptLines);
    if (cpt) out.cpt = cpt;
    const icd = collectIcd(lines.filter((l) => /\bdiag|icd|dx\b/i.test(l)));
    if (icd) out.icd10 = icd;

    const ref = extractPayerReference(blob);
    if (ref) out.tracking_id = ref;

    if (!out.denial_reason && /\bdenied\b|adverse determination/i.test(blob)) {
        const sent = blob.match(/(?:insufficient documentation[^.!\n]{0,200}|(?:request|service|authorization)\s+(?:is|was|has been)\s+denied[^.!\n]{0,180})/i);
        if (sent) out.denial_reason = sent[0].replace(/\s+/g, ' ').trim().slice(0, 280);
    }
    if (!out.decision && /\bdenied\b|adverse determination/i.test(blob)) out.decision = 'Denied';
    return out;
}

/** Labeled payer reference first, then a known payer-prefix token. */
export function extractPayerReference(text) {
    const blob = String(text || '');
    if (!blob) return '';
    const sep = '(?:\\s*[:\\-#]\\s*|\\t+|\\s{2,})';
    const labeled = blob.matchAll(new RegExp(
        '(?:tracking|auth(?:orization)?|confirmation|reference|appeal|transaction|case)\\s*(?:id|number|no\\.?|#|reference)?' + sep + '([A-Z0-9][A-Z0-9._-]{5,32})',
        'gi'
    ));
    for (const m of labeled) {
        if (looksLikeTrackingId(m[1])) return String(m[1]).trim();
    }
    const codeMatch = blob.match(/\b((?:BCBS|AVA|UHC|AET|CIG|COV|HUM|OPT|TRK|PA|CM|APL)[-_][A-Z0-9_-]{4,28})\b/i);
    if (codeMatch && looksLikeTrackingId(codeMatch[1])) return codeMatch[1].trim();
    return '';
}

/**
 * Which kind of surface produced this text.
 * 'denial' -> payer letter facts only; 'chart' -> chart facts; 'unknown' -> fill gaps only.
 */
export function classifySurface(text, url = '', title = '') {
    const head = `${url || ''} ${title || ''}`.toLowerCase();
    const blob = stripMarkup(text || '');
    const d = extractDenialFacts(blob);
    let denial = 0;
    let chart = 0;
    if (/denial|adverse|determination|decision[-_ ]letter/.test(head)) denial += 2;
    if (/chart|ehr|progress|encounter|clinical note|patient summary/.test(head)) chart += 2;
    if (d.denial_reason) denial += 2;
    if (d.denial_code) denial += 1;
    if (d.missing_items) denial += 1;
    if (d.decision && /denied|adverse|upheld/i.test(d.decision)) denial += 1;
    if (/\b(?:appeal window|right to appeal|reconsideration|adverse determination)\b/i.test(blob)) denial += 1;
    if (/\b(?:chief complaint|subjective|history of present illness|hpi|assessment|progress note|plan\s*(?:&|and)?\s*orders?|encounter)\b/i.test(blob)) chart += 2;
    if (/^\s*trial\s*#?\s*\d+\b/im.test(blob)) chart += 1;
    if (/\bsigned\s*(?:&|and)\s*locked\b|electronically signed/i.test(blob)) chart += 1;
    if (/\b(?:cpt|hcpcs)\b[^\n]*\b\d{5}\b/i.test(blob)) chart += 1;
    if (/\b(?:icd(?:-?10)?|diagnos[ie]s|dx)\b[^\n]*\b[A-TV-Z]\d[0-9A-Z]\.\w/i.test(blob)) chart += 1;
    if (denial >= 3 && denial > chart) return 'denial';
    if (chart >= 2 && chart >= denial) return 'chart';
    return 'unknown';
}

export function isAppealSurface(url, title, fields) {
    const blob = `${url || ''} ${title || ''} ${(fields || []).map((f) => f.label).join(' ')}`.toLowerCase();
    return /appeal|rebuttal|reconsider|reopen|overturn/.test(blob);
}

export function isDenialSurface(url, title, text) {
    return classifySurface(text, url, title) === 'denial';
}

/* ---------------- identity + cross-check ---------------- */

function normId(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function nameTokens(v) {
    return String(v || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1);
}

function namesMatch(a, b) {
    const x = nameTokens(a);
    const y = nameTokens(b);
    if (!x.length || !y.length) return null;
    return x.every((t) => y.includes(t)) || y.every((t) => x.includes(t));
}

/** { same: true | false | null, reason } — null when there is not enough identity to compare. */
export function samePatient(a = {}, b = {}) {
    const dobA = a.dob ? normalizeDob(a.dob) : '';
    const dobB = b.dob ? normalizeDob(b.dob) : '';
    const names = namesMatch(a.patient_name, b.patient_name);
    if (a.member_id && b.member_id) {
        if (normId(a.member_id) === normId(b.member_id)) return { same: true, reason: 'member ID' };
        if (names === true && dobA && dobB && dobA === dobB) return { same: true, reason: 'name + DOB (member ID format differs)' };
        return { same: false, reason: 'member ID differs' };
    }
    if (names === false) return { same: false, reason: 'name differs' };
    if (dobA && dobB && dobA !== dobB) return { same: false, reason: 'DOB differs' };
    if (names === true && dobA && dobB) return { same: true, reason: 'name + DOB' };
    if (names === true) return { same: null, reason: 'name only' };
    return { same: null, reason: 'not enough identity' };
}

function cptMap(text) {
    const m = new Map();
    parseCptPairs(String(text || '').replace(/,\s*/g, '\n').replace(/^/, 'CPT ')).pairs.forEach((p) => m.set(p.code, p.units));
    String(text || '').split(/[,;]/).forEach((part) => {
        const pm = part.match(/\b(\d{5}|\d{4}[FT]|[A-V]\d{4})\b(?:\s*[x×]\s*(\d{1,3}))?/i);
        if (pm && !m.has(pm[1].toUpperCase())) m.set(pm[1].toUpperCase(), pm[2] ? String(Number(pm[2])) : '');
    });
    return m;
}

function cptMatches(chart, letter) {
    const c = cptMap(chart);
    const l = cptMap(letter);
    if (!c.size || !l.size) return null;
    for (const [code, units] of l) {
        if (!c.has(code)) return false;
        if (units && c.get(code) && units !== c.get(code)) return false;
    }
    return true;
}

function icdSubset(chart, letter) {
    const c = String(chart || '').toUpperCase().split(/[,\s]+/).filter(Boolean);
    const l = String(letter || '').toUpperCase().split(/[,\s]+/).filter(Boolean);
    if (!c.length || !l.length) return null;
    return l.every((x) => c.includes(x));
}

/** Field-by-field comparison of the chart in RAM against the payer letter in RAM. */
export function crossCheckLetterVsChart(chart = {}, letter = {}) {
    const rows = [];
    const cmp = (key, label, a, b, eq) => {
        if (!a && !b) return;
        if (!a || !b) {
            rows.push({ key, label, status: a ? 'chart_only' : 'letter_only', chart: a || '', letter: b || '' });
            return;
        }
        const r = eq(a, b);
        rows.push({ key, label, status: r === false ? 'mismatch' : 'match', chart: a, letter: b });
    };
    cmp('member_id', 'Member ID', chart.member_id, letter.member_id, (a, b) => normId(a) === normId(b));
    cmp('patient_name', 'Name', chart.patient_name, letter.patient_name, (a, b) => namesMatch(a, b));
    cmp('dob', 'DOB', chart.dob, letter.dob, (a, b) => normalizeDob(a) === normalizeDob(b));
    cmp('cpt', 'CPT/units', chart.cpt, letter.cpt, cptMatches);
    cmp('icd10', 'Diagnosis', chart.icd10, letter.icd10, icdSubset);
    return rows;
}

export function identityMismatches(rows) {
    return (rows || []).filter((r) => r.status === 'mismatch' && ['member_id', 'patient_name', 'dob'].includes(r.key));
}

/* ---------------- appeal draft ---------------- */

export function splitRequestedItems(missing) {
    return String(missing || '')
        .split(/;|\n|•|\s+(?=\(?\d+[.)]\s)/)
        .map((s) => s.replace(/^\s*(?:\(?\d+[.)]|[-•])\s*/, '').replace(/[.\s]+$/, '').trim())
        .filter((s) => s.length >= 4);
}

const COMPONENT_DETECT = {
    agent: (l) => NSAID_RE.test(l) || /\b[A-Z][a-z]{3,}\s+\d+(?:\.\d+)?\s*(?:mg|mcg)\b/.test(l),
    dose: (l) => /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu)\b/i.test(l),
    duration: (l) => /\b\d+\s*-?\s*(?:weeks?|wks?|days?|months?|mos?)\b/i.test(l),
    reason: (l) => /\b(?:discontinu\w*|stopped|due to|intoleran\w*|adverse|side effects?|failed|ineffective|no relief|inadequate|insufficient)\b/i.test(l),
    date: (l) => DATE_RE.test(l),
    relief: (l) => RELIEF_RE.test(l),
    frequency: (l) => /\b\d+\s*x\s*(?:weekly|daily|per week|\/\s*week|a week)\b|\b\d+x\s*(?:weekly|daily)\b|\b(?:daily|weekly|twice|bid|tid)\b/i.test(l),
};

const COMPONENT_LABEL = {
    agent: 'agent', dose: 'dose', duration: 'duration', reason: 'reason discontinued',
    date: 'date', relief: 'duration of relief', frequency: 'frequency',
};

function componentsFromItem(item, fallback) {
    const paren = String(item).match(/\(([^)]+)\)/);
    const words = paren ? paren[1].split(/,|\band\b|\//).map((w) => w.trim()).filter(Boolean)
        : [];
    const fromText = (w) => {
        if (/agent|drug|medication|name/i.test(w)) return 'agent';
        if (/dose|strength|dosage/i.test(w)) return 'dose';
        if (/relief/i.test(w)) return 'relief';
        if (/date/i.test(w)) return 'date';
        if (/frequenc/i.test(w)) return 'frequency';
        if (/week|duration|length|day|month|period/i.test(w)) return 'duration';
        if (/reason|discontinu|stop|outcome|response|result|failure/i.test(w)) return 'reason';
        return '';
    };
    let comps = words.map(fromText).filter(Boolean);
    if (!comps.length) {
        const outside = String(item).replace(/\([^)]*\)/g, ' ');
        if (/\bdate\b/i.test(outside)) comps.push('date');
        if (/relief|duration of|response/i.test(outside)) comps.push('relief');
        if (/frequenc/i.test(outside)) comps.push('frequency');
    }
    if (!comps.length) comps = fallback.slice();
    return Array.from(new Set(comps));
}

function evaluateLine(line, comps) {
    const have = [];
    const lack = [];
    comps.forEach((c) => {
        const fn = COMPONENT_DETECT[c];
        if (!fn) return;
        (fn(line) ? have : lack).push(c);
    });
    return { have, lack };
}

function evaluateRequestedItem(item, ctx) {
    const res = { item, rule: 'unmapped', status: 'missing', quote: '', have: [], lack: [], checks: [], letter: '' };
    const label = item.charAt(0).toUpperCase() + item.slice(1);
    const missLine = (what) => `[MISS — ${what} Quote it from the record or attach it; do not attest.]`;
    const lineRule = (rule, finder, defaults, noun) => {
        res.rule = rule;
        const line = ctx.trials.find(finder);
        if (!line) {
            res.letter = missLine(`no ${noun} line found in the chart facts in RAM.`);
            return res;
        }
        ctx.usedTrials.add(line);
        res.quote = line;
        const comps = componentsFromItem(item, defaults);
        const ev = evaluateLine(line, comps);
        res.have = ev.have;
        res.lack = ev.lack;
        const outside = item.replace(/\([^)]*\)/g, ' ');
        if (/\bdated\b/i.test(outside) && !comps.includes('date') && !COMPONENT_DETECT.date(line)) {
            res.checks.push(`payer asked for a dated trial; the chart line gives no calendar date${ctx.noteDate ? ` (note signed ${ctx.noteDate})` : ''}`);
        }
        res.status = res.lack.length ? 'partial' : 'covered';
        res.letter = `"${line}"` + (res.lack.length
            ? ` [MISS — the chart line does not state: ${res.lack.map((c) => COMPONENT_LABEL[c]).join(', ')}. Add it from the record; do not attest.]`
            : '');
        return res;
    };

    if (/\b(?:inject\w*|corticosteroid|steroid|intra-?articular|epidural|nerve block)\b/i.test(item)) {
        return lineRule('injection', (l) => /\b(?:inject\w*|corticosteroid|steroid|intra-?articular|epidural|block)\b/i.test(l), ['date'], 'injection');
    }
    if (NSAID_RE.test(item) || /\b(?:medication|drug|pharmacolog\w*|analgesic|opioid|muscle relaxant|gabapentin|duloxetine|acetaminophen)\b/i.test(item)) {
        const nsaid = NSAID_RE.test(item);
        return lineRule('medication',
            (l) => (nsaid ? NSAID_RE.test(l) : COMPONENT_DETECT.dose(l)) && !/\binject/i.test(l),
            ['agent', 'dose', 'duration', 'reason'], nsaid ? 'NSAID trial' : 'medication trial');
    }
    if (/\b(?:order|prescription|referral|rx)\b/i.test(item)) {
        res.rule = 'order';
        const file = ctx.attachments.find((a) => /order|rx|prescription|referral/i.test(a));
        const needUnits = /\bunits?\b/i.test(item);
        const needSigned = /\bsigned\b/i.test(item);
        const pairs = parseCptPairs(`CPT ${String(ctx.cpt || '').replace(/,\s*/g, '\nCPT ')}`).pairs;
        const unitsOk = pairs.length > 0 && pairs.every((p) => p.units);
        if (file) res.have.push('order attachment'); else res.lack.push('order attachment');
        if (needSigned) {
            if (file && /sign/i.test(file)) res.have.push('signed');
            else if (file) res.checks.push(`confirm ${file} is signed (the file name does not say so)`);
        }
        if (needUnits) (unitsOk ? res.have : res.lack).push('unit counts');
        res.status = res.lack.length ? (res.have.length ? 'partial' : 'missing') : 'covered';
        const parts = [];
        if (file) parts.push(`Attached: ${file}.`);
        if (needUnits && unitsOk) parts.push(`Units on the chart order: ${ctx.cpt}.`);
        if (res.lack.length) parts.push(`[MISS — not in the chart facts in RAM: ${res.lack.join(', ')}. Attach or quote it; do not attest.]`);
        res.letter = parts.join(' ');
        return res;
    }
    if (/\b(?:home exercise|hep|home program|physical therapy|pt trial|exercise program)\b/i.test(item)) {
        return lineRule('exercise', (l) => /\b(?:home|exercise|physical therapy|pt)\b/i.test(l) && !/\binject/i.test(l), ['duration'], 'home-exercise or therapy');
    }
    if (/\b(?:progress note|office note|clinical note|visit note|chart note|records?|documentation)\b/i.test(item)) {
        res.rule = 'note';
        const file = ctx.attachments.find((a) => /note|record/i.test(a));
        res.status = file ? 'covered' : 'missing';
        if (file) res.have.push('note attachment'); else res.lack.push('note attachment');
        res.letter = file ? `Attached: ${file}${ctx.noteDate ? ` (signed ${ctx.noteDate})` : ''}.` : missLine('no clinical note attachment named on the chart.');
        return res;
    }
    if (/\b(?:x-?ray|radiograph|mri|ct|imaging|ultrasound)\b/i.test(item)) {
        res.rule = 'imaging';
        const file = ctx.attachments.find((a) => /x-?ray|radiograph|mri|imaging|ct[_-]|ultrasound/i.test(a));
        res.status = file ? 'covered' : 'missing';
        res.letter = file ? `Attached: ${file}.` : missLine('no imaging report named on the chart.');
        return res;
    }
    if (/letter of medical necessity|\blmn\b/i.test(item)) {
        res.rule = 'lmn';
        const file = ctx.attachments.find((a) => /lmn|necessity|letter/i.test(a));
        res.status = file ? 'covered' : 'missing';
        res.letter = file ? `Attached: ${file}.` : missLine('no letter of medical necessity named on the chart.');
        return res;
    }
    res.letter = missLine('DeskGate could not match this request to a chart fact in RAM.');
    res.label = label;
    return res;
}

/**
 * Build an appeal from quoted RAM facts only.
 * text   -> payer-facing letter staged into the appeal box ([MISS] markers stay until a human fills them)
 * review -> panel-only checklist (never typed into the portal)
 */
export function draftAppealFromRam(facts = {}, denial = {}) {
    const used = [];
    const missing = [];
    const checks = [];
    const miss = (key, what) => {
        if (!missing.includes(key)) missing.push(key);
        return `[MISS — ${what || key + ' not in RAM'}. Do not attest.]`;
    };
    const val = (key, v, what) => {
        if (v && !isSentinelValue(v)) {
            if (!used.includes(key)) used.push(key);
            return clean(v);
        }
        return miss(key, what);
    };

    const xrows = crossCheckLetterVsChart(facts, denial);
    const idMismatch = identityMismatches(xrows);
    const cptMismatch = xrows.filter((r) => r.key === 'cpt' && r.status === 'mismatch');

    const pick = (k) => facts[k] || denial[k] || '';
    const ref = preferredTrackingId(denial.tracking_id, facts.tracking_id);
    const trials = splitTrials(facts.trial_lines && facts.trial_lines.length ? facts.trial_lines : facts.prev);
    const attachments = String(facts.attachments || '').split(/,\s*/).map(clean).filter(Boolean);
    const noteDate = facts.note_date || '';
    const ctx = { trials, attachments, cpt: facts.cpt || '', noteDate, usedTrials: new Set() };

    const L = [];
    L.push(`Re: Request for reconsideration — payer reference ${val('tracking_id', ref, 'payer reference not in RAM; copy it from the letter')}` +
        (denial.denial_code ? ` (denial code ${clean(denial.denial_code)})` : ''));
    L.push(`Patient: ${val('patient_name', pick('patient_name'))} | DOB: ${val('dob', pick('dob'))} | Member ID: ${val('member_id', pick('member_id'))}`);
    L.push(`Requested: ${val('cpt', denial.cpt || facts.cpt)} | Diagnoses: ${val('icd10', facts.icd10 || denial.icd10)} | Rendering NPI: ${val('npi', facts.npi)}`);
    L.push('');
    L.push(`The determination states: ${denial.denial_reason ? `"${clean(denial.denial_reason)}"` : miss('denial_reason', 'denial reason not in RAM; READ the payer letter first')}`);
    if (denial.denial_reason) used.push('denial_reason');
    if (denial.policy_cite) {
        L.push(`Policy cited: "${clean(denial.policy_cite)}"`);
        used.push('policy_cite');
    }
    L.push('');

    const items = splitRequestedItems(denial.missing_items);
    const evaluated = items.map((it) => evaluateRequestedItem(it, ctx));
    const noteFile = attachments.find((a) => /note|progress/i.test(a));
    const who = facts.provider_name ? ` by ${clean(facts.provider_name)}${facts.npi ? ` (NPI ${facts.npi})` : ''}` : '';

    if (evaluated.length) {
        const source = noteDate ? `the progress note signed ${noteDate}${who}` : `the chart${who}`;
        L.push(`The documentation the determination lists as missing is quoted below from ${source}${noteFile ? ', which is attached' : ''}.`);
        L.push('');
        evaluated.forEach((ev, i) => {
            const heading = ev.item.charAt(0).toUpperCase() + ev.item.slice(1);
            L.push(`${i + 1}. ${heading}:`);
            L.push(ev.letter);
            L.push('');
            if (ev.status !== 'covered') {
                const key = `item_${i + 1}`;
                if (!missing.includes(key)) missing.push(key);
            }
            ev.checks.forEach((c) => checks.push(`Item ${i + 1}: ${c}`));
        });
        const others = trials.filter((t) => !ctx.usedTrials.has(t));
        if (others.length) {
            L.push('Also documented in the same note:');
            others.forEach((t) => L.push(`"${t}"`));
            L.push('');
        }
    } else {
        L.push('Conservative therapy documented on the chart:');
        if (trials.length) {
            trials.forEach((t) => L.push(`"${t}"`));
            used.push('prev');
        } else {
            L.push(miss('prev', 'no conservative-therapy lines in RAM; READ CHART on the progress note'));
        }
        L.push('');
    }

    if (facts.rationale) {
        L.push(`Clinical rationale documented${who || ' on the chart'}:`);
        L.push(`"${clean(facts.rationale)}"`);
        L.push('');
        used.push('rationale');
    } else {
        checks.push('No labeled clinical-rationale line found on the chart.');
    }

    L.push(`Attachments: ${attachments.length ? attachments.join(', ') : miss('attachments', 'no attachments named on the chart')}`);
    if (attachments.length) used.push('attachments');
    L.push('');
    L.push('We request reconsideration of the adverse determination based on the documentation above.');

    if (idMismatch.length) {
        missing.push('identity_mismatch');
    }
    if (cptMismatch.length) {
        checks.push(`CPT/units differ — chart: ${cptMismatch[0].chart}; letter: ${cptMismatch[0].letter}.`);
    }

    const R = [];
    R.push('REVIEW (panel only — not typed into the portal)');
    if (evaluated.length) {
        const covered = evaluated.filter((e) => e.status === 'covered').length;
        R.push(`Payer-requested items: ${evaluated.length} · covered ${covered} · partial ${evaluated.filter((e) => e.status === 'partial').length} · missing ${evaluated.filter((e) => e.status === 'missing').length}`);
        evaluated.forEach((e, i) => {
            const have = e.have.length ? `has ${e.have.map((c) => COMPONENT_LABEL[c] || c).join(', ')}` : '';
            const lack = e.lack.length ? `LACKS ${e.lack.map((c) => COMPONENT_LABEL[c] || c).join(', ')}` : '';
            R.push(`${i + 1}. ${e.status.toUpperCase()} — ${[have, lack].filter(Boolean).join(' · ') || (e.status === 'missing' ? 'no matching chart fact' : 'ok')}`);
        });
    } else {
        R.push('The letter in RAM lists no missing items; all chart trials are quoted.');
    }
    if (xrows.length) {
        R.push('Chart vs letter: ' + xrows.map((r) => {
            if (r.status === 'match') return `${r.label} match`;
            if (r.status === 'mismatch') return `${r.label} MISMATCH (chart ${r.chart} / letter ${r.letter})`;
            return `${r.label} ${r.status === 'chart_only' ? 'chart only' : 'letter only'}`;
        }).join(' · '));
    }
    if (idMismatch.length) R.push('STOP: the letter and the chart in RAM are not the same patient. Nothing should be filed from this draft.');
    R.push(`Miss (${missing.length})${missing.length ? ': ' + missing.join(', ') : ''} · Check (${checks.length})`);
    checks.forEach((c) => R.push(`CHECK: ${c}`));
    R.push('Not a medical-necessity determination. The coordinator edits, attests and clicks Submit on the portal.');

    return {
        text: L.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
        review: R.join('\n'),
        used,
        missing,
        checks,
        items: evaluated,
        crosscheck: xrows,
        identityMismatch: idMismatch.length > 0,
        ok: missing.length === 0,
        kind: 'quoted_ram_draft',
    };
}

/* ---------------- merge + staging ---------------- */

/**
 * Merge extracted facts into RAM.
 * - placeholder values never land ("Not visible", "N/A", "Not", [MISS ...])
 * - opts.fillOnly: only fill keys that are empty in base
 * - opts.keep: Set of keys that must not be overwritten (e.g. values read literally from the DOM)
 */
export function mergeFacts(base, extra, opts = {}) {
    const out = { ...(base || {}) };
    const keep = opts.keep instanceof Set ? opts.keep : null;
    Object.entries(extra || {}).forEach(([k, v]) => {
        if (v == null || v === '' || isSentinelValue(v)) return;
        const has = out[k] != null && out[k] !== '' && !isSentinelValue(out[k]);
        if (has && opts.fillOnly) return;
        if (has && keep && keep.has(k)) return;
        out[k] = v;
    });
    Object.keys(out).forEach((k) => { if (k !== 'tracking_id' && isSentinelValue(out[k])) delete out[k]; });
    const tid = opts.fillOnly
        ? preferredTrackingId(base && base.tracking_id, extra && extra.tracking_id)
        : preferredTrackingId(extra && extra.tracking_id, base && base.tracking_id, out.tracking_id);
    if (tid) out.tracking_id = tid;
    else delete out.tracking_id;
    return out;
}

export function matchFieldsToFacts(domFields, facts) {
    const actions = [];
    if (!Array.isArray(domFields) || !facts) return actions;
    const usedSelectors = new Set();

    for (const field of domFields) {
        if (field.readonly || field.disabled) continue;
        const searchBlob = `${field.selector || ''} ${field.label || ''} ${field.type || ''}`.toLowerCase();

        let matchedKey = null;
        let highestScore = 0;

        for (const [canonicalKey, aliases] of Object.entries(FIELD_KEY_ALIASES)) {
            for (const alias of aliases) {
                if (searchBlob.includes(alias) && alias.length > highestScore) {
                    highestScore = alias.length;
                    matchedKey = canonicalKey;
                }
            }
        }

        if (!matchedKey || usedSelectors.has(field.selector)) continue;
        const value = facts[matchedKey];
        if (value == null || value === '' || isSentinelValue(value)) continue;
        if (matchedKey === 'tracking_id' && !looksLikeTrackingId(value)) continue;
        // Never overwrite what is already in a text box (the button maps onto EMPTY fields).
        if (field.tag !== 'select' && field.empty === false) {
            actions.push({ action: 'skip_filled', selector: field.selector, field_hint: matchedKey, label: field.label });
            usedSelectors.add(field.selector);
            continue;
        }
        usedSelectors.add(field.selector);
        actions.push({
            action: 'type_text',
            selector: field.selector,
            field_hint: matchedKey,
            key: matchedKey,
            text: String(value),
        });
    }
    return actions;
}

export const stageActionsFromInventory = matchFieldsToFacts;

export function leftoverHintActions(facts = {}, already = []) {
    const actions = [];
    const skip = new Set();
    if (facts.patient_name || already.some((a) => /f_name|patient name|full name/i.test(`${a.selector} ${a.field_hint} ${a.label}`))) {
        skip.add('patient_first_name');
        skip.add('patient_last_name');
    }
    Object.entries(DEFAULT_HINTS).forEach(([key, hint]) => {
        if (!facts[key] || isSentinelValue(facts[key]) || skip.has(key)) return;
        if (key === 'tracking_id' && !looksLikeTrackingId(facts[key])) return;
        const covered = already.some((a) => {
            const blob = `${a.selector || ''} ${a.field_hint || ''} ${a.label || ''}`.toLowerCase();
            return (FIELD_KEY_ALIASES[key] || []).some((al) => blob.includes(al));
        });
        if (covered) return;
        actions.push({ action: 'type_text', field_hint: hint, key, text: facts[key] });
    });
    return actions;
}
