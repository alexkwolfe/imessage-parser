#!/usr/bin/env node

/**
 * Example: Parse a specific message by ROWID
 * Useful for debugging specific problematic messages
 */

const { IMessageDatabase } = require('../lib');
const sqlite3 = require('sqlite3');

async function parseSpecificMessage(rowId) {
  const db = new sqlite3.Database(
    process.env.HOME + '/Library/Messages/chat.db',
    sqlite3.OPEN_READONLY
  );

  const parser = new (require('../lib')).AttributedStringParser({
    preserveFormatting: true,
    includeMetadata: true,
    cleanOutput: true,
  });

  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        ROWID,
        text,
        attributedBody,
        datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as formatted_date
      FROM message
      WHERE ROWID = ?
    `;

    db.get(query, [rowId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (!row) {
        console.log(`Message with ROWID ${rowId} not found`);
        db.close();
        resolve();
        return;
      }

      console.log(`\nMessage ROWID: ${row.ROWID}`);
      console.log(`Date: ${row.formatted_date}`);
      console.log(`Has text: ${!!row.text}`);
      console.log(`Has attributedBody: ${!!row.attributedBody}`);

      if (row.text) {
        console.log('\nPlain text:');
        console.log(row.text);
      }

      if (row.attributedBody) {
        console.log('\nAttributedBody analysis:');
        console.log(`Size: ${row.attributedBody.length} bytes`);
        
        // Show hex dump of first 100 bytes
        console.log('\nFirst 100 bytes (hex):');
        const hexDump = row.attributedBody.slice(0, 100).toString('hex').match(/.{1,2}/g).join(' ');
        console.log(hexDump);

        // Parse the attributedBody
        const result = parser.parse(row.attributedBody);
        
        console.log('\nParsed text:');
        console.log(result.text);

        if (result.attributes && Object.keys(result.attributes).length > 0) {
          console.log('\nAttributes:');
          console.log(JSON.stringify(result.attributes, null, 2));
        }

        // Also try direct NSString extraction
        const typedStreamParser = new (require('../lib')).TypedStreamParser(row.attributedBody);
        const nsStrings = typedStreamParser.parseAllNSStrings();
        
        if (nsStrings.length > 0) {
          console.log(`\nFound ${nsStrings.length} NSString objects:`);
          nsStrings.forEach((str, index) => {
            console.log(`  ${index + 1}: "${str.content}"`);
          });
        }

        // Show readable text extraction
        const readableTexts = typedStreamParser.extractReadableText();
        if (readableTexts.length > 0) {
          console.log(`\nReadable text segments (${readableTexts.length}):`);
          readableTexts.forEach((text, index) => {
            console.log(`  ${index + 1}: "${text}"`);
          });
        }
      }

      db.close();
      resolve();
    });
  });
}

// Get ROWID from command line
const rowId = process.argv[2];

if (!rowId) {
  console.log('Usage: node parse-specific-message.js <ROWID>');
  console.log('Example: node parse-specific-message.js 302041');
  process.exit(1);
}

parseSpecificMessage(rowId).catch(console.error);