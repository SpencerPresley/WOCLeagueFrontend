'use client';

import * as Ably from 'ably';
import { AblyProvider, useChannel, ChannelProvider } from 'ably/react';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { IGif } from '@giphy/js-types';
import type { SyntheticEvent } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sticker, SendHorizontal } from 'lucide-react';
import GifPicker from './gif-picker';

/**
 * Props for the Chat component
 * @interface ChatProps
 */
export interface ChatProps {
  /** ID of the league this chat belongs to */
  leagueId: string;
  /** Information about the currently authenticated user */
  currentUser: {
    /** User's unique identifier */
    id: string;
    /** User's display name */
    name: string;
  };
}

/**
 * Structure of a chat message
 * @interface ChatMessage
 */
interface ChatMessage {
  /** The message text content */
  text?: string;
  /** The GIF object if this is a GIF message */
  gif?: {
    id: string;
    url: string;
    title: string;
    width: number;
    height: number;
  };
  /** The username of the message sender */
  username: string;
  /** The user ID of the message sender */
  userId: string;
  /** Timestamp when the message was sent */
  timestamp: number;
}

/** Maximum number of messages to keep in the chat history */
const MAX_MESSAGES = 100;

/**
 * Chat Component
 *
 * A real-time chat component that uses Ably for message delivery.
 * Features:
 * - Real-time message updates with consistent ordering
 * - User presence tracking per channel with live online count
 * - Persistent message history across page reloads
 * - Clickable usernames linking to profile pages
 * - Message limit (100) with automatic pruning
 * - Multi-browser support with unique client IDs
 * - Emoji support and rich text formatting
 *
 * Message Handling:
 * - Messages are stored chronologically (oldest to newest)
 * - Display is reversed to show newest messages at top
 * - History is loaded on component mount
 * - New messages are appended to maintain order
 *
 * User Experience:
 * - Loading states during history fetch
 * - Empty state prompts for first message
 * - Proper message wrapping and emoji display
 * - Responsive height based on screen size
 *
 * @component
 * @param {ChatProps} props - Component properties
 */
