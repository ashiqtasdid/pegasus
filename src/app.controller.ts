import { Controller, Get, Post, Body, Res, Param, NotFoundException } from '@nestjs/common';
import { AppService } from './app.service';
import { PluginProject } from './ai.service';
import { MavenService, CompilationResult } from './maven.service';
import { DiskReaderService, DiskProjectInfo } from './disk-reader.service';
import { Response } from 'express';
import { join } from 'path';
import * as fs from 'fs-extra';
import * as path from 'path';

@Controller()
export class AppController {  constructor(
    private readonly appService: AppService,
    private readonly mavenService: MavenService,
    private readonly diskReaderService: DiskReaderService
  ) {}  @Get()
  getRoot(@Res() res: Response) {
    console.log('📍 Root route accessed - redirecting to /app');
    return res.redirect('/app');
  }

  @Get('app')
  getApp(@Res() res: Response) {
    console.log('🎮 Web UI accessed - serving main application');
    return res.sendFile(join(process.cwd(), 'public', 'index.html'));
  }  @Post('plugin/generate')
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
}
