'use strict';

const crypto = require('crypto');

/** Eastern — matches typical Pokémon TCG restock scouting for VA / MD corridors */
const TZ = 'America/New_York';

/** Fewer than this many distinct ET calendar-day alerts → insufficient for modeling */
const MIN_UNIQUE_DAYS = 3;
const RECENCY_HALF_LIFE_DAYS = 45;
const RECENCY_WEIGHT_FLOOR = 0.2;
const RECENT_WINDOW_DAYS = 90;
const MAX_CONFIDENCE_SCORE = 85;

function timestampForRow(row) {
    const iso = row.approved_at || row.created_at;
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

function dayKeyET(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function weekdayLongET(date) {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ }).format(date);
}

const WEEKDAY_SORT = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Fun emoji accents for historical weekday histograms in Discord embeds. */
const WEEKDAY_EMOJI = {
    Monday: '🔷',
    Tuesday: '🗓️',
    Wednesday: '✨',
    Thursday: '⚡',
    Friday: '🎯',
    Saturday: '☀️',
    Sunday: '🌙'
};

/**
 * Past alert weekdays: one compact bullet row per weekday (newline between rows).
 * @param {Date[]} dayDatesSortedAscending
 */
function historicalRestockDaysLine(dayDatesSortedAscending) {
    const dows = dayDatesSortedAscending.map((d) => weekdayLongET(d));
    const counts = {};
    for (const w of dows) counts[w] = (counts[w] || 0) + 1;
    const entries = Object.entries(counts).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return WEEKDAY_SORT.indexOf(a[0]) - WEEKDAY_SORT.indexOf(b[0]);
    });
    const rows = entries.map(([day, n]) => {
        const em = WEEKDAY_EMOJI[day] || '📅';
        const short = day.slice(0, 3);
        /** Indented so bullets sit to the right of the section label visually */
        return `      • **${short}** — **×${n}** ${em}`;
    });
    return rows.join('\n');
}

function hourET(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: TZ
    }).formatToParts(date);
    return parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
}

function timeWindowLabel(date) {
    const h = hourET(date);
    if (h >= 0 && h < 6) return 'Night (12am–6am ET)';
    if (h < 12) return 'Morning (6am–12pm ET)';
    if (h < 18) return 'Afternoon (12pm–6pm ET)';
    return 'Evening (6pm–12am ET)';
}

function displayStoreName(row) {
    const s = (row.store || '').trim();
    const l = (row.location || '').trim();
    if (s) return s;
    return l || null;
}

function modeOf(arr) {
    if (!arr.length) return '—';
    const counts = {};
    for (const x of arr) counts[x] = (counts[x] || 0) + 1;
    let best = arr[0];
    let mx = -1;
    for (const k of Object.keys(counts)) {
        if (counts[k] > mx) {
            mx = counts[k];
            best = k;
        }
    }
    return best;
}

function daysAgo(date, nowMs = Date.now()) {
    return Math.max(0, (nowMs - date.getTime()) / 86400000);
}

/**
 * Recent alerts should matter more because retail cadence changes over time.
 * Half-life 45d means a report from ~45d ago counts about half as much as today,
 * while the floor prevents older history from disappearing completely.
 */
function recencyWeight(date, nowMs = Date.now()) {
    const age = daysAgo(date, nowMs);
    const weight = Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS);
    return Math.max(RECENCY_WEIGHT_FLOOR, weight);
}

function weightedModeOfDates(dates, labelFn) {
    if (!dates.length) return '—';
    const nowMs = Date.now();
    const weights = {};
    const latestSeen = {};
    for (const d of dates) {
        const label = labelFn(d);
        weights[label] = (weights[label] || 0) + recencyWeight(d, nowMs);
        latestSeen[label] = Math.max(latestSeen[label] || 0, d.getTime());
    }

    let best = labelFn(dates[dates.length - 1]);
    let bestWeight = -1;
    for (const label of Object.keys(weights)) {
        const w = weights[label];
        if (w > bestWeight || (w === bestWeight && latestSeen[label] > (latestSeen[best] || 0))) {
            best = label;
            bestWeight = w;
        }
    }
    return best;
}

