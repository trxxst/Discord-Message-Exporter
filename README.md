# Discord Message Exporter

A desktop app (Electron + React + TypeScript) that exports Discord **servers, channels, threads,
forum posts and DMs** you are allowed to read into a structured, **offline-readable** local
archive: JSON for machines, HTML for humans, and a server-level `index.html` that links the whole
backup together. Inside the app it is called **Discord Backup**.

## Download

Get the latest Windows build from the
[Releases page](https://github.com/trxxst/Discord-Message-Exporter/releases/latest): the installer
(`DiscordBackup-<version>-setup.exe`) or the portable `.exe` that runs without installing. The
builds are not code-signed, so Windows SmartScreen may warn on first launch; choose **More info**
and then **Run anyway**. Each release includes `SHA256SUMS.txt` to verify the download.

## Features

- **Account manager**: add, rename, refresh and remove accounts. Tokens are encrypted at rest
  with Electron `safeStorage` (Windows DPAPI, macOS Keychain, libsecret on Linux).
- **Bot or user token** authentication (see [Authentication and Terms of Service](#authentication-and-terms-of-service)).
- **Sources**: a single channel, a full server, a full server minus excluded channels, or a DM /
  group DM.
- **Threads and forums**: active threads, public archived threads and forum/media channel posts
  are exported next to their parent channel.
- **Role filter**: optionally keep only messages from members who currently hold selected roles.
- **Presets**: Full Archive, Messages Only, Media Only and Minimal, plus individual toggles for
  avatars, media and files, stickers, threads, update mode and ZIP.
- **Media download**: attachments, embed images, avatars and stickers (Lottie stickers are saved
  as JSON) go into each conversation's local `media/` folder.
- **Offline viewer**: every transcript opens in a browser with search, six themes and an image
  lightbox, using only local files.
- **Update mode**: re-export only messages newer than the last saved one into an existing backup.
- **ZIP packaging** of the finished archive.
- **Resilient export engine**: honours Discord rate limits, retries transient errors, and logs and
  skips a failing channel, message or attachment instead of aborting the run.
- **Live log panel** with level filters, auto-scroll and a progress bar.

## Output structure

```
<output-folder>/<server-name>/
  index.html          server homepage linking every channel and thread
  metadata.json       counts and the list of exported channels and threads
  server-icon.png
  assets/             styles.css, app.js (shared offline viewer)
  channels/<name>/    index.html, messages.html, messages.json, media/
  threads/<name>/     index.html, messages.html, messages.json, media/
```

Open the server `index.html` in any browser. It works entirely from local files.

## Getting started

### Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- Windows for the packaged installer (the app itself also runs in dev mode on macOS and Linux)

### Run from source

```bash
git clone https://github.com/trxxst/Discord-Message-Exporter.git
cd Discord-Message-Exporter
npm install
npm run dev
```

### Build a Windows executable

```bash
npm run dist
```

This writes a portable `.exe` and an NSIS installer to `release/`. On Windows you can also run
`setup&build.bat`, which checks the environment, installs dependencies, builds and packages in one
step (`--portable`, `--installer`, `--dir`, `--dev`, `--launch` and `--skip-deps` are supported).

### Scripts

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Start the app with hot reload                          |
| `npm run typecheck` | Type-check the main, preload and renderer code         |
| `npm run build`     | Bundle the app into `out/`                             |
| `npm run start`     | Run the bundled app                                    |
| `npm run package`   | Build an unpacked app in `release/win-unpacked/`       |
| `npm run dist`      | Build the portable exe and the installer in `release/` |

## Setting up a bot token (recommended)

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications)
   and add a bot to it.
2. Under **Bot**, enable the **Message Content Intent**. Without it Discord returns empty message
   text for most messages.
3. Invite the bot to your server with the **View Channels** and **Read Message History**
   permissions, for example:
   `https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot&permissions=66560`
4. In the app, click **Add account**, choose **Bot token** and paste the bot's token.

A bot can only export servers it has been invited to and channels it can see. It cannot list or
read your personal DMs.

## Authentication and Terms of Service

- **Bot token** (recommended): a bot you own, fully within Discord's permission system.
- **User token**: reads everything your account can see, including DMs. **Using a user token
  with a third-party client ("self-bot") violates Discord's Terms of Service and can get the
  account banned.** The app shows this warning when you choose it. Use it only at your own risk and
  only on data you are entitled to keep.

The app never asks for a password, never extracts tokens from the Discord client, and only reads
data through the documented REST API with the permissions the token already has. Only export
conversations you have the right to archive, and respect the privacy of the people in them.

## Security notes

- Tokens are stored in `accounts.json` in the app's user-data folder, encrypted with
  `safeStorage`. If the operating system offers no encryption backend (for example Linux without a
  keyring), the token is stored base64-encoded, which is **not** encryption.
- Media is only downloaded from Discord's own hosts. External embed images are fetched through
  Discord's media proxy, so an embed cannot make the app request arbitrary URLs.
- Message content is escaped in the generated HTML, and the offline viewer builds links only from
  `http(s)` URLs.

Please report security issues privately through
[GitHub Security Advisories](https://github.com/trxxst/Discord-Message-Exporter/security/advisories/new)
rather than in a public issue.

## Known limitations

- Update mode only fetches messages newer than the last saved one. Edits, deletions and reactions
  on older messages are not refreshed; run a full export to capture them.
- Private archived threads are not exported (listing them needs the Manage Threads permission).
- The packaging config targets Windows only.

## Project structure

- `src/main`: Electron main process. Discord REST client (`discord/`), export engine (`export/`),
  archive generators (`render/`), account store, log bus and IPC handlers.
- `src/preload`: the typed `window.api` bridge (context isolation on).
- `src/renderer`: React dashboard (zustand store, themed UI, log panel).
- `src/shared`: types and IPC channel names shared by all processes.

## Disclaimer

This project is not affiliated with, endorsed by or sponsored by Discord Inc. "Discord" is a
trademark of Discord Inc.

## License

[MIT](LICENSE)
