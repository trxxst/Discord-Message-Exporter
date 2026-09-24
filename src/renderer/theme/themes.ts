export interface ThemeDef {
  id: string
  label: string
  /** Swatch color shown in the theme selector. */
  swatch: string
}

// App-level themes (the exported archive viewer ships its own matching set).
export const THEMES: ThemeDef[] = [
  { id: 'dark', label: 'Dark', swatch: '#5865f2' },
  { id: 'oled', label: 'OLED', swatch: '#000000' },
  { id: 'mid', label: 'Mid', swatch: '#7c4dff' },
  { id: 'nord', label: 'Nord', swatch: '#88c0d0' },
  { id: 'drac', label: 'Drac', swatch: '#bd93f9' },
  { id: 'neo', label: 'Neo', swatch: '#ff2bd6' }
]

export function applyTheme(id: string): void {
  document.documentElement.setAttribute('data-theme', id)
  try {
    localStorage.setItem('db-app-theme', id)
  } catch {
    /* ignore */
  }
}

export function loadTheme(): string {
  try {
    return localStorage.getItem('db-app-theme') || 'dark'
  } catch {
    return 'dark'
  }
}
