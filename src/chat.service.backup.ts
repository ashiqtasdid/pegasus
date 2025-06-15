import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

@Injectable()
export class ChatService {
  private readonly generatedPath = path.join(process.cwd(), 'generated');
  private readonly indexPath = path.join(process.cwd(), 'plugin-indexes');
  /**
   * Generate plugin index file with directory structure in JSON format
   * @param pluginName - The name of the plugin to index
   * @param username - The username who owns the plugin
   * @returns Promise<string> - Path to the generated index file
   */
  private async generatePluginIndex(pluginName: string, username: string): Promise<string> {
    console.log(`📁 Chat Service: Generating plugin index for "${pluginName}" by user "${username}"`);
    
    const pluginPath = path.join(this.generatedPath, username, pluginName);
    const indexFileName = `${username}_${pluginName}_index.json`;
    const indexFilePath = path.join(this.indexPath, indexFileName);
    
    // Ensure index directory exists
    await fs.ensureDir(this.indexPath);
    
    const indexData = {
      metadata: {
        pluginName,
        username,
        generated: new Date().toISOString(),
        pluginPath,
        indexType: 'plugin',
        version: '2.0'
      },      status: {
        exists: false,
        accessible: false,
        errorMessage: null as string | null
      },      directoryStructure: {} as any,
      files: [] as any[],
      statistics: {
        totalFiles: 0,
        totalDirectories: 0,
        totalSize: 0,
        fileTypes: {}
      }
    };
    
    // Check if plugin directory exists
    if (await fs.pathExists(pluginPath)) {
      indexData.status.exists = true;
      indexData.status.accessible = true;
      
      try {
        // Generate directory tree structure
        indexData.directoryStructure = await this.generateDirectoryTreeJSON(pluginPath);
        
        // Index all files with details
        const fileDetails = await this.generateFileDetailsJSON(pluginPath);
        indexData.files = fileDetails.files;
        indexData.statistics = fileDetails.statistics;
        
      } catch (error) {
        indexData.status.accessible = false;
        indexData.status.errorMessage = error.message;
      }
    } else {
      indexData.status.errorMessage = `Plugin directory does not exist at: ${pluginPath}`;
    }
    
    // Write index file as formatted JSON
    const jsonContent = JSON.stringify(indexData, null, 2);
    await fs.writeFile(indexFilePath, jsonContent, 'utf8');
    console.log(`📝 Chat Service: Plugin index generated at: ${indexFilePath}`);
    
    return indexFilePath;
  }
  /**
   * Generate directory tree structure in JSON format
   * @param dirPath - Directory path to traverse
   * @returns Promise<object> - JSON object representing directory structure
   */
  private async generateDirectoryTreeJSON(dirPath: string): Promise<any> {
    const buildTree = async (currentPath: string, relativePath: string = ''): Promise<any> => {
      try {
        const items = await fs.readdir(currentPath);
        const sortedItems = items.sort();
        const tree: any = {};
        
        for (const item of sortedItems) {
          const itemPath = path.join(currentPath, item);
          const stat = await fs.stat(itemPath);
          const relativeItemPath = path.join(relativePath, item);
          
          if (stat.isDirectory()) {
            tree[item] = {
              type: 'directory',
              path: relativeItemPath,
              modified: stat.mtime.toISOString(),
              children: await buildTree(itemPath, relativeItemPath)
            };
          } else {
            tree[item] = {
              type: 'file',
              path: relativeItemPath,
              size: stat.size,
              extension: path.extname(item),
              modified: stat.mtime.toISOString()
            };
          }
        }
        
        return tree;
      } catch (error) {
        return { error: `Failed to read directory: ${error.message}` };
      }
    };
    
    return await buildTree(dirPath);
  }

