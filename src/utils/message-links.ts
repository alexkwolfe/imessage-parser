import { MessageRow, ChatRow } from '../imessage-database';

/**
 * Utility functions for building iMessage deep links
 */

export interface MessageLink {
  url: string;
  type: 'sms' | 'imessage' | 'messages';
  description: string;
}

/**
 * Build deep links for a chat conversation
 */
export function buildChatLinks(chat: ChatRow): MessageLink[] {
  const links: MessageLink[] = [];
  
  if (!chat.chat_identifier) {
    return links;
  }
  
  // Check if it's a group chat
  if (chat.chat_identifier.startsWith('chat') && /^chat\d+$/.test(chat.chat_identifier)) {
    // Group chat - use messages:// URL with GUID
    links.push({
      url: `messages://open?guid=${chat.guid}`,
      type: 'messages',
      description: 'Open group chat in Messages app'
    });
  } else {
    // Individual chat - use SMS/iMessage URL schemes
    const recipient = encodeURIComponent(chat.chat_identifier);
    
    links.push({
      url: `sms://${recipient}`,
      type: 'sms',
      description: 'Open conversation via SMS URL scheme'
    });
    
    links.push({
      url: `imessage://${recipient}`,
      type: 'imessage',
      description: 'Open conversation via iMessage URL scheme'
    });
    
    // Also provide messages:// link using chat GUID
    links.push({
      url: `messages://open?guid=${chat.guid}`,
      type: 'messages',
      description: 'Open conversation via Messages URL scheme'
    });
  }
  
  return links;
}

/**
 * Build deep link for a specific message
 * Note: Opening specific messages may require special entitlements
 */
export function buildMessageLink(message: MessageRow): MessageLink {
  return {
    url: `messages://open?guid=${message.guid}`,
    type: 'messages',
    description: 'Open specific message in Messages app'
  };
}

/**
 * Build a "compose new message" link
 */
export function buildComposeLink(recipient: string, body?: string): MessageLink {
  const encodedRecipient = encodeURIComponent(recipient);
  let url = `sms://${encodedRecipient}`;
  
  if (body) {
    // SMS URL scheme supports body parameter
    url += `&body=${encodeURIComponent(body)}`;
  }
  
  return {
    url,
    type: 'sms',
    description: 'Compose new message'
  };
}

/**
 * Parse a chat identifier to extract the recipient
 * @returns The phone number or email, or null if it's a group chat
 */
export function extractRecipient(chatIdentifier: string): string | null {
  if (!chatIdentifier) return null;
  
  // Group chats start with "chat" followed by numbers
  if (chatIdentifier.startsWith('chat') && /^chat\d+$/.test(chatIdentifier)) {
    return null;
  }
  
  // For individual chats, the identifier is usually the phone/email
  return chatIdentifier;
}

/**
 * Determine if a chat identifier represents a group chat
 */
export function isGroupChat(chatIdentifier: string): boolean {
  return chatIdentifier.startsWith('chat') && /^chat\d+$/.test(chatIdentifier);
}