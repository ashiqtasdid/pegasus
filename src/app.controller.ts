import { Controller, Get, Post, Body, Res, Param, NotFoundException } from '@nestjs/common';
import { AppService } from './app.service';
import { PluginProject } from './ai.service';
import { MavenService, CompilationResult } from './maven.service';
import { DiskReaderService, DiskProjectInfo } from './disk-reader.service';
import { ChatService } from './chat.service';
import { PluginDbService } from './plugin-db.service';
import { Response } from 'express';
import { join } from 'path';
import * as fs from 'fs-extra';
import * as path from 'path';

@Controller()
export class AppController {  constructor(
    private readonly appService: AppService,
    private readonly mavenService: MavenService,
    private readonly diskReaderService: DiskReaderService,
    private readonly chatService: ChatService,
    private readonly pluginDbService: PluginDbService
  ) {}@Get()
  getRoot(@Res() res: Response) {
    console.log('📍 Root route accessed - redirecting to /app');
    return res.redirect('/app');
  }

  @Get('app')
  getApp(@Res() res: Response) {
    console.log('🎮 Web UI accessed - serving main application');
    return res.sendFile(join(process.cwd(), 'public', 'index.html'));
  }

  @Get('health')
  getHealth() {
    console.log('🏥 Health check requested');
    
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();
    const memoryUsage = process.memoryUsage();
    
    const healthInfo = {
      status: 'healthy',
      timestamp,
      uptime: {
        seconds: Math.floor(uptime),
        human: this.formatUptime(uptime)
      },
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100 // MB
      },
      version: process.version,
      platform: process.platform,
      pid: process.pid
    };
    
