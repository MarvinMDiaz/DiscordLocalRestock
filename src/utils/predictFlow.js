'use strict';

const { createClient } = require('@supabase/supabase-js');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');

const svc = require('./predictionService');
const predictStoreCache = require('./predictStoreCache');
const config = require('../../config/config.json');

const RETAIL_KEY_LIST = Array.isArray(svc.RETAIL_KEYS)
    ? svc.RETAIL_KEYS
    : ['target', 'walmart', 'bestbuy', 'barnesandnoble'];

const CFGLOC_RE =
    /^rstk_predict_cfgloc_(VA|MD)_(target|walmart|bestbuy|barnesandnoble)$/;
const ALL_RE = /^rstk_predict_all_(VA|MD)_(target|walmart|bestbuy|barnesandnoble)$/;
const BACK_RETAIL_RE = /^rstk_predict_backRetail_(VA|MD)$/;
const LOCSTEP_RE = /^rstk_predict_locstep_(VA|MD)_(target|walmart|bestbuy|barnesandnoble)$/;

const DISCORD_SELECT_LIMIT = 25;

function resolvePredictChannelId() {
    const raw =
        process.env.PREDICT_CHANNEL_ID?.trim() ||
        (config.channels?.predictRestocks != null ? String(config.channels.predictRestocks).trim() : '') ||
        '1502074614379970620';
    return String(raw);
}

/** Strict string compare — avoids snowflake / env whitespace mismatches. */
function interactionInPredictChannel(interaction) {
    const id = interaction.channelId != null ? String(interaction.channelId) : '';
    return id === resolvePredictChannelId();
}

const CARD_TTL_MS = 40 * 60 * 1000;
/** Tracks ephemeral prediction surfaces: one or more follow-up messages for multi-embed limits. */
/** @type {Map<string, { msgs?: import('discord.js').Message[]; msg?: import('discord.js').Message; ts: number }>} */
const FORECAST_CARD = new Map();

/** Characters summed title/description/footer (+ extras Discord weighs toward ONE webhook POST bundle.) ~combined≤6000 across THAT MESSAGE.*/
/** Combined-character ceilings are intentionally conservative. */
const DISCORD_EMBED_BUNDLE_CHAR_SAFE = 5600;

function forecastCardSlotMessages(slot) {
    if (!slot) return [];
    const fromArr = Array.isArray(slot.msgs) ? slot.msgs.filter(Boolean) : [];
    if (fromArr.length) return fromArr;
    return slot.msg ? [slot.msg] : [];
}

/** Discord counts title + description + footer.text + author + fields across that embed’s embed payload. */
function tallyEmbedTextChars(eb) {
    const x = eb.data;
    let n = 0;
    if (x.title) n += x.title.length;
    if (x.description) n += x.description.length;
    if (x.footer?.text) n += x.footer.text.length;
    if (x.author?.name) n += x.author.name.length;
    if (Array.isArray(x.fields)) {
        for (const f of x.fields) {
            if (f?.name) n += f.name.length;
            if (f?.value) n += f.value.length;
        }
    }
    return n;
}

/** One message may carry several embeds; combined textual length must stay below ~6000. */
function partitionEmbedsForDiscordBundles(embedBuilders, maxBundleChars = DISCORD_EMBED_BUNDLE_CHAR_SAFE) {
    /** @type {import('discord.js').EmbedBuilder[][]} */
    const bundles = [];
    /** @type {import('discord.js').EmbedBuilder[]} */
    let cur = [];
    let sum = 0;
    for (const eb of embedBuilders) {
        const w = tallyEmbedTextChars(eb);
        if (cur.length && sum + w > maxBundleChars) {
            bundles.push(cur);
            cur = [];
            sum = 0;
        }
        cur.push(eb);
        sum += w;
    }
    if (cur.length) bundles.push(cur);
    return bundles;
}

function forecastCardKey(interaction) {
    return `${interaction.user.id}:${interaction.channelId}:${resolvePredictChannelId()}`;
}

function pruneForecastCards() {
    const now = Date.now();
    for (const [k, v] of FORECAST_CARD.entries()) {
        if (now - v.ts > CARD_TTL_MS) FORECAST_CARD.delete(k);
    }
}

