#!/usr/bin/env node

/**
 * Example: Export a chat to a formatted Markdown file
 * Preserves formatting, links, and structure
 */

const { IMessageDatabase } = require('../lib');
const fs = require('fs');
const path = require('path');

async function exportChatToMarkdown(chatName, outputFile) {
  console.log(`\nExporting "${chatName}" to ${outputFile}...\n`);

  const db = new IMessageDatabase(undefined, {
    includeMetadata: true,
    preserveFormatting: true,
  });

  try {
    // Find the chat
    const chats = await db.getChats();
    const chat = chats.find(c => 
      c.display_name === chatName || 
      c.chat_identifier.includes(chatName)
    );

    if (!chat) {
      console.error(`Chat "${chatName}" not found`);
      console.log('\nAvailable chats:');
      chats.slice(0, 20).forEach(c => {
        console.log(`  - ${c.display_name || c.chat_identifier}`);
      });
      return;
    }

    // Get all messages
    const messages = await db.getMessagesFromChat(chat.ROWID, 10000);
    console.log(`Found ${messages.length} messages`);

    // Build markdown content
    let markdown = `# ${chat.display_name || chat.chat_identifier}\n\n`;
    markdown += `**Total Messages:** ${messages.length}  \n`;
    markdown += `**Export Date:** ${new Date().toLocaleString()}  \n\n`;
    markdown += '---\n\n';

    // Group messages by date
    const messagesByDate = new Map();
    
    messages.reverse().forEach(msg => {
      const date = new Date((msg.date / 1000000000) + 978307200000);
      const dateKey = date.toLocaleDateString();
      
      if (!messagesByDate.has(dateKey)) {
        messagesByDate.set(dateKey, []);
      }
      
      messagesByDate.get(dateKey).push({
        ...msg,
        parsed: db.parseMessage(msg),
        dateObj: date,
      });
    });

    // Process each date
    for (const [dateStr, dayMessages] of messagesByDate) {
      markdown += `## ${dateStr}\n\n`;
      
      dayMessages.forEach(msg => {
        const time = msg.dateObj.toLocaleTimeString();
        const sender = msg.is_from_me ? 'Me' : formatHandle(msg.handle_id);
        
        markdown += `**[${time}] ${sender}:**`;
        
        // Add attachment indicator
        if (msg.cache_has_attachments) {
          markdown += ' 📎';
        }
        
        markdown += '  \n';
        
        // Format the text with attributes
        let text = msg.parsed.text;
        
        if (msg.parsed.attributes) {
          text = applyMarkdownFormatting(text, msg.parsed.attributes);
          
          // Add notes about special content
          if (msg.parsed.attributes.dataDetectors?.length) {
            const detectors = msg.parsed.attributes.dataDetectors
              .map(d => `${d.type}: ${d.value}`)
              .join(', ');
            markdown += `*[Detected: ${detectors}]*  \n`;
          }
        }
        
        // Handle multi-line messages
        const lines = text.split('\n');
        lines.forEach(line => {
          markdown += line + '  \n';
        });
        
        markdown += '\n';
      });
      
      markdown += '\n';
    }

    // Add statistics
    markdown += '---\n\n';
    markdown += '## Statistics\n\n';
    
    const sentCount = messages.filter(m => m.is_from_me).length;
    const receivedCount = messages.length - sentCount;
    const withAttachments = messages.filter(m => m.cache_has_attachments).length;
    const withFormatting = messages.filter(m => m.attributedBody).length;
    
    markdown += `- **Messages sent by me:** ${sentCount}\n`;
    markdown += `- **Messages received:** ${receivedCount}\n`;
    markdown += `- **Messages with attachments:** ${withAttachments}\n`;
    markdown += `- **Messages with formatting:** ${withFormatting}\n`;

    // Write to file
    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, markdown);
    
    console.log(`\n✅ Successfully exported to ${outputPath}`);
    console.log(`   File size: ${(markdown.length / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

function formatHandle(handle) {
  if (!handle) return 'Unknown';
  
  // Format phone numbers
  if (handle.match(/^\+?1?\d{10,}$/)) {
    // Simple US phone formatting
    const cleaned = handle.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
  }
  
  return handle;
}

function applyMarkdownFormatting(text, attributes) {
  // Sort all formatting ranges by position to handle overlaps
  const allRanges = [];
  
  if (attributes.bold) {
    attributes.bold.forEach(r => allRanges.push({ ...r, type: 'bold' }));
  }
  if (attributes.italic) {
    attributes.italic.forEach(r => allRanges.push({ ...r, type: 'italic' }));
  }
  if (attributes.links) {
    attributes.links.forEach(r => allRanges.push({ ...r, type: 'link' }));
  }
  
  // Sort by location
  allRanges.sort((a, b) => a.location - b.location);
  
  // Apply formatting from end to start to preserve positions
  let result = text;
  for (let i = allRanges.length - 1; i >= 0; i--) {
    const range = allRanges[i];
    const start = range.location;
    const end = range.location + range.length;
    
    if (start >= 0 && end <= text.length) {
      const content = result.substring(start, end);
      
      switch (range.type) {
        case 'bold':
          result = result.substring(0, start) + `**${content}**` + result.substring(end);
          break;
        case 'italic':
          result = result.substring(0, start) + `*${content}*` + result.substring(end);
          break;
        case 'link':
          result = result.substring(0, start) + `[${content}](${range.url})` + result.substring(end);
          break;
      }
    }
  }
  
  return result;
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node export-chat-to-markdown.js <chat-name> <output-file>');
  console.log('Example: node export-chat-to-markdown.js "Fam" "family-chat.md"');
  process.exit(1);
}

exportChatToMarkdown(args[0], args[1]).catch(console.error);