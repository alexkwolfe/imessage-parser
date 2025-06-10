export { AttributedStringParser } from './parsers/attributed-string-parser';
export { TypedStreamParser } from './parsers/typedstream-parser';
export { IMessageDatabase, MessageRow, MessageWithChat, ChatRow } from './imessage-database';
export * from './types';
export * from './utils/message-links';

import { AttributedStringParser } from './parsers/attributed-string-parser';
import { ParserOptions, ParsedMessage } from './types';

// Convenience function for parsing a single attributedBody buffer
// Note: This will return an empty link since there's no message context
export function parseAttributedBody(buffer: Buffer, options?: ParserOptions): ParsedMessage {
  const parser = new AttributedStringParser(options);
  return parser.parse(buffer);
}