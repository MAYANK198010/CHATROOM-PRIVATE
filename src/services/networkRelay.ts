/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mqtt, { MqttClient } from 'mqtt';
import { Room, Message, RoomMember } from '../types';

export interface RoomEventPayload {
  type:
    | 'MEMBER_JOINED'
    | 'MEMBER_LEFT'
    | 'MESSAGE_SENT'
    | 'MESSAGE_DELETED'
    | 'ROLE_CHANGED'
    | 'MEMBER_KICKED'
    | 'MEMBER_BANNED'
    | 'MEMBER_UNBANNED'
    | 'JOIN_REQUESTED'
    | 'JOIN_REQUEST_DECIDED'
    | 'ROOM_SETTINGS_UPDATED'
    | 'ROOM_LOCKED'
    | 'ROOM_UNLOCKED'
    | 'ROOM_ENDED'
    | 'TYPING_STATUS'
    | 'SYNC_REQUEST'
    | 'SYNC_RESPONSE'
    | 'ROOM_ANNOUNCE'
    | 'DISCOVER_PING'
    | 'PRESENCE_PING'
    | 'PRESENCE_PONG';
  roomId: string;
  roomCode: string;
  senderSessionId: string;
  senderName?: string;
  timestamp: number;
  publisherClientId?: string;
  data: unknown;
}

export type NetworkEventListener = (event: RoomEventPayload) => void;
export type RoomMetaListener = (room: Room) => void;

export interface RoomDiscoveryResult {
  room: Room;
  cachedMessages: Message[];
  cachedMembers: RoomMember[];
}

const NTFY_BASE_URL = 'https://ntfy.sh';
const NTFY_WS_BASE_URL = 'wss://ntfy.sh';
const EMQX_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'ephemeral_chatroom_v3';

/**
 * Safely parse NDJSON and concatenated JSON objects from raw response text.
 * Handles missing newlines between objects (}{), line breaks inside strings,
 * and malformed stream chunks.
 */
function parseNtfyJsonStream(rawText: string): Array<{ event?: string; message?: string; [key: string]: unknown }> {
  const results: Array<{ event?: string; message?: string; [key: string]: unknown }> = [];
  if (!rawText || !rawText.trim()) return results;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let start = -1;

  for (let i = 0; i < rawText.length; i++) {
    const char = rawText[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const jsonStr = rawText.slice(start, i + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object') {
              results.push(parsed);
            }
          } catch {
            // Ignore individual malformed segment
          }
          start = -1;
        }
      }
    }
  }

  return results;
}

class NetworkRelay {
  private clientId: string;
  private mqttClient: MqttClient | null = null;
  private isMqttConnected = false;

  // Active room WebSockets (ntfy.sh over port 443)
  private activeRoomSockets: Map<string, WebSocket> = new Map();
  // Active HTTP pollers for continuous background sync on all networks
  private activeRoomPollers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private subscribedRoomCodes: Set<string> = new Set();

  private eventListeners: Set<NetworkEventListener> = new Set();
  private roomMetaListeners: Set<RoomMetaListener> = new Set();
  private cachedDiscoveredRooms: Map<string, Room> = new Map();
  private processedEventIds: Set<string> = new Set();

  // Outbox for offline/pending messages
  private outboxQueue: Array<{ topic: string; payload: RoomEventPayload }> = [];

  constructor() {
    this.clientId =
      'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);

    this.initMqtt();

    // Re-check announcements and flush outbox periodically
    setInterval(() => {
      this.flushOutbox();
    }, 2500);
  }

  // ---------------------------------------------------------------------------
  // 1. MQTT Initialization (EMQX fallback)
  // ---------------------------------------------------------------------------
  private initMqtt() {
    try {
      this.mqttClient = mqtt.connect(EMQX_BROKER_URL, {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 4000,
        keepalive: 30,
      });

      this.mqttClient.on('connect', () => {
        this.isMqttConnected = true;
        this.subscribedRoomCodes.forEach((code) => {
          this.subscribeMqttRoom(code);
        });
        this.flushOutbox();
      });

      this.mqttClient.on('message', (_topic, messageBuffer) => {
        try {
          const payload = JSON.parse(messageBuffer.toString()) as RoomEventPayload;
          this.handleIncomingEvent(payload);
        } catch {
          // Ignore invalid messages
        }
      });

      this.mqttClient.on('error', () => {
        // Warning suppressed for clean console
      });

      this.mqttClient.on('offline', () => {
        this.isMqttConnected = false;
      });
    } catch {
      // Fall back purely to HTTPS/WSS 443
    }
  }

