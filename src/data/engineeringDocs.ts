export interface EngineeringDoc {
  id: string;
  filename: string;
  title: string;
  summary: string;
  content: string;
}

export const ENGINEERING_DOCS: EngineeringDoc[] = [
  {
    id: 'prd',
    filename: '01-product-requirements.md',
    title: 'Product Requirements Document (PRD)',
    summary: 'Core definition, privacy boundaries, MVP scope, and non-goals.',
    content: `# 01 — Product Requirements Document (PRD)

## 1. Product Summary
ChatRoom is a temporary, privacy-first communication platform that enables anyone to spin up disposable group discussion rooms in seconds. Participants join via an ephemeral link or QR code with a temporary username—requiring zero phone numbers, zero emails, and zero persistent accounts.

## 2. Core Philosophy & Non-Negotiables
* **NO PHONE NUMBER**: Never require mobile identification.
* **NO REQUIRED EMAIL**: No inbox verification or newsletter capture.
* **NO PERMANENT PROFILE**: Identity exists strictly within the context of a single room.
* **NO CONTACT LIST**: No syncing address books or social graph harvesting.
* **TEMPORARY USERNAME**: Selected at entry; discarded upon exit.
* **TEMPORARY ROOM**: Hard time-to-live (TTL) expiration with automatic garbage collection.
* **ADMIN MODERATION**: Robust client & server role-based authorization for room owners and moderators.
* **ZERO EXPOSURE**: No public room indexing, directory crawls, or enumerations.

## 3. MVP Scope
* Room creation with configurable lifespan (1h, 6h, 24h, 72h).
* Join modes: Open, Password Protected, or Approval Queue.
* Cryptographically secure 6–10 character room codes (e.g. \`X7K9PQ\`).
* Real-time WebSocket/Broadcast text messaging with delivery timestamps.
* Online presence list, typing indicators, and slow mode rate limiting.
* Admin capabilities: Kick member, Ban/Unban member, Lock room, Soft-delete messages, End room.
* Expiration ticker with auto-destruction and data purge.
`
  },
  {
    id: 'architecture',
    filename: '02-system-architecture.md',
    title: 'System Architecture Specification',
    summary: 'Multi-tiered client-server topology, WebSocket event lifecycle, and scaling.',
    content: `# 02 — System Architecture Specification

## 1. Topology Overview
\`\`\`text
                  ┌───────────────────────┐
                  │        Browser        │
                  │   React + TypeScript  │
                  └───────────┬───────────┘
                              │
                    HTTPS / WSS / Broadcast
                              │
                              ↓
                  ┌───────────────────────┐
                  │      Room Engine      │
                  │  Express + Socket.IO  │
                  └───────────┬───────────┘
                              │
                 ┌────────────┴────────────┐
                 ↓                         ↓
          ┌──────────────┐          ┌─────────────┐
          │  PostgreSQL  │          │    Redis    │
          │   Supabase   │          │ (Pub/Sub &  │
          └──────────────┘          │ Rate-Limit) │
                                    └─────────────┘
\`\`\`

## 2. Temporary Identity Model
Unlike global identity systems, identity is strictly scoped to a \`(room_id, session_id)\` tuple.
* \`session_id\`: Cryptographically generated UUID stored in browser session storage.
* Re-entering another room generates an independent, unlinked identity.
* No fingerprinting or cross-room tracking is permitted.

## 3. Event Loop & Broadcast Protocol
* **Client to Engine**: \`send_message\`, \`typing_start\`, \`typing_stop\`, \`admin_action\`
* **Engine to Room**: \`receive_message\`, \`user_presence\`, \`room_locked\`, \`room_ended\`
* **Sync Engine**: In this build, multi-tab and multi-window instances sync instantaneously using Web \`BroadcastChannel\` and reactive local state buffers.
`
  },
  {
    id: 'db-schema',
    filename: '03-database-schema.md',
    title: 'Relational Database Schema',
    summary: 'Normalized PostgreSQL tables: rooms, room_members, messages, bans, and requests.',
    content: `# 03 — Relational Database Schema

## 1. Table Definitions

### \`rooms\`
\`\`\`sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(12) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'locked', 'ended', 'expired')),
  owner_session_id VARCHAR(64) NOT NULL,
  join_mode VARCHAR(20) NOT NULL CHECK (join_mode IN ('open', 'password', 'approval')),
  password_hash VARCHAR(255),
  slow_mode_seconds INT DEFAULT 0
);
CREATE INDEX idx_rooms_code ON rooms(room_code);
CREATE INDEX idx_rooms_expires ON rooms(expires_at);
\`\`\`

### \`room_members\`
\`\`\`sql
CREATE TABLE room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  username VARCHAR(30) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'moderator', 'member')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'pending', 'removed', 'banned')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, session_id)
);
\`\`\`

### \`messages\`
\`\`\`sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(30) NOT NULL,
  sender_role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(30)
);
CREATE INDEX idx_messages_room ON messages(room_id, created_at);
\`\`\`

### \`bans\`
\`\`\`sql
CREATE TABLE bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  username VARCHAR(30) NOT NULL,
  reason VARCHAR(255),
  banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
\`\`\`
`
  },
  {
    id: 'api-spec',
    filename: '04-api-specification.md',
    title: 'API & WebSocket Specification',
    summary: 'RESTful endpoints, request/response contracts, and WebSocket event payloads.',
    content: `# 04 — API & WebSocket Specification

## 1. REST Endpoints
* \`POST /api/rooms\` — Create a new temporary chat room.
* \`GET /api/rooms/:roomCode\` — Fetch room metadata (sanitized, password omitted).
* \`POST /api/rooms/:roomCode/join\` — Request room membership with temporary username.
* \`POST /api/rooms/:roomCode/leave\` — Terminate active session and leave room.
* \`GET /api/rooms/:roomCode/members\` — List active members & roles.
* \`GET /api/rooms/:roomCode/messages\` — Fetch active message timeline.
* \`POST /api/rooms/:roomCode/messages\` — Post new message (subject to slow mode & rate limit).
* \`DELETE /api/rooms/:roomCode/messages/:id\` — Soft-delete message (Owner/Mod/Author).
* \`POST /api/rooms/:roomCode/lock\` — Toggle room locked state (Owner/Mod only).
* \`POST /api/rooms/:roomCode/ban\` — Ban session from room (Owner/Mod only).
* \`POST /api/rooms/:roomCode/unban\` — Revoke ban (Owner only).
* \`POST /api/rooms/:roomCode/end\` — Terminate room immediately (Owner only).

## 2. Socket Event Matrix
* \`connection\` / \`disconnect\`
* \`join_room\` -> emits \`user_joined\`
* \`leave_room\` -> emits \`user_left\`
* \`send_message\` -> validates -> persists -> broadcasts \`receive_message\`
* \`typing_start\` / \`typing_stop\` -> broadcast to room peers
* \`room_locked\` -> freezes client input interface
* \`room_ended\` -> disconnects all participants and wipes active room state
`
  },
  {
    id: 'security',
    filename: '05-security-model.md',
    title: 'Security, Threat Model & Anti-Abuse',
    summary: 'Authorization matrix, XSS defenses, rate-limiting, and room enumeration defense.',
    content: `# 05 — Security, Threat Model & Anti-Abuse

## 1. Authorization Matrix
| Action | Owner | Moderator | Member |
| :--- | :---: | :---: | :---: |
| Send text message | ✅ | ✅ | ✅ |
| Leave room | ✅ | ✅ | ✅ |
| Soft-delete own message | ✅ | ✅ | ✅ |
| Soft-delete any message | ✅ | ✅ | ❌ |
| Remove (kick) user | ✅ | ✅ | ❌ |
| Ban user | ✅ | ✅ | ❌ |
| Unban user | ✅ | ❌ | ❌ |
| Toggle Lock room | ✅ | ❌ | ❌ |
| Modify Slow Mode | ✅ | ❌ | ❌ |
| Change Join Mode/Password | ✅ | ❌ | ❌ |
| Promote/Demote Moderator | ✅ | ❌ | ❌ |
| End/Destroy Room | ✅ | ❌ | ❌ |

## 2. Crucial Security Controls
1. **Never Trust the Frontend**: Authorization tokens and roles are validated at the engine boundary on every request.
2. **Strict Text Sanitization (Anti-XSS)**: User inputs are escaped and never injected into dangerous DOM elements or HTML contexts.
3. **Anti-Enumeration Defense**: Room codes utilize high-entropy alphabet (base62) with rate-limited validation to prevent discovery scanning.
4. **Rate Limiting & Slow Mode**: Throttles message frequency per session to prevent flooding and bot spam.
5. **No Secret Backdoors**: True deletion and unindexing—when a room expires, all contents become inaccessible.
`
  }
];
