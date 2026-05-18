const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config/config.json');
const dataManager = require('./dataManager');
const buttonRestockHandler = require('./buttonRestockHandler');
const nlLookupSupabase = require('./nlLookupSupabase');

/** All New Look lookup date/time strings use Eastern (DMV stores). */
const LOOKUP_DISPLAY_TZ = 'America/New_York';

function nlReportChannelId() {
    return config.channels?.newlookReportRestocks || '';
}

function nlLookupChannelId() {
    return config.channels?.newlookLookupRestocks || '';
}

function assertNlReportChannel(interaction) {
    const expected = nlReportChannelId();
    if (!expected || interaction.channelId !== expected) {
        return {
            ok: false,
            message: expected
                ? `❌ Use **Report Restock** from <#${expected}> only.`
                : '❌ `newlookReportRestocks` is not set in config.'
        };
    }
    return { ok: true };
}

function assertNlLookupChannel(interaction) {
    const expected = nlLookupChannelId();
    if (!expected || interaction.channelId !== expected) {
        return {
            ok: false,
            message: expected
                ? `❌ Use **Look Up Restocks** from <#${expected}> only.`
                : '❌ `newlookLookupRestocks` is not set in config.'
        };
    }
    return { ok: true };
}

function formatNlDate(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: LOOKUP_DISPLAY_TZ,
        weekday: 'long',
        month: '2-digit',
        day: '2-digit',
        year: '2-digit'
    }).formatToParts(date);
    const part = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${part('weekday')} ${part('month')}/${part('day')}/${part('year')}`;
}

function nlRelative(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const diffMs = Date.now() - d;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return formatNlDate(iso);
}

function nlTimeShort(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: LOOKUP_DISPLAY_TZ,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(date);
}

// --- Report flow ---

async function handleNlReportButton(interaction) {
    const gate = assertNlReportChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const regionSelect = new StringSelectMenuBuilder()
        .setCustomId('nl_report_region_pick')
        .setPlaceholder('Select state/region...')
        .addOptions(
            { label: 'Virginia (VA)', value: 'va', emoji: '🔵' },
            { label: 'Maryland (MD)', value: 'md', emoji: '🔴' }
        );

    await interaction.reply({
        content: '**Step 1 of 3:** Where is the restock?',
        components: [new ActionRowBuilder().addComponents(regionSelect)],
        ephemeral: true
    });
}

async function handleNlReportRegionPick(interaction) {
    const gate = assertNlReportChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const region = interaction.values[0];
    const storeTypeSelect = new StringSelectMenuBuilder()
        .setCustomId(`nl_restock_store_pick_${region}`)
        .setPlaceholder('Select store...')
        .addOptions(
            { label: 'Target', value: 'target', emoji: '🎯' },
            { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
            { label: 'Walmart', value: 'walmart', emoji: '🛒' },
            { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' },
            { label: 'Other', value: 'other', emoji: '❓', description: 'Custom store (modal)' }
        );

    await interaction.update({
        content: '**Step 2 of 3:** Which store?',
        components: [new ActionRowBuilder().addComponents(storeTypeSelect)],
        ephemeral: true
    });
}

async function handleNlReportStorePick(interaction) {
    const gate = assertNlReportChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const region = interaction.customId.replace('nl_restock_store_pick_', '');
    const storeType = interaction.values[0];

    if (storeType === 'other') {
        return await buttonRestockHandler.prepareNlOtherStoreInProgressModal(interaction, region);
    }

    let stores = [];
    if (storeType === 'target') {
        stores = config.stores?.target?.[region] || [];
    } else if (storeType === 'bestbuy') {
        stores = config.stores?.bestbuy?.[region] || [];
    } else if (storeType === 'walmart') {
        stores = config.stores?.walmart?.[region] || [];
    } else if (storeType === 'barnesandnoble') {
        stores = config.stores?.barnesandnoble?.[region] || [];
    }

    if (stores.length === 0) {
        return interaction.update({
            content: '❌ No stores found for this type.',
            components: [],
            ephemeral: true
        });
    }

    const locationOptions = stores.slice(0, 25).map((store) => {
        const parts = store.split(' - ');
        const name = parts.length >= 2 ? parts.slice(1, 2).join(' - ') : parts[1];
        return {
            label: name.length > 100 ? `${name.substring(0, 97)}...` : name,
            value: store,
            description: parts.length > 2 ? parts.slice(2).join(' - ').substring(0, 100) : undefined
        };
    });

    const locationSelect = new StringSelectMenuBuilder()
        .setCustomId(`nl_restock_location_${region}_${storeType}`)
        .setPlaceholder('Select store location...')
        .addOptions(locationOptions);

    await interaction.update({
        content: '**Step 3 of 3:** Pick the location',
        components: [new ActionRowBuilder().addComponents(locationSelect)],
        ephemeral: true
    });
}

async function handleNlReportLocationPick(interaction) {
    const gate = assertNlReportChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const suffix = interaction.customId.replace('nl_restock_location_', '');
    const firstSep = suffix.indexOf('_');
    const region = suffix.slice(0, firstSep);
    const storeType = suffix.slice(firstSep + 1);
    const store = interaction.values[0];

    await buttonRestockHandler.stashNewlookInProgressConfirmation(interaction, region, store, storeType);
}

// --- Lookup flow (“Other” = Barnes & Noble list) ---

async function handleNlLookupButton(interaction) {
    const gate = assertNlLookupChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const regionSelect = new StringSelectMenuBuilder()
        .setCustomId('nl_lookup_region_pick')
        .setPlaceholder('Select state/region...')
        .addOptions(
            { label: 'Virginia (VA)', value: 'va', emoji: '🔵' },
            { label: 'Maryland (MD)', value: 'md', emoji: '🔴' }
        );

    await interaction.reply({
        content: '**Step 1 of 4:** Which region?',
        components: [new ActionRowBuilder().addComponents(regionSelect)],
        ephemeral: true
    });
}

async function handleNlLookupRegionPick(interaction) {
    const gate = assertNlLookupChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const region = interaction.values[0];
    const storeTypeSelect = new StringSelectMenuBuilder()
        .setCustomId(`nl_lookup_store_pick_${region}`)
        .setPlaceholder('Select store chain...')
        .addOptions(
            { label: 'Target', value: 'target', emoji: '🎯' },
            { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
            { label: 'Walmart', value: 'walmart', emoji: '🛒' },
            { label: 'Other', value: 'barnesandnoble', emoji: '📚', description: 'Barnes & Noble' }
        );

    await interaction.update({
        content: '**Step 2 of 4:** Which store chain?',
        components: [new ActionRowBuilder().addComponents(storeTypeSelect)],
        ephemeral: true
    });
}

function nlLookupChainLabel(storeType) {
    if (storeType === 'target') return 'Target';
    if (storeType === 'bestbuy') return 'Best Buy';
    if (storeType === 'walmart') return 'Walmart';
    if (storeType === 'barnesandnoble') return 'Barnes & Noble';
    return storeType;
}

async function handleNlLookupStorePick(interaction) {
    const gate = assertNlLookupChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const region = interaction.customId.replace('nl_lookup_store_pick_', '');
    const storeType = interaction.values[0];

    let stores = [];
    if (storeType === 'target') {
        stores = config.stores?.target?.[region] || [];
    } else if (storeType === 'bestbuy') {
        stores = config.stores?.bestbuy?.[region] || [];
    } else if (storeType === 'walmart') {
        stores = config.stores?.walmart?.[region] || [];
    } else if (storeType === 'barnesandnoble') {
        stores = config.stores?.barnesandnoble?.[region] || [];
    }

    if (stores.length === 0) {
        return interaction.update({
            content: '❌ No stores found for this type.',
            components: [],
            ephemeral: true
        });
    }

    const scopeSelect = new StringSelectMenuBuilder()
        .setCustomId(`nl_lookup_scope_${region}_${storeType}`)
        .setPlaceholder('How do you want to look up?')
        .addOptions(
            {
                label: 'All locations — overview',
                value: 'all',
                emoji: '📋',
                description: `All ${stores.length} ${nlLookupChainLabel(storeType)} in ${region.toUpperCase()}`
            },
            {
                label: 'Pick one location',
                value: 'specific',
                emoji: '🔍',
                description: 'Choose a single store'
            }
        );

    await interaction.update({
        content: '**Step 3 of 4:** Overview or single store?',
        components: [new ActionRowBuilder().addComponents(scopeSelect)],
        ephemeral: true
    });
}

/**
 * New Look lookup row: prefer Supabase `restock_history` when configured, else JSON `last_restocks`.
 * @param {string} region
 * @param {string} storeCanonical
 * @returns {Promise<{ storeData: object, dataSource: 'db' | 'json' }>}
 */
async function resolveNlLookupStoreData(region, storeCanonical) {
    if (nlLookupSupabase.shouldUseSupabaseForNlLookup()) {
        try {
            const row = await nlLookupSupabase.lookupSingleStoreFromDb(region, storeCanonical);
            if (row) {
                return { storeData: row, dataSource: 'db' };
            }
        } catch (err) {
            console.warn('[nl_lookup] Remote lookup failed, using saved file data:', err.message || err);
        }
    }

    const lastRestocks = dataManager.getLastRestocks();
    const found = lastRestocks.find((s) => s.store === storeCanonical);
    return { storeData: found || null, dataSource: 'json' };
}

/** Latest restock instant for New Look display (DB row or JSON last_restocks). */
function nlLookupLastReportedIso(storeData, dataSource) {
    if (!storeData) return null;
    if (storeData.last_reported_restock_date) return storeData.last_reported_restock_date;
    if (dataSource === 'db') return null;
    const cur = storeData.current_week_restock_date;
    const prev = storeData.previous_week_restock_date;
    if (!cur && !prev) return null;
    if (!cur) return prev;
    if (!prev) return cur;
    const dc = new Date(cur);
    const dp = new Date(prev);
    if (Number.isNaN(dc.getTime())) return prev;
    if (Number.isNaN(dp.getTime())) return cur;
    return dc >= dp ? cur : prev;
}

function nlLookupLastReportedDisplay(storeData, dataSource) {
    const iso = nlLookupLastReportedIso(storeData, dataSource);
    if (!iso) return 'No reported restock yet';
    const d = formatNlDate(iso);
    if (!d) return 'No reported restock yet';
    return `${d} · ${nlTimeShort(iso)} · ${nlRelative(iso)}`;
}

function nlLookupEmptyMessage(dataSource) {
    if (dataSource === 'db') {
        return (
            '📭 **No history found yet** for this store.\n' +
            'After a restock is **approved**, the latest time will show here.'
        );
    }
    return (
        '📭 **No history found yet** for this store.\n' +
        'Once an in-progress restock is **approved** for this store, it will show up here.'
    );
}

function nlLookupDisplayShortName(fullStoreName, storeType) {
    let displayName = fullStoreName;
    const lower = displayName.toLowerCase();
    if (storeType === 'target' && lower.startsWith('target - ')) {
        displayName = displayName.slice(9);
    } else if (storeType === 'bestbuy' && lower.startsWith('best buy - ')) {
        displayName = displayName.slice(11);
    } else if (storeType === 'walmart' && lower.startsWith('walmart - ')) {
        displayName = displayName.slice(10);
    } else if (storeType === 'barnesandnoble' && lower.startsWith('barnes & noble - ')) {
        displayName = displayName.slice(18);
    }
    return displayName.length > 200 ? `${displayName.slice(0, 197)}...` : displayName;
}

async function handleNlLookupScopePick(interaction) {
    const gate = assertNlLookupChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const m = interaction.customId.match(/^nl_lookup_scope_(va|md)_(.+)$/);
    if (!m) {
        return interaction.reply({ content: '❌ Invalid selection. Start over.', ephemeral: true });
    }
    const region = m[1];
    const storeType = m[2];
    const scope = interaction.values[0];

    let catalogStores = [];
    if (storeType === 'target') {
        catalogStores = config.stores?.target?.[region] || [];
    } else if (storeType === 'bestbuy') {
        catalogStores = config.stores?.bestbuy?.[region] || [];
    } else if (storeType === 'walmart') {
        catalogStores = config.stores?.walmart?.[region] || [];
    } else if (storeType === 'barnesandnoble') {
        catalogStores = config.stores?.barnesandnoble?.[region] || [];
    }

    if (catalogStores.length === 0) {
        return interaction.update({
            content: '❌ No stores configured for this chain/region.',
            components: [],
            ephemeral: true
        });
    }

    if (scope === 'specific') {
        const locationOptions = catalogStores.slice(0, 25).map((store) => {
            const parts = store.split(' - ');
            const name = parts.length >= 2 ? parts.slice(1, 2).join(' - ') : parts[1];
            return {
                label: name.length > 100 ? `${name.substring(0, 97)}...` : name,
                value: store,
                description: parts.length > 2 ? parts.slice(2).join(' - ').substring(0, 100) : undefined
            };
        });

        const locationSelect = new StringSelectMenuBuilder()
            .setCustomId(`nl_lookup_location_${region}_${storeType}`)
            .setPlaceholder('Select store location...')
            .addOptions(locationOptions);

        await interaction.update({
            content:
                catalogStores.length > 25
                    ? `**Step 4 of 4:** Pick one location _(menu shows **first 25** of ${catalogStores.length} — same as legacy single-picker limit)_`
                    : '**Step 4 of 4:** Pick one location',
            components: [new ActionRowBuilder().addComponents(locationSelect)],
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        let chainRows;
        let overviewSource = 'json';
        if (nlLookupSupabase.shouldUseSupabaseForNlLookup()) {
            try {
                const dbMap = await nlLookupSupabase.lookupStoresBatchFromDb(region, catalogStores);
                if (dbMap) {
                    overviewSource = 'db';
                    chainRows = catalogStores.map((canonical) => {
                        const tracked = dbMap.get(canonical);
                        return (
                            tracked || {
                                store: canonical,
                                last_reported_restock_date: null,
                                last_checked_date: null,
                                approvalCount: 0
                            }
                        );
                    });
                }
            } catch (err) {
                console.warn('[nl_lookup] Remote batch lookup failed, using saved file data:', err.message || err);
            }
        }
        if (!chainRows) {
            const lastRestocks = dataManager.getLastRestocks();
            chainRows = catalogStores.map((canonical) => {
                const tracked = lastRestocks.find((r) => r.store === canonical);
                return tracked
                    ? tracked
                    : {
                          store: canonical,
                          last_reported_restock_date: null,
                          last_checked_date: null,
                          approvalCount: 0
                      };
            });
        }

        const chainLabel = nlLookupChainLabel(storeType);
        const regionLabel = region === 'va' ? 'Virginia' : 'Maryland';
        const color =
            storeType === 'target'
                ? 0xff4444
                : storeType === 'bestbuy'
                  ? 0xfff200
                  : storeType === 'walmart'
                    ? 0x0071ce
                    : storeType === 'barnesandnoble'
                      ? 0x2ecc71
                      : 0x5865f2;

        const footerBits = `${config.settings?.cleanupDay || 'Sunday'} (${config.settings?.cleanupTime || '00:00'})`;
        const FOOTER = `New Look lookup · Scheduled cleanup ${footerBits}`;

        const MAX_FIELDS = 25;
        const fieldBatches = [];
        for (let i = 0; i < chainRows.length; i += MAX_FIELDS) {
            fieldBatches.push(chainRows.slice(i, i + MAX_FIELDS));
        }

        const embeds = [];
        fieldBatches.forEach((batch, idx) => {
            const eb = new EmbedBuilder()
                .setColor(color)
                .setTitle(
                    fieldBatches.length > 1
                        ? `📋 ${chainLabel} · ${regionLabel} (${idx + 1}/${fieldBatches.length})`
                        : `📋 ${chainLabel} · ${regionLabel} — all locations`
                )
                .setDescription(`**${chainRows.length}** locations · last reported restock`);

            batch.forEach((storeData) => {
                const displayName = nlLookupDisplayShortName(storeData.store, storeType);
                let value = `**Last reported restock:** ${nlLookupLastReportedDisplay(storeData, overviewSource)}`;
                if (storeData.last_checked_date) {
                    value += `\n**Last checked:** ${formatNlDate(storeData.last_checked_date)} · ${nlTimeShort(storeData.last_checked_date)} · ${nlRelative(storeData.last_checked_date)}`;
                }
                eb.addFields({ name: `🏪 ${displayName}`, value, inline: false });
            });

            embeds.push(eb);
        });

        if (embeds.length > 0) {
            embeds[embeds.length - 1].setFooter({ text: FOOTER });
        }

        const MAX_EMBEDS_REPLY = 10;
        const embedChunks = [];
        for (let i = 0; i < embeds.length; i += MAX_EMBEDS_REPLY) {
            embedChunks.push(embeds.slice(i, i + MAX_EMBEDS_REPLY));
        }

        await interaction.editReply({
            embeds: embedChunks[0],
            content: null
        });
        for (let c = 1; c < embedChunks.length; c++) {
            await interaction.followUp({ embeds: embedChunks[c], ephemeral: true });
        }
    } catch (err) {
        console.warn('[nl_lookup] Overview reply failed:', err.message || err);
        const msg =
            'Could not finish **all locations** lookup (database slow or unavailable). Try **Pick one location** or again in a moment.';
        await interaction
            .editReply({ content: msg, embeds: [], components: [] })
            .catch(async () => {
                await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
            });
    }
}

async function handleNlLookupLocationPick(interaction) {
    const gate = assertNlLookupChannel(interaction);
    if (!gate.ok) {
        return interaction.reply({ content: gate.message, ephemeral: true });
    }

    const raw = interaction.customId.replace('nl_lookup_location_', '');
    const sep = raw.indexOf('_');
    const region = raw.slice(0, sep);
    const store = interaction.values[0];

    await interaction.deferReply({ ephemeral: true });

    try {
        const { storeData, dataSource } = await resolveNlLookupStoreData(region, store);

        if (!storeData) {
            await interaction.editReply({
                content: nlLookupEmptyMessage('json')
            });
            return;
        }

        const lastReportedLine = nlLookupLastReportedDisplay(storeData, dataSource);

        let lastCheckedLine = '';
        if (storeData.last_checked_date) {
            lastCheckedLine = `${formatNlDate(storeData.last_checked_date)} · ${nlTimeShort(storeData.last_checked_date)} · ${nlRelative(storeData.last_checked_date)}`;
        }

        const embed = new EmbedBuilder()
            .setColor(region === 'md' ? 0xe74c3c : 0x3498db)
            .setTitle(`🔍 Restock lookup — ${region.toUpperCase()}`)
            .setDescription(store)
            .addFields({ name: 'Last reported restock', value: lastReportedLine, inline: false })
            .setFooter({
                text: `New Look lookup · Scheduled cleanup ${config.settings?.cleanupDay || 'Sunday'} (${config.settings?.cleanupTime || '00:00'})`
            });

        if (lastCheckedLine) {
            embed.addFields({ name: 'Last checked', value: lastCheckedLine, inline: false });
        }

        await interaction.editReply({ embeds: [embed], content: null });
    } catch (err) {
        console.warn('[nl_lookup] Single-location lookup failed:', err.message || err);
        const msg =
            'Could not load this store (database slow or unavailable). Please try again in a moment.';
        await interaction
            .editReply({ content: msg, embeds: [], components: [] })
            .catch(async () => {
                await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
            });
    }
}

module.exports = {
    handleNlReportButton,
    handleNlReportRegionPick,
    handleNlReportStorePick,
    handleNlReportLocationPick,
    handleNlLookupButton,
    handleNlLookupRegionPick,
    handleNlLookupStorePick,
    handleNlLookupScopePick,
    handleNlLookupLocationPick
};
