# Running Focus Bot as a Service

This guide covers running Focus Bot as a persistent background service on Linux (systemd) and macOS (launchd).

## Prerequisites

- Bun installed and working (`bun --version`)
- Bot runs successfully in the foreground (`bun run start`)
- `.env` file configured in the project root

Find your Bun path (you'll need it below):

```bash
which bun
```

## Linux (systemd user service)

### 1. Create the service file

```bash
mkdir -p ~/.config/systemd/user
```

Create `~/.config/systemd/user/focus-bot.service` with this content:

```ini
[Unit]
Description=Focus Bot - Telegram to Obsidian note capture
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/YOUR_USER/code/focus-bot
ExecStart=/home/YOUR_USER/.bun/bin/bun run start
Restart=always
RestartSec=5
EnvironmentFile=/home/YOUR_USER/code/focus-bot/.env

[Install]
WantedBy=default.target
```

Replace `/home/YOUR_USER` with your actual home directory path throughout.

### 2. Enable lingering

This keeps your user services running after you log out:

```bash
loginctl enable-linger $USER
```

### 3. Start the service

```bash
systemctl --user daemon-reload
systemctl --user enable focus-bot.service
systemctl --user start focus-bot.service
```

### 4. Verify

```bash
systemctl --user status focus-bot
```

### Common commands

```bash
# Start / stop / restart
systemctl --user start focus-bot
systemctl --user stop focus-bot
systemctl --user restart focus-bot

# View status
systemctl --user status focus-bot

# Follow logs live
journalctl --user -u focus-bot -f

# Recent logs
journalctl --user -u focus-bot -n 50

# Enable / disable auto-start
systemctl --user enable focus-bot
systemctl --user disable focus-bot
```

### Updating after code changes

```bash
systemctl --user restart focus-bot
```

If you edited the service file itself:

```bash
systemctl --user daemon-reload
systemctl --user restart focus-bot
```

## macOS (launchd)

### 1. Create the plist file

Create `~/Library/LaunchAgents/com.focus-bot.plist` with this content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.focus-bot</string>

    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/code/focus-bot</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USER/.bun/bin/bun</string>
        <string>run</string>
        <string>start</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/YOUR_USER/.bun/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USER/Library/Logs/focus-bot.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USER/Library/Logs/focus-bot.error.log</string>
</dict>
</plist>
```

Replace `/Users/YOUR_USER` with your actual home directory path throughout.

Note: launchd doesn't support `EnvironmentFile`. You have two options for environment variables:

**Option A** — Add each variable to the plist's `EnvironmentVariables` dict:

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>PATH</key>
    <string>/Users/YOUR_USER/.bun/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>TELEGRAM_BOT_TOKEN</key>
    <string>your-token-here</string>
    <key>ALLOWED_USER_IDS</key>
    <string>123456</string>
    <!-- ... other vars ... -->
</dict>
```

**Option B** (recommended) — Use a wrapper script that sources `.env`:

Create `run.sh` in the project root:

```bash
#!/bin/bash
set -a
source "$(dirname "$0")/.env"
set +a
exec bun run start
```

```bash
chmod +x run.sh
```

Then change the plist's `ProgramArguments` to:

```xml
<key>ProgramArguments</key>
<array>
    <string>/Users/YOUR_USER/code/focus-bot/run.sh</string>
</array>
```

### 2. Load and start the service

```bash
launchctl load ~/Library/LaunchAgents/com.focus-bot.plist
```

### 3. Verify

```bash
launchctl list | grep focus-bot
```

A `0` in the status column means it's running. A non-zero number means it exited with an error.

### Common commands

```bash
# Start / stop
launchctl load ~/Library/LaunchAgents/com.focus-bot.plist
launchctl unload ~/Library/LaunchAgents/com.focus-bot.plist

# Check status
launchctl list | grep focus-bot

# View logs
tail -f ~/Library/Logs/focus-bot.log
tail -f ~/Library/Logs/focus-bot.error.log
```

### Updating after code changes

```bash
launchctl unload ~/Library/LaunchAgents/com.focus-bot.plist
launchctl load ~/Library/LaunchAgents/com.focus-bot.plist
```

## Troubleshooting

**Service won't start** — Test the bot manually first:

```bash
bun run start
```

If that works but the service doesn't, check that all paths in the service/plist file are absolute and correct.

**Linux: service stops after logout** — Make sure lingering is enabled:

```bash
loginctl enable-linger $USER
```

**macOS: "Operation not permitted"** — You may need to grant Full Disk Access to the terminal or bun in System Settings > Privacy & Security.