function weightedConsensusOfDates(dates, labelFn) {
    if (!dates.length) return 0;
    const nowMs = Date.now();
    const weights = {};
    let total = 0;
    for (const d of dates) {
        const label = labelFn(d);
        const w = recencyWeight(d, nowMs);
        weights[label] = (weights[label] || 0) + w;
        total += w;
    }
    return total ? Math.max(...Object.values(weights)) / total : 0;
}

function weightedLabelProfile(dates, labelFn) {
    if (!dates.length) return { label: '—', consensus: 0, totalWeight: 0, weights: {} };
    const nowMs = Date.now();
    const weights = {};
    const latestSeen = {};
    let totalWeight = 0;
    for (const d of dates) {
        const label = labelFn(d);
        const w = recencyWeight(d, nowMs);
        weights[label] = (weights[label] || 0) + w;
        latestSeen[label] = Math.max(latestSeen[label] || 0, d.getTime());
        totalWeight += w;
    }

    let label = labelFn(dates[dates.length - 1]);
    let bestWeight = -1;
    for (const k of Object.keys(weights)) {
        const w = weights[k];
        if (w > bestWeight || (w === bestWeight && latestSeen[k] > (latestSeen[label] || 0))) {
            label = k;
            bestWeight = w;
        }
    }
    return {
        label,
        consensus: totalWeight ? bestWeight / totalWeight : 0,
        totalWeight,
        weights
    };
}

function mean(nums) {
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function weightedMeanIntervals(intervals, dates) {
    if (!intervals.length) return null;
    const nowMs = Date.now();
    let total = 0;
    let weightTotal = 0;
    for (let i = 0; i < intervals.length; i++) {
        /** A huge gap usually means old cadence went stale, not that the next restock takes months. */
        if (intervals[i] > RECENT_WINDOW_DAYS) continue;
        /** Weight an interval by the newer report in that interval. */
        const w = recencyWeight(dates[i + 1], nowMs);
        total += intervals[i] * w;
        weightTotal += w;
    }
    return weightTotal ? total / weightTotal : null;
}

function intervalStats(dates) {
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i].getTime() - dates[i - 1].getTime()) / 86400000);
    }
    const cadenceIntervals = intervals.filter((x) => x <= RECENT_WINDOW_DAYS);
    return {
        intervals,
        avgDays: intervals.length ? round1(mean(intervals)) : null,
        medianDays: intervals.length ? round1(median(intervals)) : null,
        recentWeightedAvgDays: intervals.length ? round1(weightedMeanIntervals(intervals, dates)) : null,
        cadenceConsistency: cadenceIntervals.length >= 2 ? Math.max(0, 1 - Math.min(1, varianceCoeff(cadenceIntervals))) : 0.45
    };
}

function buildRegionProfile(allDatesSortedAscending) {
    const stats = intervalStats(allDatesSortedAscending);
    return {
        totalDays: allDatesSortedAscending.length,
        recentDays: allDatesSortedAscending.filter((d) => daysAgo(d) <= RECENT_WINDOW_DAYS).length,
        dayProfile: weightedLabelProfile(allDatesSortedAscending, weekdayLongET),
        timeProfile: weightedLabelProfile(allDatesSortedAscending, timeWindowLabel),
        ...stats
    };
}

function chooseBlendedDay(storeProfile, regionProfile, minStoreConsensus = 0.42) {
    if (!regionProfile || regionProfile.totalDays < MIN_UNIQUE_DAYS) return storeProfile.label;
    if (storeProfile.consensus >= minStoreConsensus) return storeProfile.label;

    const regionStrong = regionProfile.dayProfile?.consensus >= 0.45;
    if (!regionStrong) return storeProfile.label;

    /** Region only breaks weak store ties; it should not overwhelm clear store-specific history. */
    return regionProfile.dayProfile?.label || storeProfile.label;
}

