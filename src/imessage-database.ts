import { Database } from 'sqlite3';
import * as path from 'path';
import * as os from 'os';
import { AttributedStringParser } from './parsers/attributed-string-parser';
import { ParsedMessage, ParserOptions } from './types';

export interface MessageRow {
  ROWID: number;
  guid: string;
  text: string | null;
  attributedBody: Buffer | null;
  date: number;
  is_from_me: number;
  handle_id: string | null;
  cache_has_attachments: number;
}

export interface MessageWithChat extends MessageRow {
  chat_guid?: string;
  chat_identifier?: string;
  chat_display_name?: string;
}

export interface ChatRow {
  ROWID: number;
  guid: string;
  chat_identifier: string;
  display_name: string | null;
}

export class IMessageDatabase {
  private db: Database;
  private parser: AttributedStringParser;
  private static readonly DEFAULT_DB_PATH = path.join(
    os.homedir(),
    'Library',
    'Messages',
    'chat.db'
  );

  constructor(dbPath?: string, parserOptions?: ParserOptions) {
    const finalPath = dbPath || IMessageDatabase.DEFAULT_DB_PATH;
    this.db = new Database(finalPath, (err) => {
      if (err) {
        throw new Error(`Failed to open database: ${err.message}`);
      }
    });
    this.parser = new AttributedStringParser(parserOptions);
  }

  /**
   * Get all chats
   */
  async getChats(): Promise<ChatRow[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          ROWID,
          guid,
          chat_identifier,
          display_name
        FROM chat
        ORDER BY ROWID DESC
      `;

      this.db.all(query, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as ChatRow[]);
      });
    });
  }

  /**
   * Get messages from a specific chat
   */
  async getMessagesFromChat(
    chatId: number,
    limit: number = 100,
    offset: number = 0
  ): Promise<MessageRow[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          m.ROWID,
          m.guid,
          m.text,
          m.attributedBody,
          m.date,
          m.is_from_me,
          h.id as handle_id,
          m.cache_has_attachments
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        WHERE cmj.chat_id = ?
        ORDER BY m.date DESC
        LIMIT ? OFFSET ?
      `;

      this.db.all(query, [chatId, limit, offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as MessageRow[]);
      });
    });
  }

  /**
   * Parse a message row to extract text content
   * Always includes a link to the message (empty string if no GUID)
   */
  parseMessage(message: MessageRow): ParsedMessage {
    let result: ParsedMessage;
    
    // If plain text exists, return it
    if (message.text) {
      result = {
        text: message.text,
        link: message.guid ? `messages://open?guid=${message.guid}` : '',
      };
    }
    // If attributedBody exists, parse it
    else if (message.attributedBody) {
      result = this.parser.parse(message.attributedBody);
      // Parser doesn't include link, so add it
      result.link = message.guid ? `messages://open?guid=${message.guid}` : '';
    }
    // No content
    else {
      result = {
        text: '',
        link: message.guid ? `messages://open?guid=${message.guid}` : '',
      };
    }

    return result;
  }

  /**
   * Search messages by content
   */
  async searchMessages(
    searchTerm: string,
    limit: number = 100
  ): Promise<Array<MessageRow & { chat_display_name?: string }>> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          m.ROWID,
          m.guid,
          m.text,
          m.attributedBody,
          m.date,
          m.is_from_me,
          h.id as handle_id,
          m.cache_has_attachments,
          c.display_name as chat_display_name
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE m.text LIKE ? OR m.attributedBody IS NOT NULL
        ORDER BY m.date DESC
        LIMIT ?
      `;

      this.db.all(query, [`%${searchTerm}%`, limit], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Filter results that actually contain the search term
        const filtered = (rows as any[]).filter(row => {
          if (row.text && row.text.includes(searchTerm)) {
            return true;
          }
          
          if (row.attributedBody) {
            const parsed = this.parseMessage(row);
            return parsed.text.toLowerCase().includes(searchTerm.toLowerCase());
          }

          return false;
        });

        resolve(filtered);
      });
    });
  }

  /**
   * Get messages with attributedBody in a date range
   */
  async getAttributedMessagesInRange(
    startDate: Date,
    endDate: Date,
    chatName?: string
  ): Promise<MessageRow[]> {
    return new Promise((resolve, reject) => {
      // Convert dates to Core Data format (seconds since 2001-01-01)
      const startTimestamp = Math.floor(startDate.getTime() / 1000) - 978307200;
      const endTimestamp = Math.floor(endDate.getTime() / 1000) - 978307200;

      let query = `
        SELECT 
          m.ROWID,
          m.guid,
          m.text,
          m.attributedBody,
          m.date,
          m.is_from_me,
          h.id as handle_id,
          m.cache_has_attachments
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE m.attributedBody IS NOT NULL
        AND m.date >= ?
        AND m.date <= ?
      `;

      const params: any[] = [startTimestamp * 1000000000, endTimestamp * 1000000000];

      if (chatName) {
        query += ' AND c.display_name = ?';
        params.push(chatName);
      }

      query += ' ORDER BY m.date';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as MessageRow[]);
      });
    });
  }

  /**
   * Get messages with full chat information for building complete links
   */
  async getMessagesWithChatInfo(
    chatId: number,
    limit: number = 100,
    offset: number = 0
  ): Promise<MessageWithChat[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          m.ROWID,
          m.guid,
          m.text,
          m.attributedBody,
          m.date,
          m.is_from_me,
          h.id as handle_id,
          m.cache_has_attachments,
          c.guid as chat_guid,
          c.chat_identifier,
          c.display_name as chat_display_name
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        LEFT JOIN chat c ON cmj.chat_id = c.ROWID
        WHERE cmj.chat_id = ?
        ORDER BY m.date DESC
        LIMIT ? OFFSET ?
      `;

      this.db.all(query, [chatId, limit, offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as MessageWithChat[]);
      });
    });
  }

  /**
   * Parse a message with chat context to include appropriate links
   * Provides better link fallbacks using chat information when message GUID is missing
   */
  parseMessageWithChat(message: MessageWithChat): ParsedMessage {
    const result = this.parseMessage(message);
    
    // If no message-specific link, try to build a better one with chat context
    if (!result.link && message.chat_identifier) {
      // Check if it's a group chat
      if (message.chat_identifier.startsWith('chat') && /^chat\d+$/.test(message.chat_identifier)) {
        result.link = message.chat_guid ? `messages://open?guid=${message.chat_guid}` : '';
      } else {
        result.link = `sms://${encodeURIComponent(message.chat_identifier)}`;
      }
    }

    return result;
  }

  /**
   * Close the database connection
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}