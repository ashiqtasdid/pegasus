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
  async readProjectFromDisk(
    userId: string,
    pluginName: string,
  ): Promise<DiskProjectInfo> {
    console.log(
      `📖 Disk Reader: Reading project from disk - userId: "${userId}", pluginName: "${pluginName}"`,
    );

    try {
      const projectPath = path.join(
        process.cwd(),
        'generated',
        userId,
        pluginName,
      );
      console.log(`📍 Disk Reader: Project path: ${projectPath}`);

      // Check if project directory exists
      console.log(`📁 Disk Reader: Checking if project directory exists...`);
      if (!(await fs.pathExists(projectPath))) {
        console.log(`❌ Disk Reader: Project directory not found`);
        return {
          projectExists: false,
          error: `Project not found: generated/${userId}/${pluginName}`,
        };
      }
      console.log(`✅ Disk Reader: Project directory exists`); // Read project-info.json if it exists to get metadata
      const projectInfoPath = path.join(projectPath, 'project-info.json');
      let projectMetadata: any = {};

      console.log(`📄 Disk Reader: Checking for project metadata...`);
      if (await fs.pathExists(projectInfoPath)) {
        try {
          const projectInfoContent = await this.safeReadFile(
            projectInfoPath,
            'utf8',
          );
          projectMetadata = this.safeJSONParse(projectInfoContent, {});
          console.log(`✅ Disk Reader: Project metadata loaded successfully`);
        } catch (error) {
          console.warn(
            '⚠️ Disk Reader: Could not read project-info.json:',
            error.message,
          );
          projectMetadata = {};
        }
      } else {
        console.log(
          `ℹ️ Disk Reader: No project metadata file found, will detect from sources`,
        );
      }

      // Read all source files from disk
      console.log(`📂 Disk Reader: Reading all source files...`);
      const files = await this.readAllSourceFiles(projectPath);
      console.log(`📝 Disk Reader: Read ${files.length} source files`);

      // Create the plugin project structure
      const pluginProject: PluginProject = {
        projectName: projectMetadata.projectName || pluginName,
        minecraftVersion:
          projectMetadata.minecraftVersion ||
          this.detectMinecraftVersion(files),
        files: files,
        dependencies:
          projectMetadata.dependencies || this.detectDependencies(files),
        buildInstructions:
          projectMetadata.buildInstructions || 'mvn clean package',
      };

      console.log(
        `🎉 Disk Reader: Successfully reconstructed project structure`,
      );
      console.log(
        `📦 Disk Reader: Project "${pluginProject.projectName}" (${pluginProject.minecraftVersion}) with ${pluginProject.files.length} files`,
      );

      return {
        projectExists: true,
        projectPath,
        pluginProject,
      };
    } catch (error) {
      console.error(`❌ Disk Reader: Failed to read project:`, error);
      return {
        projectExists: false,
        error: `Failed to read project: ${error.message}`,
      };
    }
  }
  private async readAllSourceFiles(projectPath: string): Promise<PluginFile[]> {
    const files: PluginFile[] = [];
    const sourceExtensions = [
      '.java',
      '.yml',
      '.yaml',
      '.xml',
      '.md',
      '.json',
      '.properties',
      '.txt',
    ];
    console.log(`🔍 Disk Reader: Walking directory tree from: ${projectPath}`);
    console.log(
      `📄 Disk Reader: Looking for files with extensions: ${sourceExtensions.join(', ')}`,
    );

    await this.walkDirectory(projectPath, projectPath, files, sourceExtensions);

    console.log(`📋 Disk Reader: Found ${files.length} source files total`);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  private async walkDirectory(
    basePath: string,
    currentPath: string,
    files: PluginFile[],
    extensions: string[],
  ): Promise<void> {
    try {
      const items = await fs.readdir(currentPath);
      const relativePath = path.relative(basePath, currentPath);
      const displayPath = relativePath || '(root)';
      console.log(
        `📂 Disk Reader: Scanning directory: ${displayPath} (${items.length} items)`,
      );

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          // Skip target, .git, node_modules, and other build directories
          if (
            !['target', '.git', 'node_modules', '.idea', '.vscode'].includes(
              item,
            )
          ) {
            await this.walkDirectory(basePath, fullPath, files, extensions);
          } else {
            console.log(`⏭️ Disk Reader: Skipping directory: ${item}`);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (extensions.includes(ext)) {
            try {
              const content = await this.safeReadFile(fullPath, 'utf8');
              const relativeFilePath = path
                .relative(basePath, fullPath)
                .replace(/\\/g, '/');

              console.log(
                `📄 Disk Reader: Read file: ${relativeFilePath} (${content.length} chars)`,
              );

              files.push({
                path: relativeFilePath,
                content: content,
                type: ext.substring(1), // Remove the dot
              });
            } catch (readError) {
              console.warn(
                `⚠️ Disk Reader: Could not read file ${fullPath}:`,
                readError.message,
              );
            }
          }
        }
      }
    } catch (error) {
      console.warn(
        `⚠️ Disk Reader: Could not read directory ${currentPath}:`,
        error.message,
      );
    }
  }
  private detectMinecraftVersion(files: PluginFile[]): string {
    console.log(
      `🔍 Disk Reader: Detecting Minecraft version from ${files.length} files...`,
    );

    // Look for version in pom.xml or plugin.yml
    const pomFile = files.find((f) => f.path === 'pom.xml');
    if (pomFile) {
      console.log(`📄 Disk Reader: Checking pom.xml for version info...`);
      const versionMatch = pomFile.content.match(
        /spigot-api.*?(\d+\.\d+\.\d+)/,
      );
      if (versionMatch) {
        console.log(
          `✅ Disk Reader: Found Minecraft version in pom.xml: ${versionMatch[1]}`,
        );
        return versionMatch[1];
      }
    }

    const pluginYml = files.find((f) => f.path.includes('plugin.yml'));
    if (pluginYml) {
      console.log(`📄 Disk Reader: Checking plugin.yml for API version...`);
      const apiVersionMatch = pluginYml.content.match(
        /api-version:\s*['"']?(\d+\.\d+)['"']?/,
      );
      if (apiVersionMatch) {
        const detectedVersion = `${apiVersionMatch[1]}.1`;
        console.log(
          `✅ Disk Reader: Found API version in plugin.yml: ${detectedVersion}`,
        );
        return detectedVersion; // Assume latest patch version
      }
    }

    console.log(
      `⚠️ Disk Reader: Could not detect Minecraft version, using default: 1.20.1`,
    );
    return '1.20.1'; // Default fallback
  }
  private detectDependencies(files: PluginFile[]): string[] {
    console.log(`🔍 Disk Reader: Detecting dependencies from project files...`);
    const dependencies: string[] = [];

    const pomFile = files.find((f) => f.path === 'pom.xml');
    if (pomFile) {
      console.log(`📄 Disk Reader: Parsing dependencies from pom.xml...`);
      // Extract dependencies from pom.xml
      const dependencyMatches = pomFile.content.matchAll(
        /<groupId>(.*?)<\/groupId>\s*<artifactId>(.*?)<\/artifactId>\s*<version>(.*?)<\/version>/g,
      );

      for (const match of dependencyMatches) {
        const dependency = `${match[1]}:${match[2]}:${match[3]}`;
        dependencies.push(dependency);
        console.log(`📦 Disk Reader: Found dependency: ${dependency}`);
      }
    }

    const result =
      dependencies.length > 0
        ? dependencies
        : ['org.bukkit:bukkit:1.20.1-R0.1-SNAPSHOT'];
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

      if (!(await fs.pathExists(generatedPath))) {
        return {
          totalProjects: 0,
          projects: [],
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
                hasCompiledJar = targetFiles.some(
                  (file) => file.endsWith('.jar') && !file.includes('original'),
                );
              }

              projects.push({
                userId: userDir,
                pluginName: pluginDir,
                projectPath: pluginPath,
                hasCompiledJar,
                lastModified: pluginStat.mtime,
              });
            }
          }
        }
      }

      return {
        totalProjects: projects.length,
        projects: projects.sort(
          (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
        ),
      };
    } catch (error) {
      console.error('Error getting projects list:', error);
      return {
        totalProjects: 0,
        projects: [],
      };
    }
  }

  async compareWithOriginal(
    userId: string,
    pluginName: string,
  ): Promise<{
    hasChanges: boolean;
    originalProject?: PluginProject;
    currentProject?: PluginProject;
    changedFiles: string[];
    newFiles: string[];
    deletedFiles: string[];
  }> {
    try {
      const projectPath = path.join(
        process.cwd(),
        'generated',
        userId,
        pluginName,
      );
      const projectInfoPath = path.join(projectPath, 'project-info.json');
      if (!(await this.safePathExists(projectInfoPath))) {
        return {
          hasChanges: false,
          changedFiles: [],
          newFiles: [],
          deletedFiles: [],
        };
      }

      // Read original project info safely
      try {
        const originalDataString = await this.safeReadFile(
          projectInfoPath,
          'utf8',
        );
        const originalData = this.safeJSONParse(originalDataString, null);

        if (!originalData) {
          throw new Error('Invalid project info data');
        }
        const originalProject: PluginProject = originalData;

        // Read current project from disk
        const currentResult = await this.readProjectFromDisk(
          userId,
          pluginName,
        );
        if (!currentResult.projectExists || !currentResult.pluginProject) {
          throw new Error('Could not read current project');
        }

        const currentProject = currentResult.pluginProject;

        // Compare files
        const originalFiles = new Map(
          originalProject.files.map((f) => [f.path, f.content]),
        );
        const currentFiles = new Map(
          currentProject.files.map((f) => [f.path, f.content]),
        );

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

        const hasChanges =
          changedFiles.length > 0 ||
          newFiles.length > 0 ||
          deletedFiles.length > 0;

        return {
          hasChanges,
          originalProject,
          currentProject,
          changedFiles,
          newFiles,
          deletedFiles,
        };
      } catch (readError) {
        console.error(
          `❌ Disk Reader: Error reading project info: ${readError.message}`,
        );
        return {
          hasChanges: false,
          changedFiles: [],
          newFiles: [],
          deletedFiles: [],
        };
      }
    } catch (error) {
      throw new Error(`Failed to compare projects: ${error.message}`);
    }
  }

  /**
   * Safely read a file with comprehensive error handling
   */
  private async safeReadFile(
    filePath: string,
    encoding: BufferEncoding = 'utf8',
  ): Promise<string> {
    try {
      // Check if file exists and is readable
      await fs.access(filePath, fs.constants.R_OK);

      // Get file stats to check if it's actually a file
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      // Check file size (prevent reading extremely large files)
      if (stats.size > 50 * 1024 * 1024) {
        // 50MB limit
        throw new Error(`File too large: ${filePath} (${stats.size} bytes)`);
      }

      // Read the file with timeout
      const content = await fs.readFile(filePath, encoding);

      // Validate content
      if (typeof content !== 'string') {
        throw new Error(`File content is not a string: ${filePath}`);
      }

      return content;
    } catch (error) {
      console.error(
        `❌ Disk Reader: Error reading file ${filePath}: ${error.message}`,
      );
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Safely write a file with comprehensive error handling
   */
  private async safeWriteFile(
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf8',
  ): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Validate content
      if (typeof content !== 'string') {
        content = String(content);
      }

      // Create a temporary file first (atomic write)
      const tempPath = `${filePath}.tmp.${Date.now()}`;

      try {
        await fs.writeFile(tempPath, content, encoding);
        await fs.move(tempPath, filePath);
        console.log(
          `✅ Disk Reader: Successfully wrote file: ${filePath} (${content.length} chars)`,
        );
      } catch (writeError) {
        // Clean up temp file if it exists
        if (await fs.pathExists(tempPath)) {
          await fs.remove(tempPath);
        }
        throw writeError;
      }
    } catch (error) {
      console.error(
        `❌ Disk Reader: Error writing file ${filePath}: ${error.message}`,
      );
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Safely parse JSON with fallback and error handling
   */
  private safeJSONParse<T>(jsonString: string, fallback: T): T {
    if (
      !jsonString ||
      typeof jsonString !== 'string' ||
      jsonString.trim().length === 0
    ) {
      console.log(
        `⚠️ Disk Reader: Empty or invalid JSON string, using fallback`,
      );
      return fallback;
    }

    try {
      const trimmed = jsonString.trim();

      // Basic validation - must start with { or [
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        console.log(
          `⚠️ Disk Reader: JSON string doesn't start with { or [, using fallback`,
        );
        return fallback;
      }

      const parsed = JSON.parse(trimmed);

      // Additional validation for parsed result
      if (parsed === null || parsed === undefined) {
        console.log(
          `⚠️ Disk Reader: Parsed JSON is null/undefined, using fallback`,
        );
        return fallback;
      }

      return parsed;
    } catch (error) {
      console.warn(
        `⚠️ Disk Reader: JSON parsing failed: ${error.message}, using fallback`,
      );
      return fallback;
    }
  }

  /**
   * Safely stringify JSON with error handling
   */
  private safeJSONStringify(object: any, indent: number = 2): string {
    try {
      if (object === null || object === undefined) {
        return '{}';
      }

      return JSON.stringify(object, null, indent);
    } catch (error) {
      console.warn(
        `⚠️ Disk Reader: JSON stringification failed: ${error.message}`,
      );
      return '{}';
    }
  }

  /**
   * Safely check if a path exists with error handling
   */
  private async safePathExists(filePath: string): Promise<boolean> {
    try {
      return await fs.pathExists(filePath);
    } catch (error) {
      console.warn(
        `⚠️ Disk Reader: Error checking path existence for ${filePath}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Safely ensure directory exists with error handling
   */
  private async safeEnsureDir(dirPath: string): Promise<boolean> {
    try {
      await fs.ensureDir(dirPath);
      return true;
    } catch (error) {
      console.error(
        `❌ Disk Reader: Error ensuring directory ${dirPath}: ${error.message}`,
      );
      return false;
    }
  }
}
