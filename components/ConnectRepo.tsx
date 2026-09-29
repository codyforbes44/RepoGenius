import React, { useState, useMemo } from 'react';
import { Github, Key, Search, Loader2 } from 'lucide-react';

interface ConnectRepoProps {
  onConnect: (owner: string, repo: string, token: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const ConnectRepo: React.FC<ConnectRepoProps> = ({ onConnect, isLoading, error }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const urlError = useMemo(() => {
    if (repoUrl) {
      const { error } = parseGitHubUrl(repoUrl);
      return error;
    } else {
      return null;
    }
  }, [repoUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { owner, repo, error } = parseGitHubUrl(repoUrl);

    if (owner && repo) {
      onConnect(owner, repo, token);
    } else {
      setUrlError(error || 'Invalid repository format.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-gradient-to-br from-gray-900 via-gray-950 to-black p-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gray-800 p-4 rounded-full mb-4 ring-2 ring-blue-500/20">
            <Github className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">RepoGenius by ƷBI</h1>
          <p className="text-gray-400 text-center text-sm">
            Connect your repository to unlock AI-powered insights, code analysis, and chat.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Repository
            </label>
            <div className="relative">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="owner/repo or https://github.com/..."
                className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-600 transition-all"
                required
              />
              <Search className="w-5 h-5 text-gray-500 absolute left-3 top-3.5" />
            </div>
            {urlError && <p className="text-xs text-red-400 mt-1.5">{urlError}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex justify-between">
              <span>Access Token (Optional)</span>
              <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 cursor-pointer">Get Token</a>
            </label>
            <div className="relative">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_..."
                className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-600 transition-all"
              />
              <Key className="w-5 h-5 text-gray-500 absolute left-3 top-3.5" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Recommended for private repos or to avoid rate limits (60 req/hr vs 5000 req/hr).
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 px-4 rounded-lg font-semibold text-white shadow-lg transition-all duration-200 
              ${isLoading 
                ? 'bg-blue-600/50 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 hover:shadow-blue-500/25 active:scale-[0.98]'
              }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </span>
            ) : (
              'Connect Repository'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};