function ChatComponent({ leagueId, currentUser }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const isMobile = useIsMobile();

  // Subscribe to all messages on the channel
  const { channel } = useChannel(`league-chat:${leagueId}`, (message) => {
    if (message.name === 'message') {
      setMessages((prev) => {
        // Always add new messages to the end and maintain order
        const newMessages = [...prev, message.data as ChatMessage];
        // Keep only the last MAX_MESSAGES
        return newMessages.slice(-MAX_MESSAGES);
      });
    }
  });

  useEffect(() => {
    if (!channel) return;

    // Load message history
    const loadHistory = async () => {
      try {
        // Get messages in reverse order (oldest first) with a larger limit
        const history = await channel.history({
          limit: MAX_MESSAGES,
          direction: 'forwards', // Get oldest messages first
        });

        const historicalMessages = history.items.map((item) => item.data as ChatMessage);

        setMessages(historicalMessages);
      } catch (error) {
        console.error('Failed to load message history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Subscribe to presence updates
    const onPresenceUpdate = () => {
      channel.presence.get().then((members) => {
        setOnlineUsers(members?.length || 0);
      });
    };

    loadHistory();
    onPresenceUpdate();

    // Subscribe to presence events
    channel.presence.subscribe(['enter', 'leave'], onPresenceUpdate);

    // Enter the presence set
    channel.presence.enter({ username: currentUser.name });

    return () => {
      channel.presence.unsubscribe();
      channel.presence.leave();
    };
  }, [channel, currentUser]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const message: ChatMessage = {
      text: inputMessage,
      username: currentUser.name,
      userId: currentUser.id,
      timestamp: Date.now(),
    };

    channel.publish('message', message);
    setInputMessage('');
  };

  const sendGif = (gif: IGif, e: SyntheticEvent<HTMLElement, Event>) => {
    e.preventDefault();
    e.stopPropagation();

    const message: ChatMessage = {
      gif: {
        id: gif.id.toString(),
        url: gif.images.original.url,
        title: gif.title,
        width: gif.images.original.width,
        height: gif.images.original.height,
      },
      username: currentUser.name,
      userId: currentUser.id,
      timestamp: Date.now(),
    };

    channel.publish('message', message);
    setShowGifPicker(false);
  };

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const hoursDiff = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 24) {
      return formatDistanceToNow(date, { addSuffix: true });
    } else {
      return format(date, 'MMM d, h:mm a');
    }
  };

  return (
    <Card className="flex flex-col h-[800px] lg:h-[600px] card-gradient shadow-xl">
      <CardContent className="flex-1 p-0 overflow-hidden">
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 z-10">
          <div className="flex items-center justify-between p-3">
            <span className="text-sm font-medium text-gray-300">Shout Box</span>
            <span className="text-xs bg-gray-800/80 px-2 py-1 rounded-full text-gray-300">
              {onlineUsers} online
            </span>
          </div>

          <form onSubmit={sendMessage} className="flex gap-2 p-3 border-t border-gray-800">
            <Input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message... 😊"
              className="flex-1 bg-gray-800/80 text-white border-gray-700 focus:border-gray-600 transition-colors rounded-md"
            />
            {isMobile ? (
              <Dialog open={showGifPicker} onOpenChange={setShowGifPicker}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="bg-gray-800/80 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-all rounded-md text-xs font-medium"
                  >
                    GIF
                  </Button>
                </DialogTrigger>
                <DialogContent className="p-0 sm:max-w-[425px] border-gray-800 bg-gray-900 rounded-lg">
                  <DialogTitle className="sr-only">GIF Picker</DialogTitle>
                  <GifPicker onGifSelect={sendGif} onClose={() => setShowGifPicker(false)} />
                </DialogContent>
              </Dialog>
            ) : (
              <Popover open={showGifPicker} onOpenChange={setShowGifPicker}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="bg-gray-800/80 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-all rounded-md text-xs font-medium"
                  >
                    GIF
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0 w-auto border-gray-800 bg-gray-900 rounded-lg"
                  align="end"
                  side="bottom"
                  sideOffset={5}
                  alignOffset={0}
                >
                  <GifPicker onGifSelect={sendGif} onClose={() => setShowGifPicker(false)} />
                </PopoverContent>
              </Popover>
            )}
            <Button
              type="submit"
              variant="default"
              size="icon"
              className="bg-blue-600 hover:bg-blue-500 transition-colors rounded-md"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <ScrollArea className="flex-1 h-[calc(100%-90px)]">
          <div className="p-3 min-h-full">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                No messages yet. Be the first to chat! 👋
              </div>
            ) : (
              <div className="flex flex-col-reverse space-y-reverse space-y-2">
                {messages.map((msg, index) => (
                  <Card
                    key={index}
                    className="group bg-gray-800/80 border-gray-700/50 hover:bg-gray-800/90 transition-colors rounded-md"
                  >
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start mb-1.5">
                        <div>
                          <Link
                            href={`/users/${msg.userId}`}
                            className="text-blue-400 font-medium hover:text-blue-300 transition-colors"
                          >
                            {msg.username}
                          </Link>
                          <span className="text-gray-500">: </span>
                        </div>
                        <span className="text-xs text-gray-500 opacity-60 group-hover:opacity-100 transition-opacity">
                          {formatMessageTime(msg.timestamp)}
                        </span>
                      </div>
                      {msg.text ? (
                        <span className="text-gray-100 whitespace-pre-wrap break-words">
                          {msg.text}
                        </span>
                      ) : msg.gif ? (
                        <div className="mt-2 rounded-lg overflow-hidden">
                          <img
                            src={msg.gif.url}
                            alt={msg.gif.title}
                            className="max-w-full hover:scale-[1.02] transition-transform"
                            style={{
                              maxHeight: '200px',
                              width: 'auto',
                            }}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/**
 * Chat Provider Component
 *
 * Wraps the chat component with necessary providers for Ably integration.
 * Creates and uses a memoized Ably client instance to enable:
 * - Single persistent connection for all chats
 * - Multiple simultaneous channel subscriptions
 * - Efficient connection management
 * - Cross-browser support
 *
 * Configuration:
 * - Uses token auth for security
 * - Enables message echoing for consistent display
 * - Automatic cleanup on page unload
 * - Channel-specific capabilities
 *
 * @component
 * @param {ChatProps} props - Component properties
 */
const Chat = function Chat({ leagueId, currentUser }: ChatProps) {
  console.log('Chat: Initializing for league', leagueId);

  // Create a memoized client instance that persists across renders
  const client = useMemo(() => {
    console.log('Chat: Creating new Ably client');
    return new Ably.Realtime({
      authUrl: '/api/ably',
      authMethod: 'GET',
      echoMessages: true,
      closeOnUnload: true,
    });
  }, []);

  const channelName = `league-chat:${leagueId}`;
  console.log('Chat: Using channel', channelName);

  return (
    <AblyProvider client={client}>
      <ChannelProvider channelName={channelName}>
        <ChatComponent leagueId={leagueId} currentUser={currentUser} />
      </ChannelProvider>
    </AblyProvider>
  );
};

export default Chat;
