// Commits dev-mode edits straight to the repo with the Git Data API, so all
// changed files land in one commit (and one GitHub Pages deploy).

export interface RepoRef {
  owner: string;
  name: string;
  branch: string;
}

export interface FileChange {
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
}

const TOKEN_KEY = 'smb3.ghToken';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${msg.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function commitFiles(repo: RepoRef, token: string, files: FileChange[], message: string): Promise<string> {
  const base = `/repos/${repo.owner}/${repo.name}`;
  const ref = await gh<{ object: { sha: string } }>(token, `${base}/git/ref/heads/${repo.branch}`);
  const parent = await gh<{ tree: { sha: string } }>(token, `${base}/git/commits/${ref.object.sha}`);

  const tree = await Promise.all(
    files.map(async (f) => {
      const blob = await gh<{ sha: string }>(token, `${base}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: f.encoding }),
      });
      return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
    }),
  );

  const newTree = await gh<{ sha: string }>(token, `${base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const commit = await gh<{ sha: string; html_url: string }>(token, `${base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  });
  await gh(token, `${base}/git/refs/heads/${repo.branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.html_url;
}
