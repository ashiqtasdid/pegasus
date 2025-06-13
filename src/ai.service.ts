import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model?: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface PluginFile {
  path: string;
  content: string;
  type: string;
}

export interface PluginProject {
  projectName: string;
  minecraftVersion: string;
  files: PluginFile[];
  dependencies: string[];
  buildInstructions: string;
}

@Injectable()
export class AiService {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly apiKey: string;
  private readonly siteUrl: string;
  private readonly siteName: string;
  
  // AI Model Configuration
  // - Claude Sonnet 4: Used for complex code generation and fixes
  // - Gemini Flash 1.5: Used for basic tasks like prompt enhancement
  private readonly codeGenerationModel = 'anthropic/claude-sonnet-4'; // Claude Sonnet 4
  private readonly promptEnhancementModel = 'google/gemini-flash-1.5'; // Gemini Flash 1.5
  
  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    this.siteUrl = this.configService.get<string>('YOUR_SITE_URL', 'http://localhost:3000');
    this.siteName = this.configService.get<string>('YOUR_SITE_NAME', 'Pegasus Plugin Generator');

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured in environment variables');
    }
  }

  async generatePluginCode(prompt: string, pluginName: string): Promise<PluginProject> {
    console.log(`🤖 AI Service: Starting plugin generation for "${pluginName}"`);
    console.log(`🎯 AI Service: Using Claude Sonnet 4 for code generation`);
    console.log(`📝 AI Service: User prompt: "${prompt}"`);
    
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are an expert Minecraft plugin developer. You MUST respond with ONLY a valid JSON object. No explanations, no markdown code blocks, no text outside the JSON structure.

RESPOND WITH ONLY RAW JSON (DO NOT use code block markdown formatting):
{
  "projectName": "string",
  "minecraftVersion": "string (e.g., 1.20.1)",
  "files": [
    {
      "path": "string (relative path from project root)",
      "content": "string (actual file content with proper escaping)",
      "type": "string (file extension: java, yaml, xml, md, etc.)"
    }
  ],
  "dependencies": ["array of dependency strings"],
  "buildInstructions": "string (build command)"
}

REQUIREMENTS:
- Generate complete, comprehensive Minecraft plugin project with full implementation
- Include main plugin class, plugin.yml, pom.xml, README.md, and any additional classes needed
- Create complete, production-ready code with all features fully implemented
- Use proper Java package structure and Minecraft plugin best practices
- Generate as many files and as much code as needed for a complete working plugin
- Include comprehensive error handling, logging, and proper code organization
- Escape all special characters properly in JSON (newlines as \\n, quotes as \\")
- NO markdown formatting, NO code blocks, ONLY raw JSON
- Ensure all strings are properly escaped for JSON format
- Do NOT include any explanations, comments, or additional text outside the JSON structure
- Do NOT use any markdown code blocks, just return the JSON object directly
- Ensure the JSON is valid and parsable
- Make sure every single file is included in the "files" array with correct paths and content
- Ensure the plugin is fully functional and adheres to Minecraft plugin development standards
- Ensure the plugin is complete with the features described in the prompt
- MOST IMPORTANT: MAKE SURE THE PLUGIN HAS MODULARITY AND EXTENSIBILITY
- Ensure the plugin can be easily extended with additional features in the future
- Also no files should be larger than 400 lines of code, split them if necessary & make them modular
- Make sure you do not leave any TODOs or incomplete sections in the code
- Code should be production-ready and fully functional and fully complete
- You do not need to generate long codes if the plugin is simple, but if it is complex, generate as much code as needed
`
      },
      {
        role: 'user',
        content: `Create a Minecraft plugin named "${pluginName}" with the following requirements: ${prompt}`
      }
    ];
      console.log(`🌐 AI Service: Calling OpenRouter API with Claude Sonnet 4 for code generation`);
    const response = await this.callOpenRouter({
      model: this.codeGenerationModel,
      messages,
      max_tokens: 12000, // Allow large responses for complex plugins
            // No max_tokens limit - allow unlimited code generation for complex plugins
    });
    
    console.log(`✅ AI Service: Received response from OpenRouter (${response.usage?.total_tokens || 'unknown'} tokens)`);

    const aiResponse = response.choices[0]?.message?.content || '';
    console.log(`📦 AI Service: Response length: ${aiResponse.length} characters`);
    
    try {
      // Try to parse the JSON response
      console.log(`🔍 AI Service: Parsing JSON response...`);
      
      let jsonString = aiResponse.trim();
      
      // Remove markdown code blocks if present
      if (jsonString.startsWith('```json')) {
        console.log(`🧹 AI Service: Removing markdown json code block wrapper`);
        jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonString.startsWith('```')) {
        console.log(`🧹 AI Service: Removing markdown code block wrapper`);
        jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to extract JSON object
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`❌ AI Service: No JSON found in AI response, using fallback`);
        throw new Error('No JSON found in AI response');
      }
      
      console.log(`🔍 AI Service: Attempting to parse ${jsonMatch[0].length} character JSON string`);
      const parsedProject: PluginProject = JSON.parse(jsonMatch[0]);
      console.log(`✅ AI Service: Successfully parsed JSON project structure`);
      console.log(`📁 AI Service: Generated ${parsedProject.files?.length || 0} files for project "${parsedProject.projectName}"`);
      
      // Validate the structure
      if (!parsedProject.projectName || !parsedProject.files || !Array.isArray(parsedProject.files)) {
        console.log(`❌ AI Service: Invalid project structure, using fallback`);
        throw new Error('Invalid project structure returned by AI');
      }
      
      console.log(`🎉 AI Service: Plugin generation completed successfully`);
      return parsedProject;
    } catch (parseError) {
      console.log(`⚠️ AI Service: JSON parsing failed: ${parseError.message}`);
      console.log(`🔄 AI Service: Creating fallback project structure`);
      // Fallback: create a basic structure if JSON parsing fails
      const fallbackProject = this.createFallbackProject(pluginName, prompt, aiResponse);
      console.log(`✅ AI Service: Fallback project created with ${fallbackProject.files.length} files`);
      return fallbackProject;
    }
  }

  async enhancePrompt(originalPrompt: string): Promise<string> {
    console.log(`🔧 AI Service: Enhancing prompt - original length: ${originalPrompt.length} characters`);
    console.log(`🎯 AI Service: Using Gemini Flash 1.5 for prompt enhancement`);
    
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: 'You are an expert at understanding and enhancing plugin development requirements. Take the user input and expand it into a detailed, technical specification for plugin development.'
      },
      {
        role: 'user',
        content: `Please enhance this plugin requirement into a detailed specification: ${originalPrompt}`
      }
    ];    console.log(`🌐 AI Service: Calling OpenRouter API for prompt enhancement with Gemini Flash 1.5`);
    const response = await this.callOpenRouter({
      model: this.promptEnhancementModel,
      messages,
      temperature: 0.5
      // No max_tokens limit - allow comprehensive prompt enhancement
    });

    const enhancedPrompt = response.choices[0]?.message?.content || originalPrompt;
    console.log(`✅ AI Service: Prompt enhanced - new length: ${enhancedPrompt.length} characters`);
    console.log(`📈 AI Service: Enhancement ratio: ${(enhancedPrompt.length / originalPrompt.length).toFixed(2)}x`);

    return enhancedPrompt;
  }

  private async callOpenRouter(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const startTime = Date.now();
    console.log(`🔗 AI Service: Making HTTP request to OpenRouter API`);
    console.log(`📊 AI Service: Request model: ${request.model}, temperature: ${request.temperature}, max_tokens: ${request.max_tokens}`);
    
    try {
      const response: AxiosResponse<OpenRouterResponse> = await axios.post(
        `${this.baseUrl}/chat/completions`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.siteName,
          },
        }
      );

      const duration = Date.now() - startTime;
      console.log(`✅ AI Service: OpenRouter API call completed in ${duration}ms`);
      console.log(`📊 AI Service: Token usage - prompt: ${response.data.usage?.prompt_tokens}, completion: ${response.data.usage?.completion_tokens}, total: ${response.data.usage?.total_tokens}`);

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ AI Service: OpenRouter API call failed after ${duration}ms`);
      
      if (axios.isAxiosError(error)) {
        console.error(`❌ AI Service: HTTP ${error.response?.status} - ${error.response?.data?.error?.message || error.message}`);
        throw new Error(`OpenRouter API error: ${error.response?.data?.error?.message || error.message}`);
      }
      console.error(`❌ AI Service: Unexpected error: ${error.message}`);
      throw new Error(`Failed to call OpenRouter API: ${error.message}`);
    }
  }

  private createFallbackProject(pluginName: string, prompt: string, aiResponse: string): PluginProject {
    console.log(`🔄 AI Service: Creating fallback project structure for "${pluginName}"`);
    const packageName = pluginName.toLowerCase().replace(/[^a-z0-9]/g, '');
    console.log(`📦 AI Service: Generated package name: "${packageName}"`);
    
    const fallbackProject = {
      projectName: pluginName,
      minecraftVersion: "1.20.1",
      files: [
        {
          path: `src/main/java/com/example/${packageName}/${this.capitalizeFirstLetter(pluginName)}Plugin.java`,
          content: this.createMainJavaClass(pluginName, packageName),
          type: "java"
        },
        {
          path: "src/main/resources/plugin.yml",
          content: this.createPluginYml(pluginName, packageName, prompt),
          type: "yaml"
        },
        {
          path: "pom.xml",
          content: this.createPomXml(pluginName, packageName),
          type: "xml"
        },
        {
          path: "README.md",
          content: this.createReadme(pluginName, prompt, aiResponse),
          type: "md"
        }
      ],
      dependencies: [
        "org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT"
      ],
      buildInstructions: "mvn clean compile package"
    };
    
    console.log(`✅ AI Service: Fallback project created with ${fallbackProject.files.length} files`);
    return fallbackProject;
  }

  private createMainJavaClass(pluginName: string, packageName: string): string {
    const className = this.capitalizeFirstLetter(pluginName) + 'Plugin';
    return `package com.example.${packageName};