function chooseBlendedTime(storeProfile, regionProfile) {
    if (!regionProfile || regionProfile.totalDays < MIN_UNIQUE_DAYS) return storeProfile.label;
    if (storeProfile.consensus >= 0.42) return storeProfile.label;
    if (regionProfile.timeProfile?.consensus >= 0.45) return regionProfile.timeProfile.label;
    return storeProfile.label;
}

function blendGapDays(storeStats, regionProfile) {
    const storeGap = storeStats.recentWeightedAvgDays ?? storeStats.medianDays ?? storeStats.avgDays;
    if (!regionProfile || !regionProfile.recentWeightedAvgDays) return storeGap;
    if (storeStats.intervals.length >= 4 && storeStats.cadenceConsistency >= 0.35) return storeGap;
    if (storeGap == null) return regionProfile.recentWeightedAvgDays;

    /** Small-store histories get a small regional prior so one weird gap does not dominate. */
    const storeWeight = Math.min(0.8, Math.max(0.45, storeStats.intervals.length / 6));
    return round1(storeGap * storeWeight + regionProfile.recentWeightedAvgDays * (1 - storeWeight));
}

function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round1(n) {
    return Math.round(n * 10) / 10;
}

function varianceCoeff(nums) {
    const m = mean(nums);
    if (m == null || m === 0) return 1;
    const v = nums.reduce((acc, x) => acc + (x - m) ** 2, 0) / nums.length;
    return Math.sqrt(v) / Math.abs(m);
}

function confidenceFrom(uniqueDays, intervals, timestampsSorted) {
    if (uniqueDays < MIN_UNIQUE_DAYS) return null;
    let score = Math.round((1 - Math.exp(-uniqueDays / 18)) * 55 + 25);
    if (intervals.length >= 2) {
        const cv = varianceCoeff(intervals);
        score += Math.round(Math.max(0, 35 - cv * 45));
    } else {
        score += 6;
    }
    const nowMs = Date.now();
    const recent = timestampsSorted.filter((t) => daysAgo(t, nowMs) <= RECENT_WINDOW_DAYS);
    const newestAge = daysAgo(timestampsSorted[timestampsSorted.length - 1], nowMs);
    const dayConsensus = weightedConsensusOfDates(timestampsSorted, weekdayLongET);
    const timeConsensus = weightedConsensusOfDates(timestampsSorted, timeWindowLabel);

    if (recent.length === 0) score -= 24;
    else if (recent.length >= 4) score += 14;
    else if (recent.length >= 2) score += 8;

    if (newestAge > 120) score -= 18;
    else if (newestAge <= 30) score += 8;

    score += Math.round(Math.max(0, dayConsensus - 0.4) * 22);
    score += Math.round(Math.max(0, timeConsensus - 0.4) * 16);

    return Math.min(MAX_CONFIDENCE_SCORE, Math.max(1, score));
}

