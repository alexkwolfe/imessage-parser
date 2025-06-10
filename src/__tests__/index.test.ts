import {
  AttributedStringParser,
  TypedStreamParser,
  IMessageDatabase,
  parseAttributedBody,
  ParsedMessage,
  ParserOptions,
  MessageAttributes,
  MessageRow,
  ChatRow,
} from '../index';

// Mock the parsers and database
jest.mock('../parsers/attributed-string-parser');
jest.mock('../parsers/typedstream-parser');
jest.mock('../imessage-database');

describe('index exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export AttributedStringParser', () => {
    expect(AttributedStringParser).toBeDefined();
  });

  it('should export TypedStreamParser', () => {
    expect(TypedStreamParser).toBeDefined();
  });

  it('should export IMessageDatabase', () => {
    expect(IMessageDatabase).toBeDefined();
  });

  it('should export type definitions', () => {
    // These are type exports, so we just verify they can be used
    const message: ParsedMessage = { text: 'test', link: '' };
    const options: ParserOptions = { preserveFormatting: true };
    const attributes: MessageAttributes = {};
    
    expect(message).toBeDefined();
    expect(options).toBeDefined();
    expect(attributes).toBeDefined();
  });

  describe('parseAttributedBody convenience function', () => {
    it('should create parser and parse buffer', () => {
      const mockParse = jest.fn().mockReturnValue({ text: 'parsed text', link: '' });
      (AttributedStringParser as jest.Mock).mockImplementation(() => ({
        parse: mockParse,
      }));

      const buffer = Buffer.from('test data');
      const result = parseAttributedBody(buffer);

      expect(AttributedStringParser).toHaveBeenCalledWith(undefined);
      expect(mockParse).toHaveBeenCalledWith(buffer);
      expect(result).toEqual({ text: 'parsed text', link: '' });
    });

    it('should pass options to parser', () => {
      const mockParse = jest.fn().mockReturnValue({ text: 'parsed text', link: '' });
      (AttributedStringParser as jest.Mock).mockImplementation(() => ({
        parse: mockParse,
      }));

      const buffer = Buffer.from('test data');
      const options: ParserOptions = {
        preserveFormatting: true,
        includeMetadata: true,
        cleanOutput: false,
        encoding: 'utf16le',
      };

      const result = parseAttributedBody(buffer, options);

      expect(AttributedStringParser).toHaveBeenCalledWith(options);
      expect(mockParse).toHaveBeenCalledWith(buffer);
      expect(result).toEqual({ text: 'parsed text', link: '' });
    });

    it('should return parsed message with attributes when includeMetadata is true', () => {
      const mockResult: ParsedMessage = {
        text: 'Hello World',
        link: '',
        attributes: {
          bold: [{ location: 0, length: 5 }],
          links: [{
            url: 'https://example.com',
            location: 6,
            length: 5,
          }],
        },
        rawData: Buffer.from('raw'),
      };

      const mockParse = jest.fn().mockReturnValue(mockResult);
      (AttributedStringParser as jest.Mock).mockImplementation(() => ({
        parse: mockParse,
      }));

      const buffer = Buffer.from('test data');
      const options: ParserOptions = { includeMetadata: true };

      const result = parseAttributedBody(buffer, options);

      expect(result).toEqual(mockResult);
      expect(result.attributes).toBeDefined();
      expect(result.attributes?.bold).toHaveLength(1);
      expect(result.attributes?.links).toHaveLength(1);
      expect(result.rawData).toBeDefined();
    });

    it('should handle empty buffer', () => {
      const mockParse = jest.fn().mockReturnValue({ text: '' });
      (AttributedStringParser as jest.Mock).mockImplementation(() => ({
        parse: mockParse,
      }));

      const buffer = Buffer.alloc(0);
      const result = parseAttributedBody(buffer);

      expect(mockParse).toHaveBeenCalledWith(buffer);
      expect(result.text).toBe('');
    });

    it('should handle parser errors', () => {
      const mockError = new Error('Parse error');
      const mockParse = jest.fn().mockImplementation(() => {
        throw mockError;
      });
      (AttributedStringParser as jest.Mock).mockImplementation(() => ({
        parse: mockParse,
      }));

      const buffer = Buffer.from('invalid data');

      expect(() => parseAttributedBody(buffer)).toThrow('Parse error');
    });

    it('should handle various buffer sizes', () => {
      const mockParse = jest.fn().mockImplementation((buf: Buffer) => ({
        text: `Parsed ${buf.length} bytes`,
      }));
      (AttributedStringParser as jest.Mock).mockImplementation(() => ({
        parse: mockParse,
      }));

      const sizes = [0, 10, 100, 1000, 10000];
      
      for (const size of sizes) {
        const buffer = Buffer.alloc(size);
        const result = parseAttributedBody(buffer);
        
        expect(result.text).toBe(`Parsed ${size} bytes`);
      }
    });

    it('should handle different parser option combinations', () => {
      const mockParse = jest.fn().mockReturnValue({ text: 'test' });
      (AttributedStringParser as jest.Mock).mockImplementation(() => ({
        parse: mockParse,
      }));

      const buffer = Buffer.from('test');
      const optionCombinations: ParserOptions[] = [
        {},
        { preserveFormatting: true },
        { includeMetadata: true },
        { cleanOutput: false },
        { encoding: 'utf16le' },
        { preserveFormatting: true, includeMetadata: true },
        { cleanOutput: false, encoding: 'ascii' },
        {
          preserveFormatting: false,
          includeMetadata: true,
          cleanOutput: true,
          encoding: 'utf8',
        },
      ];

      for (const options of optionCombinations) {
        jest.clearAllMocks();
        parseAttributedBody(buffer, options);
        expect(AttributedStringParser).toHaveBeenCalledWith(options);
      }
    });
  });

  describe('re-exported types', () => {
    it('should allow using MessageRow type', () => {
      const messageRow: MessageRow = {
        ROWID: 1,
        guid: 'test-guid',
        text: 'Hello',
        attributedBody: null,
        date: 123456789,
        is_from_me: 1,
        handle_id: 'handle1',
        cache_has_attachments: 0,
      };

      expect(messageRow.ROWID).toBe(1);
      expect(messageRow.text).toBe('Hello');
    });

    it('should allow using ChatRow type', () => {
      const chatRow: ChatRow = {
        ROWID: 1,
        guid: 'chat-guid',
        chat_identifier: 'chat-id',
        display_name: 'Test Chat',
      };

      expect(chatRow.ROWID).toBe(1);
      expect(chatRow.display_name).toBe('Test Chat');
    });

    it('should allow using ParsedMessage with all optional fields', () => {
      const fullMessage: ParsedMessage = {
        text: 'Hello World',
        link: 'messages://open?guid=test-message-guid',
        attributes: {
          bold: [{ location: 0, length: 5 }],
          italic: [{ location: 6, length: 5 }],
          underline: [{ location: 0, length: 11 }],
          strikethrough: [{ location: 0, length: 11 }],
          links: [{
            url: 'https://example.com',
            location: 0,
            length: 11,
          }],
          mentions: [{
            handle: '+15551234567',
            location: 0,
            length: 11,
          }],
          dataDetectors: [{
            type: 'date',
            value: 'tomorrow',
            location: 0,
            length: 8,
          }],
          fonts: [{
            family: 'Helvetica',
            size: 17,
            weight: 'bold',
            style: 'italic',
            location: 0,
            length: 11,
          }],
          colors: [{
            color: 'red',
            hex: '#ff0000',
            rgba: [255, 0, 0, 255],
            location: 0,
            length: 11,
          }],
          attachments: [{
            guid: 'attachment-guid',
            type: 'image',
            filename: 'image.png',
            mimeType: 'image/png',
            location: 0,
            length: 1,
          }],
        },
        rawData: Buffer.from('raw data'),
      };

      expect(fullMessage.text).toBe('Hello World');
      expect(fullMessage.attributes?.bold).toHaveLength(1);
      expect(fullMessage.attributes?.links?.[0].url).toBe('https://example.com');
    });
  });
});