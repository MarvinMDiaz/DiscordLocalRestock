/**
 * Temporary diagnostic: compare config VA Target catalog strings to restock_history rows.
 *
 * Usage (from repo root):
 *   node scripts/debug-restock-history-matching.js
 *
 * Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY),
 * optional RESTOCK_ALERTS_TABLE (default restock_history).
 * Does not print secrets.
 */

'use strict';

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const CONFIG_PATH = path.join(__dirname, '../config/config.json');
const TABLE = process.env.RESTOCK_ALERTS_TABLE?.trim() || 'restock_history';
const REGION = 'VA';
const RECENT_LIMIT = 200;

function requireEnv(name) {
    const v = process.env[name];
    if (!v || String(v).trim() === '') {
        throw new Error(`Missing ${name} in .env`);
    }
    return v.trim();
}

function normalizeAddr(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Catalog format: "Target - StoreNick - Full address" */
function catalogAddress(catalogLine) {
    const parts = String(catalogLine).split(' - ');
    if (parts.length < 3) return '';
    return parts.slice(2).join(' - ').trim();
}

function catalogShortName(catalogLine) {
    const parts = String(catalogLine).split(' - ');
    if (parts.length < 2) return '';
    return parts[1].trim();
}

/** a: exact full catalog === db.store */
function matchExactCatalogStore(catalogLine, row) {
    return String(row.store || '').trim() === String(catalogLine).trim();
}

/** b: catalog address === db.location */
function matchExactLocation(catalogLine, row) {
    const addr = catalogAddress(catalogLine);
    const loc = String(row.location || '').trim();
    return addr && loc && addr === loc;
}

/** c: normalized address */
function matchNormalizedLocation(catalogLine, row) {
    const a = normalizeAddr(catalogAddress(catalogLine));
    const b = normalizeAddr(row.location);
    return a.length > 5 && b.length > 5 && a === b;
}

/** d: loose — db.store equals catalog short name, or db.store is prefix of first segment, or concat match */
function matchLoose(catalogLine, row) {
    const ds = String(row.store || '').trim().toLowerCase();
    const short = catalogShortName(catalogLine).toLowerCase();
    const fullLower = String(catalogLine).toLowerCase();
    if (!ds) return false;
    if (ds === short) return true;
    if (fullLower.includes(ds) && ds.length >= 4) return true;
    const combined = `${String(row.store || '').trim()} - ${String(row.location || '').trim()}`.toLowerCase();
    if (combined.length > 10 && fullLower.replace(/\s+/g, ' ') === combined.replace(/\s+/g, ' ')) return true;
    const addr = catalogAddress(catalogLine).toLowerCase();
    const loc = String(row.location || '').trim().toLowerCase();
    if (addr && loc && (addr.includes(loc) || loc.includes(addr))) return true;
    return false;
}

function firstMatchMethods(catalogLine, row) {
    const out = [];
    if (matchExactCatalogStore(catalogLine, row)) out.push('a_exact_catalog_store');
    if (matchExactLocation(catalogLine, row)) out.push('b_exact_location');
    if (matchNormalizedLocation(catalogLine, row)) out.push('c_normalized_location');
    if (matchLoose(catalogLine, row)) out.push('d_loose');
    return out;
}

async function main() {
    const url = requireEnv('SUPABASE_URL');
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
    if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY');

    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    const catalogStores = config.stores?.target?.va || [];

    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: rows, error } = await sb
        .from(TABLE)
        .select('region, store, location, approved_at, created_at')
        .eq('region', REGION)
        .order('approved_at', { ascending: false, nullsFirst: false })
        .limit(RECENT_LIMIT);

    if (error) {
        console.error('Supabase query error:', error.message || error);
        process.exit(1);
    }

    const list = rows || [];
    console.log('');
    console.log('=== restock_history sample (non-secret) ===');
    console.log(`table=${TABLE} region=${REGION} rows_returned=${list.length} (limit ${RECENT_LIMIT})`);
    console.log('');

    const distinctStore = new Set();
    for (const r of list) {
        distinctStore.add(`${r.store} | loc=${r.location || ''}`);
    }
    console.log(`Distinct (store|location) among sample: ${distinctStore.size}`);
    list.slice(0, 15).forEach((r, i) => {
        console.log(
            `${i + 1}. store=${JSON.stringify(r.store)} location=${JSON.stringify(r.location)} approved_at=${r.approved_at || r.created_at}`
        );
    });
    if (list.length > 15) console.log(`   ... ${list.length - 15} more not printed`);

    console.log('');
    console.log('=== per catalog line: match methods vs recent DB rows ===');

    const unmatched = [];
    const methodHit = { a: 0, b: 0, c: 0, d: 0, none: 0 };

    for (const catalogLine of catalogStores) {
        const methodsFound = new Set();
        let sampleRow = null;
        for (const row of list) {
            const ms = firstMatchMethods(catalogLine, row);
            for (const m of ms) {
                methodsFound.add(m);
                if (!sampleRow) sampleRow = row;
            }
        }
        if (methodsFound.size === 0) {
            methodHit.none++;
            unmatched.push(catalogLine);
            console.log(`NO MATCH  | catalog=${JSON.stringify(catalogLine)}`);
        } else {
            if (methodsFound.has('a_exact_catalog_store')) methodHit.a++;
            if (methodsFound.has('b_exact_location')) methodHit.b++;
            if (methodsFound.has('c_normalized_location')) methodHit.c++;
            if (methodsFound.has('d_loose')) methodHit.d++;
            const tag = [...methodsFound].join(',');
            console.log(`OK [${tag}] | catalog=${JSON.stringify(catalogLine.substring(0, 80))}${catalogLine.length > 80 ? '…' : ''}`);
            if (sampleRow) {
                console.log(
                    `         example db row: store=${JSON.stringify(sampleRow.store)} location=${JSON.stringify(sampleRow.location)}`
                );
            }
        }
    }

    console.log('');
    console.log('=== summary ===');
    console.log('catalog lines with at least one match in sample (by method presence):', methodHit);
    console.log(`catalog VA Target count: ${catalogStores.length}`);
    console.log(`unmatched catalog lines: ${unmatched.length}`);
    if (unmatched.length && unmatched.length <= 8) {
        unmatched.forEach((u) => console.log('  -', u));
    } else if (unmatched.length) {
        console.log('  (first 5 unmatched)');
        unmatched.slice(0, 5).forEach((u) => console.log('  -', u));
    }

    console.log('');
    console.log('=== interpretation (for humans) ===');
    console.log(
        'Bot lookup (nlLookupSupabase.js) now tries, in order: (a) exact region+location, (b) normalized location scan, (c) short store label, (d) full catalog as store.'
    );
    console.log(
        'This script still reports a/b/c/d as independent tests against the same sample; use it to verify address strings align with DB `location`.'
    );
    console.log('');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