  private subscribeMqttRoom(cleanCode: string) {
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.subscribe(`${TOPIC_PREFIX}_${cleanCode}`, { qos: 0 });
      } catch {
        // Ignore
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Port 443 WebSocket Connection (ntfy.sh)
  // ---------------------------------------------------------------------------
  private subscribePort443Room(cleanCode: string) {
    const existing = this.activeRoomSockets.get(cleanCode);
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const topic = `${TOPIC_PREFIX}_${cleanCode}`;
      const ws = new WebSocket(`${NTFY_WS_BASE_URL}/${topic}/ws`);

      ws.onopen = () => {
        // Poll immediately to catch any messages published while disconnected
        this.pollRoomMessages(cleanCode);
      };

      ws.onmessage = (e) => {
        try {
          const raw = JSON.parse(e.data);
          if (raw.event === 'message' && raw.message) {
            const eventPayload = JSON.parse(raw.message) as RoomEventPayload;
            this.handleIncomingEvent(eventPayload);
          }
        } catch {
          // Ignore non-json or malformed socket frames
        }
      };

      ws.onclose = () => {
        this.activeRoomSockets.delete(cleanCode);
        // Auto-reconnect if room is still active
        if (this.subscribedRoomCodes.has(cleanCode)) {
          setTimeout(() => this.subscribePort443Room(cleanCode), 3000);
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      };

      this.activeRoomSockets.set(cleanCode, ws);
    } catch {
      // Handled by active HTTP polling
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Continuous Active HTTP Sync Poller (Universal mobile 5G/LTE reliability)
  // ---------------------------------------------------------------------------
  private startActivePoller(cleanCode: string) {
    if (this.activeRoomPollers.has(cleanCode)) return;

    // Run first sync immediately
    this.pollRoomMessages(cleanCode);

    // Continuous ticker every 2.5 seconds
    const interval = setInterval(() => {
      this.pollRoomMessages(cleanCode);
    }, 2500);

    this.activeRoomPollers.set(cleanCode, interval);
  }

  private stopActivePoller(cleanCode: string) {
    const poller = this.activeRoomPollers.get(cleanCode);
    if (poller) {
      clearInterval(poller);
      this.activeRoomPollers.delete(cleanCode);
    }
  }

  public async pollRoomMessages(cleanCode: string): Promise<void> {
    const topic = `${TOPIC_PREFIX}_${cleanCode}`;
    try {
      // Query cached events from the last 12 hours (maximum free tier retention)
      const pollUrl = `${NTFY_BASE_URL}/${topic}/json?poll=1&since=12h`;
      const res = await fetch(pollUrl, { method: 'GET' });
      if (!res.ok) return;

      const rawText = await res.text();
      const events = parseNtfyJsonStream(rawText);

      for (const item of events) {
        if (item.event === 'message' && item.message) {
          try {
            const payload = JSON.parse(item.message) as RoomEventPayload;
            this.handleIncomingEvent(payload);
          } catch {
            // Ignore malformed inner message
          }
        }
      }
    } catch {
      // Network hiccup, will retry on next poll cycle
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Incoming Event Dispatcher & Deduplicator
  // ---------------------------------------------------------------------------
  private handleIncomingEvent(event: RoomEventPayload) {
    if (!event || !event.roomCode || !event.type) return;

    // Filter out messages published by ourselves to avoid echo duplication
    if (event.publisherClientId === this.clientId) return;

    // Deduplicate event by composite signature
    const dataId =
      typeof event.data === 'object' && event.data !== null && 'id' in event.data
        ? String((event.data as { id: unknown }).id)
        : typeof event.data === 'object' && event.data !== null && 'message' in event.data && typeof (event.data as { message: unknown }).message === 'object' && (event.data as { message: { id?: string } }).message?.id
        ? (event.data as { message: { id: string } }).message.id
        : '';

    const eventKey = `${event.type}_${event.roomCode.toUpperCase()}_${event.senderSessionId}_${event.timestamp}_${dataId}`;

    if (this.processedEventIds.has(eventKey)) return;
    this.processedEventIds.add(eventKey);

    // Keep set pruned to avoid memory bloat
    if (this.processedEventIds.size > 2500) {
      const first = this.processedEventIds.values().next().value;
      if (first) this.processedEventIds.delete(first);
    }

    // Process room metadata announcements
    if (event.type === 'ROOM_ANNOUNCE' && event.data) {
      const roomData =
        typeof event.data === 'object' && event.data !== null && 'room' in event.data
          ? (event.data as { room: Room }).room
          : (event.data as Room);

      if (roomData && roomData.room_code) {
        const upperCode = roomData.room_code.toUpperCase();
        this.cachedDiscoveredRooms.set(upperCode, roomData);
        this.roomMetaListeners.forEach((listener) => {
          try {
            listener(roomData);
          } catch (err) {
            console.error('Error in room meta listener:', err);
          }
        });
      }
    }

    // Dispatch to registered event listeners
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in network event listener:', err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Subscription Management
  // ---------------------------------------------------------------------------
  public subscribeToRoom(roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) return;

    this.subscribedRoomCodes.add(cleanCode);

    // 1. Establish real-time WebSocket connection
    this.subscribePort443Room(cleanCode);

    // 2. Start continuous active background HTTP sync poller
    this.startActivePoller(cleanCode);

    // 3. Connect MQTT topic
    this.subscribeMqttRoom(cleanCode);
  }

  public unsubscribeFromRoom(roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    this.subscribedRoomCodes.delete(cleanCode);

    // Close WebSocket
    const ws = this.activeRoomSockets.get(cleanCode);
    if (ws) {
      try {
        ws.close();
      } catch {
        // Ignore
      }
      this.activeRoomSockets.delete(cleanCode);
    }

    // Stop active HTTP poller
    this.stopActivePoller(cleanCode);

    // Unsubscribe MQTT
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.unsubscribe(`${TOPIC_PREFIX}_${cleanCode}`);
      } catch {
        // Ignore
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Room Metadata Publishing & Deep Discovery
  // ---------------------------------------------------------------------------
  public publishRoomMeta(room: Room, creator?: RoomMember) {
    const cleanCode = room.room_code.toUpperCase();
    this.cachedDiscoveredRooms.set(cleanCode, room);

    const payload: RoomEventPayload = {
      type: 'ROOM_ANNOUNCE',
      roomId: room.id,
      roomCode: cleanCode,
      senderSessionId: creator?.session_id || this.clientId,
      publisherClientId: this.clientId,
      timestamp: Date.now(),
      data: { room, creator },
    };

    this.broadcastPayload(cleanCode, payload);
  }

  /**
   * Resolves room metadata AND extracts historical messages and members
   * from cached topic storage.
   */
  public async fetchRoomMeta(roomCode: string, timeoutMs = 4000): Promise<RoomDiscoveryResult | null> {
    const cleanCode = roomCode.trim().toUpperCase();

    // 1. Check HTTP cached messages from the last 12 hours
    try {
      const topic = `${TOPIC_PREFIX}_${cleanCode}`;
      const pollUrl = `${NTFY_BASE_URL}/${topic}/json?poll=1&since=12h`;
      const res = await fetch(pollUrl, { method: 'GET' });

      if (res.ok) {
        const text = await res.text();
        const items = parseNtfyJsonStream(text);

        let foundRoom: Room | null = null;
        const cachedMessages: Message[] = [];
        const memberMap = new Map<string, RoomMember>();

        for (const raw of items) {
          if (raw.event === 'message' && raw.message) {
            try {
              const eventPayload = JSON.parse(raw.message) as RoomEventPayload;

              if (eventPayload.type === 'ROOM_ANNOUNCE' && eventPayload.data) {
                const roomData =
                  typeof eventPayload.data === 'object' && eventPayload.data !== null && 'room' in eventPayload.data
                    ? (eventPayload.data as { room: Room }).room
                    : (eventPayload.data as Room);

                if (roomData && roomData.room_code && roomData.room_code.toUpperCase() === cleanCode) {
                  foundRoom = roomData;
                  this.cachedDiscoveredRooms.set(cleanCode, roomData);

                  const creator =
                    typeof eventPayload.data === 'object' && eventPayload.data !== null && 'creator' in eventPayload.data
                      ? (eventPayload.data as { creator?: RoomMember }).creator
                      : undefined;
                  if (creator && creator.session_id) {
                    memberMap.set(creator.session_id, creator);
                  }
                }
              }

              if (eventPayload.type === 'MESSAGE_SENT' && eventPayload.data) {
                const msg = (eventPayload.data as { message?: Message }).message;
                if (msg && msg.id) {
                  if (!cachedMessages.some((m) => m.id === msg.id)) {
                    cachedMessages.push(msg);
                  }
                }
              }

              if (eventPayload.type === 'MEMBER_JOINED' && eventPayload.data) {
                const member = (eventPayload.data as { member?: RoomMember }).member;
                if (member && member.session_id) {
                  memberMap.set(member.session_id, member);
                }
              }
            } catch {
              // Ignore malformed inner message
            }
          }
        }

        if (foundRoom) {
          return {
            room: foundRoom,
            cachedMessages: cachedMessages.sort((a, b) => a.created_at - b.created_at),
            cachedMembers: Array.from(memberMap.values()),
          };
        }
      }
    } catch {
      // Continue to live socket discovery
    }

    // 2. Fast in-memory check
    if (this.cachedDiscoveredRooms.has(cleanCode)) {
      return {
        room: this.cachedDiscoveredRooms.get(cleanCode)!,
        cachedMessages: [],
        cachedMembers: [],
      };
    }

    // 3. Live Socket Ping / Wait
    this.subscribeToRoom(cleanCode);

    return new Promise((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          const fallbackRoom = this.cachedDiscoveredRooms.get(cleanCode) || null;
          resolve(
            fallbackRoom
              ? {
                  room: fallbackRoom,
                  cachedMessages: [],
                  cachedMembers: [],
                }
              : null
          );
        }
      }, timeoutMs);

      const metaListener: RoomMetaListener = (room) => {
        if (room.room_code.toUpperCase() === cleanCode && !resolved) {
          resolved = true;
          cleanup();
          resolve({
            room,
            cachedMessages: [],
            cachedMembers: [],
          });
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.roomMetaListeners.delete(metaListener);
      };

      this.roomMetaListeners.add(metaListener);

      // Actively broadcast discover ping so any online peer immediately responds with ROOM_ANNOUNCE
      this.publishEvent({
        type: 'DISCOVER_PING',
        roomId: '',
        roomCode: cleanCode,
        data: { query: 'NEED_ROOM_META' },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Broadcast Outgoing Events
  // ---------------------------------------------------------------------------
  public publishEvent(
    event: Omit<RoomEventPayload, 'senderSessionId' | 'timestamp'> & { senderSessionId?: string }
  ) {
    const cleanCode = event.roomCode.toUpperCase();
    const fullPayload: RoomEventPayload = {
      ...event,
      senderSessionId: event.senderSessionId || this.clientId,
      publisherClientId: this.clientId,
      timestamp: Date.now(),
    };

    this.broadcastPayload(cleanCode, fullPayload);
  }

  private broadcastPayload(cleanCode: string, payload: RoomEventPayload) {
    const topic = `${TOPIC_PREFIX}_${cleanCode}`;
    const serialized = JSON.stringify(payload);

    // A. Broadcast over HTTPS Port 443 (Universal, works on all devices & carriers)
    fetch(`${NTFY_BASE_URL}/${topic}`, {
      method: 'POST',
      body: serialized,
    }).catch(() => {
      // If offline, queue in outbox for automatic replay
      this.outboxQueue.push({ topic, payload });
    });

    // B. Also broadcast over MQTT (EMQX) if connected
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.publish(topic, serialized, { qos: 0 });
      } catch {
        // Handled by outbox
      }
    }
  }

  private flushOutbox() {
    if (this.outboxQueue.length === 0) return;

    const items = [...this.outboxQueue];
    this.outboxQueue = [];

    items.forEach(({ topic, payload }) => {
      const serialized = JSON.stringify(payload);
      fetch(`${NTFY_BASE_URL}/${topic}`, {
        method: 'POST',
        body: serialized,
      }).catch(() => {
        this.outboxQueue.push({ topic, payload });
      });

      if (this.mqttClient && this.isMqttConnected) {
        try {
          this.mqttClient.publish(topic, serialized, { qos: 0 });
        } catch {
          // Ignore
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 8. Event Listeners & State
  // ---------------------------------------------------------------------------
  public onEvent(listener: NetworkEventListener) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public onRoomMeta(listener: RoomMetaListener) {
    this.roomMetaListeners.add(listener);
    return () => {
      this.roomMetaListeners.delete(listener);
    };
  }

  public getDiscoveredRooms(): Room[] {
    return Array.from(this.cachedDiscoveredRooms.values());
  }

  public getIsConnected(): boolean {
    return this.isMqttConnected || this.activeRoomSockets.size > 0 || this.activeRoomPollers.size > 0;
  }
}

export const networkRelay = new NetworkRelay();