    console.log(`✅ Health check completed - Uptime: ${healthInfo.uptime.human}, Memory: ${healthInfo.memory.used}MB`);
    return healthInfo;
  }

  @Get('health/simple')
  getSimpleHealth() {
    console.log('🏥 Simple health check requested');
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString() 
    };
  }

  @Post('plugin/generate')
  async generatePlugin(
    @Body('prompt') prompt: string,
    @Body('userId') userId: string,
    @Body('name') name?: string,
    @Body('autoCompile') autoCompile: boolean = true
  ): Promise<string> {
    console.log(`🎯 Plugin generation requested:`, {
      userId,
      name: name || 'auto-generated',
      autoCompile,
      promptLength: prompt?.length || 0
    });
    
    const startTime = Date.now();
    const result = await this.appService.generateAndCompilePlugin(prompt, userId, name, autoCompile);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Plugin generation completed in ${duration}ms for user: ${userId}`);
    return result;
  }  @Post('ai/generate-code')
  async generateCode(
    @Body('prompt') prompt: string,
    @Body('pluginName') pluginName: string = 'CustomPlugin'
  ): Promise<{ enhancedPrompt: string; pluginProject: PluginProject }> {
    console.log(`🧩 Code-only generation requested:`, {
      pluginName,
      promptLength: prompt?.length || 0
    });
    
    const startTime = Date.now();
    const result = await this.appService.generateCodeOnly(prompt, pluginName);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Code-only generation completed in ${duration}ms for plugin: ${pluginName}`);
    return result;
  }
  @Post('plugin/compile')
  async compilePlugin(
    @Body('userId') userId: string,
    @Body('pluginName') pluginName: string
  ): Promise<CompilationResult> {
    console.log(`🔨 Compilation requested:`, { userId, pluginName });
    
    const startTime = Date.now();
    const result = await this.mavenService.compilePluginByUserAndName(userId, pluginName);
    const duration = Date.now() - startTime;
    
    console.log(`${result.success ? '✅' : '❌'} Compilation ${result.success ? 'completed' : 'failed'} in ${duration}ms:`, {
      userId,
      pluginName,
      success: result.success,
      jarPath: result.jarPath
    });
    
    return result;
  }

  @Post('plugin/compile-path')
  async compilePluginByPath(
    @Body('projectPath') projectPath: string
  ): Promise<CompilationResult> {
    console.log(`🔨 Path-based compilation requested for: ${projectPath}`);
    
    const startTime = Date.now();
    const result = await this.mavenService.compilePlugin(projectPath);
    const duration = Date.now() - startTime;
    
    console.log(`${result.success ? '✅' : '❌'} Path compilation ${result.success ? 'completed' : 'failed'} in ${duration}ms`);
    return result;
  }

  @Post('plugin/status')
  async getCompilationStatus(
    @Body('userId') userId: string,
    @Body('pluginName') pluginName: string
  ): Promise<{
    hasTarget: boolean;
    hasJar: boolean;
    jarFiles: string[];
    lastModified?: Date;
  }> {
    console.log(`📊 Status check requested:`, { userId, pluginName });
    
    const projectPath = `${process.cwd()}/generated/${userId}/${pluginName}`;
    const result = await this.mavenService.getCompilationStatus(projectPath);
    
    console.log(`📊 Status result:`, {
      userId,
      pluginName,
      hasTarget: result.hasTarget,
      hasJar: result.hasJar,
      jarCount: result.jarFiles?.length || 0
    });
    
    return result;
  }
  @Post('plugin/clean')
  async cleanProject(
    @Body('userId') userId: string,
    @Body('pluginName') pluginName: string
  ): Promise<{ success: boolean; message: string }> {
    console.log(`🧹 Clean requested:`, { userId, pluginName });
    
    const projectPath = `${process.cwd()}/generated/${userId}/${pluginName}`;
    const success = await this.mavenService.cleanProject(projectPath);
    
    console.log(`${success ? '✅' : '❌'} Clean ${success ? 'completed' : 'failed'}:`, {
      userId,
      pluginName,
      success
    });
    
    return {
      success,
      message: success ? 'Project cleaned successfully' : 'Failed to clean project'
    };
  }
  @Post('plugin/fix-errors')
  async fixPluginErrors(
    @Body('userId') userId: string,
    @Body('pluginName') pluginName: string,
    @Body('maxIterations') maxIterations: number = 3
  ): Promise<{ success: boolean; message: string; fixAttempted: boolean; iterations?: number; operationsApplied?: number }> {
    console.log(`🔧 Error fix requested:`, { userId, pluginName, maxIterations });
    
    const startTime = Date.now();
    const result = await this.appService.attemptErrorFix(userId, pluginName, maxIterations);
    const duration = Date.now() - startTime;
    
    console.log(`${result.success ? '✅' : '❌'} Error fix ${result.success ? 'completed' : 'failed'} in ${duration}ms:`, {
      userId,
      pluginName,
      success: result.success,
      fixAttempted: result.fixAttempted,
      iterations: result.iterations
    });
    
    return {
      success: result.success,
      message: result.message,
      fixAttempted: result.fixAttempted,
      iterations: result.iterations,
      operationsApplied: result.operationsApplied
    };
  }

  @Post('plugin/generate-and-compile')
  async generateAndCompilePlugin(
    @Body('prompt') prompt: string,
    @Body('userId') userId: string,
    @Body('name') name?: string,
    @Body('compile') compile: boolean = true
  ): Promise<string> {
    console.log(`🚀 Generate-and-compile requested:`, {
      userId,
      name: name || 'auto-generated',
      compile,
      promptLength: prompt?.length || 0
    });
    
    const startTime = Date.now();
    const result = await this.appService.generateAndCompilePlugin(prompt, userId, name, compile);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Generate-and-compile completed in ${duration}ms for user: ${userId}`);
    return result;
  }
  
  @Post('plugin/generate-only')
  async generatePluginOnly(
    @Body('prompt') prompt: string,
    @Body('userId') userId: string,
    @Body('name') name?: string
  ): Promise<string> {
    console.log(`📝 Generate-only requested:`, {
      userId,
      name: name || 'auto-generated',
      promptLength: prompt?.length || 0
    });
    
    const startTime = Date.now();
    const result = await this.appService.generatePluginOnly(prompt, userId, name);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Generate-only completed in ${duration}ms for user: ${userId}`);
    return result;
  }  

  @Post('plugin/read')
  async readProjectFromDisk(
    @Body('userId') userId: string,
    @Body('pluginName') pluginName: string
  ): Promise<DiskProjectInfo> {
    console.log(`📖 Project read requested:`, { userId, pluginName });
    
    const startTime = Date.now();
    const result = await this.diskReaderService.readProjectFromDisk(userId, pluginName);
    const duration = Date.now() - startTime;
    
    console.log(`${result.projectExists ? '✅' : '❌'} Project read ${result.projectExists ? 'completed' : 'failed'} in ${duration}ms:`, {
      userId,
      pluginName,
      exists: result.projectExists,
      fileCount: result.pluginProject?.files?.length || 0
    });
    
    return result;
  }

  @Get('plugin/download/:userId/:pluginName')
  async downloadPlugin(
    @Param('userId') userId: string,
    @Param('pluginName') pluginName: string,
    @Res() res: Response
  ): Promise<void> {
    console.log(`📥 JAR download requested:`, { userId, pluginName });
    
    try {
      const projectPath = path.join(process.cwd(), 'generated', userId, pluginName);
      const targetDir = path.join(projectPath, 'target');
      
      console.log(`📁 Download Service: Checking target directory: ${targetDir}`);
      
      // Check if target directory exists
      if (!await fs.pathExists(targetDir)) {
        console.log(`❌ Download Service: Target directory not found`);
        throw new NotFoundException('Plugin has not been compiled yet. Please compile the plugin first.');
      }
      
      // Find JAR files
      const files = await fs.readdir(targetDir);
      const jarFiles = files.filter(file => 
        file.endsWith('.jar') && 
        !file.includes('-sources.jar') && 
        !file.includes('-javadoc.jar') &&
        !file.includes('-original.jar')
      );
      
      console.log(`📦 Download Service: Found ${jarFiles.length} JAR files: ${jarFiles.join(', ')}`);
      
      if (jarFiles.length === 0) {
        console.log(`❌ Download Service: No JAR files found`);
        throw new NotFoundException('No compiled JAR file found. Please compile the plugin first.');
      }
      
      // Use the first (main) JAR file
      const jarFile = jarFiles[0];
      const jarPath = path.join(targetDir, jarFile);
      
      console.log(`📦 Download Service: Preparing download for: ${jarFile}`);
      
      // Check if file exists
      if (!await fs.pathExists(jarPath)) {
        console.log(`❌ Download Service: JAR file not found at path: ${jarPath}`);
        throw new NotFoundException('JAR file not found.');
      }
      
      // Get file stats
      const stats = await fs.stat(jarPath);
      const fileSize = stats.size;
      
      console.log(`📊 Download Service: JAR file size: ${fileSize} bytes`);
      
      // Set response headers for file download
      res.setHeader('Content-Type', 'application/java-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${jarFile}"`);
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Cache-Control', 'no-cache');
      
      console.log(`📤 Download Service: Starting file stream for ${jarFile}`);
      
      // Stream the file
      const fileStream = fs.createReadStream(jarPath);
      
      fileStream.on('error', (error) => {
        console.error(`❌ Download Service: Stream error:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading JAR file' });
        }
      });
      
      fileStream.on('end', () => {
        console.log(`✅ Download Service: Successfully streamed ${jarFile} (${fileSize} bytes)`);
      });
      
      fileStream.pipe(res);
      
    } catch (error) {
      console.error(`❌ Download Service: Download failed:`, error);
      
      if (error instanceof NotFoundException) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error during download' });
      }
    }
  }

  @Get('plugin/download-info/:userId/:pluginName')
  async getDownloadInfo(
    @Param('userId') userId: string,
    @Param('pluginName') pluginName: string
  ): Promise<{
    available: boolean;
    jarFile?: string;
    fileSize?: number;
    lastModified?: string;
    downloadUrl?: string;
  }> {
    console.log(`📋 Download info requested:`, { userId, pluginName });
    
    try {
      const projectPath = path.join(process.cwd(), 'generated', userId, pluginName);
      const targetDir = path.join(projectPath, 'target');
      
      if (!await fs.pathExists(targetDir)) {
        console.log(`❌ Download Info: Target directory not found`);
        return { available: false };
      }
      
      const files = await fs.readdir(targetDir);
      const jarFiles = files.filter(file => 
        file.endsWith('.jar') && 
        !file.includes('-sources.jar') && 
        !file.includes('-javadoc.jar') &&
        !file.includes('-original.jar')
      );
      
      if (jarFiles.length === 0) {
        console.log(`❌ Download Info: No JAR files found`);
        return { available: false };
      }
      
      const jarFile = jarFiles[0];
      const jarPath = path.join(targetDir, jarFile);
      const stats = await fs.stat(jarPath);
      
      const result = {
        available: true,
        jarFile,
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
        downloadUrl: `/plugin/download/${userId}/${pluginName}`
      };
      
      console.log(`✅ Download Info: JAR available:`, {
        jarFile,
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString()
      });
      
      return result;
      
    } catch (error) {
      console.error(`❌ Download Info: Error getting download info:`, error);
      return { available: false };
    }
  }

  @Post('plugin/check-exists')
  async checkProjectExists(
    @Body('userId') userId: string,
    @Body('pluginName') pluginName: string
  ): Promise<{
    exists: boolean;
    hasCompiledJar: boolean;
    projectPath?: string;
    lastModified?: string;
  }> {
    console.log(`🔍 Project existence check requested:`, { userId, pluginName });
    
    const result = await this.appService.checkProjectExists(userId, pluginName);
    
    console.log(`📊 Project existence result:`, {
      userId,
      pluginName,
      exists: result.exists,
      hasCompiledJar: result.hasCompiledJar
    });
    
    return {
      exists: result.exists,
      hasCompiledJar: result.hasCompiledJar,
      projectPath: result.projectPath,
      lastModified: result.lastModified?.toISOString()
    };
  }

  /**
   * Check if a user has a specific plugin
   */
  @Post('/chat/check-user-plugin')
  async checkUserHasPlugin(@Body() body: { pluginName: string; username: string }) {
    console.log('💬 Chat endpoint: Check user plugin requested:', body);
    
    try {
      const hasPlugin = await this.chatService.checkUserHasPlugin(body.pluginName, body.username);
      
      console.log(`💬 Chat endpoint: User ${body.username} has plugin ${body.pluginName}: ${hasPlugin}`);
      
      return {
        success: true,
        hasPlugin,
        pluginName: body.pluginName,
        username: body.username,
        message: hasPlugin 
          ? `User ${body.username} has plugin ${body.pluginName}`
          : `User ${body.username} does not have plugin ${body.pluginName}`
      };
    } catch (error) {
      console.error('❌ Chat endpoint: Error checking user plugin:', error);
      return {
        success: false,
        hasPlugin: false,
        error: error.message || 'Failed to check user plugin'
      };
    }
  }

  /**
   * Get user's plugin list
   */
  @Post('/chat/get-user-plugins')
  async getUserPlugins(@Body() body: { username: string }) {
    console.log('📋 Chat endpoint: Get user plugins requested:', body);
    
    try {
      const plugins = await this.chatService.getUserPlugins(body.username);
      
      console.log(`📋 Chat endpoint: User ${body.username} has ${plugins.length} plugins`);
      
      return {
        success: true,
        username: body.username,
        plugins,
        count: plugins.length
      };
    } catch (error) {
      console.error('❌ Chat endpoint: Error getting user plugins:', error);
      return {
        success: false,
        plugins: [],
        error: error.message || 'Failed to get user plugins'
      };
    }
  }

  /**
   * Add plugin to user
   */
  @Post('/chat/add-user-plugin')
  async addPluginToUser(@Body() body: { pluginName: string; username: string }) {
    console.log('➕ Chat endpoint: Add plugin to user requested:', body);
    
    try {
      const success = await this.chatService.addPluginToUser(body.pluginName, body.username);
      
      console.log(`➕ Chat endpoint: Add plugin ${body.pluginName} to user ${body.username}: ${success}`);
      
      return {
        success,
        pluginName: body.pluginName,
        username: body.username,
        message: success 
          ? `Plugin ${body.pluginName} added to user ${body.username}`
          : `Failed to add plugin ${body.pluginName} to user ${body.username}`
      };
    } catch (error) {
      console.error('❌ Chat endpoint: Error adding plugin to user:', error);
      return {
        success: false,
        error: error.message || 'Failed to add plugin to user'
      };
    }
  }

  /**
   * Remove plugin from user
   */
  @Post('/chat/remove-user-plugin')
  async removePluginFromUser(@Body() body: { pluginName: string; username: string }) {
    console.log('➖ Chat endpoint: Remove plugin from user requested:', body);
    
    try {
      const success = await this.chatService.removePluginFromUser(body.pluginName, body.username);
      
      console.log(`➖ Chat endpoint: Remove plugin ${body.pluginName} from user ${body.username}: ${success}`);
      
      return {
        success,
        pluginName: body.pluginName,        username: body.username,
        message: success 
          ? `Plugin ${body.pluginName} removed from user ${body.username}`
          : `Failed to remove plugin ${body.pluginName} from user ${body.username}`
      };
    } catch (error) {
      console.error('❌ Chat endpoint: Error removing plugin from user:', error);
      return {
        success: false,
        error: error.message || 'Failed to remove plugin from user'
      };
    }
  }

  /**
   * New Chat System - Process chat messages with AI intent analysis
   */
  @Post('/chat/message')
  async processChatMessage(@Body() body: any) {
    console.log('💬 Chat endpoint: Process chat message requested:', body);
    
    try {
      if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
        return {
          success: false,
          error: 'Message is required and must be a non-empty string'
        };
      }

      if (!body.username || typeof body.username !== 'string' || body.username.trim().length === 0) {
        return {
          success: false,
          error: 'Username is required and must be a non-empty string'
        };
      }

      const response = await this.chatService.processChat(
        body.message.trim(),
        body.username.trim(),
        body.pluginName?.trim() || undefined
      );
      
      console.log(`💬 Chat endpoint: Chat processed successfully for user ${body.username}`);
      return response;
    } catch (error) {
      console.error('❌ Chat endpoint: Error processing chat message:', error);
      return {
        success: false,
        error: error.message || 'Failed to process chat message'
      };
    }
  }

  /**
   * Get plugin files for Monaco Editor
   */
  @Post('/plugin/files')
  async getPluginFiles(@Body() body: any) {
    console.log('📁 Plugin files endpoint: Get plugin files requested:', body);
    
    try {
      if (!body.userId || typeof body.userId !== 'string' || body.userId.trim().length === 0) {
        return {
          success: false,
          error: 'userId is required and must be a non-empty string'
        };
      }

      if (!body.pluginName || typeof body.pluginName !== 'string' || body.pluginName.trim().length === 0) {
        return {
          success: false,
          error: 'pluginName is required and must be a non-empty string'
        };
      }

      const files = await this.chatService.getPluginFilesForEditor(
        body.userId.trim(),
        body.pluginName.trim()
      );
      
      console.log(`📁 Plugin files endpoint: Retrieved ${Object.keys(files).length} files for user ${body.userId}, plugin ${body.pluginName}`);
      
      return {
        success: true,
        files
      };
    } catch (error) {
      console.error('❌ Plugin files endpoint: Error getting plugin files:', error);
      return {
        success: false,
        error: error.message || 'Failed to get plugin files'
      };
    }
  }

  /**
   * Clear plugin files cache
   */
  @Post('/plugin/clear-cache')
  async clearPluginFilesCache(@Body() body: any) {
    console.log('🗑️ Cache clear endpoint: Clear cache requested:', body);
    
    try {
      if (body.userId && body.pluginName) {
        // Clear cache for specific plugin
        this.chatService.clearPluginFilesCache(body.userId.trim(), body.pluginName.trim());
        console.log(`🗑️ Cache clear endpoint: Cleared cache for plugin ${body.pluginName} by user ${body.userId}`);
        return {
          success: true,
          message: `Cache cleared for plugin "${body.pluginName}" by user "${body.userId}"`
        };
      } else if (body.userId) {
        // Clear cache for all plugins by user
        this.chatService.clearPluginFilesCache(body.userId.trim());
        console.log(`🗑️ Cache clear endpoint: Cleared cache for all plugins by user ${body.userId}`);
        return {
          success: true,
          message: `Cache cleared for all plugins by user "${body.userId}"`
        };
      } else {
        // Clear entire cache
        this.chatService.clearPluginFilesCache();
        console.log(`🗑️ Cache clear endpoint: Cleared entire cache`);
        return {
          success: true,
          message: 'Entire plugin files cache cleared'
        };
      }
    } catch (error) {
      console.error('❌ Cache clear endpoint: Error clearing cache:', error);
      return {
        success: false,
        error: error.message || 'Failed to clear cache'
      };
    }
  }

  /**
   * Get cache statistics
   */
  @Get('/plugin/cache-stats')
  async getCacheStats() {
    console.log('📊 Cache stats endpoint: Get cache stats requested');
    
    try {
      const stats = this.chatService.getCacheStats();
      
      console.log(`📊 Cache stats endpoint: Retrieved stats - ${stats.totalEntries} cached entries`);
      
      return {
        success: true,
        stats: {
          totalEntries: stats.totalEntries,
          cacheKeys: stats.cacheKeys,
          cacheSize: stats.totalEntries
        }
      };
    } catch (error) {
      console.error('❌ Cache stats endpoint: Error getting cache stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to get cache stats'
      };
    }
  }  /**
   * Format uptime in human readable format
   * @param seconds - Uptime in seconds
   * @returns Human readable uptime string
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    
    return parts.join(' ');
  }

  /**
   * Get plugin from MongoDB
   */
  @Post('/plugin/db/get')
  async getPluginFromDb(@Body() body: any) {
    console.log('🗄️ MongoDB endpoint: Get plugin from database requested:', body);
    
    try {
      if (!body.userId || typeof body.userId !== 'string' || body.userId.trim().length === 0) {
        return {
          success: false,
          error: 'userId is required and must be a non-empty string'
        };
      }

      if (!body.pluginName || typeof body.pluginName !== 'string' || body.pluginName.trim().length === 0) {
        return {
          success: false,
          error: 'pluginName is required and must be a non-empty string'
        };
      }

      const plugin = await this.pluginDbService.getPlugin(
        body.userId.trim(),
        body.pluginName.trim()
      );
      
      if (!plugin) {
        return {
          success: false,
          error: `Plugin "${body.pluginName}" not found in database for user "${body.userId}"`
        };
      }
      
      console.log(`🗄️ MongoDB endpoint: Retrieved plugin from database with ${plugin.files.length} files`);
      
      return {
        success: true,
        plugin: {
          _id: plugin._id,
          userId: plugin.userId,
          pluginName: plugin.pluginName,
          description: plugin.description,
          minecraftVersion: plugin.minecraftVersion,
          dependencies: plugin.dependencies,
          metadata: plugin.metadata,
          totalFiles: plugin.totalFiles,
          totalSize: plugin.totalSize,
          createdAt: plugin.createdAt,
          updatedAt: plugin.updatedAt,
          lastSyncedAt: plugin.lastSyncedAt
        },
        files: plugin.files
      };
    } catch (error) {
      console.error('❌ MongoDB endpoint: Error getting plugin from database:', error);
      return {
        success: false,
        error: error.message || 'Failed to get plugin from database'
      };
    }
  }

  /**
   * Get all plugins for a user from MongoDB
   */
  @Post('/plugin/db/list')
  async getUserPluginsFromDb(@Body() body: any) {
    console.log('🗄️ MongoDB endpoint: Get user plugins from database requested:', body);
    
    try {
      if (!body.userId || typeof body.userId !== 'string' || body.userId.trim().length === 0) {
        return {
          success: false,
          error: 'userId is required and must be a non-empty string'
        };
      }

      const plugins = await this.pluginDbService.getUserPlugins(body.userId.trim());
      
      console.log(`🗄️ MongoDB endpoint: Retrieved ${plugins.length} plugins from database for user ${body.userId}`);
      
      // Return summary without full file contents for list view
      const pluginSummaries = plugins.map(plugin => ({
        _id: plugin._id,
        userId: plugin.userId,
        pluginName: plugin.pluginName,
        description: plugin.description,
        minecraftVersion: plugin.minecraftVersion,
        dependencies: plugin.dependencies,
        metadata: plugin.metadata,
        totalFiles: plugin.totalFiles,
        totalSize: plugin.totalSize,
        createdAt: plugin.createdAt,
        updatedAt: plugin.updatedAt,
        lastSyncedAt: plugin.lastSyncedAt
      }));
      
      return {
        success: true,
        plugins: pluginSummaries,
        count: plugins.length
      };
    } catch (error) {
      console.error('❌ MongoDB endpoint: Error getting user plugins from database:', error);
      return {
        success: false,
        error: error.message || 'Failed to get user plugins from database'
      };
    }
  }

  /**
   * Sync plugin with MongoDB
   */
  @Post('/plugin/db/sync')
  async syncPluginWithDb(@Body() body: any) {
    console.log('🔄 MongoDB endpoint: Sync plugin with database requested:', body);
    
    try {
      if (!body.userId || typeof body.userId !== 'string' || body.userId.trim().length === 0) {
        return {
          success: false,
          error: 'userId is required and must be a non-empty string'
        };
      }

      if (!body.pluginName || typeof body.pluginName !== 'string' || body.pluginName.trim().length === 0) {
        return {
          success: false,
          error: 'pluginName is required and must be a non-empty string'
        };
      }

      const userId = body.userId.trim();
      const pluginName = body.pluginName.trim();
      
      // Check if plugin exists on disk
      const pluginPath = path.join(process.cwd(), 'generated', userId, pluginName);
      
      if (!await fs.pathExists(pluginPath)) {
        return {
          success: false,
          error: `Plugin "${pluginName}" not found on disk for user "${userId}"`
        };
      }

      // Create sync DTO
      const pluginDto = {
        _id: body._id || this.generatePluginId(userId, pluginName),
        userId,
        pluginName,
        description: body.description || `A Minecraft plugin named ${pluginName}`,
        minecraftVersion: body.minecraftVersion || '1.20',
        dependencies: body.dependencies || [],
        metadata: body.metadata || {
          author: 'Pegasus AI',
          version: '1.0.0',
          mainClass: `com.pegasus.${pluginName.toLowerCase()}.Main`,
          apiVersion: '1.20'
        },
        diskPath: pluginPath
      };

      const plugin = await this.pluginDbService.syncWithDisk(pluginDto);
      
      console.log(`🔄 MongoDB endpoint: Plugin synced with database successfully`);
      
      return {
        success: true,
        message: `Plugin "${pluginName}" synced with database`,
        plugin: {
          _id: plugin._id,
          userId: plugin.userId,
          pluginName: plugin.pluginName,
          totalFiles: plugin.totalFiles,
          totalSize: plugin.totalSize,
          lastSyncedAt: plugin.lastSyncedAt
        }
      };
    } catch (error) {
      console.error('❌ MongoDB endpoint: Error syncing plugin with database:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync plugin with database'
      };
    }
  }

  /**
   * Get MongoDB database statistics
   */
  @Get('/plugin/db/stats')
  async getDbStats() {
    console.log('📊 MongoDB endpoint: Get database stats requested');
    
    try {
      const stats = await this.pluginDbService.getDbStats();
      
      console.log(`📊 MongoDB endpoint: Retrieved database stats - ${stats.activePlugins} active plugins`);
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('❌ MongoDB endpoint: Error getting database stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to get database stats'
      };
    }
  }

  /**
   * Force sync all plugins with MongoDB
   */
  @Post('/plugin/db/sync-all')
  async syncAllPluginsWithDb(@Body() body: any) {
    console.log('🔄 MongoDB endpoint: Sync all plugins with database requested:', body);
    
    try {
      const userId = body.userId?.trim();
      const generatedPath = path.join(process.cwd(), 'generated');
      
      if (!await fs.pathExists(generatedPath)) {
        return {
          success: false,
          error: 'No generated plugins directory found'
        };
      }

      let syncedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      if (userId) {
        // Sync plugins for specific user
        const userPath = path.join(generatedPath, userId);
        if (await fs.pathExists(userPath)) {
          const pluginDirs = await fs.readdir(userPath);
          
          for (const pluginName of pluginDirs) {
            const pluginPath = path.join(userPath, pluginName);
            const stat = await fs.stat(pluginPath);
            
            if (stat.isDirectory()) {
              try {
                const pluginDto = {
                  _id: this.generatePluginId(userId, pluginName),
                  userId,
                  pluginName,
                  description: `A Minecraft plugin named ${pluginName}`,
                  minecraftVersion: '1.20',
                  dependencies: [],
                  metadata: {
                    author: 'Pegasus AI',
                    version: '1.0.0',
                    mainClass: `com.pegasus.${pluginName.toLowerCase()}.Main`,
                    apiVersion: '1.20'
                  },
                  diskPath: pluginPath
                };

                await this.pluginDbService.syncWithDisk(pluginDto);
                syncedCount++;
                console.log(`✅ Synced plugin: ${userId}/${pluginName}`);
              } catch (error) {
                errorCount++;
                errors.push(`${userId}/${pluginName}: ${error.message}`);
                console.error(`❌ Failed to sync plugin ${userId}/${pluginName}:`, error.message);
              }
            }
          }
        }
      } else {
        // Sync all plugins for all users
        const userDirs = await fs.readdir(generatedPath);
        
        for (const userDir of userDirs) {
          const userPath = path.join(generatedPath, userDir);
          const userStat = await fs.stat(userPath);
          
          if (userStat.isDirectory()) {
            const pluginDirs = await fs.readdir(userPath);
            
            for (const pluginName of pluginDirs) {
              const pluginPath = path.join(userPath, pluginName);
              const stat = await fs.stat(pluginPath);
              
              if (stat.isDirectory()) {
                try {
                  const pluginDto = {
                    _id: this.generatePluginId(userDir, pluginName),
                    userId: userDir,
                    pluginName,
                    description: `A Minecraft plugin named ${pluginName}`,
                    minecraftVersion: '1.20',
                    dependencies: [],
                    metadata: {
                      author: 'Pegasus AI',
                      version: '1.0.0',
                      mainClass: `com.pegasus.${pluginName.toLowerCase()}.Main`,
                      apiVersion: '1.20'
                    },
                    diskPath: pluginPath
                  };

                  await this.pluginDbService.syncWithDisk(pluginDto);
                  syncedCount++;
                  console.log(`✅ Synced plugin: ${userDir}/${pluginName}`);
                } catch (error) {
                  errorCount++;
                  errors.push(`${userDir}/${pluginName}: ${error.message}`);
                  console.error(`❌ Failed to sync plugin ${userDir}/${pluginName}:`, error.message);
                }
              }
            }
          }
        }
      }
      
      console.log(`🔄 MongoDB endpoint: Bulk sync completed - ${syncedCount} synced, ${errorCount} errors`);
      
      return {
        success: true,
        message: `Bulk sync completed: ${syncedCount} plugins synced${errorCount > 0 ? `, ${errorCount} errors` : ''}`,
        syncedCount,
        errorCount,
        errors: errorCount > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('❌ MongoDB endpoint: Error syncing all plugins with database:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync all plugins with database'
      };
    }
  }

  /**
   * Generate a unique plugin ID
   */
  private generatePluginId(userId: string, pluginName: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    const hash = Buffer.from(`${userId}:${pluginName}:${timestamp}`).toString('base64url').substring(0, 24);
    return hash;
  }
}
