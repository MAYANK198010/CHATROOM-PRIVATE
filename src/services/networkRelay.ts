/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mqtt, { MqttClient } from 'mqtt';
import { Room } from '../types';

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
    | 'DISCOVER_PING';
  roomId: string;
  roomCode: string;
  senderSessionId: string;
  senderName?: string;
  timestamp: number;
  data: unknown;
}

export type NetworkEventListener = (event: RoomEventPayload) => void;
export type RoomMetaListener = (room: Room) => void;

// Dual Reliable Transports:
// 1. HTTP/WSS Port 443: ntfy.sh (Unrestricted on 5G/LTE and mobile carriers)
// 2. MQTT Broker: broker.emqx.io:8084 (Fast low-latency real-time relay)
const NTFY_BASE_URL = 'https://ntfy.sh';
const NTFY_WS_BASE_URL = 'wss://ntfy.sh';
const EMQX_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'ephemeral_chatroom_v3';

class NetworkRelay {
  private clientId: string;
  private mqttClient: MqttClient | null = null;
  private isMqttConnected = false;

  // Active room WebSockets (ntfy.sh over port 443)
  private activeRoomSockets: Map<string, WebSocket> = new Map();
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
    }, 2000);
  }

  // ---------------------------------------------------------------------------
  // 1. MQTT Initialization (EMQX)
  // ---------------------------------------------------------------------------
  private initMqtt() {
    try {
      this.mqttClient = mqtt.connect(EMQX_BROKER_URL, {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 3000,
        keepalive: 30,
      });

      this.mqttClient.on('connect', () => {
        this.isMqttConnected = true;
        // Re-subscribe to all active room topics
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

      this.mqttClient.on('error', (err) => {
        console.warn('MQTT connection note:', err.message);
      });

      this.mqttClient.on('offline', () => {
        this.isMqttConnected = false;
      });
    } catch (e) {
      console.warn('MQTT init failed, falling back purely to HTTPS/WSS 443:', e);
    }
  }

  private subscribeMqttRoom(cleanCode: string) {
    if (this.mqttClient && this.isMqttConnected) {
      this.mqttClient.subscribe(`${TOPIC_PREFIX}_${cleanCode}`, { qos: 0 });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Port 443 HTTPS / WebSocket Connection (ntfy.sh)
  // ---------------------------------------------------------------------------
  private subscribePort443Room(cleanCode: string) {
    if (this.activeRoomSockets.has(cleanCode)) {
      const existing = this.activeRoomSockets.get(cleanCode);
      if (existing && existing.readyState === WebSocket.OPEN) return;
    }

    try {
      const topic = `${TOPIC_PREFIX}_${cleanCode}`;
      const ws = new WebSocket(`${NTFY_WS_BASE_URL}/${topic}/ws`);

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
        // Auto-reconnect if room is still subscribed
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
    } catch (err) {
      console.warn('Port 443 WebSocket error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Incoming Event Dispatcher & Deduplicator
  // ---------------------------------------------------------------------------
  private handleIncomingEvent(event: RoomEventPayload) {
    if (!event || !event.roomCode || !event.type) return;

    // Filter out messages published by ourselves
    if (event.senderSessionId === this.clientId) return;

    // Deduplicate event by composite signature
    const eventKey = `${event.type}_${event.roomCode}_${event.senderSessionId}_${event.timestamp}_${
      typeof event.data === 'object' && event.data !== null && 'id' in event.data
        ? (event.data as { id: string }).id
        : ''
    }`;

    if (this.processedEventIds.has(eventKey)) return;
    this.processedEventIds.add(eventKey);

    // Keep set pruned to avoid memory growth
    if (this.processedEventIds.size > 2000) {
      const first = this.processedEventIds.values().next().value;
      if (first) this.processedEventIds.delete(first);
    }

    // Process room metadata announcements
    if (event.type === 'ROOM_ANNOUNCE' && event.data) {
      const room = event.data as Room;
      if (room && room.room_code) {
        const code = room.room_code.toUpperCase();
        this.cachedDiscoveredRooms.set(code, room);
        this.roomMetaListeners.forEach((listener) => listener(room));
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
  // 4. Room Subscription API
  // ---------------------------------------------------------------------------
  public subscribeToRoom(roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    this.subscribedRoomCodes.add(cleanCode);

    // Subscribe via Port 443 WebSocket
    this.subscribePort443Room(cleanCode);

    // Subscribe via MQTT
    this.subscribeMqttRoom(cleanCode);

    // Also send an initial discover ping in case peers are already online
    this.publishEvent({
      type: 'DISCOVER_PING',
      roomId: '',
      roomCode: cleanCode,
      data: { query: 'WHO_IS_ONLINE' },
    });
  }

  public unsubscribeFromRoom(roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    this.subscribedRoomCodes.delete(cleanCode);

    const ws = this.activeRoomSockets.get(cleanCode);
    if (ws) {
      try {
        ws.close();
      } catch {
        // Ignore
      }
      this.activeRoomSockets.delete(cleanCode);
    }

    if (this.mqttClient && this.isMqttConnected) {
      this.mqttClient.unsubscribe(`${TOPIC_PREFIX}_${cleanCode}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Room Metadata Publishing & Discovery
  // ---------------------------------------------------------------------------
  public publishRoomMeta(room: Room) {
    const cleanCode = room.room_code.toUpperCase();
    this.cachedDiscoveredRooms.set(cleanCode, room);

    const payload: RoomEventPayload = {
      type: 'ROOM_ANNOUNCE',
      roomId: room.id,
      roomCode: cleanCode,
      senderSessionId: this.clientId,
      timestamp: Date.now(),
      data: room,
    };

    this.broadcastPayload(cleanCode, payload);
  }

  public async fetchRoomMeta(roomCode: string, timeoutMs = 4500): Promise<Room | null> {
    const cleanCode = roomCode.trim().toUpperCase();

    // 1. Fast in-memory check
    if (this.cachedDiscoveredRooms.has(cleanCode)) {
      return this.cachedDiscoveredRooms.get(cleanCode)!;
    }

    // 2. Query HTTPS Port 443 cached messages via ntfy poll API (Ultra-Reliable on mobile 5G)
    try {
      const topic = `${TOPIC_PREFIX}_${cleanCode}`;
      const pollUrl = `${NTFY_BASE_URL}/${topic}/json?poll=1&since=24h`;
      const res = await fetch(pollUrl, { method: 'GET' });
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const raw = JSON.parse(line);
            if (raw.event === 'message' && raw.message) {
              const eventPayload = JSON.parse(raw.message) as RoomEventPayload;
              if (eventPayload.type === 'ROOM_ANNOUNCE' && eventPayload.data) {
                const room = eventPayload.data as Room;
                if (room && room.room_code && room.room_code.toUpperCase() === cleanCode) {
                  this.cachedDiscoveredRooms.set(cleanCode, room);
                  return room;
                }
              }
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
    } catch {
      // Network fetch error, continue to live socket discovery
    }

    // 3. Live Socket Ping / Wait (if not found in cache)
    this.subscribeToRoom(cleanCode);

    return new Promise((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(this.cachedDiscoveredRooms.get(cleanCode) || null);
        }
      }, timeoutMs);

      const metaListener: RoomMetaListener = (room) => {
        if (room.room_code.toUpperCase() === cleanCode && !resolved) {
          resolved = true;
          cleanup();
          resolve(room);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.roomMetaListeners.delete(metaListener);
      };

      this.roomMetaListeners.add(metaListener);

      // Actively broadcast discover ping so any online peer responds with ROOM_ANNOUNCE
      this.publishEvent({
        type: 'DISCOVER_PING',
        roomId: '',
        roomCode: cleanCode,
        data: { query: 'NEED_ROOM_META' },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Broadcast Outgoing Events
  // ---------------------------------------------------------------------------
  public publishEvent(
    event: Omit<RoomEventPayload, 'senderSessionId' | 'timestamp'> & { senderSessionId?: string }
  ) {
    const cleanCode = event.roomCode.toUpperCase();
    const fullPayload: RoomEventPayload = {
      ...event,
      senderSessionId: event.senderSessionId || this.clientId,
      timestamp: Date.now(),
    };

    this.broadcastPayload(cleanCode, fullPayload);
  }

  private broadcastPayload(cleanCode: string, payload: RoomEventPayload) {
    const topic = `${TOPIC_PREFIX}_${cleanCode}`;

    // A. Broadcast over HTTPS Port 443 (Universal, works everywhere)
    fetch(`${NTFY_BASE_URL}/${topic}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      // If offline, queue in outbox
      this.outboxQueue.push({ topic, payload });
    });

    // B. Also broadcast over MQTT (EMQX) if connected
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.publish(topic, JSON.stringify(payload), { qos: 0 });
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
      fetch(`${NTFY_BASE_URL}/${topic}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        // Re-queue if still failing
        this.outboxQueue.push({ topic, payload });
      });

      if (this.mqttClient && this.isMqttConnected) {
        try {
          this.mqttClient.publish(topic, JSON.stringify(payload), { qos: 0 });
        } catch {
          // Ignore
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Event Listeners
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
    return this.isMqttConnected || this.activeRoomSockets.size > 0;
  }
}

export const networkRelay = new NetworkRelay();
