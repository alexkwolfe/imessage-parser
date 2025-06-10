import {
  buildChatLinks,
  buildMessageLink,
  buildComposeLink,
  extractRecipient,
  isGroupChat
} from '../utils/message-links';
import { ChatRow, MessageRow } from '../imessage-database';

describe('message-links', () => {
  describe('buildChatLinks', () => {
    it('should build links for individual chat with phone number', () => {
      const chat: ChatRow = {
        ROWID: 1,
        guid: 'chat-guid-123',
        chat_identifier: '+15551234567',
        display_name: 'John Doe'
      };

      const links = buildChatLinks(chat);

      expect(links).toHaveLength(3);
      expect(links[0]).toEqual({
        url: 'sms://%2B15551234567',
        type: 'sms',
        description: 'Open conversation via SMS URL scheme'
      });
      expect(links[1]).toEqual({
        url: 'imessage://%2B15551234567',
        type: 'imessage',
        description: 'Open conversation via iMessage URL scheme'
      });
      expect(links[2]).toEqual({
        url: 'messages://open?guid=chat-guid-123',
        type: 'messages',
        description: 'Open conversation via Messages URL scheme'
      });
    });

    it('should build links for individual chat with email', () => {
      const chat: ChatRow = {
        ROWID: 2,
        guid: 'chat-guid-456',
        chat_identifier: 'user@example.com',
        display_name: 'User Name'
      };

      const links = buildChatLinks(chat);

      expect(links).toHaveLength(3);
      expect(links[0].url).toBe('sms://user%40example.com');
      expect(links[1].url).toBe('imessage://user%40example.com');
      expect(links[2].url).toBe('messages://open?guid=chat-guid-456');
    });

    it('should build link for group chat', () => {
      const chat: ChatRow = {
        ROWID: 3,
        guid: 'group-chat-guid-789',
        chat_identifier: 'chat123456789',
        display_name: 'Family Group'
      };

      const links = buildChatLinks(chat);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        url: 'messages://open?guid=group-chat-guid-789',
        type: 'messages',
        description: 'Open group chat in Messages app'
      });
    });

    it('should return empty array for chat without identifier', () => {
      const chat: ChatRow = {
        ROWID: 4,
        guid: 'chat-guid',
        chat_identifier: '',
        display_name: null
      };

      const links = buildChatLinks(chat);
      expect(links).toHaveLength(0);
    });
  });

  describe('buildMessageLink', () => {
    it('should build link for specific message', () => {
      const message: MessageRow = {
        ROWID: 100,
        guid: 'message-guid-xyz',
        text: 'Hello world',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle123',
        cache_has_attachments: 0
      };

      const link = buildMessageLink(message);

      expect(link).toEqual({
        url: 'messages://open?guid=message-guid-xyz',
        type: 'messages',
        description: 'Open specific message in Messages app'
      });
    });
  });

  describe('buildComposeLink', () => {
    it('should build compose link with recipient only', () => {
      const link = buildComposeLink('+15551234567');

      expect(link).toEqual({
        url: 'sms://%2B15551234567',
        type: 'sms',
        description: 'Compose new message'
      });
    });

    it('should build compose link with recipient and body', () => {
      const link = buildComposeLink('+15551234567', 'Hello there!');

      expect(link).toEqual({
        url: 'sms://%2B15551234567&body=Hello%20there!',
        type: 'sms',
        description: 'Compose new message'
      });
    });

    it('should properly encode special characters', () => {
      const link = buildComposeLink('user@example.com', 'Question: How are you?');

      expect(link.url).toBe('sms://user%40example.com&body=Question%3A%20How%20are%20you%3F');
    });
  });

  describe('extractRecipient', () => {
    it('should extract phone number', () => {
      expect(extractRecipient('+15551234567')).toBe('+15551234567');
    });

    it('should extract email', () => {
      expect(extractRecipient('user@example.com')).toBe('user@example.com');
    });

    it('should return null for group chat', () => {
      expect(extractRecipient('chat123456789')).toBeNull();
    });

    it('should return null for empty identifier', () => {
      expect(extractRecipient('')).toBeNull();
    });
  });

  describe('isGroupChat', () => {
    it('should identify group chats', () => {
      expect(isGroupChat('chat123456789')).toBe(true);
      expect(isGroupChat('chat987654321')).toBe(true);
    });

    it('should identify non-group chats', () => {
      expect(isGroupChat('+15551234567')).toBe(false);
      expect(isGroupChat('user@example.com')).toBe(false);
      expect(isGroupChat('chatroom')).toBe(false); // 'chat' prefix but no numbers
      expect(isGroupChat('chat')).toBe(false); // just 'chat'
    });
  });
});