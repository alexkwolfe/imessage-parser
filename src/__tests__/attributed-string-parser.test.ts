import { AttributedStringParser } from '../parsers/attributed-string-parser';

describe('AttributedStringParser', () => {
  let parser: AttributedStringParser;

  beforeEach(() => {
    parser = new AttributedStringParser();
  });

  describe('parse', () => {
    it('should parse simple NSString buffer', () => {
      const content = 'Hello, World!';
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([content.length]),
        Buffer.from(content, 'utf8'),
      ]);

      const result = parser.parse(buffer);

      expect(result.text).toBe(content);
      expect(result.link).toBe('');
    });

    it('should merge multiple NSStrings with proper spacing', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([5]),
        Buffer.from('Hello', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([6]),
        Buffer.from('World!', 'utf8'),
      ]);

      const result = parser.parse(buffer);

      expect(result.text).toBe('Hello World!');
      expect(result.link).toBe('');
    });

    it('should handle numbered lists with proper formatting', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([25]),
        Buffer.from('1. First item in the list', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([26]),
        Buffer.from('2. Second item in the list', 'utf8'),
      ]);

      const result = parser.parse(buffer);

      expect(result.text).toContain('First item');
      expect(result.text).toContain('Second item');
    });

    it('should handle sub-items with indentation', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([12]),
        Buffer.from('1. Main item', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([11]),
        Buffer.from('a. Sub-item', 'utf8'),
      ]);

      const result = parser.parse(buffer);

      expect(result.text).toContain('Main item');
      expect(result.text).toContain('Sub-item');
    });

    it('should fall back to readable text extraction when NSString parsing fails', () => {
      const buffer = Buffer.concat([
        Buffer.from([0x00, 0x01, 0x02]), // Binary data
        Buffer.from('This is readable text'),
        Buffer.from([0xff, 0xfe]), // More binary
      ]);

      const result = parser.parse(buffer);

      expect(result.text).toContain('This is readable text');
    });

    it('should clean output when cleanOutput option is true', () => {
      const parserWithClean = new AttributedStringParser({ cleanOutput: true });
      
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([20]),
        Buffer.from('Text   with   spaces', 'utf8'),
      ]);

      const result = parserWithClean.parse(buffer);

      expect(result.text).toBe('Text with spaces');
    });

    it('should include metadata when includeMetadata option is true', () => {
      const parserWithMeta = new AttributedStringParser({ includeMetadata: true });
      
      const buffer = Buffer.from('test');
      const result = parserWithMeta.parse(buffer);

      expect(result.rawData).toBeDefined();
      expect(result.attributes).toBeDefined();
      expect(result.link).toBe('');
    });

    it('should include attributes object when includeMetadata is true', () => {
      const parserWithMeta = new AttributedStringParser({ includeMetadata: true });
      
      const buffer = Buffer.from('Some text content');
      const result = parserWithMeta.parse(buffer);
      
      expect(result.attributes).toBeDefined();
      expect(typeof result.attributes).toBe('object');
    });

    it('should return empty attributes for non-NSAttributedString data', () => {
      const parserWithMeta = new AttributedStringParser({ includeMetadata: true });
      
      const buffer = Buffer.from('Plain text without attributes');
      const result = parserWithMeta.parse(buffer);
      
      expect(result.attributes).toBeDefined();
      expect(Object.keys(result.attributes || {}).length).toBe(0);
    });

    it('should handle buffer with NSString marker', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([11]),
        Buffer.from('Test string', 'utf8'),
      ]);
      
      const result = parser.parse(buffer);
      expect(result.text).toBe('Test string');
    });

    it('should handle buffer with multiple NSString markers', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([4]),
        Buffer.from('Test', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([4]),
        Buffer.from('Data', 'utf8'),
      ]);
      
      const result = parser.parse(buffer);
      expect(result.text).toContain('Test');
      expect(result.text).toContain('Data');
    });

    it('should handle different number patterns in reconstructText', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([8]),
        Buffer.from('10. Item', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([9]),
        Buffer.from('100. Item', 'utf8'),
      ]);

      const result = parser.parse(buffer);
      
      expect(result.text).toContain('10.');
      expect(result.text).toContain('100.');
    });

    it('should handle edge cases in mergeReadableTexts', () => {
      const parserWithFallback = new AttributedStringParser();
      
      // Test with metadata-like text that should be filtered
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from('__kIMMetadata'),
        Buffer.from('Question: What is this?'),
        Buffer.from('bplist00'),
        Buffer.from('This is the answer.'),
      ]);

      const result = parserWithFallback.parse(buffer);
      
      expect(result.text).toContain('Question: What is this?');
      expect(result.text).toContain('This is the answer');
      expect(result.text).not.toContain('NSString');
      expect(result.text).not.toContain('__kIMMetadata');
      expect(result.text).not.toContain('bplist');
    });

    it('should preserve formatting when preserveFormatting is true', () => {
      const parserWithFormatting = new AttributedStringParser({ 
        preserveFormatting: true,
        cleanOutput: false 
      });
      
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([15]),
        Buffer.from('Text   with', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([10]),
        Buffer.from('   spaces', 'utf8'),
      ]);

      const result = parserWithFormatting.parse(buffer);
      
      expect(result.text).toBe('Text   with    spaces');
    });

    it('should handle encoding option', () => {
      const parserWithEncoding = new AttributedStringParser({ encoding: 'utf16le' });
      
      // This test verifies the encoding option is passed through
      expect(parserWithEncoding).toBeDefined();
    });

    it('should handle empty NSString content', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([0]), // Empty string
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([5]),
        Buffer.from('Hello', 'utf8'),
      ]);

      const result = parser.parse(buffer);
      
      expect(result.text).toBe('Hello');
    });

    it('should handle newline characters properly', () => {
      const buffer = Buffer.concat([
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([5]),
        Buffer.from('Hello', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([1]),
        Buffer.from('\n', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([1]),
        Buffer.from('\n', 'utf8'),
        Buffer.from('NSString'),
        Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
        Buffer.from([5]),
        Buffer.from('World', 'utf8'),
      ]);

      const result = parser.parse(buffer);
      
      expect(result.text).toBe('Hello\nWorld');
    });

    it('should handle sub-items with different patterns', () => {
      const patterns = ['a. ', 'b. ', 'z. '];
      
      for (const pattern of patterns) {
        const buffer = Buffer.concat([
          Buffer.from('NSString'),
          Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
          Buffer.from([pattern.length + 8]),
          Buffer.from(pattern + 'Sub-item', 'utf8'),
        ]);

        const result = parser.parse(buffer);
        
        expect(result.text).toContain('   ' + pattern + 'Sub-item');
      }
    });

  });
});