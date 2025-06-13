import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface CompilationResult {
  success: boolean;
  message: string;
  jarPath?: string;
  buildOutput: string;
  errors?: string;
}

@Injectable()
export class MavenService {
  private readonly execAsync = promisify(exec);
  async compilePlugin(projectPath: string): Promise<CompilationResult> {
    const startTime = Date.now();
    console.log(`🔨 Maven Service: Starting compilation for project at: ${projectPath}`);
    
    try {
      // Check if the project directory exists
      console.log(`📁 Maven Service: Checking if project directory exists...`);
      if (!await fs.pathExists(projectPath)) {
        console.log(`❌ Maven Service: Project directory not found: ${projectPath}`);
        return {
          success: false,
          message: 'Project directory not found',
          buildOutput: '',
          errors: 'Project directory does not exist'
        };
      }
      console.log(`✅ Maven Service: Project directory exists`);

      // Check if pom.xml exists
      const pomPath = path.join(projectPath, 'pom.xml');
      console.log(`📄 Maven Service: Checking for pom.xml at: ${pomPath}`);
      if (!await fs.pathExists(pomPath)) {
        console.log(`❌ Maven Service: pom.xml not found`);
        return {
          success: false,
          message: 'pom.xml not found in project directory',
          buildOutput: '',
          errors: 'No pom.xml file found'
        };
      }
      console.log(`✅ Maven Service: pom.xml found`);

      // Run Maven clean and package
      console.log('🚀 Maven Service: Executing "mvn clean package" command...');
      const { stdout, stderr } = await this.execAsync('mvn clean package', {
        cwd: projectPath,
        timeout: 120000, // 2 minutes timeout
      });
      
      const duration = Date.now() - startTime;
      console.log(`⏱️ Maven Service: Maven command completed in ${duration}ms`);
      console.log(`📝 Maven Service: stdout length: ${stdout.length} characters`);
      if (stderr) {
        console.log(`⚠️ Maven Service: stderr length: ${stderr.length} characters`);
      }

      // Check if target directory and JAR file were created
      const targetDir = path.join(projectPath, 'target');
      console.log(`🎯 Maven Service: Checking target directory: ${targetDir}`);
      const jarFiles = await this.findJarFiles(targetDir);
      console.log(`📦 Maven Service: Found ${jarFiles.length} JAR files`);

      if (jarFiles.length === 0) {
        console.log(`❌ Maven Service: No JAR files generated despite compilation success`);
        return {
          success: false,
          message: 'Compilation completed but no JAR file was generated',
          buildOutput: stdout,
          errors: stderr
        };
      }

      // Find the main JAR file (not sources or javadoc)
      const mainJar = jarFiles.find(jar => 
        !jar.includes('-sources.jar') && 
        !jar.includes('-javadoc.jar') &&
        !jar.includes('-original.jar')
      ) || jarFiles[0];

      console.log('🎉 Maven Service: Compilation successful!');
      console.log(`📦 Maven Service: Main JAR file: ${path.basename(mainJar)}`);

      return {
        success: true,
        message: 'Plugin compiled successfully',
        jarPath: mainJar,
        buildOutput: stdout
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Maven Service: Compilation failed after ${duration}ms`);
      console.error(`❌ Maven Service: Error details:`, error.message);
      
      return {
        success: false,
        message: 'Maven compilation failed',
        buildOutput: error.stdout || '',
        errors: error.stderr || error.message
      };
    }
  }
  async compilePluginByUserAndName(userId: string, pluginName: string): Promise<CompilationResult> {
    const projectPath = path.join(process.cwd(), 'generated', userId, pluginName);
    console.log(`🔨 Maven Service: Compiling plugin for user "${userId}", plugin "${pluginName}"`);
    console.log(`📍 Maven Service: Resolved project path: ${projectPath}`);
    return this.compilePlugin(projectPath);
  }
  private async findJarFiles(targetDir: string): Promise<string[]> {
    console.log(`🔍 Maven Service: Searching for JAR files in: ${targetDir}`);
    try {
      if (!await fs.pathExists(targetDir)) {
        console.log(`❌ Maven Service: Target directory does not exist`);
        return [];
      }

      const files = await fs.readdir(targetDir);
      const jarFiles = files
        .filter(file => file.endsWith('.jar'))
        .map(file => path.join(targetDir, file));

      console.log(`📦 Maven Service: Found JAR files: ${jarFiles.map(f => path.basename(f)).join(', ')}`);
      return jarFiles;
    } catch (error) {
      console.error('❌ Maven Service: Error finding JAR files:', error);
      return [];
    }
  }
  async getCompilationStatus(projectPath: string): Promise<{
    hasTarget: boolean;
    hasJar: boolean;
    jarFiles: string[];
    lastModified?: Date;
  }> {
    console.log(`📊 Maven Service: Checking compilation status for: ${projectPath}`);
    try {
      const targetDir = path.join(projectPath, 'target');
      const hasTarget = await fs.pathExists(targetDir);
      console.log(`📁 Maven Service: Target directory exists: ${hasTarget}`);
      
      if (!hasTarget) {
        return {
          hasTarget: false,
          hasJar: false,
          jarFiles: []
        };
      }

      const jarFiles = await this.findJarFiles(targetDir);
      const hasJar = jarFiles.length > 0;
      console.log(`📦 Maven Service: JAR files found: ${hasJar} (${jarFiles.length} files)`);

      let lastModified: Date | undefined;
      if (hasJar) {
        const stats = await fs.stat(jarFiles[0]);
        lastModified = stats.mtime;
        console.log(`⏰ Maven Service: Last JAR modification: ${lastModified.toISOString()}`);
      }

      return {
        hasTarget,
        hasJar,
        jarFiles,
        lastModified
      };
    } catch (error) {
      console.error('❌ Maven Service: Error checking compilation status:', error);
      return {
        hasTarget: false,
        hasJar: false,
        jarFiles: []
      };
    }
  }
  async cleanProject(projectPath: string): Promise<boolean> {
    console.log(`🧹 Maven Service: Cleaning project at: ${projectPath}`);
    try {
      const targetDir = path.join(projectPath, 'target');
      console.log(`📁 Maven Service: Checking target directory: ${targetDir}`);
      
      if (await fs.pathExists(targetDir)) {
        console.log(`🗑️ Maven Service: Removing target directory...`);
        await fs.remove(targetDir);
        console.log('✅ Maven Service: Target directory cleaned successfully');
        return true;
      } else {
        console.log(`ℹ️ Maven Service: Target directory doesn't exist, nothing to clean`);
        return true;
      }
    } catch (error) {
      console.error('❌ Maven Service: Error cleaning project:', error);
      return false;
    }
  }
}