function confidenceFromSignals(uniqueDays, storeStats, timestampsSorted, dayProfile, timeProfile, regionProfile) {
    let score = confidenceFrom(uniqueDays, storeStats.intervals, timestampsSorted);
    const nowMs = Date.now();
    const newestAge = daysAgo(timestampsSorted[timestampsSorted.length - 1], nowMs);
    const recentCount = timestampsSorted.filter((t) => daysAgo(t, nowMs) <= RECENT_WINDOW_DAYS).length;

    score += Math.round(storeStats.cadenceConsistency * 18);
    score += Math.round(dayProfile.consensus * 14);
    score += Math.round(timeProfile.consensus * 10);

    if (storeStats.recentWeightedAvgDays && storeStats.medianDays) {
        const diff = Math.abs(storeStats.recentWeightedAvgDays - storeStats.medianDays);
        if (diff <= 2) score += 8;
        else if (diff >= 14) score -= 8;
    }

    if (regionProfile?.dayProfile?.label === dayProfile.label && regionProfile.dayProfile.consensus >= 0.4) score += 5;
    if (regionProfile?.timeProfile?.label === timeProfile.label && regionProfile.timeProfile.consensus >= 0.4) score += 4;

    if (recentCount < 2) score -= 10;
    if (newestAge > 150) score -= 15;

    /** Avoid overconfidence with thin store histories even if regional signals look strong. */
    let cap = MAX_CONFIDENCE_SCORE;
    if (uniqueDays < 4) cap = 58;
    else if (uniqueDays < 6) cap = 70;
    else if (uniqueDays < 8) cap = 78;

    const multipleSignalsAgree =
        uniqueDays >= 6 &&
        recentCount >= 3 &&
        dayProfile.consensus >= 0.45 &&
        timeProfile.consensus >= 0.45 &&
        storeStats.cadenceConsistency >= 0.35;

    if (!multipleSignalsAgree) cap = Math.min(cap, 78);

    return Math.min(cap, Math.max(1, Math.round(score)));
}

function confidenceLabel(score) {
    if (score >= 90) return 'Very Strong';
    if (score >= 80) return 'Strong';
    if (score >= 50) return 'Medium';
    return 'Low';
}

function predictionReason({ dayProfile, timeProfile, storeStats, regionProfile, recentCount }) {
    const reasons = [];

    if (storeStats.recentWeightedAvgDays || storeStats.medianDays) {
        reasons.push('recent restock intervals');
    }
    if (timeProfile.consensus >= 0.42) {
        const simpleTime = String(timeProfile.label).split('(')[0].trim().toLowerCase();
        reasons.push(`common ${simpleTime} activity`);
    } else {
        reasons.push('time-of-day history');
    }
    if (dayProfile.consensus >= 0.42) {
        reasons.push('repeated weekday patterns');
    } else {
        reasons.push('store-specific history');
    }
    if (regionProfile?.recentDays >= 5) {
        reasons.push('regional trend data');
    }
    if (recentCount >= 3) {
        reasons.push('recent confirmed reports');
    }

    return `Based on ${[...new Set(reasons)].slice(0, 4).join(', ')}.`;
}

function formatRangeET(start, end) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function predictedWindow(lastDate, gapDaysRounded) {
    if (!lastDate || gapDaysRounded == null || !Number.isFinite(gapDaysRounded) || gapDaysRounded <= 0) return '—';
    const gap = gapDaysRounded;
    const nextCenterMs = lastDate.getTime() + gap * 86400000;
    const nextCenter = new Date(nextCenterMs);
    const fuzz = Math.min(14, Math.max(2, round1(gap * 0.22)));
    const start = new Date(nextCenterMs - fuzz * 86400000);
    const end = new Date(nextCenterMs + fuzz * 86400000);
    return `${formatRangeET(start, end)} *(model: ~${gap} days cadence)*`;
}

function trendLabel(timestampsSorted) {
    const now = Date.now();
    const cut = 45 * 86400000;
    const recent = timestampsSorted.filter((t) => now - t.getTime() <= cut && now >= t.getTime());
    const prev = timestampsSorted.filter((t) => {
        const dt = now - t.getTime();
        return dt > cut && dt <= 2 * cut;
    });
    const a = recent.length;
    const b = prev.length;
    if (a === 0 && b === 0) return '—';
    if (b === 0 && a > 0) return '📈 Active in last 45d (no baseline prior)';
    if (a > b * 1.3) return '📈 More frequent vs prior 45d';
    if (b > a * 1.3) return '📉 Fewer sightings vs prior 45d';
    return '➖ Comparable last two 45‑day spans';
}

/**
 * Build stats for one store label from sorted unique-day timestamps.
 * @param {string} region 'VA' | 'MD'
 * @param {string} displayName
 * @param {Date[]} dayDatesSortedAscending
 * @param {ReturnType<typeof buildRegionProfile>} regionProfile
 */