async function clearForecastCard(interaction) {
    pruneForecastCards();
    const key = forecastCardKey(interaction);
    const slot = FORECAST_CARD.get(key);
    if (!slot) return;
    FORECAST_CARD.delete(key);
    for (const m of forecastCardSlotMessages(slot)) {
        try {
            await m.delete();
        } catch {
            /* already gone */
        }
    }
}

/** Ephemeral follow-up(s). Multiple bundles because Discord limits combined embed text per message to ~6000 chars. */
async function showOrRefreshForecastCard(interaction, embeds) {
    pruneForecastCards();
    const key = forecastCardKey(interaction);
    const slot = FORECAST_CARD.get(key);

    /** Always replace the whole surface to avoid invalid “edit one message with N embeds” bundles. */
    const oldMsgs = forecastCardSlotMessages(slot);
    FORECAST_CARD.delete(key);
    for (const m of oldMsgs) {
        try {
            await m.delete();
        } catch {
            /* gone */
        }
    }

    if (!embeds?.length) return;

    const bundles = partitionEmbedsForDiscordBundles(embeds);
    /** @type {import('discord.js').Message[]} */
    const msgs = [];
    for (const batch of bundles) {
        msgs.push(await interaction.followUp({ ephemeral: true, embeds: batch, fetchReply: true }));
    }
    FORECAST_CARD.set(key, { msgs, ts: Date.now() });
}

async function acknowledgePublicPredict(interaction, payload) {
    try {
        await interaction.deferReply({ ephemeral: true });
        await clearForecastCard(interaction);
        return interaction.editReply(payload);
    } catch (err) {
        console.error('[predict] public session open failed:', err?.message || err);
        try {
            if (interaction.deferred) {
                return await interaction.editReply({
                    content:
                        'Could not open the next step. Confirm the bot can use **application commands** here, then try again.',
                    embeds: [],
                    components: []
                });
            }
            if (!interaction.replied) {
                return await interaction.reply({
                    content:
                        'Could not open the next step. Confirm the bot role can **Send Messages** here, then try again.',
                    ephemeral: true
                });
            }
        } catch (_) {
            /* ignore */
        }
    }
}

const PREDICT_GENERIC_FAIL =
    'Something went wrong while generating the prediction. Please try again from the **Restock timing** panel.';

/**
 * Acknowledge a component interaction quickly, then clear forecast follow-ups and refresh the wizard message.
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @param {import('discord.js').InteractionEditReplyOptions} payload
 */
async function safeDeferClearEditReply(interaction, payload) {
    try {
        await interaction.deferUpdate();
        await clearForecastCard(interaction);
        return await interaction.editReply(payload);
    } catch (err) {
        console.error('[predict] wizard step failed:', err?.message || err);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: PREDICT_GENERIC_FAIL,
                    embeds: [],
                    components: []
                });
            } else {
                await interaction.reply({ content: PREDICT_GENERIC_FAIL, ephemeral: true });
            }
        } catch (_) {
            /* interaction token expired or already handled */
        }
    }
}

function isPredictWizardMessage(interaction) {
    try {
        const flags = interaction.message?.flags;
        return !!(flags && flags.has(MessageFlags.Ephemeral));
    } catch {
        return false;
    }
}

function tableName() {
    return process.env.RESTOCK_ALERTS_TABLE?.trim() || 'restock_history';
}

