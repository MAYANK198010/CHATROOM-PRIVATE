export type RoomRole = 'owner' | 'moderator' | 'member';

export type RoomStatus = 'active' | 'locked' | 'ended' | 'expired';

export type JoinMode = 'open' | 'password' | 'approval';

export interface Room {
  id: string;
  room_code: string;
  name: string;
  created_at: number;
  expires_at: number;
  status: RoomStatus;
  owner_session_id: string;
  join_mode: JoinMode;
  password_hash?: string;
  slow_mode_seconds: number; // 0 for off, or 5, 15, 30
}

export interface RoomMember {
  session_id: string;
  room_id: string;
  username: string;
  role: RoomRole;
  joined_at: number;
  last_seen: number;
  is_online: boolean;
  color: string;
}

export interface Message {
  id: string;
  room_id: string;
  session_id: string;
  sender_name: string;
  sender_role: RoomRole;
  content: string;
  created_at: number;
  deleted_at?: number;
  deleted_by_name?: string;
  is_system?: boolean;
  system_type?: 'join' | 'leave' | 'ban' | 'kick' | 'lock' | 'unlock' | 'slow_mode' | 'role' | 'ended';
}

export interface BanRecord {
  id: string;
  room_id: string;
  session_id: string;
  username: string;
  reason: string;
  banned_at: number;
}

export interface JoinRequest {
  id: string;
  room_id: string;
  session_id: string;
  username: string;
  requested_at: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface TypingIndicator {
  session_id: string;
  username: string;
  timestamp: number;
}

export interface SecurityAttackLog {
  id: string;
  test_name: string;
  payload: string;
  expected_outcome: string;
  actual_outcome: string;
  passed: boolean;
  timestamp: number;
}
