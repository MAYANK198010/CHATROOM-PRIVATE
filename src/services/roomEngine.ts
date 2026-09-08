import { Room, RoomMember, Message, BanRecord, JoinRequest, RoomRole, RoomStatus, JoinMode } from '../types';
import { networkRelay, RoomEventPayload } from './networkRelay';

const STORAGE_KEY_ROOMS = 'chatroom_v1_rooms';
const STORAGE_KEY_MEMBERS = 'chatroom_v1_members';
const STORAGE_KEY_MESSAGES = 'chatroom_v1_messages';
const STORAGE_KEY_BANS = 'chatroom_v1_bans';
const STORAGE_KEY_REQUESTS = 'chatroom_v1_requests';
const STORAGE_KEY_OPEN_TABS = 'chatroom_v1_open_tabs';

// Avatar color palettes for temporary avatars
const AVATAR_COLORS = [
  'bg-emerald-600',
  'bg-blue-600',
  'bg-amber-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-cyan-600',
];

export function getDeterministicColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

// Generate random cryptographically random code (e.g. X7K9PQ)
export function generateRoomCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Global broadcast channel for cross-tab real-time sync
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('chatroom_live_sync');
  }
} catch {
  // BroadcastChannel might fail in some restricted environments
}

type SyncListener = (event: { type: string; payload: unknown }) => void;
const syncListeners: Set<SyncListener> = new Set();

export function subscribeToSyncEvents(listener: SyncListener) {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function broadcastEvent(type: string, payload: unknown) {
  syncListeners.forEach((l) => l({ type, payload }));
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type, payload });
  }
}

if (broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    syncListeners.forEach((l) => l(event.data));
  };
}

class RoomEngine {
  private rooms: Map<string, Room> = new Map();
  private members: Map<string, RoomMember[]> = new Map(); // roomId -> members
  private messages: Map<string, Message[]> = new Map(); // roomId -> messages
  private bans: Map<string, BanRecord[]> = new Map(); // roomId -> bans
  private requests: Map<string, JoinRequest[]> = new Map(); // roomId -> requests
  private lastMessageTimes: Map<string, number> = new Map(); // `${roomId}:${sessionId}` -> timestamp

  public subscribeToSyncEvents(listener: SyncListener) {
    return subscribeToSyncEvents(listener);
  }

  public getDeterministicColor(username: string): string {
    return getDeterministicColor(username);
  }

  constructor() {
    this.loadFromStorage();
    if (this.rooms.size === 0) {
      this.seedInitialDemoRoom();
    }
    this.initNetworkListeners();

    // Periodic heartbeat to keep room discovery fresh on relays
    setInterval(() => {
      const now = Date.now();
      this.rooms.forEach((r) => {
        if (r.status === 'active' && now < r.expires_at) {
          networkRelay.publishRoomMeta(r);
        }
      });
    }, 6000);
  }

  private initNetworkListeners() {
    // 1. Listen for new/updated rooms from the network
    networkRelay.onRoomMeta((room) => {
      if (room && room.id && room.room_code) {
        const existing = this.rooms.get(room.id);
        if (!existing || existing.created_at <= room.created_at) {
          this.rooms.set(room.id, room);
          this.saveToStorage();
          broadcastEvent('ROOM_DISCOVERED', { room, roomId: room.id });
        }
      }
    });

    // 2. Listen for cross-device room events
    networkRelay.onEvent((event: RoomEventPayload) => {
      this.handleIncomingNetworkEvent(event);
    });

    // Auto-subscribe network relay to all known rooms
    this.rooms.forEach((r) => {
      networkRelay.subscribeToRoom(r.room_code);
    });
  }

