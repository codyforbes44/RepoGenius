import React, { useState } from 'react';
import { ConnectRepo } from './components/ConnectRepo';
import { RepoExplorer } from './components/RepoExplorer';
import { fetchRepoDetails } from './services/githubService';
import { GitHubRepo, ViewMode } from './types';

function App() {
  const [view, setView] = useState<ViewMode>(ViewMode.CONNECT);
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [token, setToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (owner: string, repoName: string, authToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const repoDetails = await fetchRepoDetails(owner, repoName, { token: authToken });
      setRepo(repoDetails);
      setToken(authToken);
      setView(ViewMode.EXPLORE);
    } catch (err) {
      setError(err.message || "Failed to connect to repository.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setRepo(null);
    setToken('');
    setView(ViewMode.CONNECT);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-950">
      {view === ViewMode.CONNECT && (
        <ConnectRepo 
          onConnect={handleConnect} 
          isLoading={isLoading} 
          error={error} 
        />
      )}
      {view === ViewMode.EXPLORE && repo && (
        <RepoExplorer 
          repo={repo} 
          token={token} 
          onDisconnect={handleDisconnect} 
        />
      )}
    </div>
  );
}

export default App;