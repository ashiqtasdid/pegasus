import { Injectable } from '@nestjs/common';

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

/**
 * AI Prompt Templates - Centralized prompt management for different AI tasks
 */
@Injectable()
export class AIPromptTemplates {
  /**
   * Generate system prompt for plugin code generation with explicit self-validation and zero-tolerance for errors
   */
  getPluginGenerationSystemPrompt(): string {
    return `You are an expert Minecraft plugin developer and a JSON formatting validator. Your ONLY task is to generate a 100% accurate, production-ready Minecraft plugin as a single valid JSON object, and to rigorously self-validate your output before responding.

=== ABSOLUTE RESPONSE RULES ===
- Respond with ONLY a valid JSON object. NO explanations, NO markdown, NO extra text.
- Your response MUST start with { and end with }.
- DO NOT use markdown code blocks.
- DO NOT include comments, explanations, or any text outside the JSON.
- ALL strings must be properly escaped (quotes: \\", newlines: \\\\n, backslashes: \\\\\\\\).
- File content must be complete, correct, and production-ready. NO placeholders, TODOs, or incomplete code.
- The code should be like this, com.pegasus.pluginname, where pluginname is the name of the plugin in lowercase, with no spaces or special characters.

=== REQUIRED JSON STRUCTURE (EXACT) ===
{
  "projectName": "string",
  "minecraftVersion": "1.20.1",
  "files": [
    {
      "path": "string (relative path from project root)",
      "content": "string (full file content, properly escaped)",
      "type": "string (file extension without dot)"
    }
  ],
  "dependencies": ["groupId:artifactId:version"],
  "buildInstructions": "mvn clean compile package"
}

=== MANDATORY FILES ===
- Main plugin class (.java) with full implementation, extends JavaPlugin, has onEnable/onDisable.
- plugin.yml with all required fields (name, main, version, api-version, commands, permissions).
- pom.xml with correct dependencies and build plugins.
- README.md with build and usage instructions.

=== CODE QUALITY & CONTENT RULES ===
- All code must be production-ready, compilable, and runnable as-is.
- NO placeholders, TODOs, or incomplete sections.
- Use correct Java package structure: com.example.[pluginname]
- Use current Spigot API (1.20.1) and best practices.
- Include error handling and logging.
- All files must be syntactically and semantically correct.

=== AI SELF-VALIDATION PHASE (MANDATORY) ===
Before outputting, you MUST:
1. Parse your own response as JSON and check for syntax errors.
2. Check that ALL required fields are present and non-empty.
3. Check that all file paths are valid and relative.
4. Check that all file content is complete, correct, and properly escaped.
5. Check that there are NO placeholders, TODOs, or incomplete code.
6. Check that dependencies are in Maven format.
7. Check that build instructions are valid.
8. Check that the main class extends JavaPlugin and has onEnable/onDisable.
9. Check that plugin.yml is valid and references the correct main class.
10. Check that pom.xml includes spigot-api and maven-compiler-plugin.
11. Check that README.md is present and complete.

If ANY check fails, REGENERATE your response until ALL checks pass. DO NOT output until you are 100% certain your response is perfect.

=== FINAL CHECKLIST (INCLUDE IN YOUR INTERNAL VALIDATION, NOT IN OUTPUT) ===
- [ ] Valid JSON syntax
- [ ] All required fields present
- [ ] All file content complete and correct
- [ ] No placeholders or TODOs
- [ ] All dependencies valid
- [ ] Main class correct
- [ ] plugin.yml correct
- [ ] pom.xml correct
- [ ] README.md present
- [ ] No markdown or extra text

REMEMBER: If you make ANY formatting or content error, the entire response will be rejected. You MUST self-validate and only output a perfect, 100% accurate JSON object.`;
  }
  /**
   * Generate enhanced user prompt for plugin generation with specific requirements breakdown
   */
  getPluginGenerationUserPrompt(pluginName: string, requirements: string): string {
    const sanitizedPluginName = pluginName.trim();
    const enhancedRequirements = this.enhanceRequirementsContext(requirements);
    
    return `Generate a complete Minecraft plugin with these EXACT specifications:

PLUGIN IDENTITY:
- Name: "${sanitizedPluginName}"
- Target Minecraft Version: 1.20.1
- Package: com.example.${sanitizedPluginName.toLowerCase().replace(/[^a-z0-9]/g, '')}

FUNCTIONAL REQUIREMENTS:
${enhancedRequirements}

IMPLEMENTATION STANDARDS:
- Use modern Bukkit/Spigot API patterns
- Include comprehensive error handling
- Add appropriate logging statements
- Follow Java best practices
- Generate complete, runnable code
- No placeholder text or TODOs

MANDATORY DELIVERABLES:
1. Main plugin class with proper lifecycle methods
2. Complete plugin.yml with all necessary metadata
3. Maven pom.xml with correct dependencies and build configuration
4. Comprehensive README.md with usage instructions

Generate production-ready code that compiles and runs without modifications.`;
  }