  private handleIncomingNetworkEvent(event: RoomEventPayload) {
    const { type, roomId, roomCode, data } = event;
    let room = this.rooms.get(roomId) || this.getRoomByCode(roomCode);

    // If room is not yet known locally but provided in sync response
    if (!room && (type === 'SYNC_RESPONSE' || type === 'ROOM_ANNOUNCE') && (data as { room?: Room })?.room) {
      const netRoom = (data as { room: Room }).room;
      this.rooms.set(netRoom.id, netRoom);
      this.saveToStorage();
      broadcastEvent('ROOM_DISCOVERED', { room: netRoom, roomId: netRoom.id });
      room = netRoom;
    }

    if (!room) return;

    switch (type) {
      case 'MEMBER_JOINED': {
        const member = (data as { member: RoomMember }).member;
        if (!member) return;
        const members = this.members.get(room.id) || [];
        const existingIdx = members.findIndex((m) => m.session_id === member.session_id);
        if (existingIdx === -1) {
          members.push(member);
        } else {
          members[existingIdx] = { ...members[existingIdx], ...member, is_online: true };
        }
        this.members.set(room.id, members);
        this.saveToStorage();
        broadcastEvent('MEMBER_JOINED', { member, roomId: room.id });
        break;
      }

      case 'MEMBER_LEFT': {
        const { sessionId } = data as { sessionId: string };
        const members = this.members.get(room.id) || [];
        const filtered = members.filter((m) => m.session_id !== sessionId);
        this.members.set(room.id, filtered);
        this.saveToStorage();
        broadcastEvent('MEMBER_LEFT', { sessionId, roomId: room.id });
        break;
      }

      case 'MESSAGE_SENT': {
        const message = (data as { message: Message }).message;
        if (!message) return;
        const messages = this.messages.get(room.id) || [];
        if (!messages.some((m) => m.id === message.id)) {
          messages.push(message);
          this.messages.set(room.id, messages);
          this.saveToStorage();
          broadcastEvent('MESSAGE_RECEIVED', { message, roomId: room.id });
        }
        break;
      }

      case 'MESSAGE_DELETED': {
        const { messageId, deletedBy } = data as { messageId: string; deletedBy: string };
        const messages = this.messages.get(room.id) || [];
        const target = messages.find((m) => m.id === messageId);
        if (target) {
          target.deleted_at = Date.now();
          target.deleted_by_name = deletedBy;
          this.saveToStorage();
          broadcastEvent('MESSAGE_DELETED', { messageId, roomId: room.id, deletedBy });
        }
        break;
      }

      case 'ROLE_CHANGED': {
        const { targetSessionId, newRole } = data as { targetSessionId: string; newRole: RoomRole };
        const members = this.members.get(room.id) || [];
        const target = members.find((m) => m.session_id === targetSessionId);
        if (target) {
          target.role = newRole;
          this.saveToStorage();
          broadcastEvent('ROLE_UPDATED', { targetSessionId, newRole, roomId: room.id });
        }
        break;
      }

      case 'MEMBER_KICKED': {
        const { targetSessionId } = data as { targetSessionId: string };
        const members = this.members.get(room.id) || [];
        const filtered = members.filter((m) => m.session_id !== targetSessionId);
        this.members.set(room.id, filtered);
        this.saveToStorage();
        broadcastEvent('MEMBER_REMOVED', { targetSessionId, roomId: room.id });
        break;
      }

      case 'MEMBER_BANNED': {
        const { targetSessionId, username, reason } = data as { targetSessionId: string; username: string; reason?: string };
        const members = this.members.get(room.id) || [];
        const filtered = members.filter((m) => m.session_id !== targetSessionId);
        this.members.set(room.id, filtered);

        const bans = this.bans.get(room.id) || [];
        if (!bans.some((b) => b.session_id === targetSessionId)) {
          bans.push({
            id: generateUUID(),
            room_id: room.id,
            session_id: targetSessionId,
            username: username || 'Unknown',
            reason: reason || 'Violating room rules',
            banned_at: Date.now(),
          });
          this.bans.set(room.id, bans);
        }
        this.saveToStorage();
        broadcastEvent('MEMBER_BANNED', { targetSessionId, roomId: room.id });
        break;
      }

      case 'MEMBER_UNBANNED': {
        const { unbannedUsername } = data as { unbannedUsername: string };
        const bans = this.bans.get(room.id) || [];
        const filtered = bans.filter((b) => b.username.toLowerCase() !== unbannedUsername.toLowerCase());
        this.bans.set(room.id, filtered);
        this.saveToStorage();
        broadcastEvent('MEMBER_UNBANNED', { unbannedUsername, roomId: room.id });
        break;
      }

      case 'ROOM_LOCKED':
      case 'ROOM_UNLOCKED': {
        const { status } = data as { status: RoomStatus };
        room.status = status;
        this.saveToStorage();
        broadcastEvent('ROOM_LOCK_TOGGLED', { status, roomId: room.id });
        break;
      }

      case 'ROOM_SETTINGS_UPDATED': {
        const { slowModeSeconds } = data as { slowModeSeconds: number };
        room.slow_mode_seconds = slowModeSeconds;
        this.saveToStorage();
        broadcastEvent('SETTINGS_CHANGED', { room, roomId: room.id });
        break;
      }

      case 'ROOM_ENDED': {
        room.status = 'ended';
        this.saveToStorage();
        broadcastEvent('ROOM_ENDED', { roomId: room.id });
        break;
      }

      case 'JOIN_REQUESTED': {
        const { request } = data as { request: JoinRequest };
        if (request) {
          const requests = this.requests.get(room.id) || [];
          if (!requests.some((r) => r.id === request.id)) {
            requests.push(request);
            this.requests.set(room.id, requests);
            this.saveToStorage();
            broadcastEvent('JOIN_REQUEST_SUBMITTED', { request, roomId: room.id });
          }
        }
        break;
      }

      case 'JOIN_REQUEST_DECIDED': {
        const { requestId, status, member } = data as { requestId: string; status: 'accepted' | 'rejected'; member?: RoomMember };
        const requests = this.requests.get(room.id) || [];
        const targetReq = requests.find((r) => r.id === requestId);
        if (targetReq) {
          targetReq.status = status;
        }
        if (status === 'accepted' && member) {
          const members = this.members.get(room.id) || [];
          if (!members.some((m) => m.session_id === member.session_id)) {
            members.push(member);
            this.members.set(room.id, members);
          }
        }
        this.saveToStorage();
        broadcastEvent('JOIN_REQUEST_DECIDED', { requestId, status, roomId: room.id });
        break;
      }

      case 'TYPING_STATUS': {
        const { sessionId, username } = data as { sessionId: string; username: string };
        broadcastEvent('TYPING_STATUS', { roomId: room.id, sessionId, username, timestamp: Date.now() });
        break;
      }

      case 'DISCOVER_PING':
      case 'SYNC_REQUEST': {
        // Re-announce room metadata immediately
        networkRelay.publishRoomMeta(room);

        // If we have messages or members in this room, respond with current state
        const currentMessages = this.messages.get(room.id) || [];
        const currentMembers = this.members.get(room.id) || [];
        const currentBans = this.bans.get(room.id) || [];
        const currentRequests = this.requests.get(room.id) || [];

        networkRelay.publishEvent({
          type: 'SYNC_RESPONSE',
          roomId: room.id,
          roomCode: room.room_code,
          data: {
            room,
            messages: currentMessages,
            members: currentMembers,
            bans: currentBans,
            requests: currentRequests,
          },
        });
        break;
      }

      case 'SYNC_RESPONSE': {
        const syncData = data as {
          room?: Room;
          messages?: Message[];
          members?: RoomMember[];
          bans?: BanRecord[];
          requests?: JoinRequest[];
        };

        let changed = false;
        if (syncData.messages && Array.isArray(syncData.messages)) {
          const existing = this.messages.get(room.id) || [];
          const existingIds = new Set(existing.map((m) => m.id));
          const newOnes = syncData.messages.filter((m) => !existingIds.has(m.id));
          if (newOnes.length > 0) {
            this.messages.set(room.id, [...existing, ...newOnes].sort((a, b) => a.created_at - b.created_at));
            changed = true;
          }
        }

        if (syncData.members && Array.isArray(syncData.members)) {
          const existing = this.members.get(room.id) || [];
          const map = new Map<string, RoomMember>();
          existing.forEach((m) => map.set(m.session_id, m));
          syncData.members.forEach((m) => map.set(m.session_id, m));
          this.members.set(room.id, Array.from(map.values()));
          changed = true;
        }

        if (syncData.bans && Array.isArray(syncData.bans)) {
          this.bans.set(room.id, syncData.bans);
          changed = true;
        }

        if (syncData.requests && Array.isArray(syncData.requests)) {
          this.requests.set(room.id, syncData.requests);
          changed = true;
        }

        if (changed) {
          this.saveToStorage();
          broadcastEvent('ROOM_SYNCED', { roomId: room.id });
        }
        break;
      }
    }
  }

