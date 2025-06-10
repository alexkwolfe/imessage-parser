import { NSDictionaryParser } from '../parsers/nsdictionary-parser';

describe('NSDictionaryParser', () => {
  describe('parse', () => {
    it('should return null for buffer without NSDictionary marker', () => {
      const buffer = Buffer.from('Some random data without dictionary');
      const parser = new NSDictionaryParser(buffer);
      
      expect(parser.parse()).toBeNull();
    });

    it('should parse empty NSDictionary', () => {
      const buffer = Buffer.from('NSDictionary' + '\x00'.repeat(20));
      const parser = new NSDictionaryParser(buffer);
      
      const result = parser.parse();
      expect(result).toBeNull(); // No attributes found
    });

    it('should parse font attributes', () => {
      // Create buffer with NSFont and Helvetica
      const data = [
        'NSDictionary',
        '\x00'.repeat(10),
        'NSFont',
        '\x00'.repeat(5),
        'Helvetica',
        '\x00\x00\x00',
        Buffer.from([17, 0, 0, 0]), // Font size 17
      ].join('');
      
      const buffer = Buffer.from(data);
      const parser = new NSDictionaryParser(buffer);
      
      const result = parser.parse();
      expect(result).not.toBeNull();
      expect(result?.get('NSFont')).toEqual({
        family: 'Helvetica',
        size: 17
      });
    });

    it('should parse bold font attributes', () => {
      const data = [
        'NSDictionary',
        '\x00'.repeat(10),
        'Bold',
        '\x00'.repeat(5),
      ].join('');
      
      const buffer = Buffer.from(data);
      const parser = new NSDictionaryParser(buffer);
      
      const result = parser.parse();
      expect(result).not.toBeNull();
      expect(result?.get('bold')).toBe(true);
    });

    it('should parse italic font attributes', () => {
      const data = [
        'NSDictionary',
        '\x00'.repeat(10),
        'Italic',
        '\x00'.repeat(5),
      ].join('');
      
      const buffer = Buffer.from(data);
      const parser = new NSDictionaryParser(buffer);
      
      const result = parser.parse();
      expect(result).not.toBeNull();
      expect(result?.get('italic')).toBe(true);
    });

    it('should parse color attributes', () => {
      const colorData = Buffer.concat([
        Buffer.from('NSDictionary' + '\x00'.repeat(10)),
        Buffer.from('NSColor' + '\x00'.repeat(5)),
        Buffer.from([255, 0, 0, 255]) // Red color
      ]);
      
      const parser = new NSDictionaryParser(colorData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('NSColor')).toEqual({
        color: 'red',
        rgba: [255, 0, 0, 255]
      });
    });

    it('should parse link attributes', () => {
      const linkData = Buffer.from([
        'NSDictionary',
        '\x00'.repeat(10),
        'NSLink',
        '\x00'.repeat(5),
        'https://example.com/path?query=value',
        '\x00\x00\x00',
      ].join(''));
      
      const parser = new NSDictionaryParser(linkData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('NSLink')).toBe('https://example.com/path?query=value');
    });

    it('should parse mention with phone number', () => {
      const mentionData = Buffer.concat([
        Buffer.from('NSDictionary'),
        Buffer.from('\x00'.repeat(10)),
        Buffer.from('__kIMMentionedHandleAttributeName'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('+15551234567'),
        Buffer.from('\x00'.repeat(100)), // Add more padding for readString
      ]);
      
      const parser = new NSDictionaryParser(mentionData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('__kIMMentionedHandleAttributeName')).toBe('+15551234567');
    });

    it('should parse mention with email', () => {
      const mentionData = Buffer.concat([
        Buffer.from('NSDictionary'),
        Buffer.from('\x00'.repeat(10)),
        Buffer.from('__kIMMentionedHandleAttributeName'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('user@example.com'),
        Buffer.from('\x00'.repeat(100)), // Add more padding
      ]);
      
      const parser = new NSDictionaryParser(mentionData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('__kIMMentionedHandleAttributeName')).toBe('user@example.com');
    });

    it('should parse data detected date', () => {
      const dataDetectedBuffer = Buffer.concat([
        Buffer.from('NSDictionary'),
        Buffer.from('\x00'.repeat(10)),
        Buffer.from('__kIMDataDetectedAttributeName'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('Date'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('tomorrow'),
        Buffer.from('\x00'.repeat(100)), // Add more padding
      ]);
      
      const parser = new NSDictionaryParser(dataDetectedBuffer);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      const dataDetected = result?.get('__kIMDataDetectedAttributeName');
      expect(dataDetected).toEqual({
        type: 'date',
        marker: 'Date',
        value: 'tomorrow'
      });
    });

    it('should parse data detected time', () => {
      const dataDetectedBuffer = Buffer.concat([
        Buffer.from('NSDictionary'),
        Buffer.from('\x00'.repeat(10)),
        Buffer.from('__kIMDataDetectedAttributeName'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('Time'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('3:30'),
        Buffer.from('\x00'.repeat(100)), // Add more padding
      ]);
      
      const parser = new NSDictionaryParser(dataDetectedBuffer);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      const dataDetected = result?.get('__kIMDataDetectedAttributeName');
      expect(dataDetected).toEqual({
        type: 'time',
        marker: 'Time',
        value: '3:30'
      });
    });

    it('should parse range attributes', () => {
      const rangeData = Buffer.concat([
        Buffer.from('NSDictionary' + '\x00'.repeat(10)),
        Buffer.from('NS.rangeval' + '\x00'.repeat(10)),
        Buffer.from(new Uint32Array([5, 10]).buffer), // location=5, length=10
      ]);
      
      const parser = new NSDictionaryParser(rangeData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('ranges')).toEqual([
        { location: 5, length: 10 }
      ]);
    });

    it('should parse multiple attributes', () => {
      const multiData = Buffer.from([
        'NSDictionary',
        '\x00'.repeat(10),
        'NSFont',
        '\x00'.repeat(5),
        'Helvetica',
        '\x00'.repeat(10),
        'Bold',
        '\x00'.repeat(10),
        'NSUnderline',
        '\x00'.repeat(5),
        'true',
      ].join(''));
      
      const parser = new NSDictionaryParser(multiData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.size).toBeGreaterThan(1);
      expect(result?.has('NSFont')).toBe(true);
      expect(result?.has('bold')).toBe(true);
      expect(result?.has('NSUnderline')).toBe(true);
    });

    it('should handle multiple ranges', () => {
      const rangeData = Buffer.concat([
        Buffer.from('NSDictionary' + '\x00'.repeat(10)),
        Buffer.from('NS.rangeval' + '\x00'.repeat(10)),
        Buffer.from(new Uint32Array([0, 5]).buffer),
        Buffer.from('NS.rangeval' + '\x00'.repeat(10)),
        Buffer.from(new Uint32Array([10, 8]).buffer),
      ]);
      
      const parser = new NSDictionaryParser(rangeData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('ranges')).toEqual([
        { location: 0, length: 5 },
        { location: 10, length: 8 }
      ]);
    });

    it('should skip invalid ranges', () => {
      const rangeData = Buffer.concat([
        Buffer.from('NSDictionary' + '\x00'.repeat(10)),
        Buffer.from('NS.rangeval' + '\x00'.repeat(10)),
        Buffer.from(new Uint32Array([50000, 2000]).buffer), // Invalid: too large
        Buffer.from('NS.rangeval' + '\x00'.repeat(10)),
        Buffer.from(new Uint32Array([5, 0]).buffer), // Invalid: zero length
        Buffer.from('NS.rangeval' + '\x00'.repeat(10)),
        Buffer.from(new Uint32Array([10, 20]).buffer), // Valid
      ]);
      
      const parser = new NSDictionaryParser(rangeData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('ranges')).toEqual([
        { location: 10, length: 20 }
      ]);
    });

    it('should parse flight information data detector', () => {
      const dataDetectedBuffer = Buffer.from([
        'NSDictionary',
        '\x00'.repeat(10),
        '__kIMDataDetectedAttributeName',
        '\x00'.repeat(5),
        'FlightInformation',
        '\x00'.repeat(5),
      ].join(''));
      
      const parser = new NSDictionaryParser(dataDetectedBuffer);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      const dataDetected = result?.get('__kIMDataDetectedAttributeName');
      expect(dataDetected).toEqual({
        type: 'flight',
        marker: 'FlightInformation'
      });
    });

    it('should parse measurement data detector', () => {
      const dataDetectedBuffer = Buffer.concat([
        Buffer.from('NSDictionary'),
        Buffer.from('\x00'.repeat(10)),
        Buffer.from('__kIMDataDetectedAttributeName'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('PhysicalAmount'),
        Buffer.from('\x00'.repeat(100)), // Add more padding
      ]);
      
      const parser = new NSDictionaryParser(dataDetectedBuffer);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      const dataDetected = result?.get('__kIMDataDetectedAttributeName');
      expect(dataDetected).toEqual({
        type: 'measurement',
        marker: 'PhysicalAmount'
      });
    });

    it('should parse all color types', () => {
      const colors = [
        { buffer: [0, 0, 0, 255], name: 'black' },
        { buffer: [255, 255, 255, 255], name: 'white' },
        { buffer: [0, 255, 0, 255], name: 'green' },
        { buffer: [0, 0, 255, 255], name: 'blue' },
      ];

      for (const { buffer, name } of colors) {
        const colorData = Buffer.concat([
          Buffer.from('NSDictionary' + '\x00'.repeat(10)),
          Buffer.from('NSColor' + '\x00'.repeat(5)),
          Buffer.from(buffer)
        ]);
        
        const parser = new NSDictionaryParser(colorData);
        const result = parser.parse();
        
        expect(result?.get('NSColor')).toEqual({
          color: name,
          rgba: buffer
        });
      }
    });

    it('should handle generic attribute values', () => {
      const genericData = Buffer.concat([
        Buffer.from('NSDictionary'),
        Buffer.from('\x00'.repeat(10)),
        Buffer.from('NSStrikethrough'),
        Buffer.from('\x00'.repeat(5)),
        Buffer.from('some value here'),
        Buffer.from('\x00'.repeat(100)), // Add more padding
      ]);
      
      const parser = new NSDictionaryParser(genericData);
      const result = parser.parse();
      
      expect(result).not.toBeNull();
      expect(result?.get('NSStrikethrough')).toBe('some value here');
    });

    it('should handle buffer with offset', () => {
      const prefix = Buffer.from('Some prefix data');
      const dictData = Buffer.from([
        'NSDictionary',
        '\x00'.repeat(10),
        'NSFont',
        '\x00'.repeat(5),
        'Helvetica',
      ].join(''));
      
      const fullBuffer = Buffer.concat([prefix, dictData]);
      const parser = new NSDictionaryParser(fullBuffer, prefix.length);
      
      const result = parser.parse();
      expect(result).not.toBeNull();
      expect(result?.has('NSFont')).toBe(true);
    });

    it('should parse various font styles', () => {
      const fontStyles = ['Semibold', 'Heavy', '-Bold', 'Oblique', '-Italic'];
      
      for (const style of fontStyles) {
        const data = Buffer.from([
          'NSDictionary',
          '\x00'.repeat(10),
          style,
          '\x00'.repeat(5),
        ].join(''));
        
        const parser = new NSDictionaryParser(data);
        const result = parser.parse();
        
        expect(result).not.toBeNull();
        if (style.includes('bold') || style === 'Semibold' || style === 'Heavy') {
          expect(result?.get('bold')).toBe(true);
        } else {
          expect(result?.get('italic')).toBe(true);
        }
      }
    });

    it('should extract date patterns from text', () => {
      const datePatterns = [
        { text: 'meeting at 2:30', expected: '2:30' },
        { text: 'on 12/25/2023', expected: '12/25/2023' },
        { text: 'see you today!', expected: 'today' },
        { text: 'due yesterday', expected: 'yesterday' },
      ];

      for (const { text, expected } of datePatterns) {
        const dataDetectedBuffer = Buffer.concat([
          Buffer.from('NSDictionary'),
          Buffer.from('\x00'.repeat(10)),
          Buffer.from('__kIMDataDetectedAttributeName'),
          Buffer.from('\x00'.repeat(5)),
          Buffer.from('Date'),
          Buffer.from('\x00'.repeat(5)),
          Buffer.from(text),
          Buffer.from('\x00'.repeat(100)), // Add more padding
        ]);
        
        const parser = new NSDictionaryParser(dataDetectedBuffer);
        const result = parser.parse();
        
        const dataDetected = result?.get('__kIMDataDetectedAttributeName');
        expect(dataDetected?.value).toBe(expected);
      }
    });
  });
});