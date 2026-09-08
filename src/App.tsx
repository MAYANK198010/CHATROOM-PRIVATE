/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { CreateRoomModal } from './components/CreateRoomModal';
import { JoinRoomModal } from './components/JoinRoomModal';
import { ChatRoomView } from './components/ChatRoomView';
import { AdminPanelModal } from './components/AdminPanelModal';
import { ShareModal } from './components/ShareModal';
import { MembersDrawer } from './components/MembersDrawer';
import { DocsModal } from './components/DocsModal';
import { SecurityTestModal } from './components/SecurityTestModal';
import { MultiRoomTabBar, OpenRoomSession } from './components/MultiRoomTabBar';
import { roomEngine } from './services/roomEngine';
import { Room, RoomMember, Message, BanRecord, JoinRequest, JoinMode } from './types';

export default function App() {
  const [openRooms, setOpenRooms] = useState<OpenRoomSession[]>(() => {
    try {
      const saved = sessionStorage.getItem('chatroom_v1_open_tabs');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });
  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
    try {
      const saved = sessionStorage.getItem('chatroom_v1_open_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed[0].room.id;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const activeSession = openRooms.find((s) => s.room.id === activeRoomId) || null;
  const activeRoom = activeSession?.room || null;
  const currentMember = activeSession?.session || null;

  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinInitialCode, setJoinInitialCode] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);

  // Sync open rooms to session storage
  useEffect(() => {
    try {
      sessionStorage.setItem('chatroom_v1_open_tabs', JSON.stringify(openRooms));
    } catch {
      // ignore
    }
  }, [openRooms]);

  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;
  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  const currentMemberRef = useRef(currentMember);
  currentMemberRef.current = currentMember;

  // Refresh active room data
  const refreshRoomData = useCallback(() => {
    const curRoom = activeRoomRef.current;
    if (!curRoom) return;
    const r = roomEngine.getRoomById(curRoom.id);
    if (r) {
      setMessages([...roomEngine.getMessages(r.id)]);
      const currentM = roomEngine.getMembers(r.id);
      setMembers([...currentM]);
      setBans([...roomEngine.getBans(r.id)]);
      setRequests([...roomEngine.getJoinRequests(r.id)]);

      const curMem = currentMemberRef.current;
      if (curMem) {
        const isBanned = roomEngine.getBans(r.id).some((b) => b.session_id === curMem.session_id);
        const updatedSelf = currentM.find((m) => m.session_id === curMem.session_id);
        if (isBanned || (!updatedSelf && !currentM.some((m) => m.username.toLowerCase() === curMem.username.toLowerCase()))) {
          alert('You have been removed or banned from this room.');
          setOpenRooms((prev) => prev.filter((item) => item.room.id !== r.id));
          setActiveRoomId((prevId) => (prevId === r.id ? null : prevId));
        }
      }
    }
  }, []);

  // Load all rooms for home listing
  const refreshAllRooms = useCallback(() => {
    const demo = roomEngine.getRoomByCode('X7K9PQ');
    const list: Room[] = [];
    if (demo) list.push(demo);
    try {
      const stored = localStorage.getItem('chatroom_v1_rooms');
      if (stored) {
        const parsed: Room[] = JSON.parse(stored);
        parsed.forEach((r) => {
          if (!list.some((existing) => existing.id === r.id)) {
            list.push(r);
          }
        });
      }
    } catch {
      // Ignore
    }
    setAllRooms(list);
  }, []);

  // Switch to room whenever activeRoomId changes
  useEffect(() => {
    if (activeRoomId) {
      const target = openRooms.find((s) => s.room.id === activeRoomId);
      if (target) {
        setMessages(roomEngine.getMessages(target.room.id));
        setMembers(roomEngine.getMembers(target.room.id));
        setBans(roomEngine.getBans(target.room.id));
        setRequests(roomEngine.getJoinRequests(target.room.id));
      }
    }
  }, [activeRoomId, openRooms]);

  // Listen to cross-tab / network sync events
  useEffect(() => {
    refreshAllRooms();
    const unsubscribe = roomEngine.subscribeToSyncEvents?.((event) => {
      const eventRoomId = (event.payload as { roomId?: string })?.roomId;
      const curActiveId = activeRoomIdRef.current;

      if (eventRoomId) {
        // Increment unread count for background open rooms
        if (event.type === 'MESSAGE_RECEIVED') {
          setOpenRooms((prev) =>
            prev.map((s) => {
              if (s.room.id === eventRoomId && s.room.id !== curActiveId) {
                return { ...s, unreadCount: s.unreadCount + 1 };
              }
              return s;
            })
          );
        }

        // If affects currently visible room, refresh data
        if (eventRoomId === curActiveId) {
          refreshRoomData();
        }
      }

      refreshAllRooms();
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [refreshRoomData, refreshAllRooms]);

  // Detect URL parameter on initial mount e.g. ?r=X7K9PQ
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('r') || params.get('room');
    if (codeParam) {
      setJoinInitialCode(codeParam.toUpperCase());
      setIsJoinOpen(true);
    }
  }, []);

  // Room Creation Handler
  const handleCreateRoom = (params: {
    name: string;
    ownerUsername: string;
    durationMinutes: number;
    joinMode: JoinMode;
    password?: string;
    slowModeSeconds?: number;
  }) => {
    const result = roomEngine.createRoom(params);
    refreshAllRooms();
    return result;
  };

  const handleJoinSuccess = (room: Room, session: RoomMember) => {
    setOpenRooms((prev) => {
      const existingIdx = prev.findIndex((s) => s.room.id === room.id);
      if (existingIdx !== -1) {
        const copy = [...prev];
        copy[existingIdx] = { room, session, unreadCount: 0 };
        return copy;
      }
      return [...prev, { room, session, unreadCount: 0 }];
    });
    setActiveRoomId(room.id);
    refreshAllRooms();
  };

  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setOpenRooms((prev) =>
      prev.map((item) => (item.room.id === roomId ? { ...item, unreadCount: 0 } : item))
    );
  };

  const handleCloseRoom = (roomId: string) => {
    setOpenRooms((prev) => {
      const remaining = prev.filter((item) => item.room.id !== roomId);
      if (activeRoomId === roomId) {
        setActiveRoomId(remaining.length > 0 ? remaining[0].room.id : null);
      }
      return remaining;
    });
  };

  // Launch Demo Room
  const handleLaunchDemoRoom = () => {
    const demo = roomEngine.getRoomByCode('X7K9PQ');
    if (demo) {
      const demoMembers = roomEngine.getMembers(demo.id);
      const owner = demoMembers.find((m) => m.role === 'owner') || demoMembers[0];
      if (owner) {
        handleJoinSuccess(demo, owner);
      }
    }
  };

  const handleLeaveRoom = () => {
    if (activeRoom && currentMember) {
      roomEngine.leaveRoom(activeRoom.id, currentMember.session_id);
      handleCloseRoom(activeRoom.id);
    }
    refreshAllRooms();
  };

  const handleSwitchIdentity = (targetMember: RoomMember) => {
    if (activeRoom) {
      setOpenRooms((prev) =>
        prev.map((item) =>
          item.room.id === activeRoom.id ? { ...item, session: targetMember } : item
        )
      );
    }
  };

  const handleResetData = () => {
    if (confirm('Reset all demo data and restore initial clean room state?')) {
      roomEngine.resetAllData();
      setOpenRooms([]);
      setActiveRoomId(null);
      refreshAllRooms();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased flex flex-col">
      {/* Navigation Header */}
      <Navbar
        currentRoom={activeRoom}
        onOpenDocs={() => setIsDocsOpen(true)}
        onOpenSecurityTests={() => setIsSecurityOpen(true)}
        onResetData={handleResetData}
        onGoHome={() => setActiveRoomId(null)}
      />

      {/* Multi-Room Parallel Tabs Bar */}
      <MultiRoomTabBar
        openRooms={openRooms}
        activeRoomId={activeRoomId}
        onSelectRoom={handleSelectRoom}
        onGoHome={() => setActiveRoomId(null)}
        onCloseRoom={handleCloseRoom}
        onOpenJoin={() => {
          setJoinInitialCode('');
          setIsJoinOpen(true);
        }}
        onOpenCreate={() => setIsCreateOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeRoom && currentMember ? (
          <ChatRoomView
            key={activeRoom.id}
            room={activeRoom}
            currentMember={currentMember}
            members={members}
            messages={messages}
            bans={bans}
            requests={requests}
            onLeaveRoom={handleLeaveRoom}
            onOpenAdmin={() => setIsAdminOpen(true)}
            onOpenShare={() => setIsShareOpen(true)}
            onOpenMembers={() => setIsMembersOpen(true)}
            onSwitchIdentity={handleSwitchIdentity}
            onRefresh={refreshRoomData}
          />
        ) : (
          <HomeView
            onCreateRoomClick={() => setIsCreateOpen(true)}
            onJoinRoomClick={(code) => {
              setJoinInitialCode(code || '');
              setIsJoinOpen(true);
            }}
            onLaunchDemoRoom={handleLaunchDemoRoom}
            allRooms={allRooms}
          />
        )}
      </main>

      {/* Modals & Slide-overs */}
      <CreateRoomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateSuccess={handleJoinSuccess}
        onCreate={handleCreateRoom}
      />

      <JoinRoomModal
        isOpen={isJoinOpen}
        initialCode={joinInitialCode}
        onClose={() => {
          setIsJoinOpen(false);
          setJoinInitialCode('');
        }}
        onJoinSuccess={handleJoinSuccess}
      />

      {activeRoom && currentMember && (
        <>
          <AdminPanelModal
            isOpen={isAdminOpen}
            onClose={() => setIsAdminOpen(false)}
            room={activeRoom}
            currentMember={currentMember}
            members={members}
            bans={bans}
            requests={requests}
            onRefreshRoom={refreshRoomData}
          />

          <ShareModal
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
            room={activeRoom}
          />

          <MembersDrawer
            isOpen={isMembersOpen}
            onClose={() => setIsMembersOpen(false)}
            members={members}
            currentMember={currentMember}
            onOpenAdmin={() => setIsAdminOpen(true)}
          />
        </>
      )}

      {/* Foundational Engineering Docs Modal */}
      <DocsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
      />

      {/* Phase 8 Security Test Modal */}
      <SecurityTestModal
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
        activeRoom={activeRoom}
      />
    </div>
  );
}