function createPredictSupabase() {
    const url = process.env.SUPABASE_URL?.trim();
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();

    if (!url || !key) {
        throw new Error(
            'Prediction requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set on the bot host (server-side only).'
        );
    }
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

function truncate(s, len) {
    if (!s) return '';
    return s.length <= len ? s : `${s.slice(0, Math.max(0, len - 1))}…`;
}

function stripMd(s) {
    return String(s || '—')
        .replace(/\*+/g, '')
        .trim();
}

/** @param {string} k */
function retailLabel(k) {
    switch (k) {
        case 'target':
            return 'Target';
        case 'walmart':
            return 'Walmart';
        case 'bestbuy':
            return 'Best Buy';
        case 'barnesandnoble':
            return 'Barnes & Noble';
        default:
            return k;
    }
}

function regionLong(region) {
    return region === 'VA' ? 'Virginia' : 'Maryland';
}

/** @param {'VA'|'MD'} letter @param {string} retailKey */
function configStoreLines(letter, retailKey) {
    const r = letter === 'VA' ? 'va' : 'md';
    const s = config.stores;
    if (retailKey === 'target') return s?.target?.[r] || [];
    if (retailKey === 'walmart') return s?.walmart?.[r] || [];
    if (retailKey === 'bestbuy') return s?.bestbuy?.[r] || [];
    if (retailKey === 'barnesandnoble') return s?.barnesandnoble?.[r] || [];
    return [];
}

function rootContent() {
    return [
        '**Restock Predictions**',
        'View community-submitted restock activity by region and retailer.',
        '',
        '**What You Can View**',
        '• Regional activity',
        '• Retailer trends',
        '• Store-level report history',
        '• Estimated restock windows',
        '',
        '**Available Regions**',
        '**Virginia**',
        'Higher activity region with more Target and Walmart report history.',
        '',
        '**Maryland**',
        'Growing activity region with developing report patterns.',
        '',
        '**How It Works**',
        'Select a region, choose a retailer, then select a store to view its prediction card.'
    ].join('\n');
}

function publicPanelEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Restock Predictions')
        .setDescription(
            'View community-submitted restock activity by region and retailer. ' +
                'Forecasts are based on historical reports and should be used as guidance only.'
        )
        .addFields(
            {
                name: 'What You Can View',
                value:
                    '• Regional activity\n' +
                    '• Retailer trends\n' +
                    '• Store-level report history\n' +
                    '• Estimated restock windows',
                inline: false
            },
            {
                name: 'Virginia',
                value: 'Higher activity region with more Target and Walmart report history.',
                inline: false
            },
            {
                name: 'Maryland',
                value: 'Growing activity region with developing report patterns.',
                inline: false
            },
            {
                name: 'How It Works',
                value: 'Select a region, choose a retailer, then select a store to view its prediction card.',
                inline: false
            }
        )
        .setFooter({ text: 'Community-submitted data. Forecasts are not guaranteed.' });
}

function publicPanelRows() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rstk_predict_reg_VA').setLabel('Virginia Predictions').setEmoji('📍').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('rstk_predict_reg_MD').setLabel('Maryland Predictions').setEmoji('📍').setStyle(ButtonStyle.Secondary)
        )
    ];
}

function wizardHomeRows() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rstk_predict_reg_VA').setLabel('Virginia Predictions').setEmoji('📍').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('rstk_predict_reg_MD').setLabel('Maryland Predictions').setEmoji('📍').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rstk_predict_home').setLabel('Start Over').setStyle(ButtonStyle.Secondary)
        )
    ];
}

function getPublicPanelPayload() {
    return { embeds: [publicPanelEmbed()], components: publicPanelRows() };
}

function retailerStepContent(region) {
    return [
        '**Step 2 of 3 · Retail Chain**',
        `Viewing **${regionLong(region)}** predictions.`,
        '_Choose a chain to view store-level predictions._'
    ].join('\n');
}

function locationStepContent(region, retailKey) {
    const total = configStoreLines(region, retailKey).length;
    let body =
        `**Step 3 of 3 · Store Forecast**\n**${retailLabel(retailKey)}** · ${regionLong(region)}\n_Select a store below to view its prediction card._`;
    if (total > DISCORD_SELECT_LIMIT) {
        body += `\n_First ${DISCORD_SELECT_LIMIT} of **${total}** config locations (Discord limit)._`;
    }
    return body;
}

/** @param {'VA'|'MD'} region */
function retailerSelectRows(region) {
    const r = region;
    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`rstk_predict_pickret_${r}`)
                .setPlaceholder('Select retailer…')
                .addOptions(
                    { label: 'Target', value: 'target', emoji: '🎯' },
                    { label: 'Walmart', value: 'walmart', emoji: '🛒' },
                    { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                    {
                        label: 'Barnes & Noble',
                        value: 'barnesandnoble',
                        emoji: '📚'
                    }
                )
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rstk_predict_home').setLabel('Regions').setStyle(ButtonStyle.Secondary)
        )
    ];
}

