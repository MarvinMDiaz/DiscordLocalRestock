/**
 * Slash-command registration — intended for your **development** Discord app + **dev guild**.
 *
 * Set in `.env`:
 *   Dev_Discord_Token  — Bot token from the **dev/test** application (Developer Portal → Bot)
 *   Dev_Client_ID      — Application ID for that **same** dev bot (OAuth2 → General)
 *   Dev_Guild          — Your **test server** guild ID where commands should appear instantly
 *
 * Do **not** use the production/live bot’s token unless you consciously want prod’s command manifest updated.
 *
 * Global registration is OFF by default. To push global commands (rare): `DEPLOY_GLOBAL_COMMANDS=true npm run deploy`
 */

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

// When migrating to a new Discord app, set DISCORD_TOKEN_V2 + CLIENT_ID_V2 + GUILD_ID_V2 (they take precedence).
const discordToken =
    process.env.DISCORD_TOKEN_V2?.trim() ||
    process.env.Dev_Discord_Token?.trim() ||
    process.env.DISCORD_TOKEN?.trim();
const clientId =
    process.env.CLIENT_ID_V2?.trim() ||
    process.env.Dev_Client_ID?.trim() ||
    process.env.CLIENT_ID?.trim();
const guildId =
    process.env.GUILD_ID_V2?.trim() ||
    process.env.Dev_Guild?.trim() ||
    process.env.GUILD_ID?.trim();
const deployGlobal =
    process.env.DEPLOY_GLOBAL_COMMANDS?.trim()?.toLowerCase() === 'true' ||
    process.env.DEPLOY_GLOBAL_COMMANDS === '1';

const commands = [];
const commandsPath = path.join(__dirname, 'src/commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property`);
    }
}

const rest = new REST({ version: '10' }).setToken(discordToken);

function printDevHint() {
    console.log('');
    console.log('── Dev deploy checklist ──');
    console.log('• `Dev_Client_ID` must match the **same application** as `Dev_Discord_Token`.');
    console.log('• `Dev_Guild` must be your **development server** guild ID.');
    console.log('• Invite the dev bot with the **applications.commands** scope.');
    console.log('• Prefer **Dev_*** vars so you never confuse prod tokens with deploy.');
}

(async () => {
    try {
        if (!discordToken || !clientId) {
            console.error('❌ Missing token or client ID. Set DISCORD_TOKEN_V2 + CLIENT_ID_V2, or Dev_* pair, or DISCORD_TOKEN + CLIENT_ID.');
            printDevHint();
            process.exit(1);
        }

        if (!guildId) {
            console.error('❌ Set GUILD_ID_V2, or Dev_Guild, or GUILD_ID — guild commands need a guild ID.');
            printDevHint();
            process.exit(1);
        }

        const usingV2 = !!process.env.DISCORD_TOKEN_V2?.trim();
        const prefDevEnv = !!(process.env.Dev_Discord_Token || process.env.Dev_Client_ID || process.env.Dev_Guild);
        if (usingV2) {
            console.log('    Env: using *_V2 (DISCORD_TOKEN_V2 / CLIENT_ID_V2 / GUILD_ID_V2) for this deploy.');
        } else if (!prefDevEnv) {
            console.warn('');
            console.warn('⚠️  No Dev_* or *_V2 vars — using DISCORD_TOKEN / CLIENT_ID / GUILD_ID.');
            console.warn('   For dev-server deploys, set Dev_*; for a new prod app, set DISCORD_TOKEN_V2 + CLIENT_ID_V2 + GUILD_ID_V2.');
            console.warn('');
        }

        console.log(`🔄 Registering ${commands.length} slash command(s)…`);
        console.log(`    Application (client): ${clientId}`);
        console.log(`    Guild:                 ${guildId}`);
        console.log(deployGlobal ? '    Mode: guild + optional global fallback (DEPLOY_GLOBAL_COMMANDS)' : '    Mode: guild only (safe for daily dev)');
        console.log('');

        let guildData;

        try {
            guildData = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        } catch (guildError) {
            console.error('❌ Guild command deploy failed:', guildError.rawError ?? guildError.message);
            console.error('');
            console.error(
                `   Request: PUT /applications/${clientId}/guilds/${guildId}/commands — fix guild access or IDs before retrying.`
            );

            const code = guildError.code ?? guildError.rawError?.code;
            if (code === 50001 || code === 50013) {
                console.error(
                    '   (Missing Permissions) Re-invite this bot with **`applications.commands`** and ensure it has a role / channel access.'
                );
            }
            if (code === 10004) console.error('   (Unknown guild) **`Dev_Guild` / `GUILD_ID`** is wrong for this token.');

            printDevHint();

            // Only optionally try global if explicitly opted in AND user understands prod implications
            if (!deployGlobal) {
                console.error('');
                console.error(
                    '🛑 Not falling through to global deploy (prevents stray / unauthorized PUTs). To force global: `DEPLOY_GLOBAL_COMMANDS=true npm run deploy`.'
                );
                process.exit(1);
            }

            console.log('⚠️  DEPLOY_GLOBAL_COMMANDS=true — attempting global PUT as fallback…');
            try {
                guildData = await rest.put(Routes.applicationCommands(clientId), { body: commands });
                console.log(`✅ Global deploy OK (${guildData.length} commands) — may take up to ~1 hr to propagate.`);
            } catch (globalError) {
                console.error('❌ Global fallback also failed:', globalError.rawError ?? globalError.message);
                const gCode = globalError.code ?? globalError.rawError?.code;
                if (gCode === 20012 || globalError.rawError?.code === 20012) {
                    console.error('');
                    console.error(
                        '   Discord 20012: token is not allowed to manage **this application’s** slash commands.'
                    );
                    console.error(
                        '   → Use the **Bot token** copied from Developer Portal → **Applications** → *that exact app* → Bot.'
                    );
                    console.error('   → `Dev_Client_ID` must be that application’s OAuth2 Application ID.');
                }
                printDevHint();
                process.exit(1);
            }
            return;
        }

        console.log(`✅ Successfully registered ${guildData.length} guild slash command(s) on your dev guild.`);
        console.log('    They usually appear instantly after restart / cache refresh.');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        if (error.rawError?.code === 20012 || error.code === 20012) {
            printDevHint();
        }
        process.exit(1);
    }
})();
