import * as path from 'path';
import { Workspace } from '../../../shared/types';
import { AgentDaemon } from '../daemon';
import { SpreadsheetBuilder } from '../skills/spreadsheet';
import { DocumentBuilder } from '../skills/document';
import { PresentationBuilder } from '../skills/presentation';
import { FolderOrganizer } from '../skills/organizer';

/**
 * SkillTools implements high-level skills for document creation
 */
export class SkillTools {
  private spreadsheetBuilder: SpreadsheetBuilder;
  private documentBuilder: DocumentBuilder;
  private presentationBuilder: PresentationBuilder;
  private folderOrganizer: FolderOrganizer;

  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string
  ) {
    this.spreadsheetBuilder = new SpreadsheetBuilder(workspace);
    this.documentBuilder = new DocumentBuilder(workspace);
    this.presentationBuilder = new PresentationBuilder(workspace);
    this.folderOrganizer = new FolderOrganizer(workspace, daemon, taskId);
  }

  /**
   * Create spreadsheet
   */
  async createSpreadsheet(input: {
    filename: string;
    sheets: Array<{ name: string; data: any[][] }>;
  }): Promise<{ success: boolean; path: string }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    const filename = input.filename.endsWith('.xlsx')
      ? input.filename
      : `${input.filename}.xlsx`;

    const outputPath = path.join(this.workspace.path, filename);

    await this.spreadsheetBuilder.create(outputPath, input.sheets);

    this.daemon.logEvent(this.taskId, 'file_created', {
      path: filename,
      type: 'spreadsheet',
      sheets: input.sheets.length,
    });

    return {
      success: true,
      path: filename,
    };
  }

  /**
   * Create document
   */
  async createDocument(input: {
    filename: string;
    format: 'docx' | 'pdf';
    content: Array<{ type: string; text: string; level?: number }>;
  }): Promise<{ success: boolean; path: string; contentBlocks?: number }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    // Log input for debugging
    const contentSummary = Array.isArray(input.content)
      ? `${input.content.length} blocks`
      : typeof input.content;
    console.log(`[SkillTools] createDocument called with: filename=${input.filename}, format=${input.format}, content=${contentSummary}`);

    // Validate content before processing
    if (!input.content) {
      throw new Error(
        'Missing required "content" parameter. ' +
        'Please provide document content as an array of blocks, e.g.: ' +
        '[{ type: "heading", text: "Title", level: 1 }, { type: "paragraph", text: "Content here" }]'
      );
    }

    const filename = input.filename.endsWith(`.${input.format}`)
      ? input.filename
      : `${input.filename}.${input.format}`;

    const outputPath = path.join(this.workspace.path, filename);

    await this.documentBuilder.create(outputPath, input.format, input.content);

    const blockCount = Array.isArray(input.content) ? input.content.length : 1;
    console.log(`[SkillTools] Document created successfully: ${filename} with ${blockCount} content blocks`);

    this.daemon.logEvent(this.taskId, 'file_created', {
      path: filename,
      type: 'document',
      format: input.format,
      contentBlocks: blockCount,
    });

    return {
      success: true,
      path: filename,
      contentBlocks: blockCount,
    };
  }

  /**
   * Edit/append to an existing document
   */
  async editDocument(input: {
    sourcePath: string;
    destPath?: string;
    newContent: Array<{ type: string; text: string; level?: number; items?: string[]; rows?: string[][] }>;
  }): Promise<{ success: boolean; path: string; sectionsAdded: number }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }
    if (!this.workspace.permissions.read) {
      throw new Error('Read permission not granted');
    }

    // Validate input
    if (!input.sourcePath) {
      throw new Error('Missing required "sourcePath" parameter - the path to the existing document to edit');
    }
    if (!input.newContent || !Array.isArray(input.newContent) || input.newContent.length === 0) {
      throw new Error(
        'Missing or empty "newContent" parameter. ' +
        'Please provide new content as an array of blocks, e.g.: ' +
        '[{ type: "heading", text: "New Section", level: 2 }, { type: "paragraph", text: "Content here" }]'
      );
    }

    const inputPath = path.join(this.workspace.path, input.sourcePath);
    const outputPath = input.destPath
      ? path.join(this.workspace.path, input.destPath)
      : inputPath;

    console.log(`[SkillTools] editDocument called: source=${input.sourcePath}, dest=${input.destPath || 'same'}, newContent=${input.newContent.length} blocks`);

    const result = await this.documentBuilder.appendToDocument(inputPath, outputPath, input.newContent);

    console.log(`[SkillTools] Document edited successfully: ${outputPath} with ${result.sectionsAdded} new sections`);

    this.daemon.logEvent(this.taskId, 'file_modified', {
      path: input.destPath || input.sourcePath,
      type: 'document',
      sectionsAdded: result.sectionsAdded,
    });

    return {
      success: true,
      path: input.destPath || input.sourcePath,
      sectionsAdded: result.sectionsAdded,
    };
  }

  /**
   * Create presentation
   */
  async createPresentation(input: {
    filename: string;
    slides: Array<{ title: string; content: string[] }>;
  }): Promise<{ success: boolean; path: string }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    const filename = input.filename.endsWith('.pptx')
      ? input.filename
      : `${input.filename}.pptx`;

    const outputPath = path.join(this.workspace.path, filename);

    await this.presentationBuilder.create(outputPath, input.slides);

    this.daemon.logEvent(this.taskId, 'file_created', {
      path: filename,
      type: 'presentation',
      slides: input.slides.length,
    });

    return {
      success: true,
      path: filename,
    };
  }

  /**
   * Organize folder
   */
  async organizeFolder(input: {
    path: string;
    strategy: 'by_type' | 'by_date' | 'custom';
    rules?: any;
  }): Promise<{ success: boolean; changes: number }> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted');
    }

    const changes = await this.folderOrganizer.organize(
      input.path,
      input.strategy,
      input.rules
    );

    this.daemon.logEvent(this.taskId, 'file_modified', {
      action: 'organize',
      path: input.path,
      strategy: input.strategy,
      changes,
    });

    return {
      success: true,
      changes,
    };
  }
}
