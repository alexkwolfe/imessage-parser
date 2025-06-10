import { TypedStreamParser } from '../parsers/typedstream-parser';

describe('TypedStreamParser', () => {
  describe('parseAllNSStrings', () => {
    it('should parse simple NSString', () => {
      // Create a mock buffer with NSString format
      const content = 'Hello, World!';
      const length = Buffer.from([content.length]);
      const preamble = Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]);
      
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        preamble,
        length,
        Buffer.from(content, 'utf8'),
      ]);

      const parser = new TypedStreamParser(buffer);
      const strings = parser.parseAllNSStrings();

      expect(strings).toHaveLength(1);
      expect(strings[0].content).toBe(content);
      expect(strings[0].className).toBe('NSString');
    });

    it('should parse multiple NSStrings', () => {
      const content1 = 'First string';
      const content2 = 'Second string';
      
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([content1.length]),
        Buffer.from(content1, 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([content2.length]),
        Buffer.from(content2, 'utf8'),
      ]);

      const parser = new TypedStreamParser(buffer);
      const strings = parser.parseAllNSStrings();

      expect(strings).toHaveLength(2);
      expect(strings[0].content).toBe(content1);
      expect(strings[1].content).toBe(content2);
    });

    it('should handle 3-byte length encoding', () => {
      const content = 'A'.repeat(300); // Long string
      const lengthBytes = Buffer.from([0x81, 0x2c, 0x01]); // 300 in little endian
      
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        lengthBytes,
        Buffer.from(content, 'utf8'),
      ]);

      const parser = new TypedStreamParser(buffer);
      const strings = parser.parseAllNSStrings();

      expect(strings).toHaveLength(1);
      expect(strings[0].content).toBe(content);
      expect(strings[0].content.length).toBe(300);
    });
  });

  describe('extractReadableText', () => {
    it('should extract readable text from mixed binary data', () => {
      const buffer = Buffer.concat([
        Buffer.from([0x00, 0x01, 0x02]), // Binary data
        Buffer.from('Hello World'),
        Buffer.from([0xff, 0xfe, 0xfd]), // More binary
        Buffer.from('Another text'),
        Buffer.from([0x00]), // Null terminator
      ]);

      const parser = new TypedStreamParser(buffer);
      const texts = parser.extractReadableText();

      expect(texts).toContain('Hello World');
      expect(texts).toContain('Another text');
    });

    it('should handle UTF-8 characters', () => {
      const buffer = Buffer.concat([
        Buffer.from('Hello '),
        Buffer.from('世界', 'utf8'), // UTF-8 Chinese characters
        Buffer.from(' Test'),
      ]);

      const parser = new TypedStreamParser(buffer);
      const texts = parser.extractReadableText();

      expect(texts.some(t => t.includes('Hello'))).toBe(true);
      expect(texts.some(t => t.includes('Test'))).toBe(true);
    });

    it('should filter out metadata strings', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSMutableAttributedString'),
        Buffer.from([0x00]),
        Buffer.from('Actual content here'),
        Buffer.from([0x00]),
        Buffer.from('NSDictionary'),
      ]);

      const parser = new TypedStreamParser(buffer);
      const texts = parser.extractReadableText();

      expect(texts).toContain('Actual content here');
      expect(texts).not.toContain('NSMutableAttributedString');
      expect(texts).not.toContain('NSDictionary');
    });
  });
});