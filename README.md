# Korō Assistant (Discord.js v14) — v1.1

Modern, modular, secure Discord bot with:
- Guild-only slash registration (fast dev)
- Centralized embeds (brand styling)
- Boot logs with timestamp/uptime/RSS
- Welcome + auto-role
- Rules auto-sync from local file (no DB)
- /clear admin command
- Supabase init + ping at boot only

## Quick Start

1) Create env
```bash
cd discord-bot
cp .env.example .env
# Fill DISCORD_TOKEN, DISCORD_APP_ID, GUILD_ID
# Optional: SUPABASE_URL, SUPABASE_ANON_KEY (for boot-only health check)
```

2) Configure IDs and brand
- Edit config.json
```json
{
  "botName": "Korō Assistant",
  "version": "1.1.0",
  "color": "#0CC0DF",
  "defaultLanguage": "en",
  "guildId": "<GUILD_ID>",
  "channels": {
    "welcomeChannelId": "<CHANNEL_ID_WELCOME>",
    "rulesChannelId": "<CHANNEL_ID_RULES>"
  },
  "roles": { "autoRoleId": "<ROLE_ID_ASSIGNED_ON_JOIN>" },
  "embeds": { "brand": { "accentHex": "#5865F2", "footerText": "© Bynex", "thumbnailUrl": "" } }
}
```

3) Rules content
- Place either content/rules.json or content/rules.md
- Example rules.json:
```json
{
  "version": 3,
  "title": "Server Rules",
  "lines": [
    "Be respectful to everyone.",
    "No spam, ads, or self-promo.",
    "Use the right channels for each topic."
  ],
  "lastUpdated": "2025-08-21T10:15:00Z"
}
```

4) Install & Run
```bash
yarn
yarn dev
```

5) Invite bot (if needed)
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147483648&scope=bot%20applications.commands
```

## Features
- Boot Logs:
  - [READY] Logged in as <bot>
  - [BOOT] Launched at 2025-08-21T12:34:56.789Z | Uptime: 0s | RSS: 72MB
- Welcome + Auto-role (guildMemberAdd):
  - Assign roles.autoRoleId (if set)
  - Send brand-styled welcome embed to channels.welcomeChannelId
- Rules Auto-sync (no DB):
  - On boot, read local content
  - Compute hash/version, compare to .cache/rules.json
  - If missing: post & pin a single embed in channels.rulesChannelId
  - If changed: edit the same message
  - If unchanged: no action
- Admin /clear:
  - /clear amount:1..100, requires ManageMessages
  - Deletes messages younger than 14 days, returns ephemeral embed
- Supabase Health Check:
  - Initialize client and call auth.getSession() at boot
  - No tables or business queries

## Troubleshooting
- Ensure bot has permissions in welcome/rules channels (send, manage messages, pin)
- Verify IDs in config.json (guild, channels, role)
- Check .cache/rules.json (messageId, lastAppliedHash)
- If rules don’t update, confirm content file changed and bot can edit pinned message

## Development Notes
- All user-facing messages use brand embed helpers (lib/embeds.js)
- Dynamic loaders tolerate empty categories
- Cooldowns prevent spam
- Errors are logged; bot should not crash