  /**
   * Enhance requirements with additional context and specifications
   */
  private enhanceRequirementsContext(requirements: string): string {
    const lines = requirements.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let enhanced = '';
    lines.forEach((line, index) => {
      enhanced += `${index + 1}. ${line}\n`;
    });
    
    // Add technical implementation hints
    enhanced += '\nTECHNICAL CONSIDERATIONS:\n';
    if (requirements.toLowerCase().includes('command')) {
      enhanced += '- Implement command handling with proper permission checks\n';
      enhanced += '- Include tab completion for user-friendly experience\n';
    }
    if (requirements.toLowerCase().includes('event') || requirements.toLowerCase().includes('listener')) {
      enhanced += '- Implement event listeners with proper event handling\n';
      enhanced += '- Cancel events appropriately when needed\n';
    }
    if (requirements.toLowerCase().includes('config')) {
      enhanced += '- Include configuration file support\n';
      enhanced += '- Provide default values and validation\n';
    }
    if (requirements.toLowerCase().includes('database') || requirements.toLowerCase().includes('storage')) {
      enhanced += '- Implement data persistence with proper error handling\n';
      enhanced += '- Include data validation and backup mechanisms\n';
    }
    if (requirements.toLowerCase().includes('gui') || requirements.toLowerCase().includes('inventory')) {
      enhanced += '- Create interactive inventory GUIs\n';
      enhanced += '- Handle click events and inventory management\n';
    }
    
    return enhanced;
  }

  /**
   * Generate system prompt for prompt enhancement
   */  getPromptEnhancementSystemPrompt(): string {
    return `You are an expert Minecraft plugin development consultant with deep knowledge of Bukkit/Spigot APIs, Java development patterns, and plugin architecture best practices.

YOUR TASK: Transform vague user requirements into detailed, technical specifications that will produce high-quality, production-ready Minecraft plugins.

ENHANCEMENT STRATEGY:
1. CLARIFY AMBIGUOUS REQUIREMENTS
   - Convert general requests into specific technical features
   - Define exact user interactions and workflows
   - Specify data structures and storage needs

2. ADD TECHNICAL IMPLEMENTATION DETAILS
   - Identify required Bukkit/Spigot APIs and events
   - Specify command structures and permissions
   - Define configuration requirements
   - Outline error handling strategies

3. INCLUDE BEST PRACTICES
   - Performance considerations
   - Security measures (permission checks, input validation)
   - User experience improvements
   - Code organization patterns

4. SPECIFY INTEGRATION REQUIREMENTS
   - Dependencies on other plugins or libraries
   - Database or file storage requirements
   - Network communication needs
   - Multi-world compatibility

ENHANCED SPECIFICATION FORMAT:
Provide a structured enhancement that includes:

CORE FUNCTIONALITY:
- [List main features with technical details]

USER INTERACTIONS:
- [Commands with syntax and permissions]
- [GUI interfaces if applicable]
- [Event triggers and responses]

TECHNICAL REQUIREMENTS:
- [Required APIs and events]
- [Data persistence strategy]
- [Configuration options]
- [Performance considerations]

QUALITY STANDARDS:
- [Error handling requirements]
- [Security measures]
- [User feedback mechanisms]
- [Logging and debugging features]

MINECRAFT-SPECIFIC CONSIDERATIONS:
- [Version compatibility]
- [Multi-world support if needed]
- [Resource pack/texture requirements]
- [Server performance impact]

Keep enhancement focused, detailed, and technically oriented while maintaining the original intent. Provide enough detail for a developer to implement without ambiguity.`;
  }
  /**
   * Generate enhanced user prompt for prompt enhancement with context analysis
   */
  getPromptEnhancementUserPrompt(originalPrompt: string): string {
    const promptLength = originalPrompt.length;
    const hasCommands = originalPrompt.toLowerCase().includes('command');
    const hasEvents = originalPrompt.toLowerCase().includes('event') || originalPrompt.toLowerCase().includes('listener');
    const hasGUI = originalPrompt.toLowerCase().includes('gui') || originalPrompt.toLowerCase().includes('inventory');
    const hasStorage = originalPrompt.toLowerCase().includes('storage') || originalPrompt.toLowerCase().includes('save') || originalPrompt.toLowerCase().includes('database');
    
    let contextHints = '';
    if (promptLength < 50) {
      contextHints += 'NOTE: This is a brief requirement that needs significant expansion. ';
    }
    if (hasCommands) {
      contextHints += 'Include detailed command specifications with permissions and syntax. ';
    }
    if (hasEvents) {
      contextHints += 'Specify event handling requirements and trigger conditions. ';
    }
    if (hasGUI) {
      contextHints += 'Detail GUI design and user interaction flows. ';
    }
    if (hasStorage) {
      contextHints += 'Define data persistence requirements and storage formats. ';
    }
    
    return `Transform this plugin requirement into a comprehensive technical specification:

ORIGINAL REQUIREMENT:
"${originalPrompt}"

ENHANCEMENT INSTRUCTIONS:
${contextHints}

Please provide a detailed specification that includes:
1. Specific feature breakdown with technical implementation details
2. Complete command structures with permissions and syntax
3. Event handling requirements and API usage
4. Data storage and configuration needs
5. User interface design (commands, GUIs, messages)
6. Error handling and validation requirements
7. Performance and security considerations
8. Integration and compatibility requirements

Make the specification detailed enough that a developer can implement it without ambiguity or additional questions.`;
  }
  /**
   * Get optimized model configurations for maximum accuracy
   */
  getModelConfigurations(): Record<string, { model: string; temperature?: number; max_tokens?: number; top_p?: number }> {
    return {
      codeGeneration: {
        model: 'anthropic/claude-sonnet-4',
        temperature: 0.1, // Very low for consistency and accuracy
        max_tokens: 16000, // Increased for complex plugins
        top_p: 0.9 // Focused on most likely tokens
      },
      promptEnhancement: {
        model: 'anthropic/claude-sonnet-4', // Upgraded from Gemini for better technical understanding
        temperature: 0.3, // Low for consistent technical analysis
        max_tokens: 6000,
        top_p: 0.95
      },
      errorFix: {
        model: 'anthropic/claude-sonnet-4',
        temperature: 0.05, // Extremely low for precise error fixing
        max_tokens: 16000,
        top_p: 0.85 // Very focused for debugging
      },
      validation: {
        model: 'anthropic/claude-sonnet-4',
        temperature: 0.0, // Deterministic for validation
        max_tokens: 4000,
        top_p: 0.8
      }
    };
  }