function computeStoreStats(region, displayName, dayDatesSortedAscending, regionProfile) {
    const n = dayDatesSortedAscending.length;
    if (n < MIN_UNIQUE_DAYS) {
        return {
            ok: false,
            displayName,
            region,
            uniqueDays: n
        };
    }

    const storeStats = intervalStats(dayDatesSortedAscending);
    const intervals = storeStats.intervals;
    const avgDays = storeStats.avgDays;
    const medDays = storeStats.medianDays;
    const recentWeightedAvgDays = storeStats.recentWeightedAvgDays;
    const gapForForecast = blendGapDays(storeStats, regionProfile);

    const last = dayDatesSortedAscending[n - 1];
    const dayProfile = weightedLabelProfile(dayDatesSortedAscending, weekdayLongET);
    const timeProfile = weightedLabelProfile(dayDatesSortedAscending, timeWindowLabel);
    const predictedDay = chooseBlendedDay(dayProfile, regionProfile);
    const predictedTimeWindow = chooseBlendedTime(timeProfile, regionProfile);
    const recentCount = dayDatesSortedAscending.filter((d) => daysAgo(d) <= RECENT_WINDOW_DAYS).length;

    const conf = confidenceFromSignals(n, storeStats, dayDatesSortedAscending, dayProfile, timeProfile, regionProfile);
    const windowStr = predictedWindow(last, gapForForecast);
    const tr = trendLabel(dayDatesSortedAscending);

    const timeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });

    return {
        ok: true,
        displayName,
        region,
        lastRestockISO: last.toISOString(),
        lastRestockPlain: `${weekdayLongET(last)} · ${timeFmt.format(last)} ET`,
        mostCommonDay: predictedDay,
        mostCommonTimeWindow: predictedTimeWindow,
        historicalRestockDaysLine: historicalRestockDaysLine(dayDatesSortedAscending),
        avgDaysBetweenRests: avgDays,
        recentWeightedAvgDaysBetweenRests: recentWeightedAvgDays,
        medianDaysBetweenRests: medDays,
        predictedNextWindow: windowStr,
        confidenceScore: conf,
        confidenceLabel: confidenceLabel(conf),
        predictionReason: predictionReason({
            dayProfile,
            timeProfile,
            storeStats,
            regionProfile,
            recentCount
        }),
        signalBreakdown: {
            dayConsensus: round1(dayProfile.consensus * 100),
            timeConsensus: round1(timeProfile.consensus * 100),
            cadenceConsistency: round1(storeStats.cadenceConsistency * 100),
            recentReports: recentCount,
            regionDay: regionProfile?.dayProfile?.label || '—',
            regionTime: regionProfile?.timeProfile?.label || '—'
        },
        trendLabel: tr,
        historicalUniqueDaysUsed: n,
        intervalSamplesUsed: intervals.length
    };
}

