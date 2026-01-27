import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} from 'docx';
import PDFDocument from 'pdfkit';
import * as mammoth from 'mammoth';
import { Workspace } from '../../../shared/types';

export interface ContentBlock {
  type: string; // 'heading' | 'paragraph' | 'list' | 'table' | 'code'
  text: string;
  level?: number; // For headings: 1-6
  items?: string[]; // For lists
  rows?: string[][]; // For tables
  language?: string; // For code blocks
}

export interface DocumentOptions {
  title?: string;
  author?: string;
  subject?: string;
  /** Font size in points (default: 12) */
  fontSize?: number;
  /** Page margins in inches */
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

/**
 * DocumentBuilder creates Word documents (.docx) and PDFs using docx and pdfkit
 */
export class DocumentBuilder {
  constructor(private workspace: Workspace) {}

  async create(
    outputPath: string,
    format: 'docx' | 'pdf' | 'md',
    content: ContentBlock[] | ContentBlock | string | undefined,
    options: DocumentOptions = {}
  ): Promise<void> {
    // Normalize content to always be an array
    const normalizedContent = this.normalizeContent(content);
    const ext = path.extname(outputPath).toLowerCase();

    // Allow format override via extension
    if (ext === '.md' || format === 'md') {
      await this.createMarkdown(outputPath, normalizedContent);
      return;
    }

    if (ext === '.pdf' || format === 'pdf') {
      await this.createPDF(outputPath, normalizedContent, options);
      return;
    }

    // Default to Word document
    await this.createDocx(outputPath, normalizedContent, options);
  }

  /**
   * Normalizes content input to always be an array of ContentBlocks
   * Throws an error if content is empty or invalid to prevent creating empty documents
   */
  private normalizeContent(content: ContentBlock[] | ContentBlock | string | undefined): ContentBlock[] {
    // Handle undefined/null - FAIL instead of creating empty document
    if (!content) {
      throw new Error(
        'Document content is required. Please provide content as an array of blocks ' +
        '(e.g., [{ type: "paragraph", text: "Your text here" }]) or as a string.'
      );
    }

    // Handle string input - convert to a single paragraph
    if (typeof content === 'string') {
      if (content.trim().length === 0) {
        throw new Error('Document content cannot be empty. Please provide text content.');
      }
      return [{ type: 'paragraph', text: content }];
    }

    // Handle single object (not an array)
    if (!Array.isArray(content)) {
      if (!content.text || content.text.trim().length === 0) {
        throw new Error(
          'Content block must have non-empty text. ' +
          `Received block with type "${content.type}" but empty or missing text.`
        );
      }
      return [content];
    }

    // Already an array - ensure it's not empty
    if (content.length === 0) {
      throw new Error(
        'Document content array cannot be empty. ' +
        'Please provide at least one content block (e.g., [{ type: "paragraph", text: "Your text" }]).'
      );
    }

    // Validate each block has content
    const emptyBlocks = content.filter(block => !block.text || block.text.trim().length === 0);
    if (emptyBlocks.length > 0) {
      console.warn(`[DocumentBuilder] Found ${emptyBlocks.length} empty content blocks, filtering them out`);
      const validBlocks = content.filter(block => block.text && block.text.trim().length > 0);
      if (validBlocks.length === 0) {
        throw new Error(
          'All content blocks have empty text. Please provide content blocks with actual text. ' +
          `Received ${content.length} blocks but all had empty or missing text fields.`
        );
      }
      return validBlocks;
    }

    return content;
  }

