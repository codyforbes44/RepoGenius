import { GitHubRepo, GitHubFile, GitHubCommit } from '../types';

const BASE_URL = 'https://api.github.com';

interface RequestOptions {
  token?: string;
  ref?: string;
}

export const fetchRepoDetails = async (owner: string, repo: string, options: RequestOptions = {}): Promise<GitHubRepo> => {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  };
  if (options.token) {
    headers['Authorization'] = `token ${options.token}`;
  }

  const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}`, { headers });
  if (!response.ok) {
    if (response.status === 404) throw new Error('Repository not found');
    if (response.status === 401) throw new Error('Invalid Git token');
    if (response.status === 403) throw new Error('Rate limit exceeded. Try adding a token.');
    throw new Error(`GitHub API Error: ${response.statusText}`);
  }
  return response.json();
};

export const fetchRepoContents = async (owner: string, repo: string, path: string = '', options: RequestOptions = {}): Promise<GitHubFile[] | GitHubFile> => {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  };
  if (options.token) {
    headers['Authorization'] = `token ${options.token}`;
  }

  // Handle encoding for path
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  let url = `${BASE_URL}/repos/${owner}/${repo}/contents/${encodedPath}`;
  
  if (options.ref) {
    url += `?ref=${options.ref}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch content at ${path}`);
  }
  return response.json();
};

export const fetchFileCommits = async (owner: string, repo: string, path: string, options: RequestOptions = {}): Promise<GitHubCommit[]> => {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (options.token) {
      headers['Authorization'] = `token ${options.token}`;
    }
  
    const url = `${BASE_URL}/repos/${owner}/${repo}/commits?path=${path}&per_page=10`; // Limit to 10 for UI
  
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch commits for ${path}`);
    }
    return response.json();
  };

export const decodeBase64 = (str: string): string => {
  try {
    // GitHub API returns base64 with newlines, we need to strip them
    return decodeURIComponent(escape(window.atob(str.replace(/\s/g, ''))));
  } catch {
    return "Error decoding file content. It might be binary or too large.";
  }
};
