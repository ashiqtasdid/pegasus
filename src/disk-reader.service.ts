import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PluginProject, PluginFile } from './ai.service';

export interface DiskProjectInfo {
  projectExists: boolean;
  projectPath?: string;
  pluginProject?: PluginProject;
  error?: string;
}

@Injectable()
export class DiskReaderService {
  async readProjectFromDisk(userId: string, pluginName: string): Promise<DiskProjectInfo> {
    console.log(`📖 Disk Reader: Reading project from disk - userId: "${userId}", pluginName: "${pluginName}"`);
    
    try {
      const projectPath = path.join(process.cwd(), 'generated', userId, pluginName);
      console.log(`📍 Disk Reader: Project path: ${projectPath}`);
      
      // Check if project directory exists
      console.log(`📁 Disk Reader: Checking if project directory exists...`);
      if (!await fs.pathExists(projectPath)) {
        console.log(`❌ Disk Reader: Project directory not found`);
        return {
          projectExists: false,
          error: `Project not found: generated/${userId}/${pluginName}`
        };
      }
      console.log(`✅ Disk Reader: Project directory exists`);

      // Read project-info.json if it exists to get metadata
      const projectInfoPath = path.join(projectPath, 'project-info.json');
      let projectMetadata: any = {};
      
      console.log(`📄 Disk Reader: Checking for project metadata...`);
      if (await fs.pathExists(projectInfoPath)) {
        try {
          const projectInfoContent = await fs.readFile(projectInfoPath, 'utf8');
          projectMetadata = JSON.parse(projectInfoContent);
          console.log(`✅ Disk Reader: Project metadata loaded successfully`);
        } catch (error) {
          console.warn('⚠️ Disk Reader: Could not read project-info.json:', error.message);
        }
      } else {
        console.log(`ℹ️ Disk Reader: No project metadata file found, will detect from sources`);
      }

      // Read all source files from disk
      console.log(`📂 Disk Reader: Reading all source files...`);
      const files = await this.readAllSourceFiles(projectPath);
      console.log(`📝 Disk Reader: Read ${files.length} source files`);
      
      // Create the plugin project structure
      const pluginProject: PluginProject = {
        projectName: projectMetadata.projectName || pluginName,
        minecraftVersion: projectMetadata.minecraftVersion || this.detectMinecraftVersion(files),
        files: files,
        dependencies: projectMetadata.dependencies || this.detectDependencies(files),
        buildInstructions: projectMetadata.buildInstructions || "mvn clean package"
      };

      console.log(`🎉 Disk Reader: Successfully reconstructed project structure`);
      console.log(`📦 Disk Reader: Project "${pluginProject.projectName}" (${pluginProject.minecraftVersion}) with ${pluginProject.files.length} files`);

      return {
        projectExists: true,
        projectPath,
        pluginProject
      };

    } catch (error) {
      console.error(`❌ Disk Reader: Failed to read project:`, error);
      return {
        projectExists: false,
        error: `Failed to read project: ${error.message}`
      };
    }
  }
  private async readAllSourceFiles(projectPath: string): Promise<PluginFile[]> {
    const files: PluginFile[] = [];
    const sourceExtensions = ['.java', '.yml', '.yaml', '.xml', '.md', '.json', '.properties', '.txt'];
    console.log(`🔍 Disk Reader: Walking directory tree from: ${projectPath}`);
    console.log(`📄 Disk Reader: Looking for files with extensions: ${sourceExtensions.join(', ')}`);
    
    await this.walkDirectory(projectPath, projectPath, files, sourceExtensions);
    
    console.log(`📋 Disk Reader: Found ${files.length} source files total`);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  private async walkDirectory(
    basePath: string, 
    currentPath: string, 
    files: PluginFile[], 
    extensions: string[]
  ): Promise<void> {
    try {
      const items = await fs.readdir(currentPath);
      const relativePath = path.relative(basePath, currentPath);
      const displayPath = relativePath || '(root)';
      console.log(`📂 Disk Reader: Scanning directory: ${displayPath} (${items.length} items)`);
      
      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = await fs.stat(fullPath);
        
        if (stat.isDirectory()) {
          // Skip target, .git, node_modules, and other build directories
          if (!['target', '.git', 'node_modules', '.idea', '.vscode'].includes(item)) {
            await this.walkDirectory(basePath, fullPath, files, extensions);
          } else {
            console.log(`⏭️ Disk Reader: Skipping directory: ${item}`);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (extensions.includes(ext)) {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              const relativeFilePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
              
              console.log(`📄 Disk Reader: Read file: ${relativeFilePath} (${content.length} chars)`);
              
              files.push({
                path: relativeFilePath,
                content: content,
                type: ext.substring(1) // Remove the dot
              });
            } catch (readError) {
              console.warn(`⚠️ Disk Reader: Could not read file ${fullPath}:`, readError.message);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Disk Reader: Could not read directory ${currentPath}:`, error.message);
    }
  }
  private detectMinecraftVersion(files: PluginFile[]): string {
    console.log(`🔍 Disk Reader: Detecting Minecraft version from ${files.length} files...`);
    
    // Look for version in pom.xml or plugin.yml
    const pomFile = files.find(f => f.path === 'pom.xml');
    if (pomFile) {
      console.log(`📄 Disk Reader: Checking pom.xml for version info...`);
      const versionMatch = pomFile.content.match(/spigot-api.*?(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        console.log(`✅ Disk Reader: Found Minecraft version in pom.xml: ${versionMatch[1]}`);
        return versionMatch[1];
      }
    }
    
    const pluginYml = files.find(f => f.path.includes('plugin.yml'));
    if (pluginYml) {
      console.log(`📄 Disk Reader: Checking plugin.yml for API version...`);
      const apiVersionMatch = pluginYml.content.match(/api-version:\s*['"']?(\d+\.\d+)['"']?/);
      if (apiVersionMatch) {
        const detectedVersion = `${apiVersionMatch[1]}.1`;
        console.log(`✅ Disk Reader: Found API version in plugin.yml: ${detectedVersion}`);
        return detectedVersion; // Assume latest patch version
      }
    }
    
    console.log(`⚠️ Disk Reader: Could not detect Minecraft version, using default: 1.20.1`);
    return '1.20.1'; // Default fallback
  }
  private detectDependencies(files: PluginFile[]): string[] {
    console.log(`🔍 Disk Reader: Detecting dependencies from project files...`);
    const dependencies: string[] = [];
    
    const pomFile = files.find(f => f.path === 'pom.xml');
    if (pomFile) {
      console.log(`📄 Disk Reader: Parsing dependencies from pom.xml...`);
      // Extract dependencies from pom.xml
      const dependencyMatches = pomFile.content.matchAll(/<groupId>(.*?)<\/groupId>\s*<artifactId>(.*?)<\/artifactId>\s*<version>(.*?)<\/version>/g);
      
      for (const match of dependencyMatches) {
        const dependency = `${match[1]}:${match[2]}:${match[3]}`;
        dependencies.push(dependency);
        console.log(`📦 Disk Reader: Found dependency: ${dependency}`);
      }
    }
    
    const result = dependencies.length > 0 ? dependencies : ['org.bukkit:bukkit:1.20.1-R0.1-SNAPSHOT'];
    console.log(`✅ Disk Reader: Detected ${result.length} dependencies`);
    return result;
  }

  async getProjectsList(userId?: string): Promise<{
    totalProjects: number;
    projects: Array<{
      userId: string;
      pluginName: string;
      projectPath: string;
      hasCompiledJar: boolean;
      lastModified: Date;
    }>;
  }> {
    try {
      const generatedPath = path.join(process.cwd(), 'generated');
      
      if (!await fs.pathExists(generatedPath)) {
        return {
          totalProjects: 0,
          projects: []
        };
      }

      const projects: any[] = [];
      const userDirs = userId ? [userId] : await fs.readdir(generatedPath);
      
      for (const userDir of userDirs) {
        const userPath = path.join(generatedPath, userDir);
        const userStat = await fs.stat(userPath);
        
        if (userStat.isDirectory()) {
          const pluginDirs = await fs.readdir(userPath);
          
          for (const pluginDir of pluginDirs) {
            const pluginPath = path.join(userPath, pluginDir);
            const pluginStat = await fs.stat(pluginPath);
            
            if (pluginStat.isDirectory()) {
              // Check if there's a compiled JAR
              const targetPath = path.join(pluginPath, 'target');
              let hasCompiledJar = false;
              
              if (await fs.pathExists(targetPath)) {
                const targetFiles = await fs.readdir(targetPath);
                hasCompiledJar = targetFiles.some(file => file.endsWith('.jar') && !file.includes('original'));
              }
              
              projects.push({
                userId: userDir,
                pluginName: pluginDir,
                projectPath: pluginPath,
                hasCompiledJar,
                lastModified: pluginStat.mtime
              });
            }
          }
        }
      }
      
      return {
        totalProjects: projects.length,
        projects: projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
      };
      
    } catch (error) {
      console.error('Error getting projects list:', error);
      return {
        totalProjects: 0,
        projects: []
      };
    }
  }

  async compareWithOriginal(userId: string, pluginName: string): Promise<{
    hasChanges: boolean;
    originalProject?: PluginProject;
    currentProject?: PluginProject;
    changedFiles: string[];
    newFiles: string[];
    deletedFiles: string[];
  }> {
    try {
      const projectPath = path.join(process.cwd(), 'generated', userId, pluginName);
      const projectInfoPath = path.join(projectPath, 'project-info.json');
      
      if (!await fs.pathExists(projectInfoPath)) {
        return {
          hasChanges: false,
          changedFiles: [],
          newFiles: [],
          deletedFiles: []
        };
      }

      // Read original project info
      const originalData = JSON.parse(await fs.readFile(projectInfoPath, 'utf8'));
      const originalProject: PluginProject = originalData;
      
      // Read current project from disk
      const currentResult = await this.readProjectFromDisk(userId, pluginName);
      if (!currentResult.projectExists || !currentResult.pluginProject) {
        throw new Error('Could not read current project');
      }
      
      const currentProject = currentResult.pluginProject;
      
      // Compare files
      const originalFiles = new Map(originalProject.files.map(f => [f.path, f.content]));
      const currentFiles = new Map(currentProject.files.map(f => [f.path, f.content]));
      
      const changedFiles: string[] = [];
      const newFiles: string[] = [];
      const deletedFiles: string[] = [];
      
      // Check for changed and new files
      for (const [path, content] of currentFiles) {
        if (originalFiles.has(path)) {
          if (originalFiles.get(path) !== content) {
            changedFiles.push(path);
          }
        } else {
          newFiles.push(path);
        }
      }
      
      // Check for deleted files
      for (const path of originalFiles.keys()) {
        if (!currentFiles.has(path)) {
          deletedFiles.push(path);
        }
      }
      
      const hasChanges = changedFiles.length > 0 || newFiles.length > 0 || deletedFiles.length > 0;
      
      return {
        hasChanges,
        originalProject,
        currentProject,
        changedFiles,
        newFiles,
        deletedFiles
      };
      
    } catch (error) {
      throw new Error(`Failed to compare projects: ${error.message}`);
    }
  }
}