  /**
   * Generate detailed file information
   * @param dirPath - Directory path to analyze
   * @returns Promise<string> - Formatted file details
   */
  private async generateFileDetails(dirPath: string): Promise<string> {
    let details = '';
    
    const analyzeDirectory = async (currentPath: string, relativePath: string = '') => {
      try {
        const items = await fs.readdir(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const relativeItemPath = path.join(relativePath, item);
          const stat = await fs.stat(itemPath);
          
          if (stat.isFile()) {
            const ext = path.extname(item);
            const size = stat.size;
            const modified = stat.mtime.toISOString();
              details += `\n📄 ${relativeItemPath}\n`;
            details += `   Size: ${size} bytes\n`;
            details += `   Type: ${ext || 'no extension'}\n`;
            details += `   Modified: ${modified}\n`;
            
            // Add full content for text files (expanded list of supported types)
            const textExtensions = [
              '.txt', '.md', '.yml', '.yaml', '.json', '.properties', '.xml', 
              '.java', '.js', '.ts', '.html', '.css', '.scss', '.less',
              '.py', '.rb', '.php', '.go', '.rs', '.kt', '.swift',
              '.c', '.cpp', '.h', '.hpp', '.cs', '.vb',
              '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.gitignore',
              '.env', '.config', '.ini', '.conf', '.log'
            ];
            
            const isTextFile = textExtensions.includes(ext.toLowerCase()) || 
                              item.toLowerCase().includes('readme') ||
                              item.toLowerCase().includes('changelog') ||
                              item.toLowerCase().includes('license') ||
                              item.toLowerCase().includes('makefile') ||
                              item.toLowerCase().includes('dockerfile') ||
                              !ext; // Files without extension are often text files
            
            if (isTextFile && size < 100000) { // Increased size limit to 100KB
              try {
                const content = await fs.readFile(itemPath, 'utf8');
                details += `   Full Content:\n   ┌${'─'.repeat(50)}\n`;
                
                // Add line numbers and proper indentation
                const lines = content.split('\n');
                const maxLineNumWidth = lines.length.toString().length;
                
                lines.forEach((line, index) => {
                  const lineNum = (index + 1).toString().padStart(maxLineNumWidth, ' ');
                  details += `   │ ${lineNum}: ${line}\n`;
                });
                
                details += `   └${'─'.repeat(50)}\n`;
                details += `   Lines: ${lines.length}\n`;
                details += `   Characters: ${content.length}\n`;
              } catch (err) {
                details += `   Content: Unable to read file (${err.message})\n`;
              }
            } else if (size >= 100000) {
              details += `   Content: File too large (${size} bytes) - skipped for indexing\n`;
            } else {
              details += `   Content: Binary file - content not indexed\n`;
            }
            
          } else if (stat.isDirectory()) {
            details += `\n📁 ${relativeItemPath}/\n`;
            details += `   Type: Directory\n`;
            details += `   Modified: ${stat.mtime.toISOString()}\n`;
            
            // Recursively analyze subdirectories
            await analyzeDirectory(itemPath, relativeItemPath);
          }
        }
      } catch (error) {
        details += `\n❌ Error analyzing ${relativePath}: ${error.message}\n`;
      }
    };
    
    await analyzeDirectory(dirPath);
    return details;
  }

