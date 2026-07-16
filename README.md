# 🤖 TIFA Dashboard - Robot Fleet Management Web App

**Next.js-based Web Dashboard** for monitoring and controlling TIFA service robots with real-time WebSocket communication and PostgreSQL database.

> **Cloudflare Tunnel** — Database diakses via `cloudflared` TCP tunnel. Jalankan `npm run dev` untuk start Next.js + tunnel secara bersamaan.

---

## 📋 Table of Contents

1. [Quick Start](#-quick-start)
2. [Features](#-features)
3. [Architecture](#-architecture)
4. [Database](#-database)
5. [WebSocket Integration](#-websocket-integration)
6. [Robot Control Commands](#-robot-control-commands)
7. [API Routes](#-api-routes)
8. [Pages & Navigation](#-pages--navigation)
9. [Development](#-development)
10. [Deployment](#-deployment)
11. [Troubleshooting](#-troubleshooting)

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables
# Buat file .env.local (lihat bagian Development)

# Start development server (Next.js + Cloudflare Tunnel)
npm run dev
```

**Access:** http://localhost:3000

> **Prerequisite:** `cloudflared` CLI harus terinstall. Dev script menjalankannya otomatis.

---

## 🎯 Features

### Dashboard & Monitoring

- ✅ **📊 Fleet Dashboard** — Robot count, avg battery, error count, activity chart
- ✅ **🤖 Robot List** — Semua robot dengan status real-time (mode, baterai, posisi)
- ✅ **🔍 Per-Robot Detail** — Battery history, position log, state log, command history
- ✅ **🗺️ Map Management** — Lihat, assign, dan kelola peta & goals robot
- ✅ **🔔 Notification Center** — Alert baterai rendah, error, WS traffic events

### Robot Control

- ✅ **📦 Navigation (OP)** — Multi-tray delivery dengan goal selection per tray
- ✅ **🔙 Move Command** — Kirim robot ke Homebase atau Charging Station
- ✅ **🕹️ Teleop (D-Pad)** — Kontrol manual robot via virtual joystick
- ✅ **🗺️ Mapping** — Start, stop, save, flag goals saat live mapping
- ✅ **📍 Map Selection** — Assign active map ke robot via `MAP_SELECTED` command
- ✅ **📤 Map Data** — Kirim data peta ke robot via `MAP_DATA` command
- ✅ **🎙️ Voice Control** — Toggle TALK_ON/OFF untuk robot AI server

### System

- ✅ **🔐 Auth** — Login dengan role-based access (admin / operator)
- ✅ **🌐 i18n** — Bahasa Indonesia & English
- ✅ **🎨 Dark / Light Mode** — Theme switcher dengan transisi smooth
- ✅ **⚙️ Settings Page** — Konfigurasi WS URL, UI ID, Robot ID, Map ID
- ✅ **🔌 WebSocket Session Control** — Turn ON/OFF koneksi WS, dengan session locking per user
- ✅ **📖 Product Docs** — Diagonal company landing + TIFA landing & dokumentasi

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| UI | [React 19](https://react.dev/) |
| Styling | [TailwindCSS 4](https://tailwindcss.com/) + Vanilla CSS |
| Language | TypeScript 5 |
| Database | PostgreSQL via [`pg`](https://node-postgres.com/) |
| WebSocket | [`ws`](https://github.com/websockets/ws) (server-side) |
| Font | [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) |
| Tunnel | [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) |
| Compression | [`archiver`](https://www.npmjs.com/package/archiver) + [`adm-zip`](https://www.npmjs.com/package/adm-zip) (map ZIP builder/reader) |
| XML | [`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) (XML parsing) |

### Communication Flow

```
┌──────────────┐    fetch/API    ┌──────────────────┐
│   Browser    │ ◄────────────► │  Next.js Server   │
│  (React 19)  │                │  (API Routes)     │
└──────────────┘                └──────┬──────┬─────┘
                                       │      │
                         cloudflared   │      │  wss://
                         TCP tunnel    │      │
                                       ▼      ▼
                               ┌────────────┐ ┌──────────────┐
                               │ PostgreSQL  │ │  Robot WS    │
                               │  (tifa DB) │ │  Broker      │
                               └────────────┘ └──────┬───────┘
                                                      │
                                                      ▼
                                               ┌──────────────┐
                                               │  TIFA Robot  │
                                               │  (TFRB1)     │
                                               └──────────────┘
```

### Project Structure

```
tifa-dashboard/
├── app/
│   ├── (auth)/                     # Auth pages
│   │   └── login/page.tsx          #   Login page
│   ├── (dashboard)/                # Protected dashboard (sidebar layout)
│   │   ├── layout.tsx              #   Sidebar + header + WS session control
│   │   ├── dashboard/page.tsx      #   Fleet monitoring overview
│   │   ├── robots/
│   │   │   ├── page.tsx            #   Robot list
│   │   │   ├── [id]/page.tsx       #   Per-robot detail + control panel
│   │   │   ├── manage/page.tsx     #   CRUD robot management
│   │   │   └── maps/page.tsx       #   Map management
│   │   ├── notifications/page.tsx  #   Notification center
│   │   └── settings/page.tsx       #   WS & communication settings
│   ├── api/                        # Next.js Route Handlers (backend)
│   │   ├── auth/
│   │   ├── battery/
│   │   ├── commands/
│   │   ├── dashboard/
│   │   ├── device-status/
│   │   ├── goals/
│   │   ├── maps/
│   │   ├── notifications/
│   │   ├── position/
│   │   ├── robot-control/
│   │   ├── robots/
│   │   ├── settings/
│   │   ├── state/
│   │   ├── ws/
│   │   │   ├── connect/            #   Trigger WS connection
│   │   │   └── session/            #   WS session ON/OFF management
│   │   └── ws-traffic/
│   ├── tifa/
│   │   ├── page.tsx                # TIFA product landing page
│   │   └── docs/                   # Product documentation
│   ├── page.tsx                    # Diagonal company landing page
│   ├── layout.tsx                  # Root layout (providers, font, metadata)
│   └── globals.css                 # Design tokens + global styles
│
├── components/
│   ├── RobotControlPanel.tsx       # Full robot control UI (OP, MOVE, TELEOP, MAPPING, TALK)
│   ├── TeleopDpad.tsx              # Virtual D-Pad joystick
│   ├── NotificationBell.tsx        # Real-time notification dropdown
│   ├── RobotSelectorModal.tsx      # Robot picker dialog
│   ├── RobotReadyToast.tsx         # Robot status toast
│   ├── WebSocketSessionControl.tsx # WS session ON/OFF toggle (header)
│   ├── BatteryIcon.tsx             # Battery level indicator
│   ├── ThemeProvider.tsx           # Dark/light theme context
│   ├── ThemeSwitcher.tsx           # Theme toggle button
│   ├── LanguageProvider.tsx        # i18n context
│   ├── LanguageSwitcher.tsx        # Language toggle (dashboard)
│   ├── LandingLanguageSwitcher.tsx # Language toggle (landing pages)
│   ├── UserDropdown.tsx            # User menu
│   ├── LogoutConfirmDialog.tsx     # Logout modal
│   ├── DiagonalNavbar.tsx          # Landing page navbar
│   ├── Navbar.tsx                  # Alternative navbar component
│   ├── InteractiveCursor.tsx       # Custom cursor effect
│   └── CursorDragAnimation.tsx     # Cursor drag animation
│
├── lib/
│   ├── api/                        # Server-side DB query functions
│   │   ├── auth.ts                 #   Sign in / sign out / current user
│   │   ├── battery.ts              #   Battery history & stats
│   │   ├── commands.ts             #   Command log queries
│   │   ├── dashboard.ts            #   Aggregated fleet stats
│   │   ├── deviceStatus.ts         #   v_device_status view
│   │   ├── goals.ts                #   Goal CRUD
│   │   ├── maps.ts                 #   Map queries
│   │   ├── mapDataBuilder.ts       #   Map ZIP builder (archiver + adm-zip)
│   │   ├── notifications.ts        #   Notification feed
│   │   ├── position.ts             #   Position history
│   │   ├── robotControl.ts         #   Command orchestration
│   │   ├── robots.ts               #   Robot CRUD
│   │   ├── state.ts                #   Robot state history
│   │   ├── wsTraffic.ts            #   WS traffic log
│   │   ├── activityLog.ts          #   Activity + sentiment
│   │   └── index.ts                #   Client re-exports
│   ├── types/database.ts           # TypeScript types (PostgreSQL schema)
│   ├── utils/robotGrouping.ts      # Device grouping logic (RB + UI_TIFA)
│   ├── dbClient.ts                 # PostgreSQL Pool + retry logic
│   ├── wsClient.ts                 # WebSocket client (robot communication)
│   ├── client-api.ts               # Frontend fetch wrappers
│   ├── settings.ts                 # Runtime settings (data/settings.json)
│   ├── sessionId.ts                # Per-user unique UI Client ID generator
│   ├── dictionaries.ts             # i18n: Dashboard (ID/EN)
│   ├── dictionaries-diagonal.ts    # i18n: Diagonal landing
│   └── dictionaries-tifa.ts        # i18n: TIFA landing
│
├── data/
│   └── settings.json               # Runtime WS & communication settings
│
├── public/                         # Static assets
│   ├── logo/                       #   Diagonal logos
│   ├── diagonal/                   #   Brand assets
│   └── tifa/                       #   Product images
│
├── .env.local                      # Environment variables (git-ignored)
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
└── eslint.config.mjs
```

---

## 🗄️ Database

### Connection

Database diakses lewat **Cloudflare Tunnel** (`cloudflared`) yang mem-proxy TCP ke PostgreSQL remote:

```
localhost:5002  ←→  cloudflared  ←→  postgres.forgixrobotic.com
```

Tunnel dijalankan otomatis saat `npm run dev`.

### Schema Convention

| Prefix | Category | Contoh |
|--------|----------|--------|
| `m_` | Master Data | `m_device`, `m_map`, `m_goal`, `m_company` |
| `h_` | History / Logs | `h_battery`, `h_position`, `h_state`, `h_command_log`, `h_ws_traffic` |
| `t_` | Transactions | `t_goal_queue`, `t_user`, `t_user_role`, `t_settings` |
| `v_` | Views | `v_device_status` |

### Key Tables

```sql
-- Master devices (robots + tablets + web)
m_device    (device_id, device_code, device_name, active_map_id, ...)

-- Maps and goals
m_map       (map_id, map_name, map_floor, ...)
m_goal      (goal_id, map_id, goal_name, goal_type, x, y, yaw, ...)
-- goal_type: TABLE | CHARGE | HOME | CUSTOM

-- Command queue
t_goal_queue (goal_queue_id, queue_code, device_id, map_id, status, payload, ...)
-- status: QUEUED | IN_PROGRESS | DONE | FAILED | CANCELLED

-- Logs
h_command_log  (device_id, command_code, command_payload, status, ...)
h_ws_traffic   (device_id, direction, code, payload, recorded_at, ...)
h_battery      (device_id, battery_percent, voltage, recorded_at, ...)
h_position     (device_id, x, y, yaw, recorded_at, ...)
h_state        (device_id, robot_mode, robot_activity, is_emergency, ...)
```

### Robot Modes

`IDLE` | `MOVING` | `CHARGING` | `MAPPING` | `RETURNING_HOME` | `ERROR` | `PAUSED`

### DB Client Features

- **Connection pool** — max 20 clients, 30s idle timeout
- **Auto-retry** — retry 2x on `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `EPIPE`, `EAI_AGAIN`
- **Typed queries** — generic `query<T>()` dan `queryWithCount<T>()` helpers
- **Transaction support** — `transaction(callback)` dengan auto commit/rollback
- **Connection test** — `testConnection(retries, delayMs)` dengan exponential backoff

---

## 🔌 WebSocket Integration

### Connection

**Broker URL**: `wss://tifa-ws.forgixrobotic.com` (configurable via Settings page)

WebSocket dikelola **server-side** di `lib/wsClient.ts`. Browser tidak connect langsung ke WS — semua command dikirim lewat Next.js API routes.

```
Browser → POST /api/robot-control → wsClient.ts → WS Broker → TFRB1
```

### WebSocket Session Control

WS connection dikelola via **session locking** agar hanya satu user yang mengontrol robot pada satu waktu:

- **Turn ON** — User klaim session WS, koneksi dimulai
- **Turn OFF** — User lepas session, koneksi diputus
- **Locked** — Jika user lain sedang memegang session, tombol di-disable
- Status ditampilkan di header dashboard via `WebSocketSessionControl` component
- Session state disimpan di `data/settings.json` (`isWsTurnedOn`, `activeUserEmail`)

### Device IDs

| ID | Device | Keterangan |
|----|--------|------------|
| `TFRB1` | Robot TIFA | Target utama semua command |
| `TFUI1` | Tablet App | Aplikasi mobile (Android) |
| `TFWB1` | Web Dashboard | Dashboard ini (sender, default) |

> **Note:** UI ID bisa dikonfigurasi di Settings page. Per-user unique ID juga di-generate via `sessionId.ts` dengan format `TFWB_{emailHash}_{tabSuffix}`.

### Session Flow

1. `wsClient.ts` connect ke `wss://tifa-ws.forgixrobotic.com`
2. Kirim **SI (Session Identify)**: `{ code: "SI", data: { type: "UI", ui_id: "TFWB1" } }`
3. Terima **ACK_SOFT** → session aktif, siap kirim command
4. Jika `DUPLICATE_UI_ID` → retry dengan progressive delay (3s → 5s → 10s)
5. Auto-reconnect setiap 5 detik jika koneksi putus
6. Jika `Send SI first` error → otomatis re-send SI

### Payload Encoding

Payload di-encode ke Base64 sebelum dikirim dari frontend untuk keamanan transport:

```typescript
encodePayload(payload)   // object → Base64 string
decodePayload(encoded)   // Base64 string → object
```

---

## 🎮 Robot Control Commands

### Outgoing (Dashboard → Robot)

#### OP — Multi-Tray Navigation

```json
{
  "code": "OP",
  "data": {
    "type": "OP",
    "map_id": "1",
    "robot_id": "TFRB1",
    "tray_tasks": [
      { "tray": 1, "dest": { "x": 2.54, "y": 2.04, "yaw": 0.0 }, "goal_id": 10 },
      { "tray": 2, "dest": { "x": 1.30, "y": 2.59, "yaw": 1.57 }, "goal_id": 11 }
    ],
    "home_base": { "x": 0.0, "y": 0.0, "yaw": 0.0 },
    "reqested_by": 1
  },
  "origin": "UI",
  "origin_id": "TFWB1",
  "timestamp": "2026-05-06T15:00:00.000Z",
  "message_id": "uuid-v4"
}
```

**Notes**:
- `goal_id` diambil dari tabel `m_goal` di PostgreSQL
- `home_base` diambil dari goal dengan `goal_type = 'HOME'`
- Command di-log ke `t_goal_queue` dan `h_command_log`

#### MOVE — Homebase / Charging Station

```json
{
  "code": "MOVE",
  "data": {
    "type": "HOMEBASE",
    "robot_id": "TFRB1",
    "dest": { "x": 0.0, "y": 0.0, "yaw": 0.0 },
    "sequence": 5,
    "home_base": { "x": 0.0, "y": 0.0, "yaw": 0.0 }
  },
  "origin": "UI",
  "origin_id": "TFWB1",
  "timestamp": "2026-05-06T15:00:00.000Z",
  "message_id": "uuid-v4"
}
```

**Type values**: `"HOMEBASE"` | `"CHARGING"`

#### TELEOP — Manual Control

```json
{
  "code": "TELEOP",
  "data": {
    "robot_id": "TFRB1",
    "ui_id": "TFWB1",
    "linear": { "x": 0.5, "y": 0.0, "z": 0.0 },
    "angular": { "x": 0.0, "y": 0.0, "z": 0.3 },
    "speed": "S"
  }
}
```

**Speed values**: `"S"` (Slow) | `"F"` (Fast) | `"VF"` (Very Fast)

#### TELEOP_DONE — End Manual Control

```json
{
  "code": "TELEOP_DONE",
  "data": {
    "robot_id": "TFRB1",
    "ui_id": "TFWB1",
    "status": "done"
  }
}
```

#### MAPPING Commands

```json
{
  "code": "MAPPING_START",
  "data": {
    "robot_id": "TFRB1",
    "ui_id": "TFWB1",
    "status": true,
    "is_auto": false,
    "timestamp": "2026-05-06T15:00:00.000Z"
  }
}
```

**Code values**: `MAPPING_START` | `MAPPING_STOP` | `MAPPING_SAVE` | `MAPPING_FLAG`

- `MAPPING_SAVE` tambahan fields: `map_name`, `category`, `category_type`
- `MAPPING_FLAG` tambahan fields: `goal_name`

#### MAP_SELECTED — Set Active Map

```json
{
  "code": "MAP_SELECTED",
  "data": {
    "robot_id": "TFRB1",
    "ui_id": "TFWB1",
    "map_id": 3,
    "timestamp": "2026-05-06T15:00:00.000Z"
  },
  "origin": "UI",
  "origin_id": "TFWB1",
  "timestamp": "2026-05-06T15:00:00.000Z",
  "message_id": "uuid-v4"
}
```

#### MAP_DATA — Send Map Data to Robot

```json
{
  "code": "MAP_DATA",
  "data": {
    "robot_id": "TFRB1",
    "ui_id": "TFWB1",
    "map_id": 3,
    "format": "zip",
    "encoding": "base64",
    "payload": "<base64-encoded-zip>"
  },
  "origin": "UI",
  "origin_id": "TFWB1",
  "timestamp": "2026-05-06T15:00:00.000Z",
  "message_id": "uuid-v4"
}
```

#### CONTROL — Voice Toggle

```json
{
  "code": "CONTROL",
  "data": {
    "type": "control",
    "ui_id": "TFWB1",
    "action": "TALK_ON",
    "robot_id": "TFRB1"
  },
  "origin": "UI",
  "origin_id": "TFWB1"
}
```

**Action values**: `"TALK_ON"` | `"TALK_OFF"`

### Incoming (Robot → Dashboard)

#### MAPPING_DONE

```json
{
  "code": "MAPPING_DONE",
  "data": {
    "robot_id": "TFRB1",
    "coverage": 0.87,
    "frontier_ratio": 0.03,
    "method": "auto",
    "is_auto": false
  }
}
```

Di-log ke `h_command_log` + `h_ws_traffic`, dan muncul di Notification Bell.

#### Incoming Event Summary

| Code | Aksi |
|------|------|
| `ACK_SOFT` | Session established, siap menerima command |
| `MAPPING_DONE` | Log ke DB + trigger notifikasi |
| `ACK` / `INIT` / `DISCONNECT` | Log ke `h_ws_traffic` |
| `ERROR` | Log ke `h_ws_traffic` + console |
| `ERROR: DUPLICATE_UI_ID` | Retry dengan progressive delay |
| `ERROR: Send SI first` | Otomatis re-send SI |
| Voice status update | Update `isListening` state |

---

## 🌐 API Routes

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/api/auth?action=signin` | Login |
| `POST` | `/api/auth?action=signout` | Logout |
| `GET` | `/api/auth?action=me` | Current user |
| `GET` | `/api/dashboard` | Fleet stats aggregate |
| `GET` | `/api/robots` | List robots |
| `POST` | `/api/robots` | Create robot |
| `PUT` | `/api/robots?id=` | Update robot |
| `DELETE` | `/api/robots?id=` | Delete robot |
| `GET` | `/api/device-status` | Real-time status (`v_device_status`) |
| `GET` | `/api/battery?deviceId=` | Battery history |
| `GET` | `/api/position?deviceId=` | Position history |
| `GET` | `/api/state?deviceId=` | State history |
| `GET` | `/api/commands` | Command log |
| `GET` | `/api/maps` | List maps |
| `GET` | `/api/goals?mapId=` | Goals per map |
| `GET` | `/api/notifications` | Notification feed |
| `POST` | `/api/robot-control` | Send robot command |
| `GET` | `/api/ws-traffic` | WS traffic log |
| `GET` | `/api/settings` | Get communication settings |
| `POST` | `/api/settings` | Update communication settings |
| `GET` | `/api/ws/session` | Get WS session status |
| `POST` | `/api/ws/session` | Turn ON/OFF WS session |
| `POST` | `/api/ws/connect` | Trigger WS connection |

---

## 📱 Pages & Navigation

| Route | Halaman | Akses |
|-------|---------|-------|
| `/` | Diagonal company landing page | Public |
| `/tifa` | TIFA product landing page | Public |
| `/tifa/docs` | Dokumentasi produk TIFA | Public |
| `/login` | Login | Public |
| `/dashboard` | Fleet monitoring dashboard | Protected |
| `/robots` | Daftar semua robot | Protected |
| `/robots/[id]` | Detail + kontrol robot | Protected |
| `/robots/manage` | CRUD robot management | Protected |
| `/robots/maps` | Manajemen peta & goals | Protected |
| `/notifications` | Notification center | Protected |
| `/settings` | WS & communication settings | Protected |

---

## 🛠️ Development

### Prerequisites

- Node.js v18+
- `cloudflared` CLI ([install guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/))
- Akses ke PostgreSQL remote (via Cloudflare Tunnel)

### Environment Variables

Buat `.env.local` di root project:

```env
# Database (accessed via Cloudflare Tunnel)
DB_HOST=localhost
DB_PORT=5002
DB_NAME=tifa
DB_USER=tifa
DB_PASS=your_password_here

# WebSocket Robot Broker
WS_ROBOT_URL=wss://tifa-ws.forgixrobotic.com
```

### Runtime Settings

Settings runtime disimpan di `data/settings.json` dan bisa dikonfigurasi lewat halaman `/settings`:

```json
{
  "wsUrl": "wss://tifa-ws.forgixrobotic.com",
  "uiId": "TFWB1",
  "robotId": "TFRB1",
  "mapId": "50",
  "activeUserEmail": null,
  "isWsTurnedOn": false
}
```

### Scripts

| Script | Command | Keterangan |
|--------|---------|------------|
| Dev | `npm run dev` | Next.js + Cloudflare Tunnel (concurrent) |
| Build | `npm run build` | Production build |
| Start | `npm start` | Start production server |
| Lint | `npm run lint` | ESLint check |

### Dev Script Detail

```json
"dev": "npx concurrently -n \"next,tunnel\" -c \"cyan,magenta\"
        \"next dev\"
        \"cloudflared access tcp --hostname postgres.forgixrobotic.com --url localhost:5002\""
```

Satu command menjalankan keduanya sekaligus. Kalau tunnel tidak mau start, bisa jalankan manual di terminal terpisah:

```bash
cloudflared access tcp --hostname postgres.forgixrobotic.com --url localhost:5002
```

---

## 🚀 Deployment

```bash
# Build production bundle
npm run build

# Start production server
npm start
```

### Production Checklist

- ✅ Set environment variables di server (bukan `.env.local`)
- ✅ Jalankan `cloudflared` sebagai service (bukan hanya dev mode)
- ✅ Pastikan WS broker `wss://tifa-ws.forgixrobotic.com` reachable
- ✅ Test login dengan akun admin/operator
- ✅ Verifikasi WebSocket session — cek log `[WS Robot] ✅ Session established`
- ✅ Test kirim command OP dari Robot Control Panel
- ✅ Cek notifikasi baterai dan WS traffic di dashboard

---

## 🐛 Troubleshooting

### Database Error: ECONNRESET

**Problem**: `SignIn Error: Error: read ECONNRESET`

**Cause**: Cloudflare Tunnel tidak berjalan atau koneksi ke origin server gagal (`websocket: bad handshake`).

**Solution**:
```powershell
# Cek apakah cloudflared berjalan
tasklist | findstr cloudflared

# Restart tunnel
taskkill /F /IM cloudflared.exe
cloudflared access tcp --hostname postgres.forgixrobotic.com --url localhost:5002
```

### Robot Tidak Menerima Command

**Problem**: Command terkirim dari dashboard tapi robot tidak merespons.

**Solution**:
1. Cek log server — pastikan `[WS Robot] ✅ Session established as TFWB1` sudah muncul
2. Pastikan WS session sudah di-Turn ON via header dashboard
3. Cek `h_command_log` di database — apakah status `SENT` atau `QUEUED`?
4. Jika `QUEUED`, berarti WS tidak terkoneksi saat command dikirim
5. Verifikasi `TFRB1` terdaftar di tabel `m_device`

### DUPLICATE_UI_ID Error

**Problem**: `[WS Robot] ⚠️ Duplicate UI ID (TFWB1), old session still active`

**Cause**: Session lama belum expire di server saat Next.js di-restart.

**Solution**: Dashboard otomatis retry dengan delay 3s → 5s → 10s. Tunggu hingga session lama timeout otomatis. Tidak perlu action manual.

### Login Gagal Setelah Server Restart

**Problem**: User tidak bisa masuk atau halaman dashboard redirect ke login terus.

**Cause**: Auth menggunakan in-memory session — tidak persistent antar restart server.

**Solution**: Login ulang setelah server restart. Untuk production, implementasi JWT atau cookie-based session diperlukan.

### Tray Tidak Muncul di Control Panel

**Problem**: Tidak ada goal yang bisa dipilih di Robot Control Panel.

**Solution**:
1. Pastikan robot memiliki `active_map_id` yang ter-set di `m_device`
2. Pastikan map tersebut memiliki goals dengan `goal_type = 'TABLE'` atau `'CUSTOM'` di `m_goal`
3. Cek response dari `/api/goals?mapId=X`

### WebSocket Session Terkunci oleh User Lain

**Problem**: Tombol Turn ON disabled dan menampilkan nama user lain.

**Cause**: User lain sudah mengaktifkan WS session.

**Solution**: Minta user tersebut Turn OFF session, atau edit manual `data/settings.json` dan set `isWsTurnedOn: false`.

---

## 📝 Key Implementation Notes

### Command Queue Flow

Setiap command robot melalui flow:

```
1. POST /api/robot-control
2. Validate goals & fetch home_base dari m_goal
3. Build command payload (RobotNavCommandPayload)
4. INSERT INTO t_goal_queue (status: 'QUEUED')
5. sendRobotCommand() → wsClient.ts → WS Broker → TFRB1
6. INSERT INTO h_command_log (status: 'SENT' atau 'QUEUED' jika WS offline)
```

### Robot Grouping Logic

Devices terkait di-group berdasarkan suffix nomor untuk ditampilkan sebagai satu "unit robot":

```
TFRB1 ←→ TFUI1        (robot + tablet, naming baru)
RB001 ←→ UI_TIFA_001  (robot + tablet, naming lama)
```

### Daily Task Auto-Reset

Tasks dengan status `QUEUED`/`IN_PROGRESS` dari hari sebelumnya otomatis di-cancel:

```sql
UPDATE t_goal_queue
SET status = 'CANCELLED', fail_reason = 'Auto-cancelled: daily reset'
WHERE status IN ('QUEUED', 'IN_PROGRESS') AND created_at < CURRENT_DATE
```

### DB Connection Retry

```
Retryable errors: ECONNRESET, ECONNREFUSED, ETIMEDOUT, EPIPE, EAI_AGAIN
Max retries: 2
Delay: 500ms → 1000ms (exponential backoff)
```

### Per-User Session ID

Setiap user yang login mendapat unique UI Client ID:

```
Format: TFWB_{emailHash}_{tabSuffix}
Contoh: TFWB_b7a1_3f8e
```

- Berbeda user → berbeda ID
- Berbeda tab → berbeda ID
- Page refresh → ID sama (sessionStorage)
- Logout + login → ID baru

---

## 👥 Tim

**Diagonal Robotic Solution**

---

## 📄 License

Private — Diagonal Robotic Solution

---

**Last Updated**: July 2026 · **Version**: 0.1.0
