import { BufferReader } from '../utils/buffer-reader';
import { TypedStreamParser } from './typedstream-parser';
import { NSDictionaryParser } from './nsdictionary-parser';
import { 
  ParsedMessage, 
  MessageAttributes, 
  Range, 
  LinkAttribute,
  MentionAttribute,
  DataDetectorAttribute,
  FontAttribute,
  ColorAttribute,
  ParserOptions 
} from '../types';

/**
 * Parser for NSAttributedString format used in iMessage attributedBody
 */
export class AttributedStringParser {
  private options: ParserOptions;

  constructor(options: ParserOptions = {}) {
    this.options = {
      preserveFormatting: true,
      includeMetadata: false,
      cleanOutput: true,
      encoding: 'utf8',
      ...options,
    };
  }

  /**
   * Parse an attributedBody buffer into structured message data
   */
  parse(buffer: Buffer): ParsedMessage {
    // First try typedstream parsing
    const typedStreamParser = new TypedStreamParser(buffer);
    const nsStrings = typedStreamParser.parseAllNSStrings();

    if (nsStrings.length > 0) {
      // Successfully parsed NSString objects
      const text = this.reconstructText(nsStrings);
      return {
        text,
        link: '', // Parser doesn't have message context for links
        attributes: this.options.includeMetadata ? this.extractAttributes(buffer) : undefined,
        rawData: this.options.includeMetadata ? buffer : undefined,
      };
    }

    // Fallback to readable text extraction
    const readableTexts = typedStreamParser.extractReadableText();
    const text = this.mergeReadableTexts(readableTexts);

    return {
      text,
      link: '', // Parser doesn't have message context for links
      attributes: this.options.includeMetadata ? {} : undefined,
      rawData: this.options.includeMetadata ? buffer : undefined,
    };
  }

  /**
   * Reconstruct formatted text from NSString objects
   */
  private reconstructText(nsStrings: Array<{ content: string }>): string {
    const parts: string[] = [];
    let lastWasNewline = false;

    for (const nsString of nsStrings) {
      const content = nsString.content;
      
      // Skip empty strings
      if (!content || content.length === 0) continue;

      // Handle special characters
      if (content === '\n' || content === '\r\n') {
        if (!lastWasNewline) {
          parts.push('\n');
          lastWasNewline = true;
        }
        continue;
      }

      // Check for numbered items (e.g., "1.", "2.", etc.)
      if (/^\d+\.\s/.test(content)) {
        if (parts.length > 0 && !lastWasNewline) {
          parts.push('\n\n');
        }
        parts.push(content);
        lastWasNewline = false;
      }
      // Check for sub-items (e.g., "a.", "b.", etc.)
      else if (/^[a-z]\.\s/.test(content)) {
        if (!lastWasNewline) {
          parts.push('\n   ');
        } else {
          parts.push('   ');
        }
        parts.push(content);
        lastWasNewline = false;
      }
      // Regular content
      else {
        if (parts.length > 0 && !lastWasNewline && !content.startsWith(' ')) {
          parts.push(' ');
        }
        parts.push(content);
        lastWasNewline = false;
      }
    }

    let result = parts.join('');

    if (this.options.cleanOutput) {
      // Clean up formatting
      result = result
        .replace(/\s*\n\s*\n\s*/g, '\n\n') // Normalize paragraph breaks
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/\n\s+/g, '\n') // Remove leading spaces after newlines
        .replace(/\s+\n/g, '\n') // Remove trailing spaces before newlines
        .trim();
    }

