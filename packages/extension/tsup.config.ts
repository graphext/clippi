import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'background/service-worker': 'src/background/service-worker.ts',
    'content/content-script': 'src/content/content-script.ts',
    'sidepanel/sidepanel': 'src/sidepanel/sidepanel.ts',
  },
  format: ['esm'],
  target: 'chrome120',
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // Copy static files post-build
  onSuccess: async () => {
    const fs = await import('fs/promises')
    const path = await import('path')

    // Copy manifest.json
    await fs.copyFile('src/manifest.json', 'dist/manifest.json')

    // Copy HTML files
    await fs.copyFile('src/sidepanel/sidepanel.html', 'dist/sidepanel/sidepanel.html')
    await fs.copyFile('src/sidepanel/sidepanel.css', 'dist/sidepanel/sidepanel.css')

    // Copy icons if they exist
    try {
      await fs.mkdir('dist/icons', { recursive: true })
      const icons = await fs.readdir('src/icons')
      for (const icon of icons) {
        await fs.copyFile(
          path.join('src/icons', icon),
          path.join('dist/icons', icon)
        )
      }
    } catch {
      // Icons folder might not exist yet
    }
  }
})
