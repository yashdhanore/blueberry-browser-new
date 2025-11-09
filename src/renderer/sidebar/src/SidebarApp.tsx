/**
 * Sidebar App
 *
 * Main sidebar application with tab switching between Chat, Agent, and Recorder modes.
 */

import React, { useEffect, useState } from 'react';
import { ChatProvider } from './contexts/ChatContext';
import { Chat } from './components/Chat';
import { AgentPanel } from './components/Agentpanel';
import { RecorderPanel } from './components/RecorderPanel';
import { HabitToastContainer } from './components/HabitToast';
import { useDarkMode } from '@common/hooks/useDarkMode';
import { MessageSquare, Brain, Video } from 'lucide-react';

type TabMode = 'chat' | 'agent' | 'recorder';

const SidebarContent: React.FC = () => {
  const { isDarkMode } = useDarkMode();
  const [activeTab, setActiveTab] = useState<TabMode>('chat');

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <div className="h-screen flex flex-col bg-background border-l border-border relative">
      {/* Habit Toast Notifications */}
      <HabitToastContainer />

      {/* Tab Switcher */}
      <div className="flex border-b border-border bg-background">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'chat'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">Chat</span>
          {activeTab === 'chat' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('agent')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'agent'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Brain className="w-4 h-4" />
          <span className="hidden sm:inline">Agent</span>
          {activeTab === 'agent' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('recorder')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'recorder'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Video className="w-4 h-4" />
          <span className="hidden sm:inline">Record</span>
          {activeTab === 'recorder' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? (
          <Chat />
        ) : activeTab === 'agent' ? (
          <AgentPanel />
        ) : (
          <RecorderPanel />
        )}
      </div>
    </div>
  );
};

export const SidebarApp: React.FC = () => {
  return (
    <ChatProvider>
      <SidebarContent />
    </ChatProvider>
  );
};