  private loadFromStorage() {
    try {
      const storedRooms = localStorage.getItem(STORAGE_KEY_ROOMS);
      if (storedRooms) {
        const parsed: Room[] = JSON.parse(storedRooms);
        parsed.forEach((r) => this.rooms.set(r.id, r));
      }

      const storedMembers = localStorage.getItem(STORAGE_KEY_MEMBERS);
      if (storedMembers) {
        const parsed: Record<string, RoomMember[]> = JSON.parse(storedMembers);
        Object.entries(parsed).forEach(([k, v]) => this.members.set(k, v));
      }

      const storedMessages = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (storedMessages) {
        const parsed: Record<string, Message[]> = JSON.parse(storedMessages);
        Object.entries(parsed).forEach(([k, v]) => this.messages.set(k, v));
      }

      const storedBans = localStorage.getItem(STORAGE_KEY_BANS);
      if (storedBans) {
        const parsed: Record<string, BanRecord[]> = JSON.parse(storedBans);
        Object.entries(parsed).forEach(([k, v]) => this.bans.set(k, v));
      }

      const storedReqs = localStorage.getItem(STORAGE_KEY_REQUESTS);
      if (storedReqs) {
        const parsed: Record<string, JoinRequest[]> = JSON.parse(storedReqs);
        Object.entries(parsed).forEach(([k, v]) => this.requests.set(k, v));
      }
    } catch {
      // Ignore storage parse issues
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_ROOMS, JSON.stringify(Array.from(this.rooms.values())));

      const membersObj: Record<string, RoomMember[]> = {};
      this.members.forEach((v, k) => (membersObj[k] = v));
      localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(membersObj));

