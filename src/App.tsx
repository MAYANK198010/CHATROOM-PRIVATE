/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
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
import { roomEngine } from './services/roomEngine';
import { Room, RoomMember, Message, BanRecord, JoinRequest, JoinMode } from './types';

export default function App() {
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [currentMember, setCurrentMember] = useState<RoomMember | null>(null);
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

  // Refresh active room data
  const refreshRoomData = useCallback(() => {
    if (!activeRoom) return;
    const r = roomEngine.getRoomById(activeRoom.id);
    if (r) {
      setActiveRoom({ ...r });
      setMessages([...roomEngine.getMessages(r.id)]);
      const currentM = roomEngine.getMembers(r.id);
      setMembers([...currentM]);
      setBans([...roomEngine.getBans(r.id)]);
      setRequests([...roomEngine.getJoinRequests(r.id)]);

      // If currentMember was kicked or banned
      if (currentMember) {
        const updatedSelf = currentM.find((m) => m.session_id === currentMember.session_id);
        const isBanned = roomEngine.getBans(r.id).some((b) => b.session_id === currentMember.session_id);
        if (!updatedSelf || isBanned) {
          alert('You have been removed or banned from this room.');
          setActiveRoom(null);
          setCurrentMember(null);
        } else {
          setCurrentMember({ ...updatedSelf });
        }
      }
    }
  }, [activeRoom, currentMember]);

  // Load all rooms for home listing
  const refreshAllRooms = useCallback(() => {
    // Collect from storage
    const demo = roomEngine.getRoomByCode('X7K9PQ');
    const list: Room[] = [];
    if (demo) list.push(demo);
    // Add any others
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

  // Listen to cross-tab / local sync events
  useEffect(() => {
    refreshAllRooms();
    const unsubscribe = roomEngine.subscribeToSyncEvents?.((event) => {
      if (activeRoom && (event.payload as { roomId?: string })?.roomId === activeRoom.id) {
        refreshRoomData();
      }
      refreshAllRooms();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeRoom, refreshRoomData, refreshAllRooms]);

  // Detect URL parameter on initial mount e.g. ?r=X7K9PQ
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('r') || params.get('room');
    if (codeParam) {
      setJoinInitialCode(codeParam.toUpperCase());
      setIsJoinOpen(true);
    }
  }, []);

  // Handle Room Creation
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

  const handleCreateSuccess = (room: Room, session: RoomMember) => {
    setActiveRoom(room);
    setCurrentMember(session);
    setMessages(roomEngine.getMessages(room.id));
    setMembers(roomEngine.getMembers(room.id));
    setBans(roomEngine.getBans(room.id));
    setRequests(roomEngine.getJoinRequests(room.id));
    refreshAllRooms();
  };

  const handleJoinSuccess = (room: Room, session: RoomMember) => {
    setActiveRoom(room);
    setCurrentMember(session);
    setMessages(roomEngine.getMessages(room.id));
    setMembers(roomEngine.getMembers(room.id));
    setBans(roomEngine.getBans(room.id));
    setRequests(roomEngine.getJoinRequests(room.id));
    refreshAllRooms();
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
    }
    setActiveRoom(null);
    setCurrentMember(null);
    refreshAllRooms();
  };

  const handleSwitchIdentity = (targetMember: RoomMember) => {
    setCurrentMember(targetMember);
  };

  const handleResetData = () => {
    if (confirm('Reset all demo data and restore initial clean room state?')) {
      roomEngine.resetAllData();
      setActiveRoom(null);
      setCurrentMember(null);
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
        onGoHome={() => {
          setActiveRoom(null);
          setCurrentMember(null);
        }}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col">
        {activeRoom && currentMember ? (
          <ChatRoomView
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
        onCreateSuccess={handleCreateSuccess}
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
