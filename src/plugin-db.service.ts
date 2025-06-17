import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plugin, PluginDocument } from './schemas/plugin.schema';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface PluginFileInfo {
  path: string;
  content: string;
  size: number;
  lastModified: Date;
  type: string;
}

export interface CreatePluginDto {
  _id: string;
  userId: string;
  pluginName: string;
  description: string;
  minecraftVersion: string;
  dependencies?: string[];
  metadata: {
    author: string;
    version: string;
    mainClass: string;
    apiVersion: string;
  };
  diskPath: string;
}

@Injectable()
export class PluginDbService {
  private readonly logger = new Logger(PluginDbService.name);

  constructor(
    @InjectModel(Plugin.name) private pluginModel: Model<PluginDocument>,
  ) {}

  /**
   * Create a new plugin in MongoDB with files from disk
   */
  async createPlugin(createPluginDto: CreatePluginDto): Promise<PluginDocument> {
    this.logger.log(`📥 Creating plugin in MongoDB: ${createPluginDto.pluginName} for user ${createPluginDto.userId}`);
    
    try {
      // Read files from disk
      const files = await this.readFilesFromDisk(createPluginDto.diskPath);
      
      const plugin = new this.pluginModel({
        ...createPluginDto,
        files,
        totalFiles: files.length,
        totalSize: files.reduce((total, file) => total + file.size, 0),
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedPlugin = await plugin.save();
      
      this.logger.log(`✅ Plugin created in MongoDB with ${files.length} files, total size: ${savedPlugin.totalSize} bytes`);
      return savedPlugin;
    } catch (error) {
      this.logger.error(`❌ Failed to create plugin in MongoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update plugin files in MongoDB by re-reading from disk
   */
  async updatePluginFiles(userId: string, pluginName: string, diskPath: string): Promise<PluginDocument> {
    this.logger.log(`🔄 Updating plugin files in MongoDB: ${pluginName} for user ${userId}`);
    
    try {
      // Read current files from disk
      const files = await this.readFilesFromDisk(diskPath);
      
      const updatedPlugin = await this.pluginModel.findOneAndUpdate(
        { userId, pluginName },
        {
          $set: {
            files,
            totalFiles: files.length,
            totalSize: files.reduce((total, file) => total + file.size, 0),
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          }
        },
        { new: true }
      );

      if (!updatedPlugin) {
        throw new Error(`Plugin ${pluginName} not found for user ${userId}`);
      }

      this.logger.log(`✅ Plugin files updated in MongoDB: ${files.length} files, total size: ${updatedPlugin.totalSize} bytes`);
      return updatedPlugin;
    } catch (error) {
      this.logger.error(`❌ Failed to update plugin files in MongoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get plugin with files from MongoDB
   */
  async getPlugin(userId: string, pluginName: string): Promise<PluginDocument | null> {
    this.logger.log(`📄 Getting plugin from MongoDB: ${pluginName} for user ${userId}`);
    
    try {
      const plugin = await this.pluginModel.findOne({ userId, pluginName, isActive: true });
      
      if (plugin) {
        this.logger.log(`✅ Plugin found in MongoDB: ${plugin.files.length} files`);
      } else {
        this.logger.log(`❌ Plugin not found in MongoDB: ${pluginName} for user ${userId}`);
      }
      
      return plugin;
    } catch (error) {
      this.logger.error(`❌ Failed to get plugin from MongoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all plugins for a user
   */
  async getUserPlugins(userId: string): Promise<PluginDocument[]> {
    this.logger.log(`📋 Getting all plugins for user: ${userId}`);
    
    try {
      const plugins = await this.pluginModel.find({ userId, isActive: true }).sort({ updatedAt: -1 });
      
      this.logger.log(`✅ Found ${plugins.length} plugins for user ${userId}`);
      return plugins;
    } catch (error) {
      this.logger.error(`❌ Failed to get user plugins from MongoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check if plugin needs sync (compare disk modification time with DB)
   */
  async needsSync(userId: string, pluginName: string, diskPath: string): Promise<boolean> {
    try {
      const plugin = await this.getPlugin(userId, pluginName);
      if (!plugin) {
        return true; // Plugin doesn't exist in DB, needs sync
      }

      // Get latest modification time from disk
      const latestDiskModTime = await this.getDirectoryLastModified(diskPath);
      const dbLastSync = plugin.lastSyncedAt ? plugin.lastSyncedAt.getTime() : 0;
      
      const needsSync = latestDiskModTime > dbLastSync;
      
      if (needsSync) {
        this.logger.log(`🔄 Plugin ${pluginName} needs sync - disk: ${new Date(latestDiskModTime)}, db: ${new Date(dbLastSync)}`);
      }
      
      return needsSync;
    } catch (error) {
      this.logger.error(`❌ Failed to check sync status: ${error.message}`);
      return true; // Assume sync needed on error
    }
  }

  /**
   * Sync plugin with disk (create or update)
   */
  async syncWithDisk(createPluginDto: CreatePluginDto): Promise<PluginDocument> {
    this.logger.log(`🔄 Syncing plugin with disk: ${createPluginDto.pluginName} for user ${createPluginDto.userId}`);
    
    try {
      const existingPlugin = await this.getPlugin(createPluginDto.userId, createPluginDto.pluginName);
      
      if (existingPlugin) {
        // Update existing plugin
        return await this.updatePluginFiles(createPluginDto.userId, createPluginDto.pluginName, createPluginDto.diskPath);
      } else {
        // Create new plugin
        return await this.createPlugin(createPluginDto);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to sync plugin with disk: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete plugin from MongoDB
   */
  async deletePlugin(userId: string, pluginName: string): Promise<boolean> {
    this.logger.log(`🗑️ Deleting plugin from MongoDB: ${pluginName} for user ${userId}`);
    
    try {
      const result = await this.pluginModel.updateOne(
        { userId, pluginName },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
      
      const deleted = result.modifiedCount > 0;
      
      if (deleted) {
        this.logger.log(`✅ Plugin marked as inactive in MongoDB: ${pluginName}`);
      } else {
        this.logger.log(`❌ Plugin not found for deletion: ${pluginName} for user ${userId}`);
      }
      
      return deleted;
    } catch (error) {
      this.logger.error(`❌ Failed to delete plugin from MongoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get plugin files in Monaco Editor format
   */
  async getPluginFilesForEditor(userId: string, pluginName: string): Promise<{[path: string]: string}> {
    this.logger.log(`📁 Getting plugin files for Monaco Editor from MongoDB: ${pluginName} for user ${userId}`);
    
    try {
      const plugin = await this.getPlugin(userId, pluginName);
      
      if (!plugin) {
        throw new Error(`Plugin "${pluginName}" not found for user "${userId}"`);
      }

      const files: {[path: string]: string} = {};
      
      for (const file of plugin.files) {
        // Use forward slashes for web compatibility
        const normalizedPath = file.path.replace(/\\/g, '/');
        files[normalizedPath] = file.content;
      }
      
      this.logger.log(`✅ Retrieved ${Object.keys(files).length} files from MongoDB for Monaco Editor`);
      
      return files;
    } catch (error) {
      this.logger.error(`❌ Failed to get plugin files for editor from MongoDB: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getDbStats(): Promise<{
    totalPlugins: number;
    activePlugins: number;
    totalFiles: number;
    totalSize: number;
    lastSyncTimes: { [key: string]: Date };
  }> {
    try {
      const totalPlugins = await this.pluginModel.countDocuments({});
      const activePlugins = await this.pluginModel.countDocuments({ isActive: true });
      
      const aggregateResult = await this.pluginModel.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalFiles: { $sum: '$totalFiles' },
            totalSize: { $sum: '$totalSize' }
          }
        }
      ]);
      
      const { totalFiles = 0, totalSize = 0 } = aggregateResult[0] || {};
      
      // Get recent sync times
      const recentPlugins = await this.pluginModel
        .find({ isActive: true })
        .sort({ lastSyncedAt: -1 })
        .limit(10)
        .select('userId pluginName lastSyncedAt');
      
      const lastSyncTimes: { [key: string]: Date } = {};
      recentPlugins.forEach(plugin => {
        lastSyncTimes[`${plugin.userId}:${plugin.pluginName}`] = plugin.lastSyncedAt;
      });

      return {
        totalPlugins,
        activePlugins,
        totalFiles,
        totalSize,
        lastSyncTimes
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get database stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Read all files from a directory recursively
   */
  private async readFilesFromDisk(dirPath: string): Promise<PluginFileInfo[]> {
    const files: PluginFileInfo[] = [];
    
    const readDirectory = async (currentPath: string, relativePath: string = '') => {
      try {
        const items = await fs.readdir(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
          const stat = await fs.stat(itemPath);
          
          if (stat.isDirectory()) {
            // Skip target and .git directories
            if (item !== 'target' && item !== '.git' && !item.startsWith('.')) {
              await readDirectory(itemPath, relativeItemPath);
            }
          } else if (stat.isFile() && this.isTextFile(item)) {
            try {
              const content = await fs.readFile(itemPath, 'utf-8');
              const fileType = this.getFileType(item);
              
              files.push({
                path: relativeItemPath.replace(/\\/g, '/'), // Normalize path separators
                content,
                size: stat.size,
                lastModified: stat.mtime,
                type: fileType
              });
            } catch (readError) {
              this.logger.warn(`⚠️ Could not read file ${itemPath}: ${readError.message}`);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`⚠️ Could not read directory ${currentPath}: ${error.message}`);
      }
    };
    
    await readDirectory(dirPath);
    return files;
  }

  /**
   * Get the latest modification time of a directory (recursively)
   */
  private async getDirectoryLastModified(dirPath: string): Promise<number> {
    let latestTime = 0;
    
    const scanDirectory = async (currentPath: string) => {
      try {
        const items = await fs.readdir(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const stat = await fs.stat(itemPath);
          
          // Update latest time if this item is newer
          if (stat.mtimeMs > latestTime) {
            latestTime = stat.mtimeMs;
          }
          
          // Recursively check subdirectories (skip target and .git)
          if (stat.isDirectory() && item !== 'target' && item !== '.git' && !item.startsWith('.')) {
            await scanDirectory(itemPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    try {
      // Check the directory itself
      const dirStat = await fs.stat(dirPath);
      latestTime = dirStat.mtimeMs;
      
      // Scan all contents
      await scanDirectory(dirPath);
    } catch (error) {
      // Return 0 if we can't check the directory
      return 0;
    }
    
    return latestTime;
  }

  /**
   * Check if a file is a text file we want to include
   */
  private isTextFile(fileName: string): boolean {
    const textExtensions = ['.java', '.xml', '.yml', '.yaml', '.json', '.properties', '.md', '.txt'];
    const ext = path.extname(fileName).toLowerCase();
    return textExtensions.includes(ext);
  }

  /**
   * Get file type from extension
   */
  private getFileType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    
    switch (ext) {
      case '.java': return 'java';
      case '.xml': return 'xml';
      case '.yml':
      case '.yaml': return 'yaml';
      case '.json': return 'json';
      case '.properties': return 'properties';
      case '.md': return 'markdown';
      case '.txt': return 'text';
      default: return 'text';
    }
  }
}