  /**
   * Generate detailed file information in JSON format
   * @param dirPath - Directory path to analyze
   * @returns Promise<object> - JSON object with file details and statistics
   */
  private async generateFileDetailsJSON(dirPath: string): Promise<{
    files: any[];
    statistics: {
      totalFiles: number;
      totalDirectories: number;
      totalSize: number;
      fileTypes: { [key: string]: number };
    };
  }> {
    const files: any[] = [];
    const statistics = {
      totalFiles: 0,
      totalDirectories: 0,
      totalSize: 0,
      fileTypes: {} as { [key: string]: number }
    };
    
    const analyzeDirectory = async (currentPath: string, relativePath: string = '') => {
      try {
        const items = await fs.readdir(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const relativeItemPath = path.join(relativePath, item);
          const stat = await fs.stat(itemPath);
          
          if (stat.isFile()) {
            const ext = path.extname(item);
            const size = stat.size;
            
            // Update statistics
            statistics.totalFiles++;
            statistics.totalSize += size;
            const fileType = ext || 'no extension';
            statistics.fileTypes[fileType] = (statistics.fileTypes[fileType] || 0) + 1;
            
            const fileInfo: any = {
              name: item,
              path: relativeItemPath,
              type: 'file',
              size,
              extension: ext,
              modified: stat.mtime.toISOString(),
              readable: true,
              content: null,
              contentPreview: null,
              lineCount: 0,
              characterCount: 0
            };
            
            // Add full content for text files
            const textExtensions = [
              '.txt', '.md', '.yml', '.yaml', '.json', '.properties', '.xml', 
              '.java', '.js', '.ts', '.html', '.css', '.scss', '.less',
              '.py', '.rb', '.php', '.go', '.rs', '.kt', '.swift',
              '.c', '.cpp', '.h', '.hpp', '.cs', '.vb',
              '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.gitignore',
              '.env', '.config', '.ini', '.conf', '.log'
            ];
            
            const isTextFile = textExtensions.includes(ext.toLowerCase()) || 
                              item.toLowerCase().includes('readme') ||
                              item.toLowerCase().includes('changelog') ||
                              item.toLowerCase().includes('license') ||
                              item.toLowerCase().includes('makefile') ||
                              item.toLowerCase().includes('dockerfile') ||
                              !ext; // Files without extension are often text files
            
            if (isTextFile && size < 100000) { // 100KB limit
              try {
                const content = await fs.readFile(itemPath, 'utf8');
                const lines = content.split('\n');
                
                fileInfo.content = content;
                fileInfo.lineCount = lines.length;
                fileInfo.characterCount = content.length;
                fileInfo.contentPreview = content.length > 500 ? content.substring(0, 500) + '...' : content;
                fileInfo.contentType = 'text';
                
                // Add numbered lines for JSON structure
                fileInfo.numberedLines = lines.map((line, index) => ({
                  number: index + 1,
                  content: line
                }));
                
              } catch (err) {
                fileInfo.content = null;
                fileInfo.readable = false;
                fileInfo.error = `Unable to read file: ${err.message}`;
              }
            } else if (size >= 100000) {
              fileInfo.contentType = 'large';
              fileInfo.note = `File too large (${size} bytes) - content not indexed`;
            } else {
              fileInfo.contentType = 'binary';
              fileInfo.note = 'Binary file - content not indexed';
            }
            
            files.push(fileInfo);
            
          } else if (stat.isDirectory()) {
            statistics.totalDirectories++;
            
            const dirInfo = {
              name: item,
              path: relativeItemPath,
              type: 'directory',
              modified: stat.mtime.toISOString()
            };
            
            files.push(dirInfo);
            
            // Recursively analyze subdirectories
            await analyzeDirectory(itemPath, relativeItemPath);
          }
        }
      } catch (error) {
        files.push({
          path: relativePath,
          type: 'error',
          error: `Error analyzing directory: ${error.message}`
        });
      }
    };
    
    await analyzeDirectory(dirPath);
    return { files, statistics };
  }

  /**
   * Check if a user has a specific plugin
   * @param pluginName - The name of the plugin to check
   * @param username - The username to check for plugin ownership
   * @returns Promise<boolean> - True if user has the plugin, false otherwise
   */
  async checkUserHasPlugin(pluginName: string, username: string): Promise<boolean> {
    console.log(`💬 Chat Service: Checking if user "${username}" has plugin "${pluginName}"`);
    
    // Validate input parameters
    if (!pluginName || pluginName.trim().length === 0) {
      console.log('❌ Chat Service: Plugin name is required');
      return false;
    }

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return false;
    }

    // Normalize inputs
    const normalizedPluginName = pluginName.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    console.log(`🔍 Chat Service: Normalized check - plugin: "${normalizedPluginName}", user: "${normalizedUsername}"`);

    // Generate plugin index file
    try {
      const indexFilePath = await this.generatePluginIndex(normalizedPluginName, normalizedUsername);
      console.log(`📊 Chat Service: Plugin index created at: ${indexFilePath}`);
    } catch (error) {
      console.error(`❌ Chat Service: Failed to generate plugin index: ${error.message}`);
    }

