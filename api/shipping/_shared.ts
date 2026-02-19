/**
 * Shared shipping utilities — used by create-label.ts and get-rates.ts
 * Extracted to eliminate ~85 lines of duplication per file.
 */

const SHIPPO_API = 'https://api.goshippo.com';

export const STATE_NAMES: Record<string, string> = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
    'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
    'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
    'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
    'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
    'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
    'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
    'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
    'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
    'district of columbia':'DC',
};

const VALID_ABBRS = new Set(Object.values(STATE_NAMES));

export function parseAddress(raw: string) {
    if (!raw || raw.trim().length < 10) return null;
    const cleaned = raw.replace(/\n/g, ', ').replace(/\s+/g, ' ').trim();

    const zipMatch = cleaned.match(/(\d{5}(?:-\d{4})?)\s*$/);
    if (!zipMatch) return null;
    const zip = zipMatch[1];
    let rest = cleaned.slice(0, zipMatch.index).replace(/,?\s*$/, '').trim();
    rest = rest.replace(/,?\s*(?:US|USA|United States)\s*$/i, '').trim();

    let state = '';
    for (const [name, abbr] of Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)) {
        const re = new RegExp('[,\\s]' + name.replace(/ /g, '\\s+') + '\\s*$', 'i');
        const m = rest.match(re);
        if (m) { state = abbr; rest = rest.slice(0, m.index).replace(/,?\s*$/, '').trim(); break; }
    }
    if (!state) {
        const abbrMatch = rest.match(/(?:,\s*|\s+)([A-Z]{2})\s*$/i);
        if (abbrMatch && VALID_ABBRS.has(abbrMatch[1].toUpperCase())) {
            state = abbrMatch[1].toUpperCase();
            rest = rest.slice(0, abbrMatch.index).replace(/,?\s*$/, '').trim();
        }
    }
    if (!state) {
        const z = parseInt(zip.slice(0, 3));
        if (z >= 330 && z <= 349) state = 'FL';
        else if (z >= 100 && z <= 149) state = 'NY';
        else if (z >= 900 && z <= 961) state = 'CA';
        else if (z >= 750 && z <= 799) state = 'TX';
    }
    if (!state) return null;

    const lastComma = rest.lastIndexOf(',');
    let street1: string, city: string;
    if (lastComma > 0) {
        street1 = rest.slice(0, lastComma).trim();
        city = rest.slice(lastComma + 1).trim();
    } else {
        const SUFFIXES = /^(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|ct|court|ln|lane|way|pl|place|cir|circle|ter|terrace|trl|trail|pkwy|parkway|hwy|highway|nw|ne|sw|se|n|s|e|w)$/i;
        const tokens = rest.split(' ');
        let splitIdx = tokens.length;
        for (let i = tokens.length - 1; i >= 0; i--) {
            if (/\d/.test(tokens[i])) { splitIdx = i + 1; break; }
        }
        while (splitIdx < tokens.length && SUFFIXES.test(tokens[splitIdx])) splitIdx++;
        if (splitIdx >= tokens.length) splitIdx = Math.max(1, Math.ceil(tokens.length / 2));
        street1 = tokens.slice(0, splitIdx).join(' ');
        city = tokens.slice(splitIdx).join(' ');
    }

    if (!street1 || !city) return null;
    return { street1, city, state, zip, country: 'US' };
}

export interface ShipFromConfig {
    ship_from_name?: string;
    ship_from_street?: string;
    ship_from_city?: string;
    ship_from_state?: string;
    ship_from_zip?: string;
    ship_from_country?: string;
    ship_from_phone?: string;
    ship_from_email?: string;
}

export function getFromAddress(tenantConfig?: ShipFromConfig) {
    return {
        name: tenantConfig?.ship_from_name || process.env.SHIP_FROM_NAME || '',
        street1: tenantConfig?.ship_from_street || process.env.SHIP_FROM_STREET || '',
        city: tenantConfig?.ship_from_city || process.env.SHIP_FROM_CITY || '',
        state: tenantConfig?.ship_from_state || process.env.SHIP_FROM_STATE || '',
        zip: tenantConfig?.ship_from_zip || process.env.SHIP_FROM_ZIP || '',
        country: tenantConfig?.ship_from_country || process.env.SHIP_FROM_COUNTRY || 'US',
        phone: tenantConfig?.ship_from_phone || process.env.SHIP_FROM_PHONE || '',
        email: tenantConfig?.ship_from_email || process.env.SHIP_FROM_EMAIL || '',
    };
}

export async function shippoPost(endpoint: string, apiKey: string, body: object) {
    const resp = await fetch(`${SHIPPO_API}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `ShippoToken ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Shippo ${endpoint} failed (${resp.status}): ${text}`);
    }
    return resp.json();
}