  /**
   * Validate prompt template parameters
   */
  validatePromptParameters(pluginName: string, requirements: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pluginName || pluginName.trim().length === 0) {
      errors.push('Plugin name is required');
    }

    if (!requirements || requirements.trim().length === 0) {
      errors.push('Requirements are required');
    }

    if (pluginName && pluginName.length > 100) {
      errors.push('Plugin name is too long (max 100 characters)');
    }    if (requirements && requirements.length > 50000) {
      errors.push('Requirements are too long (max 50000 characters)');
    }

    // Validate plugin name format
    if (pluginName && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(pluginName)) {
      errors.push('Plugin name must start with a letter and contain only letters, numbers, underscores, and hyphens');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get fallback project template
   */
  getFallbackProjectTemplate(pluginName: string, requirements: string): PluginProject {
    const packageName = pluginName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    return {
      projectName: pluginName,
      minecraftVersion: "1.20.1",
      files: [
        {
          path: `src/main/java/com/example/${packageName}/${this.capitalizeFirstLetter(pluginName)}Plugin.java`,
          content: this.createFallbackMainClass(pluginName, packageName),
          type: "java"
        },
        {
          path: "src/main/resources/plugin.yml",
          content: this.createFallbackPluginYml(pluginName, packageName, requirements),
          type: "yaml"
        },
        {
          path: "pom.xml",
          content: this.createFallbackPomXml(pluginName, packageName),
          type: "xml"
        },
        {
          path: "README.md",
          content: this.createFallbackReadme(pluginName, requirements),
          type: "md"
        }
      ],
      dependencies: [
        "org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT"
      ],
      buildInstructions: "mvn clean compile package"
    };
  }

  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private createFallbackMainClass(pluginName: string, packageName: string): string {
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
        // Initialize ${pluginName} functionality
    }
    
    @Override
    public void onDisable() {
        getLogger().info("${pluginName} plugin has been disabled!");
        // Cleanup ${pluginName} resources
    }
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (command.getName().equalsIgnoreCase("${pluginName.toLowerCase()}")) {
            if (sender instanceof Player) {
                Player player = (Player) sender;
                player.sendMessage("§a${pluginName} plugin is working!");
                return true;
            } else {
                sender.sendMessage("This command can only be used by players.");
            }
        }
        return false;
    }
}`;
  }

  private createFallbackPluginYml(pluginName: string, packageName: string, requirements: string): string {
    const className = this.capitalizeFirstLetter(pluginName) + 'Plugin';
    return `name: ${pluginName}
version: 1.0.0
main: com.example.${packageName}.${className}
api-version: 1.20
author: AI Generator
description: ${requirements}

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

  private createFallbackPomXml(pluginName: string, packageName: string): string {
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

  private createFallbackReadme(pluginName: string, requirements: string): string {
    return `# ${pluginName}

## Description
${requirements}

## Build Instructions
\`\`\`bash
mvn clean compile package
\`\`\`

## Installation
1. Build the plugin using Maven
2. Copy the generated JAR file to your server's plugins folder
3. Restart your server

## Usage
Use the command \`/${pluginName.toLowerCase()}\` to test the plugin functionality.

## Configuration
The plugin configuration can be found in the plugin.yml file.`;
  }
}