    // TODO: Implement actual logic to check user plugin ownership
    // For now, return true as placeholder
    console.log(`✅ Chat Service: User "${normalizedUsername}" has plugin "${normalizedPluginName}": true (placeholder)`);
    
    return true;
  }
  /**
   * Get user's plugin list (placeholder for future implementation)
   * @param username - The username to get plugins for
   * @returns Promise<string[]> - Array of plugin names the user has
   */
  async getUserPlugins(username: string): Promise<string[]> {
    console.log(`📋 Chat Service: Getting plugin list for user "${username}"`);
    
    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return [];
    }

    const normalizedUsername = username.trim().toLowerCase();

    // Generate comprehensive user plugins index
    try {
      await this.generateUserPluginsIndex(normalizedUsername);
    } catch (error) {
      console.error(`❌ Chat Service: Failed to generate user plugins index: ${error.message}`);
    }

    // TODO: Implement actual logic to get user's plugins
    // For now, return empty array as placeholder
    console.log(`📋 Chat Service: User "${normalizedUsername}" plugins: [] (placeholder)`);
    
    return [];
  }
  /**
   * Generate comprehensive index of all plugins for a user in JSON format
   * @param username - The username to index plugins for
   * @returns Promise<string> - Path to the generated index file
   */
  private async generateUserPluginsIndex(username: string): Promise<string> {
    console.log(`📁 Chat Service: Generating comprehensive plugins index for user "${username}"`);
    
    const userPath = path.join(this.generatedPath, username);
    const indexFileName = `${username}_all_plugins_index.json`;
    const indexFilePath = path.join(this.indexPath, indexFileName);
    
    // Ensure index directory exists
    await fs.ensureDir(this.indexPath);
    
    const indexData = {
      metadata: {
        username,
        generated: new Date().toISOString(),
        userPath,
        indexType: 'user_plugins',
        version: '2.0'
      },
      status: {
        exists: false,
        accessible: false,
        errorMessage: null as string | null
      },
      plugins: [] as any[],
      statistics: {
        totalPlugins: 0,
        totalFiles: 0,
        totalSize: 0
      }
    };
    
    // Check if user directory exists
    if (await fs.pathExists(userPath)) {
      indexData.status.exists = true;
      indexData.status.accessible = true;
      
      try {
        const plugins = await fs.readdir(userPath);
        indexData.statistics.totalPlugins = plugins.length;
        
        for (const plugin of plugins) {
          const pluginPath = path.join(userPath, plugin);
          const stat = await fs.stat(pluginPath);
          
          if (stat.isDirectory()) {
            const pluginInfo: any = {
              name: plugin,
              path: pluginPath,
              created: stat.birthtime.toISOString(),
              modified: stat.mtime.toISOString(),
              directoryStructure: {},
              files: [],
              statistics: {
                totalFiles: 0,
                totalDirectories: 0,
                totalSize: 0,
                fileTypes: {}
              }
            };
            
            try {
              // Generate directory tree for this plugin
              pluginInfo.directoryStructure = await this.generateDirectoryTreeJSON(pluginPath);
              
              // Get file details and statistics
              const fileDetails = await this.generateFileDetailsJSON(pluginPath);
              pluginInfo.files = fileDetails.files;
              pluginInfo.statistics = fileDetails.statistics;
              
              // Update global statistics
              indexData.statistics.totalFiles += fileDetails.statistics.totalFiles;
              indexData.statistics.totalSize += fileDetails.statistics.totalSize;
              
            } catch (error) {
              pluginInfo.error = `Failed to analyze plugin: ${error.message}`;
            }
            
            indexData.plugins.push(pluginInfo);
          }
        }
        
      } catch (error) {
        indexData.status.accessible = false;
        indexData.status.errorMessage = `Failed to read user directory: ${error.message}`;
      }
      
    } else {
      indexData.status.errorMessage = `User directory does not exist at: ${userPath}`;
    }
    
    // Write index file as formatted JSON
    const jsonContent = JSON.stringify(indexData, null, 2);
    await fs.writeFile(indexFilePath, jsonContent, 'utf8');
    console.log(`📝 Chat Service: User plugins index generated at: ${indexFilePath}`);
    
    return indexFilePath;
  }

  /**
   * Count total files in a directory recursively
   * @param dirPath - Directory path to count files in
   * @returns Promise<number> - Total number of files
   */
  private async countFilesInDirectory(dirPath: string): Promise<number> {
    let count = 0;
    
    const countRecursive = async (currentPath: string) => {
      try {
        const items = await fs.readdir(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const stat = await fs.stat(itemPath);
          
          if (stat.isFile()) {
            count++;
          } else if (stat.isDirectory()) {
            await countRecursive(itemPath);
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not count files in ${currentPath}: ${error.message}`);
      }
    };
    
    await countRecursive(dirPath);
    return count;
  }
  /**
   * Add plugin to user (placeholder for future implementation)
   * @param pluginName - The name of the plugin to add
   * @param username - The username to add plugin to
   * @returns Promise<boolean> - True if successfully added, false otherwise
   */
  async addPluginToUser(pluginName: string, username: string): Promise<boolean> {
    console.log(`➕ Chat Service: Adding plugin "${pluginName}" to user "${username}"`);
    
    if (!pluginName || pluginName.trim().length === 0) {
      console.log('❌ Chat Service: Plugin name is required');
      return false;
    }

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return false;
    }

    const normalizedPluginName = pluginName.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    // Generate plugin index file for the added plugin
    try {
      const indexFilePath = await this.generatePluginIndex(normalizedPluginName, normalizedUsername);
      console.log(`📊 Chat Service: Plugin index created for added plugin at: ${indexFilePath}`);
    } catch (error) {
      console.error(`❌ Chat Service: Failed to generate plugin index for add operation: ${error.message}`);
    }

    // TODO: Implement actual logic to add plugin to user
    // For now, return true as placeholder
    console.log(`✅ Chat Service: Plugin "${normalizedPluginName}" added to user "${normalizedUsername}" (placeholder)`);
    
    return true;
  }

  /**
   * Remove plugin from user (placeholder for future implementation)
   * @param pluginName - The name of the plugin to remove
   * @param username - The username to remove plugin from
   * @returns Promise<boolean> - True if successfully removed, false otherwise
   */
  async removePluginFromUser(pluginName: string, username: string): Promise<boolean> {
    console.log(`➖ Chat Service: Removing plugin "${pluginName}" from user "${username}"`);
    
    if (!pluginName || pluginName.trim().length === 0) {
      console.log('❌ Chat Service: Plugin name is required');
      return false;
    }

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return false;
    }

    const normalizedPluginName = pluginName.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    // Generate plugin index file before removal (for record keeping)
    try {
      const indexFilePath = await this.generatePluginIndex(normalizedPluginName, normalizedUsername);
      console.log(`📊 Chat Service: Plugin index created for removal record at: ${indexFilePath}`);
    } catch (error) {
      console.error(`❌ Chat Service: Failed to generate plugin index for remove operation: ${error.message}`);
    }

    // TODO: Implement actual logic to remove plugin from user
    // For now, return true as placeholder
    console.log(`✅ Chat Service: Plugin "${normalizedPluginName}" removed from user "${normalizedUsername}" (placeholder)`);
    
    return true;
  }

  /**
   * Convert JSON tree structure to string format for display compatibility
   * @param treeJSON - JSON tree structure
   * @param prefix - Prefix for indentation
   * @returns string - Formatted tree string
   */
  private convertTreeJSONToString(treeJSON: any, prefix: string = ''): string {
    let result = '';
    
    if (treeJSON.error) {
      return `${prefix}❌ ${treeJSON.error}\n`;
    }
    
    const entries = Object.entries(treeJSON);
    entries.forEach(([name, info]: [string, any], index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const icon = info.type === 'directory' ? '📁' : '📄';
      
      result += `${prefix}${connector}${icon} ${name}\n`;
      
      if (info.type === 'directory' && info.children) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        result += this.convertTreeJSONToString(info.children, newPrefix);
      }
    });
    
    return result;
  }
}
