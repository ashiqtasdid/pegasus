class PluginGenerator {
    constructor() {
        this.apiBase = window.location.origin;
        this.currentProject = null;
        this.init();
    }    init() {
        this.bindEvents();
        this.loadExamples();
        this.initChatSystem();
    }bindEvents() {
        document.getElementById('pluginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generatePlugin();
        });

        document.getElementById('refreshProjectBtn').addEventListener('click', () => {
            if (this.currentProject) {
                this.loadProjectFiles(this.currentProject.userId, this.currentProject.pluginName);
            }
        });

        // Auto-populate user ID if empty
        document.getElementById('userId').addEventListener('focus', (e) => {
            if (!e.target.value) {
                e.target.value = 'user-' + Math.random().toString(36).substr(2, 8);
            }
        });

        // Check for existing project when plugin name or user ID changes
        const pluginNameField = document.getElementById('pluginName');
        const userIdField = document.getElementById('userId');
        
        let checkTimeout;
        const checkProject = () => {
            clearTimeout(checkTimeout);
            checkTimeout = setTimeout(() => {
                this.checkExistingProject();
            }, 500); // Debounce for 500ms
        };

        pluginNameField.addEventListener('input', checkProject);
        userIdField.addEventListener('input', checkProject);
        pluginNameField.addEventListener('blur', () => this.checkExistingProject());
    }

    loadExamples() {
        const examples = [
            "Create a teleportation plugin with /sethome and /home commands, including cooldowns",
            "Make a custom enchantment plugin that adds fire resistance and speed boost effects",
            "Build a economy plugin with virtual currency, shops, and player transactions",
            "Create a mini-game plugin for spleef with automatic arena management",
            "Make a custom mob spawner plugin with configurable spawn rates and locations"
        ];

        const promptField = document.getElementById('prompt');
        let exampleIndex = 0;

        promptField.addEventListener('focus', () => {
            if (!promptField.value) {
                promptField.placeholder = examples[exampleIndex];
                exampleIndex = (exampleIndex + 1) % examples.length;
            }
        });
    }

    async generatePlugin() {
        const formData = new FormData(document.getElementById('pluginForm'));
        const data = {
            prompt: formData.get('prompt'),
            userId: formData.get('userId'),
            name: formData.get('pluginName') || undefined,
            autoCompile: true,
            complexity: formData.get('complexity')
        };

        // Validation
        if (!data.prompt.trim()) {
            this.showError('Please describe your plugin idea');
            return;
        }        if (!data.userId.trim()) {
            this.showError('Please enter a user ID');
            return;
        }

        this.hideResults();
        this.hideProject();

        // Check if this is a recompile operation
        const statusDiv = document.getElementById('projectStatus');
        const isRecompiling = !statusDiv.classList.contains('hidden') && 
                            (statusDiv.innerHTML.includes('Project exists') || statusDiv.innerHTML.includes('Will recompile'));

        this.showLoading(isRecompiling);

        try {
            const response = await fetch(`${this.apiBase}/plugin/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.text();
            this.showResults(result, data);
              // Store current project info for later use
            this.currentProject = {
                userId: data.userId,
                pluginName: data.name || this.extractPluginNameFromResult(result)
            };

            // Update chat context with new project
            this.updateChatContext();

            // Load project files if generation was successful
            if (result.includes('COMPILATION SUCCESSFUL') || result.includes('Plugin project generated')) {
                setTimeout(() => {
                    this.loadProjectFiles(this.currentProject.userId, this.currentProject.pluginName);
                }, 1000);
            }

        } catch (error) {
            console.error('Generation error:', error);
            this.showError(`Failed to generate plugin: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    async loadProjectFiles(userId, pluginName) {
        if (!userId || !pluginName) return;

        try {
            const response = await fetch(`${this.apiBase}/plugin/read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId, pluginName })
            });

            if (!response.ok) {
                throw new Error(`Failed to load project files: ${response.statusText}`);
            }

            const projectData = await response.json();
            this.showProjectFiles(projectData);

        } catch (error) {
            console.error('Error loading project files:', error);
            this.showError(`Failed to load project files: ${error.message}`);
        }
    }

    extractPluginNameFromResult(result) {
        // Try to extract plugin name from result text        const match = result.match(/Project: ([^\n]+)/);
        return match ? match[1].trim() : 'GeneratedPlugin';
    }

    showLoading(isRecompiling = false) {
        document.getElementById('loadingState').classList.remove('hidden');
        document.getElementById('generateBtn').disabled = true;
        
        if (isRecompiling) {
            document.getElementById('generateBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Recompiling...';
        } else {
            document.getElementById('generateBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
        }
    }

    hideLoading() {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('generateBtn').innerHTML = '<i class="fas fa-rocket mr-2"></i>Generate Plugin';
    }

    showResults(result, requestData) {
        const container = document.getElementById('resultsContent');
        const isSuccess = result.includes('COMPILATION SUCCESSFUL');
        const hasAutoFix = result.includes('fixed after') || result.includes('auto-fix');

        container.innerHTML = `
            <div class="border-l-4 ${isSuccess ? 'border-green-400 bg-green-50' : 'border-yellow-400 bg-yellow-50'} p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas ${isSuccess ? 'fa-check-circle text-green-400' : 'fa-exclamation-triangle text-yellow-400'} text-xl"></i>
                    </div>
                    <div class="ml-3 flex-1">
                        <h3 class="text-sm font-medium ${isSuccess ? 'text-green-800' : 'text-yellow-800'}">
                            ${isSuccess ? 'Plugin Generated Successfully!' : 'Generation Completed with Warnings'}
                        </h3>
                        <div class="mt-2 text-sm ${isSuccess ? 'text-green-700' : 'text-yellow-700'}">
                            <pre class="whitespace-pre-wrap font-mono text-xs bg-white p-3 rounded border overflow-x-auto">${result}</pre>
                        </div>
                    </div>
                </div>
            </div>

            ${hasAutoFix ? `
                <div class="border-l-4 border-blue-400 bg-blue-50 p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <i class="fas fa-magic text-blue-400 text-xl"></i>
                        </div>
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-blue-800">
                                AI Auto-Fix Applied
                            </h3>
                            <p class="mt-1 text-sm text-blue-700">
                                The AI automatically detected and fixed compilation errors during generation.
                            </p>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-800 mb-2">Request Details:</h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                        <span class="font-medium text-gray-600">User ID:</span>
                        <span class="ml-1 text-gray-800">${requestData.userId}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-600">Plugin Name:</span>
                        <span class="ml-1 text-gray-800">${requestData.name || 'Auto-generated'}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-600">Auto-Compile:</span>
                        <span class="ml-1 text-gray-800">${requestData.autoCompile ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            </div>            ${isSuccess ? `
                <div class="text-center space-y-2">
                    <div class="flex flex-col sm:flex-row gap-2 justify-center">
                        <button onclick="pluginGen.downloadJar('${requestData.userId}', '${requestData.name || 'plugin_' + Date.now()}')" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            <i class="fas fa-download mr-2"></i>
                            Download JAR File
                        </button>
                        <button onclick="pluginGen.downloadInstructions()" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                            <i class="fas fa-book mr-2"></i>
                            Installation Guide
                        </button>
                    </div>
                    <div id="downloadStatus" class="text-sm text-gray-600"></div>
                </div>
                    </button>
                </div>
            ` : ''}
        `;

        document.getElementById('resultsSection').classList.remove('hidden');
    }    showProjectFiles(projectData) {
        if (!projectData.projectExists) {
            document.getElementById('projectFiles').innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-folder-open text-2xl mb-2"></i>
                    <p class="text-sm">Project files not found</p>
                </div>
            `;
            document.getElementById('projectSection').classList.remove('hidden');
            return;
        }

        const { pluginProject } = projectData;
        const container = document.getElementById('projectFiles');

        // Create compact project info
        const projectInfoHtml = `
            <div class="compact-project-info">
                <div class="compact-project-info-grid">
                    <div class="compact-project-info-item">
                        <span class="compact-project-info-label">Name:</span> 
                        <span>${pluginProject.projectName}</span>
                    </div>
                    <div class="compact-project-info-item">
                        <span class="compact-project-info-label">Version:</span> 
                        <span>${pluginProject.minecraftVersion}</span>
                    </div>
                    <div class="compact-project-info-item">
                        <span class="compact-project-info-label">Dependencies:</span> 
                        <span>${pluginProject.dependencies?.join(', ') || 'None'}</span>
                    </div>
                </div>
                <div class="compact-download-section">
                    <button onclick="pluginGen.downloadJar('${this.currentProject?.userId}', '${this.currentProject?.pluginName}')" class="compact-download-btn">
                        <i class="fas fa-download mr-1"></i>JAR
                    </button>
                    <button onclick="pluginGen.downloadInstructions()" class="compact-download-btn secondary">
                        <i class="fas fa-book mr-1"></i>Guide
                    </button>
                </div>
                <div id="projectDownloadStatus" class="text-xs text-center mt-2"></div>
            </div>
        `;

        // Create VS Code style file tree
        const fileTreeHtml = this.generateVSCodeFileTree(pluginProject.files);

        container.innerHTML = projectInfoHtml + fileTreeHtml;
        document.getElementById('projectSection').classList.remove('hidden');

        // Add event listeners for collapsible files
        this.setupFileTreeEvents();
    }

    generateVSCodeFileTree(files) {
        let html = '<div class="vscode-explorer">';
        
        files.forEach((file, index) => {
            const fileType = this.getFileType(file.path);
            const fileName = file.path.split('/').pop();
            const isCollapsed = index > 0; // Keep first file expanded
            
            html += `
                <div class="collapsible-file">
                    <div class="collapsible-header ${isCollapsed ? 'collapsed' : ''}" onclick="pluginGen.toggleFileCollapse(this)">
                        <i class="fas fa-chevron-down collapsible-toggle"></i>
                        <div class="vscode-file-item" data-type="${fileType}">
                            <div class="vscode-file-icon">
                                <i class="fas ${this.getFileIcon(file.path)}"></i>
                            </div>
                            <div class="vscode-file-name">${fileName}</div>
                        </div>
                    </div>
                    <div class="collapsible-content ${isCollapsed ? 'collapsed' : ''}">
                        <div class="compact-code-viewer">
                            <div class="compact-code-header">
                                <span>${file.path}</span>
                                <span class="text-xs">${fileType.toUpperCase()}</span>
                            </div>
                            <div class="compact-code-content">
                                ${this.formatCodeWithLineNumbers(file.content)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    formatCodeWithLineNumbers(content) {
        const lines = content.split('\n');
        return lines.map((line, index) => {
            const lineNumber = index + 1;
            const escapedLine = this.escapeHtml(line);
            return `<div><span class="compact-line-numbers">${lineNumber}</span>${escapedLine}</div>`;
        }).join('');
    }

    toggleFileCollapse(headerElement) {
        const content = headerElement.nextElementSibling;
        const toggle = headerElement.querySelector('.collapsible-toggle');
        
        headerElement.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    }

    setupFileTreeEvents() {
        // Add any additional event listeners for the file tree
        // This can be extended for more interactive features
    }

    getFileIcon(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'java': return 'fab fa-java';
            case 'yml': case 'yaml': return 'fas fa-cogs';
            case 'xml': return 'fas fa-code';
            case 'md': return 'fab fa-markdown';
            case 'json': return 'fas fa-brackets-curly';
            default: return 'fas fa-file-code';
        }
    }

    getFileType(filePath) {
        return filePath.split('.').pop()?.toLowerCase() || 'file';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadInstructions() {
        const instructions = `
# Minecraft Plugin Installation Guide

## Generated Plugin Installation

1. **Locate your JAR file**: The compiled plugin JAR file should be in the project's target directory.

2. **Copy to server**: 
   - Navigate to your Minecraft server directory
   - Place the JAR file in the 'plugins' folder

3. **Restart server**: Stop and start your Minecraft server to load the plugin

4. **Verify installation**: Check the server console for plugin load messages

## Troubleshooting

- Ensure your server is running Spigot or Paper (Bukkit-compatible)
- Check that the Minecraft version matches your server version
- Review server logs for any error messages
- Make sure you have the required permissions to install plugins

## Plugin Information

Generated on: ${new Date().toLocaleString()}
Project Files: Available in the project directory
Build Command: mvn clean package

For support or modifications, refer to the generated source code.
        `.trim();

        const blob = new Blob([instructions], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'minecraft-plugin-installation-guide.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }    async downloadJar(userId, pluginName) {
        console.log('🔥 Attempting to download JAR for:', { userId, pluginName });
        
        // Use appropriate status div based on context
        const statusDiv = document.getElementById('downloadStatus') || document.getElementById('projectDownloadStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Checking JAR availability...';
        }
        
        try {
            // First check if JAR is available
            const response = await fetch(`${this.apiBase}/plugin/download-info/${encodeURIComponent(userId)}/${encodeURIComponent(pluginName)}`);
            const downloadInfo = await response.json();
            
            if (!response.ok) {
                throw new Error('Failed to get download information');
            }
            
            if (!downloadInfo.available) {
                if (statusDiv) {
                    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle text-yellow-500 mr-1"></i>JAR file not available. Please ensure the plugin has been compiled successfully.';
                }
                return;
            }
            
            // Show download info
            const fileSizeMB = (downloadInfo.fileSize / 1024 / 1024).toFixed(2);
            if (statusDiv) {
                statusDiv.innerHTML = `<i class="fas fa-info-circle text-blue-500 mr-1"></i>Downloading ${downloadInfo.jarFile} (${fileSizeMB} MB)...`;
            }
            
            // Start download
            const downloadUrl = `${this.apiBase}/plugin/download/${encodeURIComponent(userId)}/${encodeURIComponent(pluginName)}`;
            
            // Create download link and trigger it
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = downloadInfo.jarFile;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Show success message
            if (statusDiv) {
                statusDiv.innerHTML = `<i class="fas fa-check-circle text-green-500 mr-1"></i>Download started! Check your downloads folder for ${downloadInfo.jarFile}`;
            }
            
            // Clear status after 5 seconds
            setTimeout(() => {
                if (statusDiv) {
                    statusDiv.innerHTML = '';
                }
            }, 5000);
            
        } catch (error) {
            console.error('Download error:', error);
            if (statusDiv) {
                statusDiv.innerHTML = `<i class="fas fa-times-circle text-red-500 mr-1"></i>Download failed: ${error.message}`;
            }
            
            // Clear error after 10 seconds
            setTimeout(() => {
                if (statusDiv) {
                    statusDiv.innerHTML = '';
                }
            }, 10000);
        }
    }

    async checkDownloadAvailability(userId, pluginName) {
        try {
            const response = await fetch(`${this.apiBase}/plugin/download-info/${encodeURIComponent(userId)}/${encodeURIComponent(pluginName)}`);
            const downloadInfo = await response.json();
            
            if (response.ok && downloadInfo.available) {
                return {
                    available: true,
                    jarFile: downloadInfo.jarFile,
                    fileSize: downloadInfo.fileSize,
                    lastModified: downloadInfo.lastModified
                };
            }
            
            return { available: false };
        } catch (error) {
            console.error('Error checking download availability:', error);
            return { available: false };
        }
    }

    hideResults() {
        document.getElementById('resultsSection').classList.add('hidden');
    }

    hideProject() {
        document.getElementById('projectSection').classList.add('hidden');
    }

    showError(message) {
        const container = document.getElementById('resultsContent');
        container.innerHTML = `
            <div class="border-l-4 border-red-400 bg-red-50 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas fa-exclamation-circle text-red-400 text-xl"></i>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-800">Error</h3>
                        <div class="mt-2 text-sm text-red-700">
                            ${message}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('resultsSection').classList.remove('hidden');
    }

    async checkExistingProject() {
        const pluginName = document.getElementById('pluginName').value.trim();
        const userId = document.getElementById('userId').value.trim();
        const statusDiv = document.getElementById('projectStatus');
        
        // Clear status if no plugin name or user ID
        if (!pluginName || !userId) {
            statusDiv.classList.add('hidden');
            statusDiv.innerHTML = '';
            return;
        }

        try {
            console.log('🔍 Checking for existing project:', { userId, pluginName });
            
            const response = await fetch(`${this.apiBase}/plugin/check-exists`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId,
                    pluginName: pluginName
                })
            });

            if (!response.ok) {
                throw new Error('Failed to check project existence');
            }

            const result = await response.json();
            
            if (result.exists) {
                const lastModified = result.lastModified ? new Date(result.lastModified).toLocaleString() : 'Unknown';
                
                if (result.hasCompiledJar) {
                    statusDiv.innerHTML = `
                        <div class="flex items-center p-2 bg-green-50 border border-green-200 rounded">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            <div class="flex-1">
                                <span class="text-green-800 font-medium">Project exists with compiled JAR</span>
                                <div class="text-green-600 text-xs">Last modified: ${lastModified}</div>
                                <div class="text-green-600 text-xs">Will recompile existing project instead of creating new one</div>
                            </div>
                            <button onclick="pluginGen.loadProjectFiles('${userId}', '${pluginName}')" class="ml-2 text-green-600 hover:text-green-800 text-sm">
                                <i class="fas fa-eye mr-1"></i>View
                            </button>
                        </div>
                    `;
                } else {
                    statusDiv.innerHTML = `
                        <div class="flex items-center p-2 bg-yellow-50 border border-yellow-200 rounded">
                            <i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
                            <div class="flex-1">
                                <span class="text-yellow-800 font-medium">Project exists but not compiled</span>
                                <div class="text-yellow-600 text-xs">Last modified: ${lastModified}</div>
                                <div class="text-yellow-600 text-xs">Will attempt to recompile existing project</div>
                            </div>
                            <button onclick="pluginGen.loadProjectFiles('${userId}', '${pluginName}')" class="ml-2 text-yellow-600 hover:text-yellow-800 text-sm">
                                <i class="fas fa-eye mr-1"></i>View
                            </button>
                        </div>
                    `;
                }
                statusDiv.classList.remove('hidden');
            } else {
                statusDiv.innerHTML = `
                    <div class="flex items-center p-2 bg-blue-50 border border-blue-200 rounded">
                        <i class="fas fa-plus-circle text-blue-500 mr-2"></i>
                        <span class="text-blue-800">New project - will generate fresh plugin files</span>
                    </div>                `;
                statusDiv.classList.remove('hidden');
            }
            
        } catch (error) {
            console.error('Error checking project existence:', error);
            statusDiv.innerHTML = `
                <div class="flex items-center p-2 bg-red-50 border border-red-200 rounded">
                    <i class="fas fa-exclamation-circle text-red-500 mr-2"></i>
                    <span class="text-red-800 text-xs">Could not check project status</span>
                </div>
            `;
            statusDiv.classList.remove('hidden');
        }
    }

    // ==================== CHAT FUNCTIONALITY ====================

    initChatSystem() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendChatBtn');
        const clearBtn = document.getElementById('clearChatBtn');
        const quickQuestionBtns = document.querySelectorAll('.quick-question-btn');

        // Enable/disable send button based on input
        chatInput.addEventListener('input', () => {
            const hasText = chatInput.value.trim().length > 0;
            sendBtn.disabled = !hasText;
            sendBtn.classList.toggle('opacity-50', !hasText);
            sendBtn.classList.toggle('cursor-not-allowed', !hasText);
        });

        // Send message on button click
        sendBtn.addEventListener('click', () => {
            this.sendChatMessage();
        });

        // Send message on Enter (Shift+Enter for new line)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) {
                    this.sendChatMessage();
                }
            }
        });

        // Clear chat
        clearBtn.addEventListener('click', () => {
            this.clearChat();
        });

        // Quick question buttons
        quickQuestionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.dataset.question;
                chatInput.value = question;
                chatInput.dispatchEvent(new Event('input')); // Trigger input event to enable send button
                this.sendChatMessage();
            });
        });

        // Initialize chat context display
        this.updateChatContext();
    }

    updateChatContext() {
        const contextSpan = document.getElementById('chatContext');
        if (this.currentProject && this.currentProject.pluginName) {
            contextSpan.textContent = `Plugin: ${this.currentProject.pluginName}`;
            contextSpan.classList.remove('text-gray-500');
            contextSpan.classList.add('text-indigo-600', 'font-medium');
        } else {
            contextSpan.textContent = 'General Questions';
            contextSpan.classList.remove('text-indigo-600', 'font-medium');
            contextSpan.classList.add('text-gray-500');
        }
    }

    async sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (!message) return;

        // Clear input and disable send button
        chatInput.value = '';
        document.getElementById('sendChatBtn').disabled = true;

        // Add user message to chat
        this.addChatMessage('user', message);

        // Get current context
        const userId = document.getElementById('userId').value.trim();
        const pluginName = this.currentProject?.pluginName || null;

        try {
            // Show typing indicator
            this.addTypingIndicator();

            // Send to chat API
            const response = await fetch(`${this.apiBase}/chat/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    username: userId || 'anonymous',
                    pluginName: pluginName
                })
            });

            const data = await response.json();

            // Remove typing indicator
            this.removeTypingIndicator();

            if (data.success) {
                // Add AI response
                this.addChatMessage('assistant', data.message, {
                    type: data.type,
                    contextLoaded: data.contextLoaded,
                    filesAnalyzed: data.filesAnalyzed
                });
            } else {
                this.addChatMessage('error', data.error || 'Failed to get response from AI assistant');
            }

        } catch (error) {
            console.error('Chat error:', error);
            this.removeTypingIndicator();
            this.addChatMessage('error', 'Failed to communicate with AI assistant. Please try again.');
        }
    }

    addChatMessage(type, content, metadata = {}) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        
        // Clear empty state if this is the first message
        if (messagesContainer.children.length === 1 && 
            messagesContainer.firstElementChild.classList.contains('text-center')) {
            messagesContainer.innerHTML = '';
        }

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'user') {
            messageDiv.className = 'flex justify-end';
            messageDiv.innerHTML = `
                <div class="max-w-xs lg:max-w-md px-4 py-2 bg-indigo-600 text-white rounded-lg shadow">
                    <div class="text-sm">${this.escapeHtml(content)}</div>
                    <div class="text-xs text-indigo-200 mt-1">${timestamp}</div>
                </div>
            `;
        } else if (type === 'assistant') {
            messageDiv.className = 'flex justify-start';
            
            // Format the AI response (convert markdown to HTML)
            const formattedContent = this.formatMarkdown(content);
            
            // Create metadata display
            let metadataHtml = '';
            if (metadata.type) {
                const typeIcon = metadata.type === 'info' ? 'fas fa-info-circle text-blue-500' : 'fas fa-wrench text-orange-500';
                metadataHtml += `<span class="inline-flex items-center text-xs text-gray-500"><i class="${typeIcon} mr-1"></i>${metadata.type}</span>`;
            }
            if (metadata.contextLoaded) {
                metadataHtml += `<span class="inline-flex items-center text-xs text-green-600 ml-2"><i class="fas fa-check-circle mr-1"></i>Plugin context loaded</span>`;
            }
            if (metadata.filesAnalyzed > 0) {
                metadataHtml += `<span class="text-xs text-gray-500 ml-2">${metadata.filesAnalyzed} files analyzed</span>`;
            }

            messageDiv.innerHTML = `
                <div class="max-w-none lg:max-w-4xl px-4 py-3 bg-gray-100 text-gray-900 rounded-lg shadow">
                    <div class="flex items-center mb-2">
                        <i class="fas fa-robot text-purple-500 mr-2"></i>
                        <span class="text-sm font-medium text-gray-700">AI Assistant</span>
                        <div class="flex-1"></div>
                        <span class="text-xs text-gray-500">${timestamp}</span>
                    </div>
                    <div class="text-sm prose prose-sm max-w-none">${formattedContent}</div>
                    ${metadataHtml ? `<div class="mt-2 pt-2 border-t border-gray-200">${metadataHtml}</div>` : ''}
                </div>
            `;
        } else if (type === 'error') {
            messageDiv.className = 'flex justify-center';
            messageDiv.innerHTML = `
                <div class="max-w-xs lg:max-w-md px-4 py-2 bg-red-100 text-red-800 rounded-lg shadow border border-red-200">
                    <div class="flex items-center">
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        <div class="text-sm">${this.escapeHtml(content)}</div>
                    </div>
                    <div class="text-xs text-red-600 mt-1">${timestamp}</div>
                </div>
            `;
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'flex justify-start';
        typingDiv.innerHTML = `
            <div class="max-w-xs lg:max-w-md px-4 py-3 bg-gray-100 text-gray-600 rounded-lg shadow">
                <div class="flex items-center">
                    <i class="fas fa-robot text-purple-500 mr-2"></i>
                    <span class="text-sm">AI Assistant is thinking</span>
                    <div class="ml-2 flex space-x-1">
                        <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                        <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                        <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    </div>
                </div>
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    clearChat() {
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.innerHTML = `
            <div class="text-center text-sm text-gray-500 py-8">
                <i class="fas fa-comments text-2xl text-gray-300 mb-2"></i>
                <p>Ask me anything about your Minecraft plugin!</p>
                <p class="text-xs mt-1">I can help with code explanations, troubleshooting, and Minecraft development questions.</p>
            </div>
        `;
    }

    formatMarkdown(text) {
        // Simple markdown formatting for chat
        return text
            // Code blocks
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-800 text-gray-100 p-3 rounded mt-2 mb-2 overflow-x-auto"><code>$2</code></pre>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Line breaks
            .replace(/\n/g, '<br>')
            // Headers
            .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-3 mb-2">$1</h3>')
            .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
            .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-3">$1</h1>')
            // Lists
            .replace(/^- (.*$)/gm, '<li class="ml-4">• $1</li>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global function for complexity slider
function updateComplexityDisplay(value) {
    const complexityValue = document.getElementById('complexityValue');
    const complexityDescription = document.getElementById('complexityDescription');
    const hiddenComplexity = document.getElementById('complexity');
    
    complexityValue.textContent = value;
    hiddenComplexity.value = value;
    
    const descriptions = {
        1: "Very simple - Basic single command or feature",
        2: "Simple - Few commands with basic functionality",
        3: "Basic - Multiple commands with simple systems",
        4: "Moderate-Simple - Several features with configuration",
        5: "Moderate - Multiple features and basic systems",
        6: "Moderate-Advanced - Complex features with data storage",
        7: "Advanced - Multiple systems with GUI and events",
        8: "Very Advanced - Complex architecture with databases",
        9: "Expert - Enterprise-level with multiple integrations",
        10: "Master - Comprehensive plugin with all advanced features"
    };
    
    complexityDescription.textContent = descriptions[value] || descriptions[5];
    
    // Update button text based on complexity
    const generateBtn = document.getElementById('generateBtn');
    if (value <= 3) {
        generateBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Generate Simple Plugin';
    } else if (value <= 6) {
        generateBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Generate Plugin';
    } else {
        generateBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Generate Advanced Plugin';
    }
}

class PluginGenerator {
    constructor() {
        this.apiBase = window.location.origin;
        this.currentProject = null;
        this.init();
    }    init() {
        this.bindEvents();
        this.loadExamples();
        this.initChatSystem();
    }bindEvents() {
        document.getElementById('pluginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generatePlugin();
        });

        document.getElementById('refreshProjectBtn').addEventListener('click', () => {
            if (this.currentProject) {
                this.loadProjectFiles(this.currentProject.userId, this.currentProject.pluginName);
            }
        });

        // Auto-populate user ID if empty
        document.getElementById('userId').addEventListener('focus', (e) => {
            if (!e.target.value) {
                e.target.value = 'user-' + Math.random().toString(36).substr(2, 8);
            }
        });

        // Check for existing project when plugin name or user ID changes
        const pluginNameField = document.getElementById('pluginName');
        const userIdField = document.getElementById('userId');
        
        let checkTimeout;
        const checkProject = () => {
            clearTimeout(checkTimeout);
            checkTimeout = setTimeout(() => {
                this.checkExistingProject();
            }, 500); // Debounce for 500ms
        };

        pluginNameField.addEventListener('input', checkProject);
        userIdField.addEventListener('input', checkProject);
        pluginNameField.addEventListener('blur', () => this.checkExistingProject());
    }

    loadExamples() {
        const examples = [
            "Create a teleportation plugin with /sethome and /home commands, including cooldowns",
            "Make a custom enchantment plugin that adds fire resistance and speed boost effects",
            "Build a economy plugin with virtual currency, shops, and player transactions",
            "Create a mini-game plugin for spleef with automatic arena management",
            "Make a custom mob spawner plugin with configurable spawn rates and locations"
        ];

        const promptField = document.getElementById('prompt');
        let exampleIndex = 0;

        promptField.addEventListener('focus', () => {
            if (!promptField.value) {
                promptField.placeholder = examples[exampleIndex];
                exampleIndex = (exampleIndex + 1) % examples.length;
            }
        });
    }

    async generatePlugin() {
        const formData = new FormData(document.getElementById('pluginForm'));
        const data = {
            prompt: formData.get('prompt'),
            userId: formData.get('userId'),
            name: formData.get('pluginName') || undefined,
            autoCompile: true,
            complexity: formData.get('complexity')
        };

        // Validation
        if (!data.prompt.trim()) {
            this.showError('Please describe your plugin idea');
            return;
        }        if (!data.userId.trim()) {
            this.showError('Please enter a user ID');
            return;
        }

        this.hideResults();
        this.hideProject();

        // Check if this is a recompile operation
        const statusDiv = document.getElementById('projectStatus');
        const isRecompiling = !statusDiv.classList.contains('hidden') && 
                            (statusDiv.innerHTML.includes('Project exists') || statusDiv.innerHTML.includes('Will recompile'));

        this.showLoading(isRecompiling);

        try {
            const response = await fetch(`${this.apiBase}/plugin/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.text();
            this.showResults(result, data);
              // Store current project info for later use
            this.currentProject = {
                userId: data.userId,
                pluginName: data.name || this.extractPluginNameFromResult(result)
            };

            // Update chat context with new project
            this.updateChatContext();

            // Load project files if generation was successful
            if (result.includes('COMPILATION SUCCESSFUL') || result.includes('Plugin project generated')) {
                setTimeout(() => {
                    this.loadProjectFiles(this.currentProject.userId, this.currentProject.pluginName);
                }, 1000);
            }

        } catch (error) {
            console.error('Generation error:', error);
            this.showError(`Failed to generate plugin: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    async loadProjectFiles(userId, pluginName) {
        if (!userId || !pluginName) return;

        try {
            const response = await fetch(`${this.apiBase}/plugin/read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId, pluginName })
            });

            if (!response.ok) {
                throw new Error(`Failed to load project files: ${response.statusText}`);
            }

            const projectData = await response.json();
            this.showProjectFiles(projectData);

        } catch (error) {
            console.error('Error loading project files:', error);
            this.showError(`Failed to load project files: ${error.message}`);
        }
    }

    extractPluginNameFromResult(result) {
        // Try to extract plugin name from result text        const match = result.match(/Project: ([^\n]+)/);
        return match ? match[1].trim() : 'GeneratedPlugin';
    }

    showLoading(isRecompiling = false) {
        document.getElementById('loadingState').classList.remove('hidden');
        document.getElementById('generateBtn').disabled = true;
        
        if (isRecompiling) {
            document.getElementById('generateBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Recompiling...';
        } else {
            document.getElementById('generateBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
        }
    }

    hideLoading() {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('generateBtn').innerHTML = '<i class="fas fa-rocket mr-2"></i>Generate Plugin';
    }

    showResults(result, requestData) {
        const container = document.getElementById('resultsContent');
        const isSuccess = result.includes('COMPILATION SUCCESSFUL');
        const hasAutoFix = result.includes('fixed after') || result.includes('auto-fix');

        container.innerHTML = `
            <div class="border-l-4 ${isSuccess ? 'border-green-400 bg-green-50' : 'border-yellow-400 bg-yellow-50'} p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas ${isSuccess ? 'fa-check-circle text-green-400' : 'fa-exclamation-triangle text-yellow-400'} text-xl"></i>
                    </div>
                    <div class="ml-3 flex-1">
                        <h3 class="text-sm font-medium ${isSuccess ? 'text-green-800' : 'text-yellow-800'}">
                            ${isSuccess ? 'Plugin Generated Successfully!' : 'Generation Completed with Warnings'}
                        </h3>
                        <div class="mt-2 text-sm ${isSuccess ? 'text-green-700' : 'text-yellow-700'}">
                            <pre class="whitespace-pre-wrap font-mono text-xs bg-white p-3 rounded border overflow-x-auto">${result}</pre>
                        </div>
                    </div>
                </div>
            </div>

            ${hasAutoFix ? `
                <div class="border-l-4 border-blue-400 bg-blue-50 p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <i class="fas fa-magic text-blue-400 text-xl"></i>
                        </div>
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-blue-800">
                                AI Auto-Fix Applied
                            </h3>
                            <p class="mt-1 text-sm text-blue-700">
                                The AI automatically detected and fixed compilation errors during generation.
                            </p>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-800 mb-2">Request Details:</h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                        <span class="font-medium text-gray-600">User ID:</span>
                        <span class="ml-1 text-gray-800">${requestData.userId}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-600">Plugin Name:</span>
                        <span class="ml-1 text-gray-800">${requestData.name || 'Auto-generated'}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-600">Auto-Compile:</span>
                        <span class="ml-1 text-gray-800">${requestData.autoCompile ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            </div>            ${isSuccess ? `
                <div class="text-center space-y-2">
                    <div class="flex flex-col sm:flex-row gap-2 justify-center">
                        <button onclick="pluginGen.downloadJar('${requestData.userId}', '${requestData.name || 'plugin_' + Date.now()}')" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            <i class="fas fa-download mr-2"></i>
                            Download JAR File
                        </button>
                        <button onclick="pluginGen.downloadInstructions()" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                            <i class="fas fa-book mr-2"></i>
                            Installation Guide
                        </button>
                    </div>
                    <div id="downloadStatus" class="text-sm text-gray-600"></div>
                </div>
                    </button>
                </div>
            ` : ''}
        `;

        document.getElementById('resultsSection').classList.remove('hidden');
    }    showProjectFiles(projectData) {
        if (!projectData.projectExists) {
            document.getElementById('projectFiles').innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-folder-open text-2xl mb-2"></i>
                    <p class="text-sm">Project files not found</p>
                </div>
            `;
            document.getElementById('projectSection').classList.remove('hidden');
            return;
        }

        const { pluginProject } = projectData;
        const container = document.getElementById('projectFiles');

        // Create compact project info
        const projectInfoHtml = `
            <div class="compact-project-info">
                <div class="compact-project-info-grid">
                    <div class="compact-project-info-item">
                        <span class="compact-project-info-label">Name:</span> 
                        <span>${pluginProject.projectName}</span>
                    </div>
                    <div class="compact-project-info-item">
                        <span class="compact-project-info-label">Version:</span> 
                        <span>${pluginProject.minecraftVersion}</span>
                    </div>
                    <div class="compact-project-info-item">
                        <span class="compact-project-info-label">Dependencies:</span> 
                        <span>${pluginProject.dependencies?.join(', ') || 'None'}</span>
                    </div>
                </div>
                <div class="compact-download-section">
                    <button onclick="pluginGen.downloadJar('${this.currentProject?.userId}', '${this.currentProject?.pluginName}')" class="compact-download-btn">
                        <i class="fas fa-download mr-1"></i>JAR
                    </button>
                    <button onclick="pluginGen.downloadInstructions()" class="compact-download-btn secondary">
                        <i class="fas fa-book mr-1"></i>Guide
                    </button>
                </div>
                <div id="projectDownloadStatus" class="text-xs text-center mt-2"></div>
            </div>
        `;

        // Create VS Code style file tree
        const fileTreeHtml = this.generateVSCodeFileTree(pluginProject.files);

        container.innerHTML = projectInfoHtml + fileTreeHtml;
        document.getElementById('projectSection').classList.remove('hidden');

        // Add event listeners for collapsible files
        this.setupFileTreeEvents();
    }

    generateVSCodeFileTree(files) {
        let html = '<div class="vscode-explorer">';
        
        files.forEach((file, index) => {
            const fileType = this.getFileType(file.path);
            const fileName = file.path.split('/').pop();
            const isCollapsed = index > 0; // Keep first file expanded
            
            html += `
                <div class="collapsible-file">
                    <div class="collapsible-header ${isCollapsed ? 'collapsed' : ''}" onclick="pluginGen.toggleFileCollapse(this)">
                        <i class="fas fa-chevron-down collapsible-toggle"></i>
                        <div class="vscode-file-item" data-type="${fileType}">
                            <div class="vscode-file-icon">
                                <i class="fas ${this.getFileIcon(file.path)}"></i>
                            </div>
                            <div class="vscode-file-name">${fileName}</div>
                        </div>
                    </div>
                    <div class="collapsible-content ${isCollapsed ? 'collapsed' : ''}">
                        <div class="compact-code-viewer">
                            <div class="compact-code-header">
                                <span>${file.path}</span>
                                <span class="text-xs">${fileType.toUpperCase()}</span>
                            </div>
                            <div class="compact-code-content">
                                ${this.formatCodeWithLineNumbers(file.content)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    formatCodeWithLineNumbers(content) {
        const lines = content.split('\n');
        return lines.map((line, index) => {
            const lineNumber = index + 1;
            const escapedLine = this.escapeHtml(line);
            return `<div><span class="compact-line-numbers">${lineNumber}</span>${escapedLine}</div>`;
        }).join('');
    }

    toggleFileCollapse(headerElement) {
        const content = headerElement.nextElementSibling;
        const toggle = headerElement.querySelector('.collapsible-toggle');
        
        headerElement.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    }

    setupFileTreeEvents() {
        // Add any additional event listeners for the file tree
        // This can be extended for more interactive features
    }

    getFileIcon(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'java': return 'fab fa-java';
            case 'yml': case 'yaml': return 'fas fa-cogs';
            case 'xml': return 'fas fa-code';
            case 'md': return 'fab fa-markdown';
            case 'json': return 'fas fa-brackets-curly';
            default: return 'fas fa-file-code';
        }
    }

    getFileType(filePath) {
        return filePath.split('.').pop()?.toLowerCase() || 'file';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadInstructions() {
        const instructions = `
# Minecraft Plugin Installation Guide

## Generated Plugin Installation

1. **Locate your JAR file**: The compiled plugin JAR file should be in the project's target directory.

2. **Copy to server**: 
   - Navigate to your Minecraft server directory
   - Place the JAR file in the 'plugins' folder

3. **Restart server**: Stop and start your Minecraft server to load the plugin

4. **Verify installation**: Check the server console for plugin load messages

## Troubleshooting

- Ensure your server is running Spigot or Paper (Bukkit-compatible)
- Check that the Minecraft version matches your server version
- Review server logs for any error messages
- Make sure you have the required permissions to install plugins

## Plugin Information

Generated on: ${new Date().toLocaleString()}
Project Files: Available in the project directory
Build Command: mvn clean package

For support or modifications, refer to the generated source code.
        `.trim();

        const blob = new Blob([instructions], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'minecraft-plugin-installation-guide.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }    async downloadJar(userId, pluginName) {
        console.log('🔥 Attempting to download JAR for:', { userId, pluginName });
        
        // Use appropriate status div based on context
        const statusDiv = document.getElementById('downloadStatus') || document.getElementById('projectDownloadStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Checking JAR availability...';
        }
        
        try {
            // First check if JAR is available
            const response = await fetch(`${this.apiBase}/plugin/download-info/${encodeURIComponent(userId)}/${encodeURIComponent(pluginName)}`);
            const downloadInfo = await response.json();
            
            if (!response.ok) {
                throw new Error('Failed to get download information');
            }
            
            if (!downloadInfo.available) {
                if (statusDiv) {
                    statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle text-yellow-500 mr-1"></i>JAR file not available. Please ensure the plugin has been compiled successfully.';
                }
                return;
            }
            
            // Show download info
            const fileSizeMB = (downloadInfo.fileSize / 1024 / 1024).toFixed(2);
            if (statusDiv) {
                statusDiv.innerHTML = `<i class="fas fa-info-circle text-blue-500 mr-1"></i>Downloading ${downloadInfo.jarFile} (${fileSizeMB} MB)...`;
            }
            
            // Start download
            const downloadUrl = `${this.apiBase}/plugin/download/${encodeURIComponent(userId)}/${encodeURIComponent(pluginName)}`;
            
            // Create download link and trigger it
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = downloadInfo.jarFile;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Show success message
            if (statusDiv) {
                statusDiv.innerHTML = `<i class="fas fa-check-circle text-green-500 mr-1"></i>Download started! Check your downloads folder for ${downloadInfo.jarFile}`;
            }
            
            // Clear status after 5 seconds
            setTimeout(() => {
                if (statusDiv) {
                    statusDiv.innerHTML = '';
                }
            }, 5000);
            
        } catch (error) {
            console.error('Download error:', error);
            if (statusDiv) {
                statusDiv.innerHTML = `<i class="fas fa-times-circle text-red-500 mr-1"></i>Download failed: ${error.message}`;
            }
            
            // Clear error after 10 seconds
            setTimeout(() => {
                if (statusDiv) {
                    statusDiv.innerHTML = '';
                }
            }, 10000);
        }
    }

    async checkDownloadAvailability(userId, pluginName) {
        try {
            const response = await fetch(`${this.apiBase}/plugin/download-info/${encodeURIComponent(userId)}/${encodeURIComponent(pluginName)}`);
            const downloadInfo = await response.json();
            
            if (response.ok && downloadInfo.available) {
                return {
                    available: true,
                    jarFile: downloadInfo.jarFile,
                    fileSize: downloadInfo.fileSize,
                    lastModified: downloadInfo.lastModified
                };
            }
            
            return { available: false };
        } catch (error) {
            console.error('Error checking download availability:', error);
            return { available: false };
        }
    }

    hideResults() {
        document.getElementById('resultsSection').classList.add('hidden');
    }

    hideProject() {
        document.getElementById('projectSection').classList.add('hidden');
    }

    showError(message) {
        const container = document.getElementById('resultsContent');
        container.innerHTML = `
            <div class="border-l-4 border-red-400 bg-red-50 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas fa-exclamation-circle text-red-400 text-xl"></i>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-800">Error</h3>
                        <div class="mt-2 text-sm text-red-700">
                            ${message}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('resultsSection').classList.remove('hidden');
    }

    async checkExistingProject() {
        const pluginName = document.getElementById('pluginName').value.trim();
        const userId = document.getElementById('userId').value.trim();
        const statusDiv = document.getElementById('projectStatus');
        
        // Clear status if no plugin name or user ID
        if (!pluginName || !userId) {
            statusDiv.classList.add('hidden');
            statusDiv.innerHTML = '';
            return;
        }

        try {
            console.log('🔍 Checking for existing project:', { userId, pluginName });
            
            const response = await fetch(`${this.apiBase}/plugin/check-exists`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId,
                    pluginName: pluginName
                })
            });

            if (!response.ok) {
                throw new Error('Failed to check project existence');
            }

            const result = await response.json();
            
            if (result.exists) {
                const lastModified = result.lastModified ? new Date(result.lastModified).toLocaleString() : 'Unknown';
                
                if (result.hasCompiledJar) {
                    statusDiv.innerHTML = `
                        <div class="flex items-center p-2 bg-green-50 border border-green-200 rounded">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            <div class="flex-1">
                                <span class="text-green-800 font-medium">Project exists with compiled JAR</span>
                                <div class="text-green-600 text-xs">Last modified: ${lastModified}</div>
                                <div class="text-green-600 text-xs">Will recompile existing project instead of creating new one</div>
                            </div>
                            <button onclick="pluginGen.loadProjectFiles('${userId}', '${pluginName}')" class="ml-2 text-green-600 hover:text-green-800 text-sm">
                                <i class="fas fa-eye mr-1"></i>View
                            </button>
                        </div>
                    `;
                } else {
                    statusDiv.innerHTML = `
                        <div class="flex items-center p-2 bg-yellow-50 border border-yellow-200 rounded">
                            <i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
                            <div class="flex-1">
                                <span class="text-yellow-800 font-medium">Project exists but not compiled</span>
                                <div class="text-yellow-600 text-xs">Last modified: ${lastModified}</div>
                                <div class="text-yellow-600 text-xs">Will attempt to recompile existing project</div>
                            </div>
                            <button onclick="pluginGen.loadProjectFiles('${userId}', '${pluginName}')" class="ml-2 text-yellow-600 hover:text-yellow-800 text-sm">
                                <i class="fas fa-eye mr-1"></i>View
                            </button>
                        </div>
                    `;
                }
                statusDiv.classList.remove('hidden');
            } else {
                statusDiv.innerHTML = `
                    <div class="flex items-center p-2 bg-blue-50 border border-blue-200 rounded">
                        <i class="fas fa-plus-circle text-blue-500 mr-2"></i>
                        <span class="text-blue-800">New project - will generate fresh plugin files</span>
                    </div>                `;
                statusDiv.classList.remove('hidden');
            }
            
        } catch (error) {
            console.error('Error checking project existence:', error);
            statusDiv.innerHTML = `
                <div class="flex items-center p-2 bg-red-50 border border-red-200 rounded">
                    <i class="fas fa-exclamation-circle text-red-500 mr-2"></i>
                    <span class="text-red-800 text-xs">Could not check project status</span>
                </div>
            `;
            statusDiv.classList.remove('hidden');
        }
    }

    // ==================== CHAT FUNCTIONALITY ====================

    initChatSystem() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendChatBtn');
        const clearBtn = document.getElementById('clearChatBtn');
        const quickQuestionBtns = document.querySelectorAll('.quick-question-btn');

        // Enable/disable send button based on input
        chatInput.addEventListener('input', () => {
            const hasText = chatInput.value.trim().length > 0;
            sendBtn.disabled = !hasText;
            sendBtn.classList.toggle('opacity-50', !hasText);
            sendBtn.classList.toggle('cursor-not-allowed', !hasText);
        });

        // Send message on button click
        sendBtn.addEventListener('click', () => {
            this.sendChatMessage();
        });

        // Send message on Enter (Shift+Enter for new line)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) {
                    this.sendChatMessage();
                }
            }
        });

        // Clear chat
        clearBtn.addEventListener('click', () => {
            this.clearChat();
        });

        // Quick question buttons
        quickQuestionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.dataset.question;
                chatInput.value = question;
                chatInput.dispatchEvent(new Event('input')); // Trigger input event to enable send button
                this.sendChatMessage();
            });
        });

        // Initialize chat context display
        this.updateChatContext();
    }

    updateChatContext() {
        const contextSpan = document.getElementById('chatContext');
        if (this.currentProject && this.currentProject.pluginName) {
            contextSpan.textContent = `Plugin: ${this.currentProject.pluginName}`;
            contextSpan.classList.remove('text-gray-500');
            contextSpan.classList.add('text-indigo-600', 'font-medium');
        } else {
            contextSpan.textContent = 'General Questions';
            contextSpan.classList.remove('text-indigo-600', 'font-medium');
            contextSpan.classList.add('text-gray-500');
        }
    }

    async sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (!message) return;

        // Clear input and disable send button
        chatInput.value = '';
        document.getElementById('sendChatBtn').disabled = true;

        // Add user message to chat
        this.addChatMessage('user', message);

        // Get current context
        const userId = document.getElementById('userId').value.trim();
        const pluginName = this.currentProject?.pluginName || null;

        try {
            // Show typing indicator
            this.addTypingIndicator();

            // Send to chat API
            const response = await fetch(`${this.apiBase}/chat/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    username: userId || 'anonymous',
                    pluginName: pluginName
                })
            });

            const data = await response.json();

            // Remove typing indicator
            this.removeTypingIndicator();

            if (data.success) {
                // Add AI response
                this.addChatMessage('assistant', data.message, {
                    type: data.type,
                    contextLoaded: data.contextLoaded,
                    filesAnalyzed: data.filesAnalyzed
                });
            } else {
                this.addChatMessage('error', data.error || 'Failed to get response from AI assistant');
            }

        } catch (error) {
            console.error('Chat error:', error);
            this.removeTypingIndicator();
            this.addChatMessage('error', 'Failed to communicate with AI assistant. Please try again.');
        }
    }

    addChatMessage(type, content, metadata = {}) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        
        // Clear empty state if this is the first message
        if (messagesContainer.children.length === 1 && 
            messagesContainer.firstElementChild.classList.contains('text-center')) {
            messagesContainer.innerHTML = '';
        }

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'user') {
            messageDiv.className = 'flex justify-end';
            messageDiv.innerHTML = `
                <div class="max-w-xs lg:max-w-md px-4 py-2 bg-indigo-600 text-white rounded-lg shadow">
                    <div class="text-sm">${this.escapeHtml(content)}</div>
                    <div class="text-xs text-indigo-200 mt-1">${timestamp}</div>
                </div>
            `;
        } else if (type === 'assistant') {
            messageDiv.className = 'flex justify-start';
            
            // Format the AI response (convert markdown to HTML)
            const formattedContent = this.formatMarkdown(content);
            
            // Create metadata display
            let metadataHtml = '';
            if (metadata.type) {
                const typeIcon = metadata.type === 'info' ? 'fas fa-info-circle text-blue-500' : 'fas fa-wrench text-orange-500';
                metadataHtml += `<span class="inline-flex items-center text-xs text-gray-500"><i class="${typeIcon} mr-1"></i>${metadata.type}</span>`;
            }
            if (metadata.contextLoaded) {
                metadataHtml += `<span class="inline-flex items-center text-xs text-green-600 ml-2"><i class="fas fa-check-circle mr-1"></i>Plugin context loaded</span>`;
            }
            if (metadata.filesAnalyzed > 0) {
                metadataHtml += `<span class="text-xs text-gray-500 ml-2">${metadata.filesAnalyzed} files analyzed</span>`;
            }

            messageDiv.innerHTML = `
                <div class="max-w-none lg:max-w-4xl px-4 py-3 bg-gray-100 text-gray-900 rounded-lg shadow">
                    <div class="flex items-center mb-2">
                        <i class="fas fa-robot text-purple-500 mr-2"></i>
                        <span class="text-sm font-medium text-gray-700">AI Assistant</span>
                        <div class="flex-1"></div>
                        <span class="text-xs text-gray-500">${timestamp}</span>
                    </div>
                    <div class="text-sm prose prose-sm max-w-none">${formattedContent}</div>
                    ${metadataHtml ? `<div class="mt-2 pt-2 border-t border-gray-200">${metadataHtml}</div>` : ''}
                </div>
            `;
        } else if (type === 'error') {
            messageDiv.className = 'flex justify-center';
            messageDiv.innerHTML = `
                <div class="max-w-xs lg:max-w-md px-4 py-2 bg-red-100 text-red-800 rounded-lg shadow border border-red-200">
                    <div class="flex items-center">
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        <div class="text-sm">${this.escapeHtml(content)}</div>
                    </div>
                    <div class="text-xs text-red-600 mt-1">${timestamp}</div>
                </div>
            `;
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'flex justify-start';
        typingDiv.innerHTML = `
            <div class="max-w-xs lg:max-w-md px-4 py-3 bg-gray-100 text-gray-600 rounded-lg shadow">
                <div class="flex items-center">
                    <i class="fas fa-robot text-purple-500 mr-2"></i>
                    <span class="text-sm">AI Assistant is thinking</span>
                    <div class="ml-2 flex space-x-1">
                        <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                        <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                        <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    </div>
                </div>
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    clearChat() {
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.innerHTML = `
            <div class="text-center text-sm text-gray-500 py-8">
                <i class="fas fa-comments text-2xl text-gray-300 mb-2"></i>
                <p>Ask me anything about your Minecraft plugin!</p>
                <p class="text-xs mt-1">I can help with code explanations, troubleshooting, and Minecraft development questions.</p>
            </div>
        `;
    }

    formatMarkdown(text) {
        // Simple markdown formatting for chat
        return text
            // Code blocks
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-800 text-gray-100 p-3 rounded mt-2 mb-2 overflow-x-auto"><code>$2</code></pre>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Line breaks
            .replace(/\n/g, '<br>')
            // Headers
            .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-3 mb-2">$1</h3>')
            .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
            .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-3">$1</h1>')
            // Lists
            .replace(/^- (.*$)/gm, '<li class="ml-4">• $1</li>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the application
const pluginGen = new PluginGenerator();
