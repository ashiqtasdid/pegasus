import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AiService, PluginProject } from './ai.service';
import { MavenService } from './maven.service';
import { ErrorFixService } from './error-fix.service';
import { DiskReaderService } from './disk-reader.service';

@Injectable()
export class AppService {  constructor(
    private aiService: AiService,
    private mavenService: MavenService,
    private errorFixService: ErrorFixService,
    private diskReaderService: DiskReaderService
  ) {}

  getHello(): string {
    return 'Hello World!';
  }  async generatePlugin(prompt: string, userId: string, name?: string): Promise<string> {
    const startTime = Date.now();
    console.log(`🎮 App Service: Starting plugin generation`);
    console.log(`👤 App Service: User ID: "${userId}"`);
    console.log(`📝 App Service: Original prompt: "${prompt}"`);
    console.log(`🏷️ App Service: Plugin name: ${name || '(auto-generated)'}`);
      try {
      // Use prompt as plugin name if name is not provided
      const pluginName = name || `plugin_${Date.now()}`;
      console.log(`📦 App Service: Final plugin name: "${pluginName}"`);
      
      // Create folder structure: generated/userId/pluginName
      const generatedPath = path.join(process.cwd(), 'generated');
      const userPath = path.join(generatedPath, userId);
      const pluginPath = path.join(userPath, pluginName);
      console.log(`📍 App Service: Target directory: ${pluginPath}`);
      
      // Check if project already exists when name is specified
      const projectExists = name && await fs.pathExists(pluginPath);
      
      if (projectExists) {
        console.log(`🔄 App Service: Project "${pluginName}" already exists, recompiling instead of recreating...`);
        
        // Check if this is a valid plugin project
        const pomPath = path.join(pluginPath, 'pom.xml');
        if (await fs.pathExists(pomPath)) {
          console.log(`✅ App Service: Found existing project with pom.xml, proceeding with recompilation`);
          
          // Clean the project first
          console.log(`🧹 App Service: Cleaning existing build artifacts...`);
          const cleanSuccess = await this.mavenService.cleanProject(pluginPath);
          if (cleanSuccess) {
            console.log(`✅ App Service: Project cleaned successfully`);
          } else {
            console.log(`⚠️ App Service: Project clean failed, continuing anyway`);
          }
          
          // Compile the existing project
          console.log(`🔨 App Service: Compiling existing project...`);
          const compilationResult = await this.mavenService.compilePlugin(pluginPath);
          
          const duration = Date.now() - startTime;
          
          if (compilationResult.success) {
            console.log(`🎉 App Service: Existing project recompiled successfully in ${duration}ms`);
            
            return `Plugin project "${pluginName}" already exists and has been recompiled successfully!\n\nUser: ${userId}\nProject: ${pluginName}\nExisting project location: ${pluginPath}\n\n🎉 COMPILATION SUCCESSFUL!\nJAR file created: ${compilationResult.jarPath}\nThe plugin is ready to deploy to your Minecraft server!\n\nNote: Used existing project files instead of generating new ones. If you want to regenerate the project, please use a different name or delete the existing project folder.`;
          } else {
            console.log(`❌ App Service: Existing project compilation failed in ${duration}ms`);
            
            // If recompilation fails, we could try to fix it or fall back to regeneration
            console.log(`🔄 App Service: Recompilation failed, attempting to fix errors with AI...`);
            
            try {
              const fixResult = await this.errorFixService.attemptErrorFix(userId, pluginName, 3);
              
              if (fixResult.success) {
                console.log(`🎉 App Service: Existing project fixed and compiled successfully`);
                return `Plugin project "${pluginName}" existed with compilation errors but has been fixed and recompiled successfully!\n\nUser: ${userId}\nProject: ${pluginName}\nProject location: ${pluginPath}\n\n🎉 COMPILATION SUCCESSFUL (after AI fixes)!\nJAR file created: ${fixResult.finalCompilationResult?.jarPath}\nThe plugin is ready to deploy to your Minecraft server!`;
              } else {
                console.log(`❌ App Service: Failed to fix existing project, will regenerate instead`);
                // Fall through to regenerate the project
              }
            } catch (fixError) {
              console.log(`❌ App Service: Error during fix attempt: ${fixError.message}, will regenerate instead`);
              // Fall through to regenerate the project
            }
          }
        } else {
          console.log(`⚠️ App Service: Directory exists but no pom.xml found, treating as incomplete project`);
          // Fall through to regenerate the project
        }
        
        // If we reach here, recompilation failed or the project was incomplete
        // Remove the existing directory and regenerate
        console.log(`🗑️ App Service: Removing incomplete/failed project directory...`);
        try {
          await fs.remove(pluginPath);
          console.log(`✅ App Service: Old project directory removed`);
        } catch (removeError) {
          console.log(`⚠️ App Service: Failed to remove old directory: ${removeError.message}`);
        }
      }
      
      // Ensure directories exist (won't overwrite if they already exist)
      console.log(`📁 App Service: Creating directory structure...`);
      await fs.ensureDir(pluginPath);
      console.log(`✅ App Service: Directory structure created`);
      
      // Enhance the prompt using AI
      console.log(`🔧 App Service: Enhancing prompt with AI...`);
      const enhancedPrompt = await this.aiService.enhancePrompt(prompt);
      console.log(`✅ App Service: Prompt enhanced (${enhancedPrompt.length} chars)`);
      
      // Generate plugin project using AI
      console.log(`🤖 App Service: Generating plugin code with AI...`);
      const pluginProject = await this.aiService.generatePluginCode(enhancedPrompt, pluginName);      
      console.log(`✅ App Service: AI generated ${pluginProject.files.length} files`);

      // Create all the files from the plugin project
      console.log(`💾 App Service: Writing files to disk...`);
      for (const file of pluginProject.files) {
        const filePath = path.join(pluginPath, file.path);
        console.log(`📄 App Service: Writing file: ${file.path} (${file.content.length} chars)`);
        
        // Ensure the directory exists for this file
        await fs.ensureDir(path.dirname(filePath));
        
        // Write the file content
        await fs.writeFile(filePath, file.content, 'utf8');
      }
      console.log(`✅ App Service: All ${pluginProject.files.length} files written to disk`);
      
      // Create a project summary file
      console.log(`📊 App Service: Creating project metadata...`);
      const projectSummary = {
        ...pluginProject,
        originalPrompt: prompt,
        enhancedPrompt,
        generatedAt: new Date().toISOString(),
        userId
      };
      
      const summaryPath = path.join(pluginPath, 'project-info.json');
      await fs.writeFile(summaryPath, JSON.stringify(projectSummary, null, 2), 'utf8');
      console.log(`✅ App Service: Project metadata saved`);
      
      // Process the response
      const duration = Date.now() - startTime;
      const nameInfo = name ? ` with name: ${name}` : ` with auto-generated name: ${pluginName}`;
      const filesList = pluginProject.files.map(f => `- ${f.path} (${f.type})`).join('\n');
      
      console.log(`🎉 App Service: Plugin generation completed in ${duration}ms`);
      console.log(`📦 App Service: Generated project "${pluginProject.projectName}" for Minecraft ${pluginProject.minecraftVersion}`);
      
      return `Plugin project generated with AI assistance!\n\nProject: ${pluginProject.projectName}\nMinecraft Version: ${pluginProject.minecraftVersion}\nUser: ${userId}${nameInfo}\n\nGenerated files:\n${filesList}\n- project-info.json (project metadata)\n\nBuild Instructions: ${pluginProject.buildInstructions}\nFiles location: ${pluginPath}`;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ App Service: Plugin generation failed after ${duration}ms:`, error);
      throw new Error(`Failed to generate plugin: ${error.message}`);
    }
  }  async generateCodeOnly(prompt: string, pluginName: string): Promise<{ enhancedPrompt: string; pluginProject: PluginProject }> {
    console.log(`🧩 App Service: Generating code-only for plugin "${pluginName}"`);
    console.log(`📝 App Service: Prompt: "${prompt}"`);
    
    try {      
      // Enhance the prompt using AI
      console.log(`🔧 App Service: Enhancing prompt...`);
      const enhancedPrompt = await this.aiService.enhancePrompt(prompt);
      console.log(`✅ App Service: Prompt enhanced`);
      
      // Generate plugin project using AI
      console.log(`🤖 App Service: Generating code structure...`);
      const pluginProject = await this.aiService.generatePluginCode(enhancedPrompt, pluginName);
      console.log(`✅ App Service: Code generation completed - ${pluginProject.files.length} files`);
      
      return {
        enhancedPrompt,
        pluginProject
      };
    } catch (error) {
      console.error(`❌ App Service: Code-only generation failed:`, error);
      throw new Error(`Failed to generate code: ${error.message}`);
    }
  }  async generateAndCompilePlugin(prompt: string, userId: string, name?: string, shouldCompile: boolean = true): Promise<string> {
    console.log(`🚀 App Service: Starting full plugin generation and compilation workflow`);
    console.log(`👤 App Service: User: "${userId}", Plugin: "${name || '(auto-generated)'}", Compile: ${shouldCompile}`);
    
    // First generate the plugin
    console.log(`📝 App Service: Step 1 - Generating plugin files...`);
    const generationResult = await this.generatePlugin(prompt, userId, name);
    console.log(`✅ App Service: Plugin generation completed`);
    
    if (!shouldCompile) {
      console.log(`⏭️ App Service: Skipping compilation (shouldCompile=false)`);
      return generationResult;
    }

    // Then compile it automatically with error fixing
    const pluginName = name || `plugin_${Date.now()}`;
    console.log(`🔨 App Service: Step 2 - Starting automatic compilation for plugin: ${pluginName}`);
    
    let compilationResult = await this.mavenService.compilePluginByUserAndName(userId, pluginName);
    let fixAttempts = 0;
    const maxFixAttempts = 3;
    
    // If compilation fails, attempt to fix errors automatically
    while (!compilationResult.success && fixAttempts < maxFixAttempts) {
      fixAttempts++;
      console.log(`❌ App Service: Compilation failed, attempting AI fix (attempt ${fixAttempts}/${maxFixAttempts})`);
      
      try {
        // Use the error fix service to attempt a fix
        console.log(`🤖 App Service: Calling error fix service...`);
        const fixResult = await this.errorFixService.attemptErrorFix(userId, pluginName, 1);
        
        if (fixResult.success) {
          console.log(`✅ App Service: Auto-fix successful on attempt ${fixAttempts}`);
          compilationResult = fixResult.finalCompilationResult!;
          break;
        } else {
          console.log(`❌ App Service: Auto-fix failed on attempt ${fixAttempts}: ${fixResult.message}`);
        }
      } catch (error) {
        console.error(`❌ App Service: Error during auto-fix attempt ${fixAttempts}:`, error.message);
      }      
      // If this wasn't the last attempt, try compiling again
      if (fixAttempts < maxFixAttempts) {
        console.log(`🔄 App Service: Retrying compilation after fix...`);
        compilationResult = await this.mavenService.compilePluginByUserAndName(userId, pluginName);
      }
    }
    
    console.log(`📊 App Service: Compilation workflow completed after ${fixAttempts} fix attempts`);
    let compilationInfo = '';
    if (compilationResult.success) {
      const fixInfo = fixAttempts > 0 ? ` (fixed after ${fixAttempts} auto-fix attempts)` : '';
      compilationInfo = `\n\n🎉 COMPILATION SUCCESSFUL${fixInfo}!\nJAR file created: ${compilationResult.jarPath}\nThe plugin is ready to deploy to your Minecraft server!`;
      console.log(`🎉 App Service: Plugin ${pluginName} compiled successfully${fixInfo}`);
    } else {
      compilationInfo = `\n\n❌ COMPILATION FAILED after ${fixAttempts} fix attempts!\nError: ${compilationResult.message}\nYou may need to manually review the code or provide a different prompt.`;
      console.error(`❌ App Service: Plugin ${pluginName} compilation failed after ${fixAttempts} fix attempts:`, compilationResult.errors);
    }

    return generationResult + compilationInfo;
  }
  async generatePluginOnly(prompt: string, userId: string, name?: string): Promise<string> {
    try {
      // Use prompt as plugin name if name is not provided
      const pluginName = name || `plugin_${Date.now()}`;
      
      // Create folder structure: generated/userId/pluginName
      const generatedPath = path.join(process.cwd(), 'generated');
      const userPath = path.join(generatedPath, userId);
      const pluginPath = path.join(userPath, pluginName);
      
      // Ensure directories exist (won't overwrite if they already exist)
      await fs.ensureDir(pluginPath);
      
      // Enhance the prompt using AI
      const enhancedPrompt = await this.aiService.enhancePrompt(prompt);
      
      // Generate plugin project using AI
      const pluginProject = await this.aiService.generatePluginCode(enhancedPrompt, pluginName);
      
      // Create all the files from the plugin project
      for (const file of pluginProject.files) {
        const filePath = path.join(pluginPath, file.path);
        
        // Ensure the directory exists for this file
        await fs.ensureDir(path.dirname(filePath));
        
        // Write the file content
        await fs.writeFile(filePath, file.content, 'utf8');
      }
      
      // Create a project summary file
      const projectSummary = {
        ...pluginProject,
        originalPrompt: prompt,
        enhancedPrompt,
        generatedAt: new Date().toISOString(),
        userId
      };
      
      const summaryPath = path.join(pluginPath, 'project-info.json');
      await fs.writeFile(summaryPath, JSON.stringify(projectSummary, null, 2), 'utf8');
      
      // Process the response
      const nameInfo = name ? ` with name: ${name}` : ` with auto-generated name: ${pluginName}`;
      const filesList = pluginProject.files.map(f => `- ${f.path} (${f.type})`).join('\n');
      
      return `Plugin project generated!\n\nProject: ${pluginProject.projectName}\nMinecraft Version: ${pluginProject.minecraftVersion}\nUser: ${userId}${nameInfo}\n\nGenerated files:\n${filesList}\n- project-info.json (project metadata)\n\nBuild Instructions: ${pluginProject.buildInstructions}\nFiles location: ${pluginPath}`;
    } catch (error) {
      throw new Error(`Failed to generate plugin: ${error.message}`);
    }
  } async checkProjectExists(userId: string, pluginName: string): Promise<{
    exists: boolean;
    hasCompiledJar: boolean;
    projectPath?: string;
    lastModified?: Date;
  }> {
    console.log(`🔍 App Service: Checking if project exists - userId: "${userId}", pluginName: "${pluginName}"`);
    
    try {
      const projectPath = path.join(process.cwd(), 'generated', userId, pluginName);
      const exists = await fs.pathExists(projectPath);
      
      if (!exists) {
        console.log(`❌ App Service: Project does not exist`);
        return { exists: false, hasCompiledJar: false };
      }
      
      console.log(`✅ App Service: Project directory exists`);
      
      // Check if it has a compiled JAR
      const compilationStatus = await this.mavenService.getCompilationStatus(projectPath);
      
      // Get project last modified time
      let lastModified: Date | undefined;
      try {
        const stats = await fs.stat(projectPath);
        lastModified = stats.mtime;
      } catch (error) {
        console.log(`⚠️ App Service: Could not get project stats: ${error.message}`);
      }
      
      console.log(`📊 App Service: Project exists with JAR: ${compilationStatus.hasJar}`);
      
      return {
        exists: true,
        hasCompiledJar: compilationStatus.hasJar,
        projectPath,
        lastModified
      };
    } catch (error) {
      console.error(`❌ App Service: Error checking project existence:`, error);
      return { exists: false, hasCompiledJar: false };
    }
  }
}