    return result;
  }

  /**
   * Merge readable text segments intelligently
   */
  private mergeReadableTexts(texts: string[]): string {
    if (texts.length === 0) return '';

    const merged: string[] = [];
    let currentParagraph: string[] = [];

    for (const text of texts) {
      // Skip metadata and very short segments
      if (text.length < 3 || this.isMetadata(text)) continue;

      // Check if this looks like a new paragraph or list item
      if (this.isNewParagraph(text)) {
        if (currentParagraph.length > 0) {
          merged.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
      }

      currentParagraph.push(text);
    }

    // Don't forget the last paragraph
    if (currentParagraph.length > 0) {
      merged.push(currentParagraph.join(' '));
    }

    return merged.join('\n\n').trim();
  }

  private isMetadata(text: string): boolean {
    const metadataPatterns = [
      /^NS[A-Z]/,
      /^__kIM/,
      /^[A-Z]+$/,
      /^[a-z]+$/,
      /^\{.*\}$/,
      /^\[.*\]$/,
      /^bplist/,
      /^X\$version/,
    ];

    return metadataPatterns.some(pattern => pattern.test(text));
  }

  private isNewParagraph(text: string): boolean {
    // Check for numbered lists
    if (/^\d+\./.test(text)) return true;
    
    // Check for lettered sub-items
    if (/^[a-z]\./.test(text)) return true;
    
    // Check for question indicators
    if (text.toLowerCase().includes('question')) return true;
    
    // Check for sentence endings followed by capitals
    if (/[.!?]\s*$/.test(text)) return true;

    return false;
  }

  /**
   * Extract message attributes (formatting, links, etc.)
   */
  private extractAttributes(buffer: Buffer): MessageAttributes {
    const attributes: MessageAttributes = {};
    const dictParser = new NSDictionaryParser(buffer);
    const dictData = dictParser.parse();

    if (!dictData) return attributes;

    // Extract formatting ranges
    if (dictData.has('bold') && dictData.get('bold')) {
      attributes.bold = this.extractFormattingRanges(buffer, 'Bold');
    }

    if (dictData.has('italic') && dictData.get('italic')) {
      attributes.italic = this.extractFormattingRanges(buffer, 'Italic');
    }

    // Extract links
    const links = this.extractLinks(buffer);
    if (links.length > 0) {
      attributes.links = links;
    }

    // Extract mentions
    const mentions = this.extractMentions(buffer);
    if (mentions.length > 0) {
      attributes.mentions = mentions;
    }

    // Extract data detectors (dates, times, etc.)
    const dataDetectors = this.extractDataDetectors(buffer);
    if (dataDetectors.length > 0) {
      attributes.dataDetectors = dataDetectors;
    }

    // Extract font information
    const fonts = this.extractFontAttributes(buffer);
    if (fonts.length > 0) {
      attributes.fonts = fonts;
    }

    // Extract color information
    const colors = this.extractColorAttributes(buffer);
    if (colors.length > 0) {
      attributes.colors = colors;
    }

    return attributes;
  }

  /**
   * Extract formatting ranges for a specific style
   */
  private extractFormattingRanges(buffer: Buffer, style: string): Range[] {
    const ranges: Range[] = [];
    const reader = new BufferReader(buffer);
    
    let pos = reader.findPattern(style);
    while (pos !== -1) {
      reader.seek(pos);
      
      // Look for associated range information
      const rangePos = reader.findPattern('NS.rangeval');
      if (rangePos !== -1 && rangePos - pos < 200) {
        reader.seek(rangePos + 11);
        
        // Try to read range values
        if (reader.remaining >= 8) {
          reader.skip(10); // Skip some bytes
          const location = reader.readUInt32LE();
          const length = reader.readUInt32LE();
          
          if (location < 10000 && length < 1000 && length > 0) {
            ranges.push({ location, length });
          }
        }
      }
      
      pos = reader.findPattern(style);
    }
    
    return ranges;
  }

  /**
   * Extract link attributes
   */
  private extractLinks(buffer: Buffer): LinkAttribute[] {
    const links: LinkAttribute[] = [];
    const reader = new BufferReader(buffer);
    
    // Look for URL patterns
    const urlPatterns = ['http://', 'https://', 'mailto:', 'tel:'];
    
    for (const pattern of urlPatterns) {
      reader.seek(0);
      let pos = reader.findPattern(pattern);
      
      while (pos !== -1) {
        reader.seek(pos);
        
        // Extract URL
        let url = '';
        while (reader.remaining > 0) {
          const byte = reader.peekByte();
          if (byte === null) break;
          
          const char = String.fromCharCode(byte);
          if (/[a-zA-Z0-9:\/\.\-_\?=&%@+]/.test(char)) {
            url += char;
            reader.skip(1);
          } else {
            break;
          }
        }
        
        if (url.length > pattern.length) {
          // Try to find range information
          const range = this.findNearestRange(buffer, pos);
          links.push({
            url,
            location: range?.location || 0,
            length: range?.length || url.length,
          });
        }
        
        pos = reader.findPattern(pattern);
      }
    }
    
    return links;
  }

  /**
   * Extract mention attributes
   */
  private extractMentions(buffer: Buffer): MentionAttribute[] {
    const mentions: MentionAttribute[] = [];
    const reader = new BufferReader(buffer);
    
    // Look for mention markers
    const mentionMarker = '__kIMMentionedHandleAttributeName';
    let pos = reader.findPattern(mentionMarker);
    
    while (pos !== -1) {
      reader.seek(pos + mentionMarker.length);
      
      // Extract handle (phone number or email)
      const text = reader.readString(100, 'utf8');
      
      const phoneMatch = text.match(/\+?1?\d{10,}/);
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      
      const handle = phoneMatch?.[0] || emailMatch?.[0];
      
      if (handle) {
        const range = this.findNearestRange(buffer, pos);
        mentions.push({
          handle,
          location: range?.location || 0,
          length: range?.length || handle.length,
        });
      }
      
      pos = reader.findPattern(mentionMarker);
    }
    
    return mentions;
  }

  /**
   * Extract data detector attributes (dates, times, addresses, etc.)
   */
  private extractDataDetectors(buffer: Buffer): DataDetectorAttribute[] {
    const detectors: DataDetectorAttribute[] = [];
    const reader = new BufferReader(buffer);
    
    // Look for DDScannerResult markers
    const scannerMarker = 'DDScannerResult';
    let pos = reader.findPattern(scannerMarker);
    
    while (pos !== -1) {
      reader.seek(pos);
      
      // Try to determine the type of data detected
      const nearbyText = reader.readString(200, 'utf8');
      
      let type: DataDetectorAttribute['type'] = 'date';
      let value = '';
      
      if (nearbyText.includes('tomorrow') || nearbyText.includes('today')) {
        type = 'date';
        value = nearbyText.match(/(tomorrow|today|yesterday)/i)?.[0] || '';
      } else if (nearbyText.match(/\d{1,2}:\d{2}/)) {
        type = 'time';
        value = nearbyText.match(/\d{1,2}:\d{2}/)?.[0] || '';
      } else if (nearbyText.match(/\d+ ?kg|lbs?/i)) {
        type = 'measurement';
        value = nearbyText.match(/\d+ ?(?:kg|lbs?)/i)?.[0] || '';
      }
      
      if (value) {
        const range = this.findNearestRange(buffer, pos);
        detectors.push({
          type,
          value,
          location: range?.location || 0,
          length: range?.length || value.length,
        });
      }
      
      reader.seek(pos + scannerMarker.length);
      pos = reader.findPattern(scannerMarker);
    }
    
    return detectors;
  }

  /**
   * Extract font attributes
   */
  private extractFontAttributes(buffer: Buffer): FontAttribute[] {
    const fonts: FontAttribute[] = [];
    const reader = new BufferReader(buffer);
    
    // Look for font markers
    const fontMarkers = ['NSFont', 'Helvetica', 'Arial', 'Times'];
    
    for (const marker of fontMarkers) {
      reader.seek(0);
      let pos = reader.findPattern(marker);
      
      while (pos !== -1) {
        reader.seek(pos);
        
        const font: FontAttribute = {
          location: 0,
          length: 0,
        };
        
        // Extract font family
        if (marker !== 'NSFont') {
          font.family = marker;
        }
        
        // Look for style indicators nearby
        const nearbyText = reader.readString(100, 'utf8');
        
        if (nearbyText.includes('Bold') || nearbyText.includes('Semibold')) {
          font.weight = nearbyText.includes('Semibold') ? 'semibold' : 'bold';
        }
        
        if (nearbyText.includes('Italic') || nearbyText.includes('Oblique')) {
          font.style = 'italic';
        }
        
        // Try to find font size
        const sizeMatch = nearbyText.match(/(\d+)(?:pt|px)?/);
        if (sizeMatch) {
          font.size = parseInt(sizeMatch[1]);
        }
        
        const range = this.findNearestRange(buffer, pos);
        if (range) {
          font.location = range.location;
          font.length = range.length;
        }
        
        if (font.family || font.size || font.weight || font.style) {
          fonts.push(font);
        }
        
        reader.seek(pos + marker.length);
        pos = reader.findPattern(marker);
      }
    }
    
    return fonts;
  }

  /**
   * Extract color attributes
   */
  private extractColorAttributes(buffer: Buffer): ColorAttribute[] {
    const colors: ColorAttribute[] = [];
    const reader = new BufferReader(buffer);
    
    // Look for NSColor markers
    let pos = reader.findPattern('NSColor');
    
    while (pos !== -1) {
      reader.seek(pos + 7); // Skip 'NSColor'
      
      // Try to read color values
      if (reader.remaining >= 4) {
        const rgba = [
          reader.readUInt8(),
          reader.readUInt8(),
          reader.readUInt8(),
          reader.readUInt8(),
        ];
        
        // Convert to hex
        const hex = '#' + rgba.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
        
        // Determine color name
        let colorName = 'custom';
        if (rgba[0] === 0 && rgba[1] === 0 && rgba[2] === 0) colorName = 'black';
        else if (rgba[0] === 255 && rgba[1] === 255 && rgba[2] === 255) colorName = 'white';
        else if (rgba[0] === 255 && rgba[1] === 0 && rgba[2] === 0) colorName = 'red';
        else if (rgba[0] === 0 && rgba[1] === 255 && rgba[2] === 0) colorName = 'green';
        else if (rgba[0] === 0 && rgba[1] === 0 && rgba[2] === 255) colorName = 'blue';
        
        const range = this.findNearestRange(buffer, pos);
        colors.push({
          color: colorName,
          hex,
          rgba,
          location: range?.location || 0,
          length: range?.length || 0,
        });
      }
      
      pos = reader.findPattern('NSColor');
    }
    
    return colors;
  }

  /**
   * Find the nearest range information to a given position
   */
  private findNearestRange(buffer: Buffer, targetPos: number): Range | null {
    const reader = new BufferReader(buffer);
    reader.seek(Math.max(0, targetPos - 100)); // Look back up to 100 bytes
    
    const searchEnd = Math.min(buffer.length, targetPos + 200);
    let closestRange: Range | null = null;
    let closestDistance = Infinity;
    
    while (reader.position < searchEnd) {
      const rangePos = reader.findPattern('NS.rangeval');
      if (rangePos === -1) break;
      
      reader.seek(rangePos + 11);
      if (reader.remaining < 20) break;
      
      reader.skip(10); // Skip some bytes
      
      try {
        const location = reader.readUInt32LE();
        const length = reader.readUInt32LE();
        
        if (location < 10000 && length < 1000 && length > 0) {
          const distance = Math.abs(rangePos - targetPos);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestRange = { location, length };
          }
        }
      } catch {
        // Invalid range data, continue
      }
    }
    
    return closestRange;
  }
}