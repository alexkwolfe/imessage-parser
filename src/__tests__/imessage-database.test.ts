import { IMessageDatabase, MessageRow, ChatRow } from '../imessage-database';
import { Database } from 'sqlite3';
import { AttributedStringParser } from '../parsers/attributed-string-parser';

// Mock sqlite3
jest.mock('sqlite3', () => ({
  Database: jest.fn(),
}));

// Mock AttributedStringParser
jest.mock('../parsers/attributed-string-parser');

describe('IMessageDatabase', () => {
  let mockDb: any;
  let mockParser: any;
  let database: IMessageDatabase;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock database methods
    mockDb = {
      all: jest.fn(),
      close: jest.fn(),
    };

    // Setup mock parser
    mockParser = {
      parse: jest.fn().mockReturnValue({ text: 'parsed text', link: '' }),
    };

    // Mock Database constructor
    (Database as unknown as jest.Mock).mockImplementation((path, callback) => {
      if (callback) callback(null);
      return mockDb;
    });

    // Mock AttributedStringParser
    (AttributedStringParser as jest.Mock).mockImplementation(() => mockParser);
  });

  describe('constructor', () => {
    it('should create database with default path', () => {
      database = new IMessageDatabase();
      expect(Database).toHaveBeenCalledWith(
        expect.stringContaining('Library/Messages/chat.db'),
        expect.any(Function)
      );
    });

    it('should create database with custom path', () => {
      const customPath = '/custom/path/to/db';
      database = new IMessageDatabase(customPath);
      expect(Database).toHaveBeenCalledWith(customPath, expect.any(Function));
    });

    it('should throw error if database fails to open', () => {
      const error = new Error('Database error');
      (Database as unknown as jest.Mock).mockImplementation((path, callback) => {
        if (callback) callback(error);
        return mockDb;
      });

      expect(() => new IMessageDatabase()).toThrow('Failed to open database: Database error');
    });

    it('should pass parser options to AttributedStringParser', () => {
      const parserOptions = { preserveFormatting: true };
      database = new IMessageDatabase(undefined, parserOptions);
      expect(AttributedStringParser).toHaveBeenCalledWith(parserOptions);
    });
  });

  describe('getChats', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should return all chats', async () => {
      const mockChats: ChatRow[] = [
        { ROWID: 1, guid: 'chat1', chat_identifier: 'id1', display_name: 'Chat 1' },
        { ROWID: 2, guid: 'chat2', chat_identifier: 'id2', display_name: 'Chat 2' },
      ];

      mockDb.all.mockImplementation((query: any, callback: any) => {
        callback(null, mockChats);
      });

      const result = await database.getChats();
      expect(result).toEqual(mockChats);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.any(Function)
      );
    });

    it('should reject on database error', async () => {
      const error = new Error('Query failed');
      mockDb.all.mockImplementation((query: any, callback: any) => {
        callback(error);
      });

      await expect(database.getChats()).rejects.toEqual(error);
    });
  });

  describe('getMessagesFromChat', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should return messages from a specific chat', async () => {
      const mockMessages: MessageRow[] = [
        {
          ROWID: 1,
          guid: 'msg1',
          text: 'Hello',
          attributedBody: null,
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle1',
          cache_has_attachments: 0,
        },
      ];

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, mockMessages);
      });

      const result = await database.getMessagesFromChat(1, 50, 0);
      expect(result).toEqual(mockMessages);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1, 50, 0],
        expect.any(Function)
      );
    });

    it('should use default limit and offset', async () => {
      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, []);
      });

      await database.getMessagesFromChat(1);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.any(String),
        [1, 100, 0],
        expect.any(Function)
      );
    });

    it('should reject on database error', async () => {
      const error = new Error('Query failed');
      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(error);
      });

      await expect(database.getMessagesFromChat(1)).rejects.toEqual(error);
    });
  });

  describe('parseMessage', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should return plain text if available', () => {
      const message: MessageRow = {
        ROWID: 1,
        guid: 'msg1',
        text: 'Plain text message',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
      };

      const result = database.parseMessage(message);
      expect(result).toEqual({ text: 'Plain text message', link: 'messages://open?guid=msg1' });
      expect(mockParser.parse).not.toHaveBeenCalled();
    });

    it('should parse attributedBody if text is null', () => {
      const mockBuffer = Buffer.from('test');
      const message: MessageRow = {
        ROWID: 1,
        guid: 'msg1',
        text: null,
        attributedBody: mockBuffer,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
      };

      const result = database.parseMessage(message);
      expect(result).toEqual({ text: 'parsed text', link: 'messages://open?guid=msg1' });
      expect(mockParser.parse).toHaveBeenCalledWith(mockBuffer);
    });

    it('should return empty text if both text and attributedBody are null', () => {
      const message: MessageRow = {
        ROWID: 1,
        guid: 'msg1',
        text: null,
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
      };

      const result = database.parseMessage(message);
      expect(result).toEqual({ text: '', link: 'messages://open?guid=msg1' });
    });

    it('should include link when requested', () => {
      const message: MessageRow = {
        ROWID: 1,
        guid: 'msg-guid-123',
        text: 'Test message',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
      };

      const result = database.parseMessage(message);
      expect(result).toEqual({ 
        text: 'Test message',
        link: 'messages://open?guid=msg-guid-123'
      });
    });

    it('should handle message without guid', () => {
      const message: MessageRow = {
        ROWID: 1,
        guid: '',
        text: 'Test message',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
      };

      const result = database.parseMessage(message);
      expect(result).toEqual({ text: 'Test message', link: '' });
    });
  });

  describe('searchMessages', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should search messages by text content', async () => {
      const mockMessages = [
        {
          ROWID: 1,
          guid: 'msg1',
          text: 'Hello world',
          attributedBody: null,
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle1',
          cache_has_attachments: 0,
          chat_display_name: 'Test Chat',
        },
      ];

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, mockMessages);
      });

      const result = await database.searchMessages('world');
      expect(result).toEqual(mockMessages);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.text LIKE'),
        ['%world%', 100],
        expect.any(Function)
      );
    });

    it('should search messages by attributedBody content', async () => {
      const mockMessages = [
        {
          ROWID: 1,
          guid: 'msg1',
          text: null,
          attributedBody: Buffer.from('test'),
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle1',
          cache_has_attachments: 0,
        },
      ];

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, mockMessages);
      });

      mockParser.parse.mockReturnValue({ text: 'Hello world from attributed' });

      const result = await database.searchMessages('world');
      expect(result).toHaveLength(1);
      expect(mockParser.parse).toHaveBeenCalledWith(mockMessages[0].attributedBody);
    });

    it('should filter out messages that do not contain search term', async () => {
      const mockMessages = [
        {
          ROWID: 1,
          guid: 'msg1',
          text: 'Hello',
          attributedBody: null,
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle1',
          cache_has_attachments: 0,
        },
        {
          ROWID: 2,
          guid: 'msg2',
          text: null,
          attributedBody: Buffer.from('test'),
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle2',
          cache_has_attachments: 0,
        },
      ];

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, mockMessages);
      });

      mockParser.parse.mockReturnValue({ text: 'No match here' });

      const result = await database.searchMessages('world');
      expect(result).toHaveLength(0);
    });

    it('should use custom limit', async () => {
      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, []);
      });

      await database.searchMessages('test', 50);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.any(String),
        ['%test%', 50],
        expect.any(Function)
      );
    });

    it('should handle case-insensitive search in attributedBody', async () => {
      const mockMessages = [
        {
          ROWID: 1,
          guid: 'msg1',
          text: null,
          attributedBody: Buffer.from('test'),
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle1',
          cache_has_attachments: 0,
        },
      ];

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, mockMessages);
      });

      mockParser.parse.mockReturnValue({ text: 'Hello WORLD' });

      const result = await database.searchMessages('world');
      expect(result).toHaveLength(1);
    });

    it('should reject on database error', async () => {
      const error = new Error('Query failed');
      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(error);
      });

      await expect(database.searchMessages('test')).rejects.toEqual(error);
    });
  });

  describe('getAttributedMessagesInRange', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should get messages within date range', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      const mockMessages: MessageRow[] = [
        {
          ROWID: 1,
          guid: 'msg1',
          text: null,
          attributedBody: Buffer.from('test'),
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle1',
          cache_has_attachments: 0,
        },
      ];

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, mockMessages);
      });

      const result = await database.getAttributedMessagesInRange(startDate, endDate);
      expect(result).toEqual(mockMessages);
      
      // Check that dates are converted to Core Data format
      const expectedStartTimestamp = (Math.floor(startDate.getTime() / 1000) - 978307200) * 1000000000;
      const expectedEndTimestamp = (Math.floor(endDate.getTime() / 1000) - 978307200) * 1000000000;
      
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.attributedBody IS NOT NULL'),
        [expectedStartTimestamp, expectedEndTimestamp],
        expect.any(Function)
      );
    });

    it('should filter by chat name when provided', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      const chatName = 'Test Chat';

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, []);
      });

      await database.getAttributedMessagesInRange(startDate, endDate, chatName);
      
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND c.display_name = ?'),
        [expect.any(Number), expect.any(Number), chatName],
        expect.any(Function)
      );
    });

    it('should reject on database error', async () => {
      const error = new Error('Query failed');
      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(error);
      });

      await expect(
        database.getAttributedMessagesInRange(new Date(), new Date())
      ).rejects.toEqual(error);
    });
  });

  describe('getMessagesWithChatInfo', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should return messages with chat information', async () => {
      const mockMessages = [
        {
          ROWID: 1,
          guid: 'msg1',
          text: 'Hello',
          attributedBody: null,
          date: 123456789,
          is_from_me: 1,
          handle_id: 'handle1',
          cache_has_attachments: 0,
          chat_guid: 'chat-guid-123',
          chat_identifier: '+15551234567',
          chat_display_name: 'John Doe',
        },
      ];

      mockDb.all.mockImplementation((query: any, params: any, callback: any) => {
        callback(null, mockMessages);
      });

      const result = await database.getMessagesWithChatInfo(1);
      expect(result).toEqual(mockMessages);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('c.guid as chat_guid'),
        [1, 100, 0],
        expect.any(Function)
      );
    });
  });

  describe('parseMessageWithChat', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should include message link for message with guid', () => {
      const message = {
        ROWID: 1,
        guid: 'msg-guid-123',
        text: 'Test message',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
        chat_guid: 'chat-guid-456',
        chat_identifier: '+15551234567',
        chat_display_name: 'John Doe',
      };

      const result = database.parseMessageWithChat(message);
      expect(result).toEqual({
        text: 'Test message',
        link: 'messages://open?guid=msg-guid-123'
      });
    });

    it('should fallback to SMS link for individual chat without message guid', () => {
      const message = {
        ROWID: 1,
        guid: '',
        text: 'Test message',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
        chat_guid: 'chat-guid-456',
        chat_identifier: '+15551234567',
        chat_display_name: 'John Doe',
      };

      const result = database.parseMessageWithChat(message);
      expect(result).toEqual({
        text: 'Test message',
        link: 'sms://%2B15551234567'
      });
    });

    it('should use chat guid for group chat without message guid', () => {
      const message = {
        ROWID: 1,
        guid: '',
        text: 'Test message',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
        chat_guid: 'group-chat-guid',
        chat_identifier: 'chat123456789',
        chat_display_name: 'Family Group',
      };

      const result = database.parseMessageWithChat(message);
      expect(result).toEqual({
        text: 'Test message',
        link: 'messages://open?guid=group-chat-guid'
      });
    });

    it('should always include appropriate link', () => {
      const message = {
        ROWID: 1,
        guid: 'msg-guid-123',
        text: 'Test message',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
        chat_guid: 'chat-guid-456',
        chat_identifier: '+15551234567',
        chat_display_name: 'John Doe',
      };

      const result = database.parseMessageWithChat(message);
      expect(result.link).toBe('messages://open?guid=msg-guid-123');
    });
  });

  describe('close', () => {
    beforeEach(() => {
      database = new IMessageDatabase();
    });

    it('should close database connection', async () => {
      mockDb.close.mockImplementation((callback: any) => callback(null));

      await database.close();
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should reject on close error', async () => {
      const error = new Error('Close failed');
      mockDb.close.mockImplementation((callback: any) => callback(error));

      await expect(database.close()).rejects.toEqual(error);
    });
  });
});