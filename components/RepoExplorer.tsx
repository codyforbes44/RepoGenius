import React, { useState, useEffect, useRef, useMemo } from 'react';
import { RecursiveFileTree } from './FileTree';
import { GitHubRepo, GitHubFile, ChatMessage, GitHubCommit } from '../types';
import { fetchRepoContents, decodeBase64, fetchFileCommits } from '../services/githubService';
import { createChatSession, sendMessageToGemini, analyzeCode, generateSummary, generateDeploymentGuide } from '../services/geminiService';
import { Loader2, Send, Bot, FileText, Code2, Menu, X, Sparkles, MessageSquare, History, GitCommitHorizontal, ArrowLeftRight, Rocket, Copy, Check } from 'lucide-react';
import { Chat } from '@google/genai';
// @ts-expect-error - No types for react-syntax-highlighter
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-expect-error - No types for vscDarkPlus
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
// @ts-expect-error - No types for diff
import * as Diff from 'diff';

interface RepoExplorerProps {
  repo: GitHubRepo;
  token: string;
  onDisconnect: () => void;
}

interface DiffLine {
    num?: number;
    content?: string;
    type: 'normal' | 'add' | 'remove' | 'empty';
}

export const RepoExplorer: React.FC<RepoExplorerProps> = ({ repo, token, onDisconnect }) => {
  // State for Files
  const [rootFiles, setRootFiles] = useState<GitHubFile[]>([]);
  const [filesMap, setFilesMap] = useState<Record<string, GitHubFile[]>>({});
  const [selectedFile, setSelectedFile] = useState<GitHubFile | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string>('');

  // History & Compare State
  const [showHistory, setShowHistory] = useState(false);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [compareCommit, setCompareCommit] = useState<GitHubCommit | null>(null);
  const [compareContent, setCompareContent] = useState<string | null>(null);

  // State for AI
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [pathCopied, setPathCopied] = useState(false);

  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial Load
  useEffect(() => {
    const initRepo = async () => {
      try {
        const contents = await fetchRepoContents(repo.owner.login, repo.name, '', { token });
        if (Array.isArray(contents)) {
          setRootFiles(contents);
          
          // Try to find README
          const readme = contents.find(f => f.name.toLowerCase() === 'readme.md');
          if (readme) {
            const readmeData = await fetchRepoContents(repo.owner.login, repo.name, readme.path, { token });
            if (!Array.isArray(readmeData) && readmeData.content) {
              const decoded = decodeBase64(readmeData.content);
              setReadmeContent(decoded);
              
              // Init Chat with Context
              const systemInstruction = `
                You are an expert AI assistant for the GitHub repository: ${repo.full_name}.
                Your goal is to help the user understand the code, fix bugs, and navigate the project.
                
                Context from README:
                ${decoded.substring(0, 5000)}
                
                Always be concise, helpful, and provide code snippets in markdown when relevant.
              `;
              setChatSession(createChatSession(systemInstruction));
            }
          } else {
             // Fallback chat init without readme
             const systemInstruction = `You are an expert AI assistant for the GitHub repository: ${repo.full_name}.`;
             setChatSession(createChatSession(systemInstruction));
          }
        }
      } catch (err) {
        console.error("Failed to load root files", err);
      }
    };
    initRepo();
  }, [repo, token]);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset comparison when file changes
  useEffect(() => {
      setCompareCommit(null);
      setCompareContent(null);
      setShowHistory(false);
      setCommits([]);
      setPathCopied(false);
  }, [selectedFile]);

  // Handlers
  const handleFolderExpand = async (folder: GitHubFile) => {
    if (filesMap[folder.path]) return;
    try {
      const contents = await fetchRepoContents(repo.owner.login, repo.name, folder.path, { token });
      if (Array.isArray(contents)) {
        setFilesMap(prev => ({ ...prev, [folder.path]: contents }));
      }
    } catch (err) {
      console.error("Failed to fetch folder contents", err);
    }
  };

  const handleFileSelect = async (file: GitHubFile) => {
    setSelectedFile(file);
    setIsFileLoading(true);
    setFileContent(null);
    try {
      const data = await fetchRepoContents(repo.owner.login, repo.name, file.path, { token });
      if (!Array.isArray(data) && data.content) {
        setFileContent(decodeBase64(data.content));
      } else {
        setFileContent("File is too large or not displayed.");
      }
    } catch {
      setFileContent("Error loading file.");
    } finally {
      setIsFileLoading(false);
    }
  };

  const handleToggleHistory = async () => {
    if (!selectedFile) return;
    
    // Toggle
    if (showHistory) {
        setShowHistory(false);
        setCompareCommit(null);
        setCompareContent(null);
        return;
    }

    setShowHistory(true);
    if (commits.length === 0) {
        setIsLoadingCommits(true);
        try {
            const data = await fetchFileCommits(repo.owner.login, repo.name, selectedFile.path, { token });
            setCommits(data);
        } catch (err) {
            console.error("Failed to fetch commits", err);
        } finally {
            setIsLoadingCommits(false);
        }
    }
  };

  const handleCompareCommit = async (commit: GitHubCommit) => {
    if (commit.sha === compareCommit?.sha) {
        // Deselect
        setCompareCommit(null);
        setCompareContent(null);
        return;
    }
    
    setCompareCommit(commit);
    try {
        const data = await fetchRepoContents(repo.owner.login, repo.name, selectedFile!.path, { token, ref: commit.sha });
        if (!Array.isArray(data) && data.content) {
            setCompareContent(decodeBase64(data.content));
        } else {
            setCompareContent("Content unavailable for this version.");
        }
    } catch {
        setCompareContent("Error loading version content.");
    }
  };

  const handleCopyPath = () => {
    if (selectedFile) {
        navigator.clipboard.writeText(selectedFile.path);
        setPathCopied(true);
        setTimeout(() => setPathCopied(false), 2000);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim() || !chatSession) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputMessage,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsAiThinking(true);

    try {
      // Inject current file context if available, with full content and history
      let promptToSend = userMsg.text;
      
      if (selectedFile && fileContent) {
        // Ensure we don't send error messages as code context
        const isReadableCode = !fileContent.startsWith("File is too large") && !fileContent.startsWith("Error loading");
        
        if (isReadableCode) {
           // Fetch or use existing commits for context
           let fileCommits = commits;
           if (fileCommits.length === 0) {
               try {
                    // Temporarily fetch commits for context if not already loaded in UI
                    fileCommits = await fetchFileCommits(repo.owner.login, repo.name, selectedFile.path, { token });
                    // We update state so we don't fetch again if they open the history tab
                    setCommits(fileCommits); 
               } catch {
                   console.log("Could not fetch commits for chat context");
               }
           }

           const commitHistory = fileCommits.slice(0, 3).map(c => 
               `- ${c.commit.message} (${c.commit.author.name}, ${new Date(c.commit.author.date).toLocaleDateString()})`
           ).join('\n');

           const contextBlock = `
Context: User is currently viewing file: ${selectedFile.path}

File Content:
\`\`\`
${fileContent}
\`\`\`

Recent Commit History for this file:
${commitHistory || 'No recent history available.'}
`;

           promptToSend = `${contextBlock}\n\nUser Question: ${userMsg.text}`;
        }
      }

      const responseText = await sendMessageToGemini(chatSession, promptToSend);
      
      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "Sorry, I encountered an error communicating with Gemini.",
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!readmeContent) return;
    setIsAiThinking(true);
    setShowAiPanel(true);
    
    const thinkingId = Date.now().toString();
    setMessages(prev => [...prev, { id: thinkingId, role: 'model', text: "Generating repository summary...", timestamp: Date.now() }]);
    
    try {
        const result = await generateSummary(repo.name, readmeContent);
        setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: result } : m));
    } catch {
        setMessages(prev => prev.filter(m => m.id !== thinkingId));
    } finally {
        setIsAiThinking(false);
    }
  };

  const handleAnalyzeFile = async () => {
    if (!selectedFile || !fileContent) return;
    setIsAiThinking(true);
    setShowAiPanel(true);
    
    const thinkingId = Date.now().toString();
    setMessages(prev => [...prev, { id: thinkingId, role: 'model', text: `Analyzing ${selectedFile.name}...`, timestamp: Date.now() }]);

    try {
        const result = await analyzeCode(selectedFile.name, fileContent);
        setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: result } : m));
    } catch {
        setMessages(prev => prev.filter(m => m.id !== thinkingId));
    } finally {
        setIsAiThinking(false);
    }
  };

  const handleDeploy = async () => {
    setIsAiThinking(true);
    setShowAiPanel(true);
    
    // Open the requested link
    window.open('https://aistudio.google.com/apps', '_blank');

    const thinkingId = Date.now().toString();
    setMessages(prev => [...prev, { 
        id: thinkingId, 
        role: 'model', 
        text: `Analyzing repository structure (files, README, package.json) for deployment...`, 
        timestamp: Date.now() 
    }]);

    try {
        // Try to fetch package.json for better context
        let packageJsonContent = '';
        const pkgFile = rootFiles.find(f => f.name === 'package.json');
        if (pkgFile) {
            try {
                const pkgData = await fetchRepoContents(repo.owner.login, repo.name, pkgFile.path, { token });
                if (!Array.isArray(pkgData) && pkgData.content) {
                    packageJsonContent = decodeBase64(pkgData.content);
                }
            } catch {
                console.log("Could not fetch package.json for deployment context");
            }
        }

        const fileNames = rootFiles.map(f => f.name);
        const result = await generateDeploymentGuide(repo.name, fileNames, readmeContent, packageJsonContent);
        setMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: result } : m));
    } catch {
        setMessages(prev => prev.filter(m => m.id !== thinkingId));
    } finally {
        setIsAiThinking(false);
    }
  };

  // Compute Diff
  const diffData = useMemo(() => {
    if (!compareContent || !fileContent || !selectedFile) return null;
    
    // Skip large files or errors
    if (isErrorContent(compareContent) || isErrorContent(fileContent)) return null;

    try {
        const parts = Diff.diffLines(compareContent, fileContent);
        const left: DiffLine[] = [];
        const right: DiffLine[] = [];
        let leftLn = 1;
        let rightLn = 1;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const lines = part.value.replace(/\n$/, '').split('\n');
            
            if (part.removed) {
                // Check for modification block (Remove then Add)
                if (i + 1 < parts.length && parts[i+1].added) {
                    const nextPart = parts[i+1];
                    const nextLines = nextPart.value.replace(/\n$/, '').split('\n');
                    const max = Math.max(lines.length, nextLines.length);
                    
                    for (let j = 0; j < max; j++) {
                        // Left Side (Removed)
                        if (j < lines.length) {
                             left.push({ num: leftLn++, content: lines[j], type: 'remove' });
                        } else {
                             left.push({ type: 'empty' });
                        }
                        
                        // Right Side (Added)
                        if (j < nextLines.length) {
                            right.push({ num: rightLn++, content: nextLines[j], type: 'add' });
                        } else {
                            right.push({ type: 'empty' });
                        }
                    }
                    i++; // Skip the added part we just consumed
                } else {
                    // Pure Removal
                    lines.forEach(l => {
                        left.push({ num: leftLn++, content: l, type: 'remove' });
                        right.push({ type: 'empty' });
                    });
                }
            } else if (part.added) {
                // Pure Addition
                 lines.forEach(l => {
                    left.push({ type: 'empty' });
                    right.push({ num: rightLn++, content: l, type: 'add' });
                });
            } else {
                // Unchanged
                lines.forEach(l => {
                     left.push({ num: leftLn++, content: l, type: 'normal' });
                     right.push({ num: rightLn++, content: l, type: 'normal' });
                });
            }
        }
        return { left, right };
    } catch (e) {
        console.error("Diff calculation failed", e);
        return null;
    }
  }, [compareContent, fileContent, selectedFile]);

  // Helper for language detection
  const getLanguage = (filename: string) => {
    if (!filename) return 'text';
    const ext = filename.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
        'js': 'javascript', 'jsx': 'javascript',
        'ts': 'typescript', 'tsx': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'java': 'java',
        'go': 'go',
        'rs': 'rust',
        'c': 'cpp', 'cpp': 'cpp', 'h': 'cpp',
        'css': 'css',
        'html': 'html',
        'json': 'json',
        'md': 'markdown',
        'yml': 'yaml', 'yaml': 'yaml',
        'sh': 'bash', 'bash': 'bash'
    };
    return map[ext || ''] || 'text';
  };

  // Helper check for error content
  function isErrorContent(content: string | null) {
      return content?.startsWith("File is too large") || content?.startsWith("Error loading");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-300 overflow-hidden font-sans relative">
      {/* Sidebar - File Explorer */}
      <div className={`
        ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:w-0'} 
        fixed md:relative z-40 h-full flex-shrink-0 border-r border-gray-800 bg-gray-900 transition-all duration-300 flex flex-col
      `}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="font-semibold text-white truncate pr-2">{repo.name}</div>
            <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 flex flex-col min-h-0 py-2 overflow-y-auto">
            <RecursiveFileTree 
                files={rootFiles} 
                filesMap={filesMap}
                onFileSelect={(file) => {
                    handleFileSelect(file);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                }} 
                onFolderExpand={handleFolderExpand}
                selectedFile={selectedFile}
            />
        </div>
        <div className="p-3 border-t border-gray-800 text-xs text-gray-500">
            <button onClick={onDisconnect} className="text-red-400 hover:text-red-300 w-full text-left px-2 py-1 rounded hover:bg-red-950/30 transition-colors">Disconnect Repo</button>
        </div>
      </div>

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-gray-950 relative">
        {/* Top Navigation Bar */}
        <div className="h-14 border-b border-gray-800 flex items-center px-4 justify-between bg-gray-900/50">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} className="p-1 hover:bg-gray-800 rounded">
                    <Menu className="w-5 h-5" />
                </button>
            )}
            {selectedFile ? (
                <div className="flex items-center gap-2 text-sm text-gray-200">
                   <FileText className="w-4 h-4 text-blue-400" />
                   <span className="truncate max-w-xs">{selectedFile.path}</span>
                   <button
                        onClick={handleCopyPath}
                        className="ml-1 p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-white transition-colors"
                        title="Copy full path"
                   >
                       {pathCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                   </button>
                </div>
            ) : (
                <span className="text-sm text-gray-500">No file selected</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={handleGenerateSummary}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-white border border-gray-700 transition-colors"
                title="Generate Repo Summary"
            >
                <Sparkles className="w-3 h-3 text-yellow-400" />
                <span className="hidden sm:inline">Summarize</span>
            </button>
            <button 
                onClick={handleDeploy}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded text-xs border border-blue-600/30 transition-colors"
                title="Deploy to AI Studio Apps"
            >
                <Rocket className="w-3 h-3" />
                <span className="hidden sm:inline">Deploy</span>
            </button>
             <button 
                onClick={() => setShowAiPanel(!showAiPanel)}
                className={`p-2 rounded transition-colors ${showAiPanel ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-800'}`}
            >
                <MessageSquare className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* File Content Area with History/Compare support */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
            
             {/* File Toolbar */}
             {selectedFile && !selectedFile.name.endsWith('.png') && !selectedFile.name.endsWith('.jpg') && (
                 <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4">
                     <div className="text-xs text-gray-500 font-mono">
                         {fileContent ? `${fileContent.length} chars` : 'Loading...'}
                     </div>
                     <div className="flex items-center gap-2">
                         <button 
                            onClick={handleToggleHistory}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors ${showHistory ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                        >
                            <History className="w-3 h-3" />
                            History
                        </button>
                         <button 
                             onClick={handleAnalyzeFile}
                             className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors"
                         >
                             <Sparkles className="w-3 h-3 text-blue-400" />
                             Explain
                         </button>
                     </div>
                 </div>
             )}

             {/* Main View Container */}
             <div className="flex-1 flex overflow-hidden">
                
                {/* Content Pane(s) */}
                <div className="flex-1 overflow-hidden flex flex-col relative bg-[#0d1117]">
                    {selectedFile ? (
                        isFileLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            </div>
                        ) : (
                            <div className="flex-1 flex overflow-hidden">
                                {compareCommit && compareContent ? (
                                    /* Split View with Diff Highlighting */
                                    <div className="flex-1 flex overflow-hidden">
                                        {diffData ? (
                                            <>
                                                {/* Left Pane (Old / Removed) */}
                                                <div className="flex-1 flex flex-col border-r border-gray-700 bg-[#0d1117]">
                                                    <div className="bg-red-900/20 text-red-200 text-xs px-2 py-1 border-b border-red-900/30 flex items-center gap-2">
                                                        <GitCommitHorizontal className="w-3 h-3" />
                                                        <span>{compareCommit.commit.message.split('\n')[0]} ({compareCommit.sha.substring(0,7)})</span>
                                                    </div>
                                                    <div className="flex-1 overflow-auto bg-[#0d1117]">
                                                        <div className="font-mono text-[13px] leading-6">
                                                            {diffData.left.map((line, idx) => (
                                                                <div key={idx} className={`flex ${
                                                                    line.type === 'remove' ? 'bg-red-500/15' : 
                                                                    line.type === 'normal' ? 'bg-gray-800/20' : ''
                                                                }`}>
                                                                    <span className={`w-10 text-right pr-3 select-none border-r border-gray-800 bg-[#0d1117] flex-shrink-0 ${
                                                                        line.type === 'remove' ? 'text-red-600/70' : 'text-gray-600'
                                                                    }`}>
                                                                        {line.num || ''}
                                                                    </span>
                                                                    <span className={`pl-2 pr-2 whitespace-pre flex-1 ${
                                                                        line.type === 'remove' ? 'text-red-200' : 
                                                                        line.type === 'empty' ? 'invisible' : 'text-gray-400'
                                                                    }`}>
                                                                        {line.content || ' '}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right Pane (New / Added) */}
                                                <div className="flex-1 flex flex-col bg-[#0d1117]">
                                                    <div className="bg-green-900/20 text-green-200 text-xs px-2 py-1 border-b border-green-900/30 flex items-center gap-2">
                                                         <span className="font-bold">Current Version</span>
                                                    </div>
                                                     <div className="flex-1 overflow-auto bg-[#0d1117]">
                                                        <div className="font-mono text-[13px] leading-6">
                                                            {diffData.right.map((line, idx) => (
                                                                <div key={idx} className={`flex ${
                                                                    line.type === 'add' ? 'bg-green-500/15' : 
                                                                    line.type === 'normal' ? 'bg-gray-800/20' : ''
                                                                }`}>
                                                                    <span className={`w-10 text-right pr-3 select-none border-r border-gray-800 bg-[#0d1117] flex-shrink-0 ${
                                                                        line.type === 'add' ? 'text-green-600/70' : 'text-gray-600'
                                                                    }`}>
                                                                        {line.num || ''}
                                                                    </span>
                                                                    <span className={`pl-2 pr-2 whitespace-pre flex-1 ${
                                                                        line.type === 'add' ? 'text-green-200' : 
                                                                        line.type === 'empty' ? 'invisible' : 'text-gray-400'
                                                                    }`}>
                                                                        {line.content || ' '}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            /* Fallback for binary/large files in diff mode */
                                            <div className="flex-1 flex items-center justify-center text-gray-500">
                                                Diff unavailable for this file type or content.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Single View */
                                    <div className="flex-1 overflow-auto bg-[#0d1117]">
                                        {selectedFile.name.endsWith('.png') || selectedFile.name.endsWith('.jpg') ? (
                                            <div className="p-6">
                                                <img src={selectedFile.download_url} alt="Preview" className="max-w-full h-auto rounded border border-gray-700" />
                                            </div>
                                        ) : (
                                            isErrorContent(fileContent) ? (
                                                <div className="p-6 font-mono text-sm leading-relaxed text-gray-400">{fileContent}</div>
                                            ) : (
                                                <SyntaxHighlighter
                                                    language={getLanguage(selectedFile.name)}
                                                    style={vscDarkPlus}
                                                    customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent', fontSize: '0.875rem' }}
                                                    showLineNumbers={true}
                                                    lineNumberStyle={{ minWidth: '3em', paddingRight: '1em', color: '#484f58', textAlign: 'right', borderRight: '1px solid #30363d', marginRight: '1em' }}
                                                >
                                                    {fileContent || ''}
                                                </SyntaxHighlighter>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600">
                            <Code2 className="w-16 h-16 mb-4 opacity-20" />
                            <p>Select a file to view its content</p>
                        </div>
                    )}
                </div>

                {/* History Sidebar Panel */}
                {showHistory && (
                    <div className="w-72 border-l border-gray-800 bg-gray-900 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                            <span>Commit History</span>
                            <button onClick={() => setShowHistory(false)}><X className="w-4 h-4 hover:text-white" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {isLoadingCommits ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-800">
                                    {commits.map(commit => (
                                        <li key={commit.sha} className="p-0">
                                            <button 
                                                onClick={() => handleCompareCommit(commit)}
                                                className={`w-full text-left p-3 hover:bg-gray-800 transition-colors flex flex-col gap-1 group ${compareCommit?.sha === commit.sha ? 'bg-blue-900/20 border-l-2 border-blue-500' : ''}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-blue-400 font-mono">{commit.sha.substring(0, 7)}</span>
                                                    <span className="text-[10px] text-gray-500">{new Date(commit.commit.author.date).toLocaleDateString()}</span>
                                                </div>
                                                <div className="text-sm text-gray-300 line-clamp-2 leading-tight">
                                                    {commit.commit.message}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                                                    <span className="w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center text-[8px] text-white">
                                                        {commit.commit.author.name[0]}
                                                    </span>
                                                    {commit.commit.author.name}
                                                    {compareCommit?.sha === commit.sha && (
                                                        <span className="ml-auto text-blue-400 flex items-center gap-1">
                                                            <ArrowLeftRight className="w-3 h-3" /> Comparing
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                    {commits.length === 0 && (
                                        <li className="p-4 text-center text-xs text-gray-500">No commits found for this file.</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
             </div>
        </div>

        {/* AI Panel (Overlay/Side) */}
        {showAiPanel && (
            <>
                {/* Mobile AI Panel Backdrop */}
                <div 
                    className="fixed inset-0 bg-black/50 z-20 md:hidden" 
                    onClick={() => setShowAiPanel(false)}
                />
                <div className="w-full sm:w-96 border-l border-gray-800 bg-gray-900 flex flex-col shadow-xl fixed md:relative right-0 top-0 bottom-0 h-full z-30 border-t md:border-t-0 border-gray-700 md:border-gray-800 transition-all duration-300">
                    <div className="p-3 border-b border-gray-800 font-semibold text-sm flex items-center gap-2 text-white justify-between">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-blue-400" /> Gemini Assistant
                        </div>
                        <button onClick={() => setShowAiPanel(false)} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4" /></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center mt-10 space-y-3">
                            <div className="bg-gray-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                                <Sparkles className="w-6 h-6 text-yellow-400" />
                            </div>
                            <p className="text-sm text-gray-400">Ask me anything about this repository.</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                <button onClick={() => { setInputMessage("Explain the project structure"); handleSendMessage(); }} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-300 border border-gray-700">Structure?</button>
                                <button onClick={() => { setInputMessage("What is the main entry point?"); handleSendMessage(); }} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-300 border border-gray-700">Entry point?</button>
                            </div>
                        </div>
                    )}
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] rounded-lg p-3 text-sm whitespace-pre-wrap ${
                                msg.role === 'user' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-800 text-gray-200 border border-gray-700'
                            }`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                        {isAiThinking && (
                            <div className="flex justify-start">
                                <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                    <span className="text-xs text-gray-400">Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 border-t border-gray-800 bg-gray-900">
                        <form onSubmit={handleSendMessage} className="relative">
                            <input 
                            type="text"
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            placeholder="Ask a question..."
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-blue-500 text-white"
                            />
                            <button 
                            type="submit" 
                            disabled={!inputMessage.trim() || isAiThinking}
                            className="absolute right-2 top-2 p-0.5 text-blue-500 hover:text-blue-400 disabled:opacity-50"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
};