import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class ${className} extends JavaPlugin {
    
    @Override
    public void onEnable() {
        getLogger().info("${pluginName} plugin has been enabled!");
        // TODO: Initialize ${pluginName} functionality
    }
    
    @Override
    public void onDisable() {
        getLogger().info("${pluginName} plugin has been disabled!");
        // TODO: Cleanup ${pluginName} resources
    }
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (command.getName().equalsIgnoreCase("${pluginName.toLowerCase()}")) {
            if (sender instanceof Player) {
                Player player = (Player) sender;
                player.sendMessage("§a${pluginName} plugin is working!");
                // TODO: Implement ${pluginName} command logic
                return true;
            } else {
                sender.sendMessage("This command can only be used by players.");
            }
        }
        return false;
    }
}`;
  }

  private createPluginYml(pluginName: string, packageName: string, prompt: string): string {
    const className = this.capitalizeFirstLetter(pluginName) + 'Plugin';
    return `name: ${pluginName}
version: 1.0.0
main: com.example.${packageName}.${className}
api-version: 1.20
author: AI Generator
description: ${prompt}

commands:
  ${pluginName.toLowerCase()}:
    description: Main ${pluginName} command
    usage: /${pluginName.toLowerCase()}
    permission: ${pluginName.toLowerCase()}.use

permissions:
  ${pluginName.toLowerCase()}.use:
    description: Allows using ${pluginName}
    default: true`;
  }

  private createPomXml(pluginName: string, packageName: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>${packageName}</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    <name>${pluginName}</name>
    
    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
    
    <repositories>
        <repository>
            <id>spigot-repo</id>
            <url>https://hub.spigotmc.org/nexus/content/repositories/snapshots/</url>
        </repository>
    </repositories>
    
    <dependencies>
        <dependency>
            <groupId>org.spigotmc</groupId>
            <artifactId>spigot-api</artifactId>
            <version>1.20.1-R0.1-SNAPSHOT</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>17</source>
                    <target>17</target>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;
  }

  private createReadme(pluginName: string, prompt: string, aiResponse: string): string {
    return `# ${pluginName}

## Description
${prompt}

## AI Response
${aiResponse}

## Build Instructions
\`\`\`bash
mvn clean compile package
\`\`\`

## Installation
1. Build the plugin using Maven
2. Copy the generated JAR file to your server's plugins folder
3. Restart your server`;
  }

  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
