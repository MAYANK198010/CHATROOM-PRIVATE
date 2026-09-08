import mqtt, { MqttClient } from 'mqtt';
import { Room, RoomMember, Message, BanRecord, JoinRequest } from '../types';

// Public secure WebSocket MQTT brokers (no registration or API key required)
const PRIMARY_BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
const FALLBACK_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

const TOPIC_PREFIX = 'ephemeral_chatroom_v2';

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
    | 'SYNC_RESPONSE';
  roomId: string;
  roomCode: string;
  senderSessionId: string;
  senderName?: string;
  timestamp: number;
  data: unknown;
}

export type NetworkEventListener = (event: RoomEventPayload) => void;
export type RoomMetaListener = (room: Room) => void;

class NetworkRelay {
  private client: MqttClient | null = null;
  private clientId: string;
  private isConnected = false;
  private activeRoomSubscriptions: Set<string> = new Set();
  private eventListeners: Set<NetworkEventListener> = new Set();
  private roomMetaListeners: Set<RoomMetaListener> = new Set();
  private cachedDiscoveredRooms: Map<string, Room> = new Map();
  private pendingMetaRequests: Map<string, (room: Room | null) => void> = new Map();

  constructor() {
    this.clientId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    this.initClient(PRIMARY_BROKER_URL);
  }

  private initClient(brokerUrl: string) {
    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 3000,
        keepalive: 30,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        // Subscribe to global room announcement directory
        this.client?.subscribe(`${TOPIC_PREFIX}/directory/#`, { qos: 0 });
        this.client?.subscribe(`${TOPIC_PREFIX}/rooms/+/info`, { qos: 1 });

        // Re-subscribe to any active rooms
        this.activeRoomSubscriptions.forEach((roomCode) => {
          this.subscribeRoomTopics(roomCode);
        });
      });

      this.client.on('message', (topic, messageBuffer) => {
        this.handleIncomingMessage(topic, messageBuffer.toString());
      });

      this.client.on('error', (err) => {
        console.warn('NetworkRelay MQTT error:', err.message);
        if (brokerUrl === PRIMARY_BROKER_URL) {
          // Switch to fallback broker
          try {
            this.client?.end(true);
          } catch {
            // Ignore
          }
          this.initClient(FALLBACK_BROKER_URL);
        }
      });

      this.client.on('offline', () => {
        this.isConnected = false;
      });
    } catch (e) {
      console.warn('Failed to initialize MQTT client:', e);
    }
  }

  private handleIncomingMessage(topic: string, messageStr: string) {
    try {
      const data = JSON.parse(messageStr);

      // 1. Room Metadata Topic e.g. ephemeral_chatroom_v2/rooms/X7K9PQ/info
      if (topic.includes('/info')) {
        const room = data as Room;
        if (room && room.room_code) {
          const code = room.room_code.toUpperCase();
          this.cachedDiscoveredRooms.set(code, room);
          this.roomMetaListeners.forEach((listener) => listener(room));

          // Resolve any pending lookup promises
          if (this.pendingMetaRequests.has(code)) {
            const resolver = this.pendingMetaRequests.get(code);
            this.pendingMetaRequests.delete(code);
            resolver?.(room);
          }
        }
        return;
      }

      // 2. Room Events Topic e.g. ephemeral_chatroom_v2/rooms/X7K9PQ/events
      if (topic.includes('/events') || topic.includes('/sync')) {
        const event = data as RoomEventPayload;
        // Ignore events sent by ourselves
        if (event.senderSessionId === this.clientId) {
          return;
        }
        this.eventListeners.forEach((listener) => listener(event));
      }
    } catch {
      // Ignore malformed payloads
    }
  }

  public subscribeToRoom(roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    this.activeRoomSubscriptions.add(cleanCode);
    if (this.isConnected && this.client) {
      this.subscribeRoomTopics(cleanCode);
    }
  }

  private subscribeRoomTopics(cleanCode: string) {
    if (!this.client) return;
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/${cleanCode}/info`, { qos: 1 });
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/${cleanCode}/events`, { qos: 1 });
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/${cleanCode}/sync`, { qos: 1 });
  }

  public unsubscribeFromRoom(roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    this.activeRoomSubscriptions.delete(cleanCode);
    if (this.client && this.isConnected) {
      this.client.unsubscribe(`${TOPIC_PREFIX}/rooms/${cleanCode}/events`);
      this.client.unsubscribe(`${TOPIC_PREFIX}/rooms/${cleanCode}/sync`);
    }
  }

  public publishRoomMeta(room: Room) {
    const cleanCode = room.room_code.toUpperCase();
    this.cachedDiscoveredRooms.set(cleanCode, room);

    if (this.client && this.isConnected) {
      // Retained message ensures anyone who queries this topic receives it immediately
      this.client.publish(
        `${TOPIC_PREFIX}/rooms/${cleanCode}/info`,
        JSON.stringify(room),
        { retain: true, qos: 1 }
      );
      // Also publish to public directory
      this.client.publish(
        `${TOPIC_PREFIX}/directory/${cleanCode}`,
        JSON.stringify(room),
        { retain: true, qos: 0 }
      );
    }
  }

  public async fetchRoomMeta(roomCode: string, timeoutMs = 4000): Promise<Room | null> {
    const cleanCode = roomCode.trim().toUpperCase();

    // Check memory cache first
    if (this.cachedDiscoveredRooms.has(cleanCode)) {
      return this.cachedDiscoveredRooms.get(cleanCode)!;
    }

    if (!this.client || !this.isConnected) {
      return null;
    }

    // Subscribe to the topic
    this.client.subscribe(`${TOPIC_PREFIX}/rooms/${cleanCode}/info`, { qos: 1 });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingMetaRequests.has(cleanCode)) {
          this.pendingMetaRequests.delete(cleanCode);
          resolve(this.cachedDiscoveredRooms.get(cleanCode) || null);
        }
      }, timeoutMs);

      this.pendingMetaRequests.set(cleanCode, (room) => {
        clearTimeout(timer);
        resolve(room);
      });
    });
  }

  public publishEvent(event: Omit<RoomEventPayload, 'senderSessionId' | 'timestamp'> & { senderSessionId?: string }) {
    const cleanCode = event.roomCode.toUpperCase();
    const fullPayload: RoomEventPayload = {
      ...event,
      senderSessionId: event.senderSessionId || this.clientId,
      timestamp: Date.now(),
    };

    if (this.client && this.isConnected) {
      const subtopic = event.type === 'SYNC_REQUEST' || event.type === 'SYNC_RESPONSE' ? 'sync' : 'events';
      this.client.publish(
        `${TOPIC_PREFIX}/rooms/${cleanCode}/${subtopic}`,
        JSON.stringify(fullPayload),
        { qos: 1 }
      );
    }
  }

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
    return this.isConnected;
  }
}

export const networkRelay = new NetworkRelay();
