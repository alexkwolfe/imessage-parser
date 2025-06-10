#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { IMessageDatabase } from './imessage-database';
import { ParsedMessage } from './types';

const program = new Command();

program
  .name('imessage-parser')
  .description('Parse and extract iMessage data from chat.db')
  .version('0.1.0');

// List chats command
program
  .command('list-chats')
  .description('List all available chats')
  .option('-l, --limit <number>', 'limit number of chats', '50')
  .action(async (options) => {
    const db = new IMessageDatabase();
    try {
      const chats = await db.getChats();
      const limit = parseInt(options.limit);
      
      console.log(chalk.blue(`\nFound ${chats.length} chats:\n`));
      
      chats.slice(0, limit).forEach((chat, index) => {
        const name = chat.display_name || chat.chat_identifier;
        console.log(`${chalk.yellow(index + 1)}. ${chalk.green(name)} (ID: ${chat.ROWID})`);
      });
      
      if (chats.length > limit) {
        console.log(chalk.gray(`\n... and ${chats.length - limit} more`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
    } finally {
      await db.close();
    }
  });

// Extract messages command
program
  .command('extract')
  .description('Extract messages from a chat')
  .argument('<chat>', 'chat name or ID')
  .option('-l, --limit <number>', 'limit number of messages', '100')
  .option('-o, --output <file>', 'output file (default: stdout)')
  .option('-f, --format <format>', 'output format: text, json, markdown', 'text')
  .option('--include-formatting', 'include formatting information')
  .option('--after <date>', 'only messages after this date (YYYY-MM-DD)')
  .option('--before <date>', 'only messages before this date (YYYY-MM-DD)')
  .action(async (chatIdentifier, options) => {
    const db = new IMessageDatabase();
    try {
      // Find the chat
      const chats = await db.getChats();
      const chat = chats.find(c => 
        c.display_name === chatIdentifier || 
        c.ROWID.toString() === chatIdentifier ||
        c.chat_identifier.includes(chatIdentifier)
      );

      if (!chat) {
        console.error(chalk.red(`Chat "${chatIdentifier}" not found`));
        process.exit(1);
      }

      console.log(chalk.blue(`Extracting messages from: ${chat.display_name || chat.chat_identifier}`));

      // Get messages
      const messages = await db.getMessagesFromChat(chat.ROWID, parseInt(options.limit));
      
      // Parse messages
      const parsedMessages = messages.map(msg => ({
        ...msg,
        parsed: db.parseMessage(msg),
      }));

      // Filter by date if specified
      let filteredMessages = parsedMessages;
      if (options.after || options.before) {
        const afterDate = options.after ? new Date(options.after).getTime() : 0;
        const beforeDate = options.before ? new Date(options.before).getTime() : Infinity;
        
        filteredMessages = parsedMessages.filter(msg => {
          const msgDate = (msg.date / 1000000000) + 978307200000;
          return msgDate >= afterDate && msgDate <= beforeDate;
        });
      }

      // Format output
      let output = '';
      switch (options.format) {
        case 'json':
          output = formatAsJSON(filteredMessages, options.includeFormatting);
          break;
        case 'markdown':
          output = formatAsMarkdown(filteredMessages, chat.display_name || chat.chat_identifier, options.includeFormatting);
          break;
        default:
          output = formatAsText(filteredMessages, options.includeFormatting);
      }

      // Output
      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(chalk.green(`\nExtracted ${filteredMessages.length} messages to ${options.output}`));
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
    } finally {
      await db.close();
    }
  });

// Search command
program
  .command('search')
  .description('Search messages across all chats')
  .argument('<query>', 'search query')
  .option('-l, --limit <number>', 'limit number of results', '50')
  .option('--case-sensitive', 'case sensitive search')
  .option('--regex', 'use regular expression')
  .action(async (query, options) => {
    const db = new IMessageDatabase();
    try {
      console.log(chalk.blue(`Searching for: "${query}"...\n`));
      
      const results = await db.searchMessages(query, parseInt(options.limit));
      
      if (results.length === 0) {
        console.log(chalk.yellow('No messages found'));
        return;
      }

      console.log(chalk.green(`Found ${results.length} messages:\n`));

      results.forEach((msg, index) => {
        const parsed = db.parseMessage(msg);
        const date = new Date((msg.date / 1000000000) + 978307200000);
        const preview = parsed.text.substring(0, 100).replace(/\n/g, ' ');
        
        console.log(chalk.yellow(`${index + 1}. `) + chalk.gray(`[${date.toLocaleString()}]`));
        console.log(`   ${chalk.cyan(msg.chat_display_name || 'Unknown Chat')}`);
        console.log(`   ${msg.is_from_me ? 'Me' : msg.handle_id}: ${preview}${parsed.text.length > 100 ? '...' : ''}`);
        
        // Show link
        if (parsed.link) {
          console.log(`   ${chalk.gray('Link:')} ${chalk.blue(parsed.link)}`);
        }
        
        // Highlight search term
        if (!options.regex) {
          const regex = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
          const highlighted = preview.replace(regex, chalk.bgYellow.black('$&'));
          console.log(`   ${highlighted}`);
        }
        console.log();
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error);
    } finally {
      await db.close();
    }
  });

// Parse specific message command
program
  .command('parse-message')
  .description('Parse a specific message by ROWID')
  .argument('<rowid>', 'message ROWID')
  .option('--show-hex', 'show hex dump of attributedBody')
  .option('--show-readable', 'show all readable text segments')
  .action(async (rowId, options) => {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(
      path.join(os.homedir(), 'Library', 'Messages', 'chat.db'),
      sqlite3.OPEN_READONLY
    );

    const query = `
      SELECT 
        ROWID,
        text,
        attributedBody,
        datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as formatted_date,
        cache_has_attachments
      FROM message
      WHERE ROWID = ?
    `;

    db.get(query, [rowId], async (err: any, row: any) => {
      if (err) {
        console.error(chalk.red('Error:'), err);
        return;
      }

      if (!row) {
        console.log(chalk.red(`Message with ROWID ${rowId} not found`));
        return;
      }

      console.log(chalk.blue('\n=== Message Details ==='));
      console.log(`${chalk.yellow('ROWID:')} ${row.ROWID}`);
      console.log(`${chalk.yellow('Date:')} ${row.formatted_date}`);
      console.log(`${chalk.yellow('Has plain text:')} ${!!row.text}`);
      console.log(`${chalk.yellow('Has attributedBody:')} ${!!row.attributedBody}`);
      console.log(`${chalk.yellow('Has attachments:')} ${!!row.cache_has_attachments}`);

      if (row.text) {
        console.log(chalk.blue('\n=== Plain Text ==='));
        console.log(row.text);
      }

      if (row.attributedBody) {
        console.log(chalk.blue('\n=== AttributedBody Analysis ==='));
        console.log(`${chalk.yellow('Size:')} ${row.attributedBody.length} bytes`);

        if (options.showHex) {
          console.log(chalk.blue('\n=== Hex Dump (first 200 bytes) ==='));
          const hex = row.attributedBody.slice(0, 200).toString('hex');
          for (let i = 0; i < hex.length; i += 32) {
            console.log(hex.substring(i, i + 32).match(/.{2}/g).join(' '));
          }
        }

        // Parse with our parser
        const { AttributedStringParser, TypedStreamParser } = require('./index');
        const parser = new AttributedStringParser({ includeMetadata: true });
        const result = parser.parse(row.attributedBody);

        console.log(chalk.blue('\n=== Parsed Text ==='));
        console.log(result.text || chalk.gray('(no text extracted)'));
        
        if (result.link) {
          console.log(chalk.blue('\n=== Message Link ==='));
          console.log(result.link);
        }

        if (result.attributes && Object.keys(result.attributes).length > 0) {
          console.log(chalk.blue('\n=== Formatting Attributes ==='));
          console.log(JSON.stringify(result.attributes, null, 2));
        }

        if (options.showReadable) {
          const typedStreamParser = new TypedStreamParser(row.attributedBody);
          const readableTexts = typedStreamParser.extractReadableText();
          
          if (readableTexts.length > 0) {
            console.log(chalk.blue(`\n=== Readable Text Segments (${readableTexts.length}) ===`));
            readableTexts.forEach((text: string, index: number) => {
              console.log(`${chalk.yellow(`[${index + 1}]`)} ${text}`);
            });
          }
        }
      }

      db.close();
    });
  });

// Export attachments command
program
  .command('export-attachments')
  .description('Export attachments from a chat')
  .argument('<chat>', 'chat name or ID')
  .option('-o, --output <dir>', 'output directory', './attachments')
  .option('--after <date>', 'only attachments after this date (YYYY-MM-DD)')
  .action(async (chatIdentifier, options) => {
    console.log(chalk.yellow('Attachment export is not yet implemented'));
    // TODO: Implement attachment export
  });

// Stats command
program
  .command('stats')
  .description('Show statistics about messages')
  .option('-c, --chat <name>', 'specific chat name')
  .action(async (options) => {
    const db = new IMessageDatabase();
    try {
      const chats = await db.getChats();
      
      if (options.chat) {
        // Stats for specific chat
        const chat = chats.find(c => 
          c.display_name === options.chat || 
          c.chat_identifier.includes(options.chat)
        );

        if (!chat) {
          console.error(chalk.red(`Chat "${options.chat}" not found`));
          return;
        }

        const messages = await db.getMessagesFromChat(chat.ROWID, 10000);
        showChatStats(chat, messages);
      } else {
        // Overall stats
        console.log(chalk.blue('\n=== iMessage Database Statistics ===\n'));
        console.log(`${chalk.yellow('Total chats:')} ${chats.length}`);
        
        // Get message counts for top chats
        const chatStats = [];
        for (const chat of chats.slice(0, 10)) {
          const messages = await db.getMessagesFromChat(chat.ROWID, 1);
          const totalQuery = `
            SELECT COUNT(*) as count 
            FROM chat_message_join 
            WHERE chat_id = ?
          `;
          
          // This is a simplified version - in production you'd query the count
          chatStats.push({
            name: chat.display_name || chat.chat_identifier,
            messageCount: messages.length,
          });
        }

        console.log(chalk.blue('\n=== Top Chats ==='));
        chatStats.forEach((stat, index) => {
          console.log(`${index + 1}. ${stat.name}`);
        });
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
    } finally {
      await db.close();
    }
  });

// Helper functions
function formatAsText(messages: any[], includeFormatting: boolean): string {
  let output = '';
  
  messages.reverse().forEach(msg => {
    const date = new Date((msg.date / 1000000000) + 978307200000);
    const sender = msg.is_from_me ? 'Me' : msg.handle_id || 'Unknown';
    
    output += `[${date.toLocaleString()}] ${sender}: ${msg.parsed.text}\n`;
    
    if (includeFormatting && msg.parsed.attributes && Object.keys(msg.parsed.attributes).length > 0) {
      output += `  Formatting: ${JSON.stringify(msg.parsed.attributes)}\n`;
    }
    
    output += '\n';
  });
  
  return output;
}

function formatAsJSON(messages: any[], includeFormatting: boolean): string {
  const data = messages.map(msg => ({
    date: new Date((msg.date / 1000000000) + 978307200000).toISOString(),
    sender: msg.is_from_me ? 'Me' : msg.handle_id || 'Unknown',
    text: msg.parsed.text,
    ...(includeFormatting && msg.parsed.attributes ? { formatting: msg.parsed.attributes } : {}),
  }));
  
  return JSON.stringify(data, null, 2);
}

function formatAsMarkdown(messages: any[], chatName: string, includeFormatting: boolean): string {
  let output = `# ${chatName}\n\n`;
  output += `**Messages:** ${messages.length}  \n`;
  output += `**Date Range:** ${getDateRange(messages)}  \n\n`;
  output += '---\n\n';
  
  let lastDate = '';
  
  messages.reverse().forEach(msg => {
    const date = new Date((msg.date / 1000000000) + 978307200000);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    const sender = msg.is_from_me ? 'Me' : msg.handle_id || 'Unknown';
    
    if (dateStr !== lastDate) {
      output += `\n## ${dateStr}\n\n`;
      lastDate = dateStr;
    }
    
    if (msg.parsed.link) {
      output += `**[${timeStr}] [${sender}](${msg.parsed.link}):**  \n`;
    } else {
      output += `**[${timeStr}] ${sender}:**  \n`;
    }
    
    // Apply formatting if available
    let text = msg.parsed.text;
    if (includeFormatting && msg.parsed.attributes) {
      text = applyMarkdownFormatting(text, msg.parsed.attributes);
    }
    
    output += `${text}\n\n`;
  });
  
  return output;
}

function getDateRange(messages: any[]): string {
  if (messages.length === 0) return 'N/A';
  
  const dates = messages.map(msg => (msg.date / 1000000000) + 978307200000);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  
  return `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`;
}

function applyMarkdownFormatting(text: string, attributes: any): string {
  // This is a simplified version - in a real implementation,
  // you'd need to handle overlapping ranges properly
  
  if (attributes.links) {
    attributes.links.forEach((link: any) => {
      const linkText = text.substring(link.location, link.location + link.length);
      text = text.replace(linkText, `[${linkText}](${link.url})`);
    });
  }
  
  if (attributes.bold) {
    attributes.bold.forEach((range: any) => {
      const boldText = text.substring(range.location, range.location + range.length);
      text = text.replace(boldText, `**${boldText}**`);
    });
  }
  
  if (attributes.italic) {
    attributes.italic.forEach((range: any) => {
      const italicText = text.substring(range.location, range.location + range.length);
      text = text.replace(italicText, `*${italicText}*`);
    });
  }
  
  return text;
}

function showChatStats(chat: any, messages: any[]): void {
  console.log(chalk.blue(`\n=== Stats for ${chat.display_name || chat.chat_identifier} ===\n`));
  
  const sentCount = messages.filter(m => m.is_from_me).length;
  const receivedCount = messages.length - sentCount;
  const withAttachments = messages.filter(m => m.cache_has_attachments).length;
  const withAttributedBody = messages.filter(m => m.attributedBody).length;
  
  console.log(`${chalk.yellow('Total messages:')} ${messages.length}`);
  console.log(`${chalk.yellow('Sent by me:')} ${sentCount}`);
  console.log(`${chalk.yellow('Received:')} ${receivedCount}`);
  console.log(`${chalk.yellow('With attachments:')} ${withAttachments}`);
  console.log(`${chalk.yellow('With formatting:')} ${withAttributedBody}`);
  
  if (messages.length > 0) {
    const dates = messages.map(msg => (msg.date / 1000000000) + 978307200000);
    const firstDate = new Date(Math.min(...dates));
    const lastDate = new Date(Math.max(...dates));
    
    console.log(`${chalk.yellow('First message:')} ${firstDate.toLocaleString()}`);
    console.log(`${chalk.yellow('Last message:')} ${lastDate.toLocaleString()}`);
  }
}

// Run the CLI
program.parse();