  /**
   * Creates a Word document (.docx)
   */
  private async createDocx(
    outputPath: string,
    content: ContentBlock[],
    options: DocumentOptions
  ): Promise<void> {
    const children: Paragraph[] = [];

    for (const block of content) {
      switch (block.type) {
        case 'heading': {
          const level = Math.min(Math.max(block.level || 1, 1), 6);
          const headingLevel = this.getHeadingLevel(level);
          children.push(
            new Paragraph({
              text: block.text,
              heading: headingLevel,
              spacing: { before: 240, after: 120 }
            })
          );
          break;
        }

        case 'paragraph':
          children.push(
            new Paragraph({
              children: [new TextRun({ text: block.text, size: (options.fontSize || 12) * 2 })],
              spacing: { after: 200 }
            })
          );
          break;

        case 'list': {
          const items = block.items || block.text.split('\n').filter(line => line.trim());
          for (const item of items) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: item, size: (options.fontSize || 12) * 2 })],
                bullet: { level: 0 },
                spacing: { after: 100 }
              })
            );
          }
          break;
        }

        case 'table': {
          if (block.rows && block.rows.length > 0) {
            const table = new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: block.rows.map((row, rowIndex) =>
                new TableRow({
                  children: row.map(
                    cell =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: cell,
                                bold: rowIndex === 0,
                                size: (options.fontSize || 12) * 2
                              })
                            ]
                          })
                        ],
                        borders: {
                          top: { style: BorderStyle.SINGLE, size: 1 },
                          bottom: { style: BorderStyle.SINGLE, size: 1 },
                          left: { style: BorderStyle.SINGLE, size: 1 },
                          right: { style: BorderStyle.SINGLE, size: 1 }
                        }
                      })
                  )
                })
              )
            });
            children.push(new Paragraph({ children: [] })); // Spacing before table
            children.push(table as any);
            children.push(new Paragraph({ children: [] })); // Spacing after table
          }
          break;
        }

        case 'code':
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: block.text,
                  font: 'Courier New',
                  size: 20, // 10pt
                  shading: { fill: 'F0F0F0' }
                })
              ],
              spacing: { before: 200, after: 200 }
            })
          );
          break;

        default:
          children.push(
            new Paragraph({
              children: [new TextRun({ text: block.text, size: (options.fontSize || 12) * 2 })]
            })
          );
      }
    }

    const doc = new Document({
      creator: options.author || 'CoWork-OSS',
      title: options.title,
      subject: options.subject,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: (options.margins?.top || 1) * 1440, // Convert inches to twips
                bottom: (options.margins?.bottom || 1) * 1440,
                left: (options.margins?.left || 1) * 1440,
                right: (options.margins?.right || 1) * 1440
              }
            }
          },
          children
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    await fsPromises.writeFile(outputPath, buffer);
  }

  /**
   * Creates a PDF document
   */
  private async createPDF(
    outputPath: string,
    content: ContentBlock[],
    options: DocumentOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: {
          top: (options.margins?.top || 1) * 72,
          bottom: (options.margins?.bottom || 1) * 72,
          left: (options.margins?.left || 1) * 72,
          right: (options.margins?.right || 1) * 72
        },
        info: {
          Title: options.title || '',
          Author: options.author || 'CoWork-OSS',
          Subject: options.subject || ''
        }
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const baseFontSize = options.fontSize || 12;

      for (const block of content) {
        switch (block.type) {
          case 'heading': {
            const level = Math.min(Math.max(block.level || 1, 1), 6);
            const fontSize = baseFontSize + (7 - level) * 2; // h1 = base+12, h6 = base+2
            doc
              .font('Helvetica-Bold')
              .fontSize(fontSize)
              .text(block.text, { paragraphGap: 10 });
            doc.moveDown(0.5);
            break;
          }

          case 'paragraph':
            doc
              .font('Helvetica')
              .fontSize(baseFontSize)
              .text(block.text, { paragraphGap: 8, lineGap: 4 });
            doc.moveDown(0.5);
            break;

          case 'list': {
            const items = block.items || block.text.split('\n').filter(line => line.trim());
            doc.font('Helvetica').fontSize(baseFontSize);
            for (const item of items) {
              doc.text(`• ${item}`, { indent: 20, paragraphGap: 4 });
            }
            doc.moveDown(0.5);
            break;
          }

          case 'table': {
            if (block.rows && block.rows.length > 0) {
              doc.font('Helvetica').fontSize(baseFontSize - 1);
              const columnCount = block.rows[0].length;
              const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
              const colWidth = pageWidth / columnCount;

              for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
                const row = block.rows[rowIndex];
                const startY = doc.y;

                // Draw cells
                for (let colIndex = 0; colIndex < row.length; colIndex++) {
                  const x = doc.page.margins.left + colIndex * colWidth;
                  doc.font(rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica');
                  doc.text(row[colIndex], x, startY, {
                    width: colWidth - 10,
                    continued: false
                  });
                }

                // Draw horizontal line
                doc
                  .moveTo(doc.page.margins.left, doc.y + 5)
                  .lineTo(doc.page.margins.left + pageWidth, doc.y + 5)
                  .stroke();

                doc.moveDown(0.3);
              }
              doc.moveDown(0.5);
            }
            break;
          }

          case 'code':
            doc
              .font('Courier')
              .fontSize(baseFontSize - 2)
              .fillColor('#333333')
              .text(block.text, { paragraphGap: 8 });
            doc.fillColor('#000000');
            doc.moveDown(0.5);
            break;

          default:
            doc
              .font('Helvetica')
              .fontSize(baseFontSize)
              .text(block.text);
            doc.moveDown(0.5);
        }
      }

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Creates a Markdown document (fallback)
   */
  private async createMarkdown(outputPath: string, content: ContentBlock[]): Promise<void> {
    const markdown = content
      .map(block => {
        switch (block.type) {
          case 'heading': {
            const level = Math.min(Math.max(block.level || 1, 1), 6);
            return `${'#'.repeat(level)} ${block.text}\n`;
          }
          case 'paragraph':
            return `${block.text}\n`;
          case 'list': {
            const items = block.items || block.text.split('\n').filter(line => line.trim());
            return items.map(item => `- ${item}`).join('\n') + '\n';
          }
          case 'table': {
            if (!block.rows || block.rows.length === 0) return '';
            const header = block.rows[0];
            const separator = header.map(() => '---').join(' | ');
            const rows = block.rows.map(row => row.join(' | ')).join('\n');
            return `${header.join(' | ')}\n${separator}\n${block.rows.slice(1).map(row => row.join(' | ')).join('\n')}\n`;
          }
          case 'code':
            return `\`\`\`${block.language || ''}\n${block.text}\n\`\`\`\n`;
          default:
            return `${block.text}\n`;
        }
      })
      .join('\n');

    await fsPromises.writeFile(outputPath, markdown, 'utf-8');
  }

  private getHeadingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
    switch (level) {
      case 1: return HeadingLevel.HEADING_1;
      case 2: return HeadingLevel.HEADING_2;
      case 3: return HeadingLevel.HEADING_3;
      case 4: return HeadingLevel.HEADING_4;
      case 5: return HeadingLevel.HEADING_5;
      case 6: return HeadingLevel.HEADING_6;
      default: return HeadingLevel.HEADING_1;
    }
  }

  /**
   * Reads an existing DOCX file and extracts its content as HTML
   */
  async readDocument(inputPath: string): Promise<{ html: string; text: string; messages: string[] }> {
    const buffer = await fsPromises.readFile(inputPath);
    const result = await mammoth.convertToHtml({ buffer });
    const textResult = await mammoth.extractRawText({ buffer });

    return {
      html: result.value,
      text: textResult.value,
      messages: result.messages.map(m => m.message)
    };
  }

  /**
   * Appends new content sections to an existing DOCX file.
   * Note: Due to DOCX format complexity, this creates a new document with
   * the original content (converted to plain text sections) plus the new content.
   * Some formatting may be lost in the process.
   */
  async appendToDocument(
    inputPath: string,
    outputPath: string,
    newContent: ContentBlock[],
    options: DocumentOptions = {}
  ): Promise<{ success: boolean; sectionsAdded: number }> {
    // Read existing document
    const existingContent = await this.readDocument(inputPath);

    // Convert existing HTML to basic content blocks
    const existingBlocks = this.htmlToContentBlocks(existingContent.html);

    // Combine with new content
    const allContent = [...existingBlocks, ...newContent];

    // Create new document with all content
    await this.createDocx(outputPath, allContent, options);

    return {
      success: true,
      sectionsAdded: newContent.length
    };
  }

  /**
   * Converts HTML from mammoth to ContentBlocks
   * This is a simplified conversion that preserves basic structure
   */
  private htmlToContentBlocks(html: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    // Simple regex-based HTML parsing for common elements
    // Match headings
    const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    // Match paragraphs
    const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    // Match list items
    const listRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
    const listItemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    // Match tables
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const tdThRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

    // Helper to strip HTML tags
    const stripTags = (str: string): string => str.replace(/<[^>]*>/g, '').trim();

    // Process in order of appearance
    let lastIndex = 0;
    const processedRanges: Array<{start: number; end: number}> = [];

    // Find all headings
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      const text = stripTags(match[2]);
      if (text) {
        blocks.push({
          type: 'heading',
          text,
          level: parseInt(match[1], 10)
        });
        processedRanges.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    // Find all paragraphs
    paragraphRegex.lastIndex = 0;
    while ((match = paragraphRegex.exec(html)) !== null) {
      // Skip if this range overlaps with an already processed element
      const overlaps = processedRanges.some(r =>
        (match!.index >= r.start && match!.index < r.end) ||
        (match!.index + match![0].length > r.start && match!.index + match![0].length <= r.end)
      );
      if (overlaps) continue;

      const text = stripTags(match[1]);
      if (text) {
        blocks.push({
          type: 'paragraph',
          text
        });
        processedRanges.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    // Find all lists
    listRegex.lastIndex = 0;
    while ((match = listRegex.exec(html)) !== null) {
      const listHtml = match[1];
      const items: string[] = [];
      let itemMatch;
      const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      while ((itemMatch = itemRegex.exec(listHtml)) !== null) {
        const itemText = stripTags(itemMatch[1]);
        if (itemText) items.push(itemText);
      }
      if (items.length > 0) {
        blocks.push({
          type: 'list',
          text: items.join('\n'),
          items
        });
      }
    }

    // Find all tables
    tableRegex.lastIndex = 0;
    while ((match = tableRegex.exec(html)) !== null) {
      const tableHtml = match[1];
      const rows: string[][] = [];
      let rowMatch;
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cells: string[] = [];
        let cellMatch;
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          cells.push(stripTags(cellMatch[1]));
        }
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) {
        blocks.push({
          type: 'table',
          text: '',
          rows
        });
      }
    }

    // Sort blocks by their original position would require more complex tracking
    // For now, we return them in the order found (headings, then paragraphs, then lists, then tables)
    // This may not preserve exact document order

    return blocks;
  }
}
