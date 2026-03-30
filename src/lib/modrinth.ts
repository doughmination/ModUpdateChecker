const BASE = 'https://api.modrinth.com/v2';
const UA = 'modrinth-discord-bot/1.0 (contact via Discord)';

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  project_type: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  changelog: string | null;
  version_type: 'release' | 'beta' | 'alpha';
  game_versions: string[];
  loaders: string[];
  date_published: string;
  files: { url: string; primary: boolean }[];
}

async function modrinthFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Modrinth API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchProject(projectId: string): Promise<ModrinthProject> {
  return modrinthFetch<ModrinthProject>(`/project/${projectId}`);
}

export async function fetchLatestVersions(projectId: string): Promise<ModrinthVersion[]> {
  // Returns versions sorted newest first
  return modrinthFetch<ModrinthVersion[]>(`/project/${projectId}/version`);
}
