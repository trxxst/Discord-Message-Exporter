import { createWriteStream } from 'fs'
import archiver from 'archiver'

/**
 * Compress a completed export folder into a sibling .zip, preserving structure.
 * Resolves with the zip path on success.
 */
export function createZip(sourceFolder: string, zipPath: string, folderNameInZip: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => resolve(zipPath))
    // Without this, a write failure (disk full, locked file) is an unhandled
    // stream error that takes down the main process.
    output.on('error', (err) => reject(err))
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err)
    })
    archive.on('error', (err) => reject(err))

    archive.pipe(output)
    archive.directory(sourceFolder, folderNameInZip)
    void archive.finalize()
  })
}