function sortedDayDates(dayMap) {
    return [...dayMap.values()].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * @param {any[]} rows
 */
function groupRows(rows) {
    /** @type {Map<string, Map<string, Date>>} */
    const byStoreDays = new Map();
    /** @type {Map<string, number>} */
    const rawCounts = new Map();

    for (const row of rows) {
        const name = displayStoreName(row);
        if (!name) continue;

        const ts = timestampForRow(row);
        if (!ts) continue;

        rawCounts.set(name, (rawCounts.get(name) || 0) + 1);
        const dk = dayKeyET(ts);

        if (!byStoreDays.has(name)) byStoreDays.set(name, new Map());
        const m = byStoreDays.get(name);
        const prev = m.get(dk);
        if (!prev || ts < prev) m.set(dk, ts);
    }

    return { byStoreDays, rawCounts };
}

/**
 * Analyze all rows for a region (exact match `VA` or `MD` in Supabase).
 */
function analyzeRegion(rows, region) {
    const { byStoreDays, rawCounts } = groupRows(rows);
    const allRegionDates = [];
    for (const dayMap of byStoreDays.values()) {
        allRegionDates.push(...sortedDayDates(dayMap));
    }
    allRegionDates.sort((a, b) => a.getTime() - b.getTime());
    const regionProfile = buildRegionProfile(allRegionDates);

    /** @type {any[]} */
    const predictions = [];
    /** @type {Array<{displayName:string,uniqueDays:number,raw:number}>} */
    const insufficient = [];

    for (const [displayName, dayMap] of byStoreDays) {
        const sortedDates = sortedDayDates(dayMap);
        const raw = rawCounts.get(displayName) || 0;
        const st = computeStoreStats(region, displayName, sortedDates, regionProfile);
        if (st.ok) {
            predictions.push({ ...st, rawRowsApprox: raw });
        } else {
            insufficient.push({ displayName, uniqueDays: st.uniqueDays, raw });
        }
    }

    predictions.sort((a, b) => {
        const d = (b.historicalUniqueDaysUsed ?? 0) - (a.historicalUniqueDaysUsed ?? 0);
        if (d !== 0) return d;
        return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
    });

    insufficient.sort((x, y) => y.uniqueDays - x.uniqueDays || y.raw - x.raw);

    return { predictions, insufficient };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function fetchRestockRows(supabase, tableName, region) {
    const pageSize = 800;
    const all = [];
    let from = 0;
    for (;;) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from(tableName)
            .select('store, location, approved_at, created_at, region')
            .eq('region', region)
            .order('created_at', { ascending: true })
            .range(from, to);

        if (error) throw new Error(error.message || String(error.code));

        const chunk = data || [];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
    }

    return all;
}

/** Slug for Discord StringSelect `.values` ≤ 100 chars */
function makeStoreSlug(region, displayName) {
    return crypto.createHash('sha256').update(`${region}|${displayName}`).digest('base64url').slice(0, 48);
}

/** @typedef {'target'|'walmart'|'bestbuy'|'barnesandnoble'} RetailerKey */

const RETAIL_KEYS = /** @type {const} */ ([
    'target',
    'walmart',
    'bestbuy',
    'barnesandnoble'
]);

const RETAIL_MATCHERS = {
    target: (n) => /^\s*target\b/i.test(n),
    walmart: (n) => /^\s*walmart\b/i.test(n),
    bestbuy: (n) => /^\s*best\s*buy\b/i.test(n) || /^\s*bestbuy\b/i.test(n),
    barnesandnoble: (n) =>
        /^\s*barnes\b/i.test(n) || /\bb\s*&\s*n\b/i.test(n) || /\bbarnes\b.*\bnoble\b/i.test(n)
};

/**
 * Whether a grouped store label belongs to one of our tracked chains (prefix-style names in alerts).
 * @param {string} displayName
 * @param {RetailerKey} key
 */
function matchesRetailer(displayName, key) {
    const n = displayName ?? '';
    const fn = RETAIL_MATCHERS[key];
    return !!(fn && fn(n));
}

/**
 * @param {{predictions:any[], insufficient:any[]}} analyzed
 * @param {RetailerKey} retailerKey
 */
function filterAnalyzedByRetailer(analyzed, retailerKey) {
    if (!RETAIL_KEYS.includes(retailerKey)) return analyzed;
    return {
        predictions: analyzed.predictions.filter((p) => matchesRetailer(p.displayName, retailerKey)),
        insufficient: analyzed.insufficient.filter((s) => matchesRetailer(s.displayName, retailerKey))
    };
}

module.exports = {
    TZ,
    MIN_UNIQUE_DAYS,
    RETAIL_KEYS,
    analyzeRegion,
    fetchRestockRows,
    computeStoreStats,
    displayStoreName,
    makeStoreSlug,
    matchesRetailer,
    filterAnalyzedByRetailer
};