/** New Look–style location options; hashed values for long addresses. */
function buildConfigLocationMenu(regionLetter, retailKey, userId) {
    const linesAll = configStoreLines(regionLetter, retailKey);
    const lines = linesAll.slice(0, DISCORD_SELECT_LIMIT);

    const select = new StringSelectMenuBuilder()
        .setCustomId(`rstk_predict_cfgloc_${regionLetter}_${retailKey}`)
        .setPlaceholder(`Select ${retailLabel(retailKey)} location…`);

    if (!lines.length) {
        return { selectMenu: null, listed: 0, totalConfigured: linesAll.length };
    }

    const options = [];
    for (const full of lines) {
        const slug = svc.makeStoreSlug(`${retailKey}|cfgloc`, `${regionLetter}|${full}`);
        predictStoreCache.remember(userId, regionLetter, slug, full);

        const parts = full.split(' - ');
        const friendly =
            parts.length >= 2 ? parts.slice(1, 2).join(' - ') : parts[0] || full.slice(0, 60);
        let description =
            parts.length > 2 ? truncate(parts.slice(2).join(' - '), 100) : undefined;
        options.push({
            label: truncate(friendly, 100).slice(0, 100) || truncate(full, 100).slice(0, 100),
            value: slug.slice(0, 100),
            description
        });
    }

    select.addOptions(options);
    return { selectMenu: select, listed: options.length, totalConfigured: linesAll.length };
}

