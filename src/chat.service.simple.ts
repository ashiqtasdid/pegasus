import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

@Injectable()
export class ChatService {
  private readonly generatedPath = path.join(process.cwd(), 'generated');
  private readonly indexPath = path.join(process.cwd(), 'plugin-indexes');

  /**
   * Generate simple plugin index for AI consumption
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
      const indexData: any = {
      plugin: pluginName,
      username: username,
      generated: new Date().toISOString(),
      files: []
    };
    
    // Check if plugin directory exists and get files
    if (await fs.pathExists(pluginPath)) {
      indexData.files = await this.getFilesWithContent(pluginPath);
    }
    
    // Write JSON index file
    await fs.writeFile(indexFilePath, JSON.stringify(indexData, null, 2), 'utf8');
    console.log(`📝 Chat Service: Plugin index generated at: ${indexFilePath}`);
    
    return indexFilePath;
  }

  /**
   * Get all files with their content for AI processing - SIMPLE VERSION
   * @param dirPath - Directory path to scan
   * @returns Promise<any[]> - Array of {path, content} objects
   */
  private async getFilesWithContent(dirPath: string): Promise<any[]> {
    const files: any[] = [];
    
    const scanDirectory = async (currentPath: string, relativePath: string = '') => {
      try {
        const items = await fs.readdir(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const relativeItemPath = path.join(relativePath, item).replace(/\\/g, '/');
          const stat = await fs.stat(itemPath);
          
          if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            
            // Only index text files that matter for AI
            const textFiles = ['.java', '.js', '.ts', '.py', '.txt', '.md', '.yml', '.yaml', '.json', '.xml', '.properties', '.html', '.css'];
            
            if (textFiles.includes(ext) || !ext) {
              try {
                const content = await fs.readFile(itemPath, 'utf8');
                files.push({
                  path: relativeItemPath,
                  content: content
                });
              } catch (err) {
                // Skip unreadable files
              }
            }
          } else if (stat.isDirectory()) {
            await scanDirectory(itemPath, relativeItemPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    await scanDirectory(dirPath);
    return files;
  }

  /**
   * Generate comprehensive index of all plugins for a user - SIMPLE VERSION
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
      const indexData: any = {
      username: username,
      generated: new Date().toISOString(),
      plugins: []
    };
    
    // Check if user directory exists
    if (await fs.pathExists(userPath)) {
      try {
        const plugins = await fs.readdir(userPath);
        
        for (const plugin of plugins) {
          const pluginPath = path.join(userPath, plugin);
          const stat = await fs.stat(pluginPath);
          
          if (stat.isDirectory()) {
            const files = await this.getFilesWithContent(pluginPath);
            indexData.plugins.push({
              name: plugin,
              files: files
            });
          }
        }
      } catch (error) {
        // Skip if can't read user directory
      }
    }
    
    // Write index file
    await fs.writeFile(indexFilePath, JSON.stringify(indexData, null, 2), 'utf8');
    console.log(`📝 Chat Service: User plugins index generated at: ${indexFilePath}`);
    
    return indexFilePath;
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
}