      const messagesObj: Record<string, Message[]> = {};
      this.messages.forEach((v, k) => (messagesObj[k] = v));
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messagesObj));

      const bansObj: Record<string, BanRecord[]> = {};
      this.bans.forEach((v, k) => (bansObj[k] = v));
      localStorage.setItem(STORAGE_KEY_BANS, JSON.stringify(bansObj));

      const reqsObj: Record<string, JoinRequest[]> = {};
      this.requests.forEach((v, k) => (reqsObj[k] = v));
      localStorage.setItem(STORAGE_KEY_REQUESTS, JSON.stringify(reqsObj));
    } catch {
      // Ignore write errors
    }
  }

  // Seed sample "College Project" room from the specification document
  public seedInitialDemoRoom() {
    const roomId = 'demo-room-college-project';
    const roomCode = 'X7K9PQ';
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    const ownerSessionId = 'session-mayank-owner';
    const modSessionId = 'session-priya-mod';
    const memberSessionId = 'session-rahul-member';

    const demoRoom: Room = {
      id: roomId,
      room_code: roomCode,
      name: 'College Project (Demo)',
      created_at: now - 3600000,
      expires_at: expiresAt,
      status: 'active',
      owner_session_id: ownerSessionId,
      join_mode: 'open',
      slow_mode_seconds: 0,
    };

    const members: RoomMember[] = [
      {
        session_id: ownerSessionId,
        room_id: roomId,
        username: 'Mayank',
        role: 'owner',
        joined_at: now - 3600000,
        last_seen: now,
        is_online: true,
        color: 'bg-indigo-600',
      },
      {
        session_id: modSessionId,
        room_id: roomId,
        username: 'Priya',
        role: 'moderator',
        joined_at: now - 3200000,
        last_seen: now - 120000,
        is_online: true,
        color: 'bg-emerald-600',
      },
      {
        session_id: memberSessionId,
        room_id: roomId,
        username: 'Rahul',
        role: 'member',
        joined_at: now - 2800000,
        last_seen: now - 60000,
        is_online: true,
        color: 'bg-amber-600',
      },
    ];

    const messages: Message[] = [
      {
        id: generateUUID(),
        room_id: roomId,
        session_id: ownerSessionId,
        sender_name: 'Mayank',
        sender_role: 'owner',
        content: 'Welcome to our project room! No accounts or personal contacts needed.',
        created_at: now - 3500000,
      },
      {
        id: generateUUID(),
        room_id: roomId,
        session_id: 'system',
        sender_name: 'System',
        sender_role: 'member',
        content: 'Priya joined the room via temporary link.',
        created_at: now - 3200000,
        is_system: true,
        system_type: 'join',
      },
      {
        id: generateUUID(),
        room_id: roomId,
        session_id: modSessionId,
        sender_name: 'Priya',
        sender_role: 'moderator',
        content: 'Great, I have the architecture slides ready for our seminar tomorrow.',
        created_at: now - 3100000,
      },
      {
        id: generateUUID(),
        room_id: roomId,
        session_id: memberSessionId,
        sender_name: 'Rahul',
        sender_role: 'member',
        content: 'Hello everyone! I just scanned the QR code on Mayank’s laptop.',
        created_at: now - 2700000,
      },
    ];

    this.rooms.set(roomId, demoRoom);
    this.members.set(roomId, members);
    this.messages.set(roomId, messages);
    this.bans.set(roomId, []);
    this.requests.set(roomId, []);
    this.saveToStorage();
  }

  // Getters
  public getRoomByCode(code: string): Room | null {
    this.checkExpirations();
    const cleanCode = code.trim().toUpperCase();
    for (const room of this.rooms.values()) {
      if (room.room_code.toUpperCase() === cleanCode) {
        return room;
      }
    }
    return null;
  }

  public getRoomById(id: string): Room | null {
    this.checkExpirations();
    return this.rooms.get(id) || null;
  }

  public getMembers(roomId: string): RoomMember[] {
    return this.members.get(roomId) || [];
  }

  public getMessages(roomId: string): Message[] {
    return this.messages.get(roomId) || [];
  }

  public getBans(roomId: string): BanRecord[] {
    return this.bans.get(roomId) || [];
  }

  public getJoinRequests(roomId: string): JoinRequest[] {
    return this.requests.get(roomId) || [];
  }

  // Async room lookup combining local storage and live network discovery
  public async resolveRoomByCode(code: string, timeoutMs = 3000): Promise<Room | null> {
    const local = this.getRoomByCode(code);
    if (local) return local;

    const networkRoom = await networkRelay.fetchRoomMeta(code, timeoutMs);
    if (networkRoom) {
      this.rooms.set(networkRoom.id, networkRoom);
      this.saveToStorage();
      networkRelay.subscribeToRoom(networkRoom.room_code);
      return networkRoom;
    }
    return null;
  }

  // Check and update expirations
  public checkExpirations() {
    const now = Date.now();
    let updated = false;
    this.rooms.forEach((room) => {
      if (room.status === 'active' && now >= room.expires_at) {
        room.status = 'expired';
        updated = true;
        broadcastEvent('ROOM_EXPIRED', { roomId: room.id });
      }
    });
    if (updated) {
      this.saveToStorage();
    }
  }

  // Create Room
  public createRoom(params: {
    name: string;
    ownerUsername: string;
    durationMinutes: number;
    joinMode: JoinMode;
    password?: string;
    slowModeSeconds?: number;
  }): { room: Room; session: RoomMember } {
    const trimmedName = params.name.trim().slice(0, 100);
    const trimmedUsername = params.ownerUsername.trim().slice(0, 30);

    if (!trimmedName) throw new Error('Room name is required (1-100 characters)');
    if (!trimmedUsername) throw new Error('Username is required (1-30 characters)');

    const roomId = generateUUID();
    let roomCode = generateRoomCode(6);
    // Ensure uniqueness
    while (this.getRoomByCode(roomCode)) {
      roomCode = generateRoomCode(6);
    }

    const now = Date.now();
    const expiresAt = now + params.durationMinutes * 60 * 1000;
    const ownerSessionId = 'sess_' + generateUUID();

    const newRoom: Room = {
      id: roomId,
      room_code: roomCode,
      name: trimmedName,
      created_at: now,
      expires_at: expiresAt,
      status: 'active',
      owner_session_id: ownerSessionId,
      join_mode: params.joinMode,
      password_hash: params.password?.trim() || undefined,
      slow_mode_seconds: params.slowModeSeconds || 0,
    };

    const ownerMember: RoomMember = {
      session_id: ownerSessionId,
      room_id: roomId,
      username: trimmedUsername,
      role: 'owner',
      joined_at: now,
      last_seen: now,
      is_online: true,
      color: getDeterministicColor(trimmedUsername),
    };

    const initialSystemMessage: Message = {
      id: generateUUID(),
      room_id: roomId,
      session_id: 'system',
      sender_name: 'System',
      sender_role: 'owner',
      content: `Room created by ${trimmedUsername}. Privacy active: no phone, no email, zero persistent trace.`,
      created_at: now,
      is_system: true,
      system_type: 'join',
    };

    this.rooms.set(roomId, newRoom);
    this.members.set(roomId, [ownerMember]);
    this.messages.set(roomId, [initialSystemMessage]);
    this.bans.set(roomId, []);
    this.requests.set(roomId, []);

    this.saveToStorage();

    // Publish to network relay and subscribe
    networkRelay.subscribeToRoom(roomCode);
    networkRelay.publishRoomMeta(newRoom);

    broadcastEvent('ROOM_CREATED', { room: newRoom });

    return { room: newRoom, session: ownerMember };
  }

  // Join Room
  public joinRoom(params: {
    roomCode: string;
    username: string;
    password?: string;
    existingSessionId?: string;
  }): {
    success: boolean;
    status: 'joined' | 'pending_approval' | 'banned' | 'invalid_password' | 'expired' | 'locked';
    member?: RoomMember;
    room?: Room;
    error?: string;
  } {
    this.checkExpirations();
    const room = this.getRoomByCode(params.roomCode);

    if (!room) {
      return { success: false, status: 'expired', error: 'Room not found or invalid room code.' };
    }

    if (room.status === 'expired' || Date.now() >= room.expires_at) {
      return { success: false, status: 'expired', error: 'This room has reached its expiration time and is closed.' };
    }

    if (room.status === 'ended') {
      return { success: false, status: 'expired', error: 'This room has been ended by its creator.' };
    }

    const trimmedUsername = params.username.trim().slice(0, 30);
    if (!trimmedUsername) {
      return { success: false, status: 'joined', error: 'Username must be 1 to 30 characters.' };
    }

    // Check if banned
    const bans = this.bans.get(room.id) || [];
    const isBanned = bans.some(
      (b) => b.username.toLowerCase() === trimmedUsername.toLowerCase() || (params.existingSessionId && b.session_id === params.existingSessionId)
    );
    if (isBanned) {
      return { success: false, status: 'banned', error: 'You have been banned from this room by an administrator.' };
    }

    // Check existing member session
    const members = this.members.get(room.id) || [];
    if (params.existingSessionId) {
      const existing = members.find((m) => m.session_id === params.existingSessionId);
      if (existing) {
        existing.is_online = true;
        existing.last_seen = Date.now();
        this.saveToStorage();
        broadcastEvent('MEMBER_JOINED', { member: existing, roomId: room.id });
        networkRelay.subscribeToRoom(room.room_code);
        networkRelay.publishEvent({
          type: 'MEMBER_JOINED',
          roomId: room.id,
          roomCode: room.room_code,
          senderSessionId: existing.session_id,
          senderName: existing.username,
          data: { member: existing },
        });
        return { success: true, status: 'joined', member: existing, room };
      }
    }

    // Password verification if join_mode === 'password'
    if (room.join_mode === 'password' && room.password_hash) {
      if (!params.password || params.password.trim() !== room.password_hash) {
        return { success: false, status: 'invalid_password', error: 'Incorrect room password.' };
      }
    }

    const sessionId = params.existingSessionId || 'sess_' + generateUUID();

    // Approval verification if join_mode === 'approval'
    if (room.join_mode === 'approval') {
      // Check if already approved
      const requests = this.requests.get(room.id) || [];
      const existingReq = requests.find((r) => r.session_id === sessionId || r.username.toLowerCase() === trimmedUsername.toLowerCase());

      if (existingReq?.status === 'accepted') {
        // Fall through to add member
      } else if (existingReq?.status === 'rejected') {
        return { success: false, status: 'pending_approval', error: 'Your request to join this room was declined by the administrator.' };
      } else {
        if (!existingReq) {
          const newReq: JoinRequest = {
            id: generateUUID(),
            room_id: room.id,
            session_id: sessionId,
            username: trimmedUsername,
            requested_at: Date.now(),
            status: 'pending',
          };
          requests.push(newReq);
          this.requests.set(room.id, requests);
          this.saveToStorage();
          networkRelay.subscribeToRoom(room.room_code);
          networkRelay.publishEvent({
            type: 'JOIN_REQUESTED',
            roomId: room.id,
            roomCode: room.room_code,
            senderSessionId: sessionId,
            senderName: trimmedUsername,
            data: { request: newReq },
          });
          broadcastEvent('JOIN_REQUEST_SUBMITTED', { request: newReq, roomId: room.id });
        }
        return { success: false, status: 'pending_approval', error: 'Join request sent. Awaiting administrator approval...' };
      }
    }

    // Create member
    const newMember: RoomMember = {
      session_id: sessionId,
      room_id: room.id,
      username: trimmedUsername,
      role: 'member',
      joined_at: Date.now(),
      last_seen: Date.now(),
      is_online: true,
      color: getDeterministicColor(trimmedUsername),
    };

    members.push(newMember);
    this.members.set(room.id, members);

    // Add join system message
    const sysMsg: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: 'system',
      sender_name: 'System',
      sender_role: 'member',
      content: `${trimmedUsername} entered the room.`,
      created_at: Date.now(),
      is_system: true,
      system_type: 'join',
    };
    const messages = this.messages.get(room.id) || [];
    messages.push(sysMsg);
    this.messages.set(room.id, messages);

    this.saveToStorage();

    // Subscribe to network updates & publish member join + sync request
    networkRelay.subscribeToRoom(room.room_code);
    networkRelay.publishEvent({
      type: 'MEMBER_JOINED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: sessionId,
      senderName: trimmedUsername,
      data: { member: newMember },
    });
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: 'system',
      data: { message: sysMsg },
    });
    networkRelay.publishEvent({
      type: 'SYNC_REQUEST',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: sessionId,
      data: {},
    });

    broadcastEvent('MEMBER_JOINED', { member: newMember, roomId: room.id });
    broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });

    return { success: true, status: 'joined', member: newMember, room };
  }

  // Send Message
  public sendMessage(params: {
    roomId: string;
    sessionId: string;
    content: string;
  }): { success: boolean; error?: string; message?: Message } {
    this.checkExpirations();
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room does not exist.' };

    if (room.status === 'expired' || Date.now() >= room.expires_at) {
      return { success: false, error: 'This room is expired. No messages can be sent.' };
    }

    if (room.status === 'ended') {
      return { success: false, error: 'This room has been closed.' };
    }

    const members = this.members.get(room.id) || [];
    const sender = members.find((m) => m.session_id === params.sessionId);
    if (!sender) return { success: false, error: 'You are not a registered participant in this room.' };

    // Check ban
    const bans = this.bans.get(room.id) || [];
    if (bans.some((b) => b.session_id === sender.session_id || b.username.toLowerCase() === sender.username.toLowerCase())) {
      return { success: false, error: 'You have been banned from sending messages in this room.' };
    }

    // Check lock (moderators and owners can still talk, members cannot)
    if (room.status === 'locked' && sender.role === 'member') {
      return { success: false, error: 'This room is locked by an administrator. Only moderators can send messages.' };
    }

    // Enforce slow mode for non-admin members (tracked per room & session)
    const rateLimitKey = `${params.roomId}:${sender.session_id}`;
    const now = Date.now();
    if (room.slow_mode_seconds > 0 && sender.role === 'member') {
      const lastTime = this.lastMessageTimes.get(rateLimitKey) || 0;
      const elapsedSeconds = (now - lastTime) / 1000;
      if (elapsedSeconds < room.slow_mode_seconds) {
        const remaining = Math.ceil(room.slow_mode_seconds - elapsedSeconds);
        return { success: false, error: `Slow mode active (${room.slow_mode_seconds}s). Wait ${remaining}s before your next message.` };
      }
    }

    // Enforce general anti-spam rate limiting (tracked per room & session)
    const lastTime = this.lastMessageTimes.get(rateLimitKey) || 0;
    if (now - lastTime < 300) {
      return { success: false, error: 'Sending too fast. Please slow down.' };
    }

    const cleanContent = params.content.trim().slice(0, 1000);
    if (!cleanContent) {
      return { success: false, error: 'Message cannot be empty.' };
    }

    const newMessage: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: sender.session_id,
      sender_name: sender.username,
      sender_role: sender.role,
      content: cleanContent,
      created_at: now,
    };

    this.lastMessageTimes.set(rateLimitKey, now);
    const messages = this.messages.get(room.id) || [];
    messages.push(newMessage);
    this.messages.set(room.id, messages);

    sender.last_seen = now;
    this.saveToStorage();

    // Broadcast across network relay to all other devices in the room
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: sender.session_id,
      senderName: sender.username,
      data: { message: newMessage },
    });

    broadcastEvent('MESSAGE_RECEIVED', { message: newMessage, roomId: room.id });

    return { success: true, message: newMessage };
  }

  // Soft-Delete message
  public deleteMessage(params: {
    roomId: string;
    sessionId: string;
    messageId: string;
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.sessionId);
    if (!actor) return { success: false, error: 'Unauthorized session' };

    const messages = this.messages.get(room.id) || [];
    const targetMsg = messages.find((m) => m.id === params.messageId);
    if (!targetMsg) return { success: false, error: 'Message not found' };

    // Permissions: owner and mod can delete any message; member can delete only own message
    const isPrivileged = actor.role === 'owner' || actor.role === 'moderator';
    const isAuthor = targetMsg.session_id === actor.session_id;

    if (!isPrivileged && !isAuthor) {
      return { success: false, error: 'You do not have permission to delete this message.' };
    }

    targetMsg.deleted_at = Date.now();
    targetMsg.deleted_by_name = actor.username;

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'MESSAGE_DELETED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      senderName: actor.username,
      data: { messageId: targetMsg.id, deletedBy: actor.username },
    });

    broadcastEvent('MESSAGE_DELETED', { messageId: targetMsg.id, roomId: room.id, deletedBy: actor.username });
    return { success: true };
  }

  // Remove (Kick) Member
  public removeMember(params: {
    roomId: string;
    adminSessionId: string;
    targetSessionId: string;
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'moderator')) {
      return { success: false, error: 'Unauthorized: Owner or Moderator role required.' };
    }

    const targetIdx = members.findIndex((m) => m.session_id === params.targetSessionId);
    if (targetIdx === -1) return { success: false, error: 'Member not found.' };

    const target = members[targetIdx];
    if (target.role === 'owner') return { success: false, error: 'Cannot remove the room owner.' };
    if (actor.role === 'moderator' && target.role === 'moderator') {
      return { success: false, error: 'Moderators cannot remove other moderators.' };
    }

    members.splice(targetIdx, 1);
    this.members.set(room.id, members);

    // Announce system message
    const sysMsg: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: 'system',
      sender_name: 'System',
      sender_role: actor.role,
      content: `${target.username} was removed by ${actor.username}.`,
      created_at: Date.now(),
      is_system: true,
      system_type: 'kick',
    };
    const messages = this.messages.get(room.id) || [];
    messages.push(sysMsg);

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'MEMBER_KICKED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: { targetSessionId: target.session_id },
    });
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: 'system',
      data: { message: sysMsg },
    });

    broadcastEvent('MEMBER_REMOVED', { targetSessionId: target.session_id, roomId: room.id });
    broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });

    return { success: true };
  }

  // Ban Member
  public banMember(params: {
    roomId: string;
    adminSessionId: string;
    targetSessionId: string;
    reason?: string;
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'moderator')) {
      return { success: false, error: 'Unauthorized: Owner or Moderator role required.' };
    }

    const targetIdx = members.findIndex((m) => m.session_id === params.targetSessionId);
    if (targetIdx === -1) return { success: false, error: 'Member not found.' };

    const target = members[targetIdx];
    if (target.role === 'owner') return { success: false, error: 'Cannot ban the room owner.' };
    if (actor.role === 'moderator' && target.role === 'moderator') {
      return { success: false, error: 'Moderators cannot ban fellow moderators.' };
    }

    // Add to bans
    const bans = this.bans.get(room.id) || [];
    const banRecord: BanRecord = {
      id: generateUUID(),
      room_id: room.id,
      session_id: target.session_id,
      username: target.username,
      reason: params.reason?.trim() || 'Violating room rules',
      banned_at: Date.now(),
    };
    bans.push(banRecord);
    this.bans.set(room.id, bans);

    // Remove from active members
    members.splice(targetIdx, 1);
    this.members.set(room.id, members);

    const sysMsg: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: 'system',
      sender_name: 'System',
      sender_role: actor.role,
      content: `${target.username} was banned from the room by ${actor.username}.`,
      created_at: Date.now(),
      is_system: true,
      system_type: 'ban',
    };
    const messages = this.messages.get(room.id) || [];
    messages.push(sysMsg);

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'MEMBER_BANNED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: { targetSessionId: target.session_id, username: target.username, reason: params.reason },
    });
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: 'system',
      data: { message: sysMsg },
    });

    broadcastEvent('MEMBER_BANNED', { targetSessionId: target.session_id, roomId: room.id });
    broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });

    return { success: true };
  }

  // Unban Member (Owner only)
  public unbanMember(params: {
    roomId: string;
    adminSessionId: string;
    banId: string;
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || actor.role !== 'owner') {
      return { success: false, error: 'Unauthorized: Only the room Owner can revoke bans.' };
    }

    const bans = this.bans.get(room.id) || [];
    const idx = bans.findIndex((b) => b.id === params.banId);
    if (idx === -1) return { success: false, error: 'Ban record not found.' };

    const unbanned = bans.splice(idx, 1)[0];
    this.bans.set(room.id, bans);

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'MEMBER_UNBANNED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: { unbannedUsername: unbanned.username },
    });

    broadcastEvent('MEMBER_UNBANNED', { unbannedUsername: unbanned.username, roomId: room.id });
    return { success: true };
  }

  // Promote / Demote (Owner only)
  public setMemberRole(params: {
    roomId: string;
    adminSessionId: string;
    targetSessionId: string;
    newRole: 'moderator' | 'member';
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || actor.role !== 'owner') {
      return { success: false, error: 'Unauthorized: Only the room Owner can assign roles.' };
    }

    const target = members.find((m) => m.session_id === params.targetSessionId);
    if (!target) return { success: false, error: 'Member not found.' };

    target.role = params.newRole;

    const sysMsg: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: 'system',
      sender_name: 'System',
      sender_role: 'owner',
      content: `${target.username} is now a ${params.newRole}.`,
      created_at: Date.now(),
      is_system: true,
      system_type: 'role',
    };
    const messages = this.messages.get(room.id) || [];
    messages.push(sysMsg);

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'ROLE_CHANGED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: { targetSessionId: target.session_id, newRole: params.newRole },
    });
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: 'system',
      data: { message: sysMsg },
    });

    broadcastEvent('ROLE_UPDATED', { targetSessionId: target.session_id, newRole: params.newRole, roomId: room.id });
    broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });

    return { success: true };
  }

  // Toggle Lock Room (Owner or Moderator)
  public toggleRoomLock(params: {
    roomId: string;
    adminSessionId: string;
  }): { success: boolean; newStatus?: RoomStatus; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'moderator')) {
      return { success: false, error: 'Unauthorized: Owner or Moderator role required.' };
    }

    room.status = room.status === 'locked' ? 'active' : 'locked';

    const sysMsg: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: 'system',
      sender_name: 'System',
      sender_role: actor.role,
      content: room.status === 'locked' ? 'Room locked by admin. Only moderators can send messages.' : 'Room unlocked by admin.',
      created_at: Date.now(),
      is_system: true,
      system_type: room.status === 'locked' ? 'lock' : 'unlock',
    };
    const messages = this.messages.get(room.id) || [];
    messages.push(sysMsg);

    this.saveToStorage();

    networkRelay.publishEvent({
      type: room.status === 'locked' ? 'ROOM_LOCKED' : 'ROOM_UNLOCKED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: { status: room.status },
    });
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: 'system',
      data: { message: sysMsg },
    });

    broadcastEvent('ROOM_LOCK_TOGGLED', { status: room.status, roomId: room.id });
    broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });

    return { success: true, newStatus: room.status };
  }

  // Set Slow Mode (Owner only)
  public setSlowMode(params: {
    roomId: string;
    adminSessionId: string;
    slowModeSeconds: number;
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || actor.role !== 'owner') {
      return { success: false, error: 'Unauthorized: Owner role required.' };
    }

    room.slow_mode_seconds = params.slowModeSeconds;

    const sysMsg: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: 'system',
      sender_name: 'System',
      sender_role: 'owner',
      content:
        params.slowModeSeconds > 0
          ? `Slow mode enabled: ${params.slowModeSeconds} seconds between messages.`
          : 'Slow mode has been disabled.',
      created_at: Date.now(),
      is_system: true,
      system_type: 'slow_mode',
    };
    const messages = this.messages.get(room.id) || [];
    messages.push(sysMsg);

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'ROOM_SETTINGS_UPDATED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: { slowModeSeconds: params.slowModeSeconds },
    });
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: 'system',
      data: { message: sysMsg },
    });

    broadcastEvent('SETTINGS_CHANGED', { room, roomId: room.id });
    broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });

    return { success: true };
  }

  // Decide Join Request (Approval mode)
  public decideJoinRequest(params: {
    roomId: string;
    adminSessionId: string;
    requestId: string;
    approved: boolean;
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'moderator')) {
      return { success: false, error: 'Unauthorized: Owner or Moderator role required.' };
    }

    const requests = this.requests.get(room.id) || [];
    const req = requests.find((r) => r.id === params.requestId);
    if (!req) return { success: false, error: 'Request not found' };

    req.status = params.approved ? 'accepted' : 'rejected';
    let newMember: RoomMember | undefined;

    if (params.approved) {
      // Add member if not already in
      const existing = members.find((m) => m.session_id === req.session_id);
      if (!existing) {
        newMember = {
          session_id: req.session_id,
          room_id: room.id,
          username: req.username,
          role: 'member',
          joined_at: Date.now(),
          last_seen: Date.now(),
          is_online: true,
          color: getDeterministicColor(req.username),
        };
        members.push(newMember);
        this.members.set(room.id, members);

        const sysMsg: Message = {
          id: generateUUID(),
          room_id: room.id,
          session_id: 'system',
          sender_name: 'System',
          sender_role: 'member',
          content: `${req.username} was approved and joined the room.`,
          created_at: Date.now(),
          is_system: true,
          system_type: 'join',
        };
        const messages = this.messages.get(room.id) || [];
        messages.push(sysMsg);

        networkRelay.publishEvent({
          type: 'MESSAGE_SENT',
          roomId: room.id,
          roomCode: room.room_code,
          senderSessionId: 'system',
          data: { message: sysMsg },
        });

        broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });
      }
    }

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'JOIN_REQUEST_DECIDED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: { requestId: req.id, status: req.status, member: newMember },
    });

    broadcastEvent('JOIN_REQUEST_DECIDED', { requestId: req.id, status: req.status, roomId: room.id });
    return { success: true };
  }

  // End Room (Owner only)
  public endRoom(params: {
    roomId: string;
    adminSessionId: string;
  }): { success: boolean; error?: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const members = this.members.get(room.id) || [];
    const actor = members.find((m) => m.session_id === params.adminSessionId);
    if (!actor || actor.role !== 'owner') {
      return { success: false, error: 'Unauthorized: Only the room Owner can end the room.' };
    }

    room.status = 'ended';

    const sysMsg: Message = {
      id: generateUUID(),
      room_id: room.id,
      session_id: 'system',
      sender_name: 'System',
      sender_role: 'owner',
      content: `Room ended by owner ${actor.username}. Session closed.`,
      created_at: Date.now(),
      is_system: true,
      system_type: 'ended',
    };
    const messages = this.messages.get(room.id) || [];
    messages.push(sysMsg);

    this.saveToStorage();

    networkRelay.publishEvent({
      type: 'ROOM_ENDED',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: actor.session_id,
      data: {},
    });
    networkRelay.publishEvent({
      type: 'MESSAGE_SENT',
      roomId: room.id,
      roomCode: room.room_code,
      senderSessionId: 'system',
      data: { message: sysMsg },
    });

    broadcastEvent('ROOM_ENDED', { roomId: room.id });
    broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId: room.id });

    return { success: true };
  }

  // Broadcast typing indicator
  public emitTyping(roomId: string, sessionId: string, username: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      networkRelay.publishEvent({
        type: 'TYPING_STATUS',
        roomId,
        roomCode: room.room_code,
        senderSessionId: sessionId,
        data: { sessionId, username },
      });
    }
    broadcastEvent('TYPING_STATUS', { roomId, sessionId, username, timestamp: Date.now() });
  }

  // Leave room
  public leaveRoom(roomId: string, sessionId: string) {
    const room = this.rooms.get(roomId);
    const members = this.members.get(roomId) || [];
    const idx = members.findIndex((m) => m.session_id === sessionId);
    if (idx !== -1) {
      const leaving = members[idx];
      members.splice(idx, 1);
      this.members.set(roomId, members);

      const sysMsg: Message = {
        id: generateUUID(),
        room_id: roomId,
        session_id: 'system',
        sender_name: 'System',
        sender_role: leaving.role,
        content: `${leaving.username} left the room.`,
        created_at: Date.now(),
        is_system: true,
        system_type: 'leave',
      };
      const messages = this.messages.get(roomId) || [];
      messages.push(sysMsg);

      this.saveToStorage();

      if (room) {
        networkRelay.publishEvent({
          type: 'MEMBER_LEFT',
          roomId,
          roomCode: room.room_code,
          senderSessionId: sessionId,
          data: { sessionId },
        });
        networkRelay.publishEvent({
          type: 'MESSAGE_SENT',
          roomId,
          roomCode: room.room_code,
          senderSessionId: 'system',
          data: { message: sysMsg },
        });
      }

      broadcastEvent('MEMBER_LEFT', { sessionId, roomId });
      broadcastEvent('MESSAGE_RECEIVED', { message: sysMsg, roomId });
    }
  }

  // Clear all demo data
  public resetAllData() {
    localStorage.removeItem(STORAGE_KEY_ROOMS);
    localStorage.removeItem(STORAGE_KEY_MEMBERS);
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    localStorage.removeItem(STORAGE_KEY_BANS);
    localStorage.removeItem(STORAGE_KEY_REQUESTS);
    localStorage.removeItem(STORAGE_KEY_OPEN_TABS);
    this.rooms.clear();
    this.members.clear();
    this.messages.clear();
    this.bans.clear();
    this.requests.clear();
    this.seedInitialDemoRoom();
    broadcastEvent('DATA_RESET', {});
  }
}

export const roomEngine = new RoomEngine();