function locationActionRows(region, retailKey, userId) {
    const r = region;
    const k = retailKey;
    const rows = [];

    const { selectMenu } = buildConfigLocationMenu(region, retailKey, userId);
    if (selectMenu) {
        rows.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`rstk_predict_locstep_${r}_${k}`)
                .setLabel('Refresh panel')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`rstk_predict_backRetail_${r}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return rows;
}

function scoreForecastName(dbName, cfgFullLine) {
    const canonL = cfgFullLine.trim().toLowerCase();
    const d = (dbName || '').trim().toLowerCase();
    if (!canonL.length || !d.length) return 0;
    if (d === canonL) return 10000;

    /** Common config line layout: Chain - Place - Addr */
    const parts = cfgFullLine.split(' - ');
    let hint =
        parts.length >= 3
            ? `${parts[1]} ${parts.slice(2).join(' ')}`.toLowerCase().replace(/\s+/g, ' ')
            : canonL;

    let sc = 0;
    if (d.includes(canonL)) sc = Math.min(canonL.length + 200, 2000);
    if (canonL.includes(d)) sc = Math.max(sc, Math.min(d.length + 150, d.length >= 28 ? d.length + 400 : d.length));

    const tokenize = (s) =>
        s.split(/[\s,]+/).filter((x) => x.replace(/[^\w]/g, '').length >= 4);
    for (const t of [...new Set([...tokenize(hint), ...tokenize(canonL)])]) {
        const tt = t.toLowerCase();
        if (tt.length >= 4 && d.includes(tt)) sc += tt.length * 6;
    }
    return sc;
}

/** Prefer modeled row with best score vs thin-history row. */
function pickForecastRow(filtered, cfgFullLine) {
    const canonL = cfgFullLine.trim().toLowerCase();

    const modeledEq = filtered.predictions.find((p) => (p.displayName || '').trim().toLowerCase() === canonL);
    if (modeledEq) return { tag: 'modeled', modeled: modeledEq };

    const thinEq = filtered.insufficient.find((x) => (x.displayName || '').trim().toLowerCase() === canonL);
    if (thinEq) return { tag: 'thin', thin: thinEq };

    let bestModeled = null;
    let bestModeledSc = -1;
    for (const p of filtered.predictions) {
        const sc = scoreForecastName(p.displayName, cfgFullLine);
        if (sc > bestModeledSc) {
            bestModeledSc = sc;
            bestModeled = p;
        }
    }

    let bestThin = null;
    let bestThinSc = -1;
    for (const x of filtered.insufficient) {
        const sc = scoreForecastName(x.displayName, cfgFullLine);
        if (sc > bestThinSc) {
            bestThinSc = sc;
            bestThin = x;
        }
    }

    const threshold = 40;
    if (bestModeledSc >= threshold && bestModeled) return { tag: 'modeled', modeled: bestModeled };
    if (bestThinSc >= threshold && bestThin) return { tag: 'thin', thin: bestThin };
    return { tag: 'none', scoreModeled: bestModeledSc, scoreThin: bestThinSc };
}

async function loadAnalyzedForRegion(region) {
    console.log('[predict] loadAnalyzedForRegion start', { region });
    const supabase = createPredictSupabase();
    const tbl = tableName();
    const rows = await svc.fetchRestockRows(supabase, tbl, region);
    const analyzed = svc.analyzeRegion(rows, region);
    console.log('[predict] loadAnalyzedForRegion done', {
        region,
        modeledCount: analyzed?.predictions?.length ?? 0,
        thinCount: analyzed?.insufficient?.length ?? 0
    });
    return analyzed;
}

/**
 * Markdown body matching the single-store prediction card (no title/footer).
 * @param {object} p modeled prediction row from predictionService
 * @param {{ maxHistChars?: number }} [opts]
 */
function modeledPredictionDescriptionMarkdown(p, opts = {}) {
    const maxHistChars = opts.maxHistChars ?? 900;

    const day =
        p.mostCommonDay && String(p.mostCommonDay).trim() && p.mostCommonDay !== '—'
            ? String(p.mostCommonDay).trim()
            : '—';
    let timing = stripMd(p.mostCommonTimeWindow || '');
    if (!timing || timing === '—') timing = '—';

    let histRaw =
        typeof p.historicalRestockDaysLine === 'string' && p.historicalRestockDaysLine.trim()
            ? p.historicalRestockDaysLine.trim()
            : '';
    let hist = '';
    if (histRaw) {
        const lines = histRaw.split('\n');
        let acc = '';
        for (const line of lines) {
            const next = acc ? `${acc}\n${line}` : line;
            if (next.length > maxHistChars) break;
            acc = next;
        }
        hist = acc || truncate(histRaw, maxHistChars);
    }

    const lastRestock =
        p.lastRestockPlain && String(p.lastRestockPlain).trim()
            ? truncate(String(p.lastRestockPlain).trim(), 220)
            : '—';
    const confidence =
        p.confidenceLabel && p.confidenceScore
            ? `${p.confidenceLabel} · ${p.confidenceScore}%`
            : p.confidenceLabel || (p.confidenceScore ? `${p.confidenceScore}%` : '—');

    const insights = [];
    const breakdown = p.signalBreakdown || {};
    if (breakdown.cadenceConsistency != null) {
        if (breakdown.cadenceConsistency >= 65) {
            insights.push('• Store has shown consistent weekly activity recently');
        } else if (breakdown.cadenceConsistency >= 35) {
            insights.push('• Recent alerts are starting to form a repeat pattern');
        } else {
            insights.push('• Pattern has been less consistent recently');
        }
    }
    if (timing !== '—') {
        const simpleTime = timing.split('(')[0].trim();
        insights.push(`• Recent alerts usually happen in the ${simpleTime.toLowerCase()}`);
    }
    if (day !== '—') insights.push(`• Most matching alerts point toward ${day}`);
    if (breakdown.regionDay && breakdown.regionDay !== '—') {
        insights.push(`• Nearby ${p.region || ''} stores also lean ${breakdown.regionDay}`.replace(/\s+/g, ' ').trim());
    }
    if (breakdown.recentReports != null) {
        insights.push(`• ${breakdown.recentReports} recent alert${breakdown.recentReports === 1 ? '' : 's'} weighed into this forecast`);
    }

    const histLines = [];
    if (hist) {
        const entries = hist
            .split('\n')
            .map((line) => {
                const dayMatch = line.match(/\*\*([A-Za-z]{3})\*\*/);
                const countMatch = line.match(/×(\d+)/);
                if (!dayMatch || !countMatch) return null;
                return { day: dayMatch[1], count: Number(countMatch[1]) };
            })
            .filter(Boolean);
        const maxCount = Math.max(...entries.map((x) => x.count), 1);
        const parsed = entries.map(({ day: histDay, count }) => {
            const strength = count / maxCount;
            const marker = strength >= 0.75 ? '🟢' : strength >= 0.4 ? '🟡' : '⚫';
            const bars = '▰'.repeat(Math.min(6, Math.max(1, Math.round(strength * 6))));
            return `\`${histDay}\` ${marker} ${bars} ${count}`;
        });
        histLines.push(...parsed);
    }

    let desc =
        `**📡 Forecast Window**\n` +
        `> **${day}** · ${timing === '—' ? 'Time window still forming' : timing}\n\n` +
        `**📈 Signal Strength:** ${confidence}\n` +
        `**Last Reported:** ${lastRestock}`;

    if (insights.length) {
        desc += `\n\n**🧠 Restock Intel**\n${insights.slice(0, 5).join('\n')}`;
    } else if (p.predictionReason) {
        desc += `\n\n**🧠 Restock Intel**\n• ${truncate(String(p.predictionReason), 180)}`;
    }

    if (histLines.length) {
        desc += `\n\n**📊 Restock Patterns**\n${histLines.join('\n')}`;
    } else if (hist) {
        desc += `\n\n**📊 Restock Patterns**\n${hist}`;
    }

    const tr = stripMd(p.trendLabel || '');
    if (tr && tr !== '—') desc += `\n\n**📉 Trend Activity:** ${truncate(tr, 180)}`;

    return desc;
}

