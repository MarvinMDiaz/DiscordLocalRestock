/**
 * Creates #report-restock-va and #report-restock-md (prod-like names) and updates
 * config/config.test.json so command gating + admin_setup_button_* default to those channels.
 *
 * Run: npm run provision:report-channels
 */

const fs = require('fs').promises;
const path = require('path');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
require('dotenv').config({ quiet: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const token =
        process.env.DISCORD_TOKEN_V2?.trim() ||
        process.env.Dev_Discord_Token?.trim() ||
        process.env.DISCORD_TOKEN?.trim();
    const guildId =
        process.env.GUILD_ID_V2?.trim() ||
        process.env.Dev_Guild?.trim() ||
        process.env.GUILD_ID?.trim();
    const configPath = path.join(__dirname, '../config/config.test.json');

    if (!token || !guildId) {
        console.error('Set DISCORD_TOKEN_V2 (or Dev_Discord_Token / DISCORD_TOKEN) and GUILD_ID_V2 (or Dev_Guild / GUILD_ID) in .env');
        process.exit(1);
    }

    let raw;
    try {
        raw = await fs.readFile(configPath, 'utf8');
    } catch (e) {
        console.error('Missing config/config.test.json — run npm run provision:test first.');
        process.exit(1);
    }

    const config = JSON.parse(raw);

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(token);
    const guild = await client.guilds.fetch(guildId);

    const category =
        guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === 'Restock Bot (test)') ||
        null;

    await sleep(400);
    const chVa = await guild.channels.create({
        name: 'report-restock-va',
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: 'VA: /admin_setup_button_va posts the Report Restock panel here',
        reason: 'Report restock (VA) — admin button setup',
    });
    console.log(`✅ #report-restock-va (${chVa.id})`);

    await sleep(500);
    const chMd = await guild.channels.create({
        name: 'report-restock-md',
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: 'MD: /admin_setup_button_md posts the Report Restock panel here',
        reason: 'Report restock (MD) — admin button setup',
    });
    console.log(`✅ #report-restock-md (${chMd.id})`);

    const vaId = chVa.id;
    const mdId = chMd.id;

    if (!config.commandChannels) config.commandChannels = {};
    if (!config.channels) config.channels = {};
    if (!config.channelNames) config.channelNames = {};

    // Slash + button gate uses these IDs (same channel as prod: one hub for panel + flows)
    config.commandChannels.report_past_restock_va = vaId;
    config.commandChannels.report_restock_va = vaId;
    config.commandChannels.restock_in_progress_va = vaId;

    config.commandChannels.report_past_restock_md = mdId;
    config.commandChannels.report_restock_md = mdId;
    config.commandChannels.restock_in_progress_md = mdId;

    // Keep config.channels aligned for humans / any code that reads these keys
    config.channels.restock_in_progress_va = vaId;
    config.channels.restock_in_progress_md = mdId;

    config.channelNames[vaId] = '#report-restock-va';
    config.channelNames[mdId] = '#report-restock-md';

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`\n✅ Updated ${path.basename(configPath)} — reporting commands + buttons use the new channels.\n`);

    client.destroy();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
