import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Folder, FileCode, FolderOpen, ChevronRight, ChevronDown, File, Search, X } from 'lucide-react';
import { GitHubFile } from '../types';

// Props interfaces
interface FileTreeProps {
  files: GitHubFile[];
  onFileSelect: (file: GitHubFile) => void;
  onFolderExpand: (folder: GitHubFile) => Promise<void>;
  selectedFile: GitHubFile | null;
}

interface ExtendedFileTreeProps extends FileTreeProps {
    filesMap: Record<string, GitHubFile[]>;
}

// Type for flattened tree items
interface FlattenedTreeItem {
  file: GitHubFile;
  depth: number;
}

// Icon helper
const getFileIcon = (fileName: string) => {
  if (fileName.endsWith('.tsx') || fileName.endsWith('.ts') || fileName.endsWith('.js') || fileName.endsWith('.jsx')) return <FileCode className="w-4 h-4 text-blue-400" />;
  if (fileName.endsWith('.css') || fileName.endsWith('.scss')) return <FileCode className="w-4 h-4 text-pink-400" />;
  if (fileName.endsWith('.json')) return <FileCode className="w-4 h-4 text-yellow-400" />;
  if (fileName.endsWith('.md')) return <FileCode className="w-4 h-4 text-gray-400" />;
  return <File className="w-4 h-4 text-gray-500" />;
};

// Search helper
const hasMatchingChild = (path: string, query: string, filesMap: Record<string, GitHubFile[]>): boolean => {
    const children = filesMap[path];
    if (!children) return false;
    return children.some(child => 
        child.name.toLowerCase().includes(query) || 
        (child.type === 'dir' && hasMatchingChild(child.path, query, filesMap))
    );
};

// Main FileTree component
export const RecursiveFileTree: React.FC<ExtendedFileTreeProps> = (props) => {
    const { files, filesMap, onFileSelect, onFolderExpand, selectedFile } = props;
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const containerRef = useRef<HTMLDivElement>(null);

    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (containerRef.current) {
            const obs = new ResizeObserver(([entry]) => {
                const { width, height } = entry.contentRect;
                setSize({ width, height });
            });
            obs.observe(containerRef.current);
            return () => obs.disconnect();
        }
    }, []);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const handleFolderClick = async (file: GitHubFile) => {
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(file.path)) {
          newSet.delete(file.path);
        } else {
          newSet.add(file.path);
          if (!filesMap[file.path]) {
            onFolderExpand(file);
          }
        }
        return newSet;
      });
    };

    const flattenedTree = useMemo((): FlattenedTreeItem[] => {
        const flatList: FlattenedTreeItem[] = [];
        const query = searchQuery.toLowerCase();

        const recurse = (currentFiles: GitHubFile[], depth: number) => {
            const sorted = [...currentFiles].sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'dir' ? -1 : 1;
            });

            for (const file of sorted) {
                const isDirectMatch = query ? file.name.toLowerCase().includes(query) : true;
                const hasVisibleChild = query ? hasMatchingChild(file.path, query, filesMap) : false;

                if (isDirectMatch || hasVisibleChild) {
                    flatList.push({ file, depth });
                    const isExpanded = expandedFolders.has(file.path) || (query && hasVisibleChild);
                    if (file.type === 'dir' && isExpanded && filesMap[file.path]) {
                        recurse(filesMap[file.path], depth + 1);
                    }
                }
            }
        };

        recurse(files, 0);
        return flatList;
    }, [files, filesMap, expandedFolders, searchQuery]);

    const hasMatches = flattenedTree.length > 0;

    const { visibleItems, totalHeight } = useMemo(() => {
        const containerHeight = size.height;
        const totalHeight = flattenedTree.length * ITEM_HEIGHT;
        const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
        const endIndex = Math.min(flattenedTree.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
        const visibleItems = flattenedTree.slice(startIndex, endIndex);
        return { visibleItems, totalHeight };
    }, [size.height, flattenedTree]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-3 mb-2">
                <div className="relative group">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                    <input 
                        type="text"
                        placeholder="Search files..."
                        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-md pl-8 pr-8 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 focus:bg-gray-800 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300 transition-colors"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto" ref={containerRef} onScroll={handleScroll}>
                {hasMatches ? (
                    <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                        {visibleItems.map((item, index) => {
                            const { file, depth } = item;
                            const query = searchQuery.toLowerCase();
                            const hasVisibleChild = query ? hasMatchingChild(file.path, query, filesMap) : false;
                            const isExpanded = expandedFolders.has(file.path) || (query && hasVisibleChild);
                            const isSelected = selectedFile?.path === file.path;
                            const top = (startIndex + index) * ITEM_HEIGHT;

                            return (
                                <div
                                    key={file.path}
                                    className={`flex items-center gap-2 pr-2 rounded cursor-pointer text-sm select-none transition-colors whitespace-nowrap ${isSelected ? 'bg-blue-900/40 text-blue-300' : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                                    style={{ 
                                        paddingLeft: `${depth * 16 + 8}px`, 
                                        position: 'absolute', 
                                        top: `${top}px`, 
                                        left: 0, 
                                        right: 0, 
                                        height: `${ITEM_HEIGHT}px`
                                    }}
                                    onClick={() => file.type === 'dir' ? handleFolderClick(file) : onFileSelect(file)}
                                >
                                    <span className="opacity-70 flex-shrink-0">
                                      {file.type === 'dir' ? (
                                        isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                                      ) : (
                                        <span className="w-3 h-3 block" /> 
                                      )}
                                    </span>
                                    <span className="flex-shrink-0">
                                    {file.type === 'dir' ? (
                                      isExpanded ? <FolderOpen className="w-4 h-4 text-blue-300" /> : <Folder className="w-4 h-4 text-blue-500" />
                                    ) : (
                                      getFileIcon(file.name)
                                    )}
                                    </span>
                                    <span className="truncate">{file.name}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="px-4 py-8 text-center">
                        <p className="text-xs text-gray-500">No files match "{searchQuery}"</p>
                    </div>
                )}
            </div>
        </div>
    );
};