/** Discord “green” — single-store prediction card + matched overview pages */
const MODEL_EMBED_GREEN = 0x57f287;

/** Discord caps each embed description at 4096; keep chunks smaller for title/footer. Bundling ≤6000 is handled by partition. */
const OVERVIEW_EMBED_DESC_SAFE = 3800;

/** @returns {import('discord.js').EmbedBuilder[]} */
function buildRetailOverviewEmbeds(region, retailKey, filtered) {
    const { predictions } = filtered;

    if (!predictions.length) {
        return [
            new EmbedBuilder()
                .setColor(0x95a5a6)
                .setDescription('_Nothing modeled for this chain yet (needs more alert days)._')
        ];
    }

    const BETWEEN = '\n\n――――――――――――――――\n\n';

    const blocks = predictions.map((p, idx) => {
        let body =
            modeledPredictionDescriptionMarkdown(p, { maxHistChars: 900 });
        /** Cap pathological megahistory so one store can't overflow an embed alone */
        let block = `**${idx + 1}.** ${truncate(p.displayName, 200)}\n${body}`;
        if (block.length > OVERVIEW_EMBED_DESC_SAFE - 200) {
            body = modeledPredictionDescriptionMarkdown(p, { maxHistChars: 400 });
            block = `**${idx + 1}.** ${truncate(p.displayName, 200)}\n${body}`;
        }
        if (block.length > OVERVIEW_EMBED_DESC_SAFE - 120) {
            block = truncate(block, OVERVIEW_EMBED_DESC_SAFE - 120) + '\n_…trimmed — open this store solo for full detail._';
        }
        return block;
    });

    /** Full description chunks (each fits one embed). */
    const chunkTexts = [];
    /** Stores included per chunk — for truncation messaging */
    const chunkStores = [];
    let curBlocks = [];
    let len = 0;

    for (const block of blocks) {
        const sep = curBlocks.length ? BETWEEN.length : 0;
        const add = sep + block.length;
        if (curBlocks.length && len + add > OVERVIEW_EMBED_DESC_SAFE) {
            chunkTexts.push(curBlocks.join(BETWEEN));
            chunkStores.push(curBlocks.length);
            curBlocks = [];
            len = 0;
        }
        curBlocks.push(block);
        len += add;
    }
    if (curBlocks.length) {
        chunkTexts.push(curBlocks.join(BETWEEN));
        chunkStores.push(curBlocks.length);
    }

    const baseTitle = `All modeled · ${retailLabel(retailKey)} · ${region}`;
    const pageCount = chunkTexts.length;
    const shownStores = chunkStores.reduce((a, b) => a + b, 0);

    return chunkTexts.map((desc, idx) => {
        let text = desc;
        if (idx === chunkTexts.length - 1 && shownStores < predictions.length) {
            const rest = predictions.length - shownStores;
            text += `\n\n_${rest} more location(s) not shown — build limit._`;
        }
        const title =
            pageCount <= 1
                ? baseTitle
                : `${baseTitle} (${idx + 1}/${pageCount})`;
        return new EmbedBuilder()
            .setColor(MODEL_EMBED_GREEN)
            .setTitle(truncate(title, 256))
            .setDescription(text)
            .setFooter({ text: 'From community alerts only — not a guarantee.' });
    });
}

function modeledEmbedCompact(p) {
    return new EmbedBuilder()
        .setColor(MODEL_EMBED_GREEN)
        .setTitle(truncate(`Restock Signal // ${p.displayName}`, 256))
        .setDescription(modeledPredictionDescriptionMarkdown(p))
        .setFooter({ text: 'Community alert intelligence — prediction not guaranteed.' });
}

function insufficientEmbedCompact(displayName, uniqueDays) {
    const desc = truncate(displayName, 400);
    return new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle('Not enough history yet')
        .setDescription(`${desc}\nNeeds **${svc.MIN_UNIQUE_DAYS}+** alert days · has **${uniqueDays}**.`);
}

/**
 * Dropdown: retailer (step 2)
 */
async function handlePredictRetailSelect(interaction) {
    if (!interactionInPredictChannel(interaction)) {
        return interaction.reply({ content: 'Wrong channel.', ephemeral: true }).catch(() => {});
    }

    const m = interaction.customId.match(/^rstk_predict_pickret_(VA|MD)$/);
    if (!m) {
        return interaction.reply({ content: 'Unknown menu.', ephemeral: true }).catch(() => {});
    }

    const region = /** @type {'VA'|'MD'} */ (m[1]);
    const retailKey = interaction.values?.[0];
    if (!retailKey || !RETAIL_KEY_LIST.includes(retailKey)) {
        return interaction.reply({ content: 'Invalid retailer.', ephemeral: true }).catch(() => {});
    }

    const uid = interaction.user.id;

    return safeDeferClearEditReply(interaction, {
        content: locationStepContent(region, retailKey),
        embeds: [],
        components: locationActionRows(region, retailKey, uid)
    });
}

/** Config-backed location picker (step 3) */
async function handlePredictConfigLocationSelect(interaction) {
    if (!interactionInPredictChannel(interaction)) {
        return interaction.reply({ content: 'Wrong channel.', ephemeral: true }).catch(() => {});
    }

    const m = interaction.customId.match(CFGLOC_RE);
    if (!m) {
        return interaction.reply({ content: 'Unknown location menu.', ephemeral: true }).catch(() => {});
    }

    const region = /** @type {'VA'|'MD'} */ (m[1]);
    const retailKey = m[2];
    const slug = interaction.values?.[0];

    await interaction.deferUpdate();

    if (!slug) {
        await clearForecastCard(interaction);
        return interaction.editReply({
            content: locationStepContent(region, retailKey),
            embeds: [],
            components: locationActionRows(region, retailKey, interaction.user.id)
        });
    }

    const canonical = predictStoreCache.resolve(interaction.user.id, region, slug);
    if (!canonical) {
        await clearForecastCard(interaction);
        return interaction.editReply({
            content: `${locationStepContent(region, retailKey)}\n_That list expired — reopen **Virginia**/ **Maryland**._`,
            embeds: [],
            components: locationActionRows(region, retailKey, interaction.user.id)
        });
    }

    try {
        const analyzed = await loadAnalyzedForRegion(region);
        const filtered = svc.filterAnalyzedByRetailer(analyzed, retailKey);
        const hit = pickForecastRow(filtered, canonical);

        await interaction.editReply({
            content: locationStepContent(region, retailKey),
            embeds: [],
            components: locationActionRows(region, retailKey, interaction.user.id)
        });

        if (hit.tag === 'modeled' && hit.modeled) {
            await showOrRefreshForecastCard(interaction, [modeledEmbedCompact(hit.modeled)]);
            return;
        }

        if (hit.tag === 'thin' && hit.thin) {
            const t = hit.thin;
            await showOrRefreshForecastCard(interaction, [insufficientEmbedCompact(t.displayName, t.uniqueDays)]);
            return;
        }

        await showOrRefreshForecastCard(interaction, [
            new EmbedBuilder()
                .setColor(0xe67e22)
                .setTitle('No archive match yet')
                .setDescription(
                    '_No modeled match for **this config line** in archive yet — wording may differ from alerts._ Try another location or archive more reports.'
                )
        ]);
        return;
    } catch (err) {
        console.error('[predict] cfg location failed:', err?.message || err);
        await clearForecastCard(interaction);
        return interaction.editReply({
            content: locationStepContent(region, retailKey),
            embeds: [],
            components: locationActionRows(region, retailKey, interaction.user.id)
        });
    }
}

/**
 * Buttons
 */
async function handlePredictButton(interaction) {
    if (!interactionInPredictChannel(interaction)) {
        return interaction.reply({
            content: `Use prediction controls in <#${resolvePredictChannelId()}>.`,
            ephemeral: true
        });
    }

    const cid = interaction.customId;
    const uid = interaction.user.id;

    if (cid === 'rstk_predict_home') {
        const payload = { content: rootContent(), embeds: [], components: wizardHomeRows() };
        if (isPredictWizardMessage(interaction)) {
            return safeDeferClearEditReply(interaction, payload);
        }
        return acknowledgePublicPredict(interaction, payload);
    }

    if (cid === 'rstk_predict_reg_VA' || cid === 'rstk_predict_reg_MD') {
        const region = cid.endsWith('_VA') ? 'VA' : 'MD';
        const payload = {
            content: retailerStepContent(region),
            embeds: [],
            components: retailerSelectRows(region)
        };
        if (isPredictWizardMessage(interaction)) {
            return safeDeferClearEditReply(interaction, payload);
        }
        return acknowledgePublicPredict(interaction, payload);
    }

    const backRetailMatch = cid.match(BACK_RETAIL_RE);
    if (backRetailMatch) {
        const region = /** @type {'VA'|'MD'} */ (backRetailMatch[1]);
        return safeDeferClearEditReply(interaction, {
            content: retailerStepContent(region),
            embeds: [],
            components: retailerSelectRows(region)
        });
    }

    const locstepMatch = cid.match(LOCSTEP_RE);
    if (locstepMatch) {
        const region = /** @type {'VA'|'MD'} */ (locstepMatch[1]);
        const retailKey = locstepMatch[2];
        let content = locationStepContent(region, retailKey);
        if (!buildConfigLocationMenu(region, retailKey, uid).selectMenu) {
            content +=
                `\n⚠️ _No stores listed in **config.json** for **${retailLabel(retailKey)}** (${region})._`;
        }
        return safeDeferClearEditReply(interaction, {
            content,
            embeds: [],
            components: locationActionRows(region, retailKey, uid)
        });
    }

    const allMatch = cid.match(ALL_RE);
    if (allMatch) {
        const region = /** @type {'VA'|'MD'} */ (allMatch[1]);
        const retailKey = allMatch[2];
        await interaction.deferUpdate();
        try {
            const analyzed = await loadAnalyzedForRegion(region);
            const filtered = svc.filterAnalyzedByRetailer(analyzed, retailKey);
            await interaction.editReply({
                content: locationStepContent(region, retailKey),
                embeds: [],
                components: locationActionRows(region, retailKey, uid)
            });
            await showOrRefreshForecastCard(interaction, buildRetailOverviewEmbeds(region, retailKey, filtered));
        } catch (err) {
            console.error('[predict] all-stores failed:', err?.message || err);
            await clearForecastCard(interaction);
            await interaction.editReply({
                content: locationStepContent(region, retailKey),
                embeds: [],
                components: locationActionRows(region, retailKey, uid)
            });
        }
        return;
    }

    if (cid.startsWith('rstk_predict_')) {
        return interaction
            .reply({
                content:
                    'These controls are outdated — open the newest **Restock timing** panel in this channel.',
                ephemeral: true
            })
            .catch(() => {});
    }
}

module.exports = {
    resolvePredictChannelId,
    getPublicPanelPayload,
    handlePredictButton,
    handlePredictRetailSelect,
    handlePredictConfigLocationSelect
};
