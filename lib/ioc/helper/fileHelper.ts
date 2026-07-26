import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IocConfig } from '../types';
// create file helper class

const CONFIG_FILE_NAME = 'asena-config.ts';

/**
 * Directories that never hold application components. `node_modules` alone is the
 * overwhelming majority of a project's files, and walking it made every boot stat
 * tens of thousands of paths. Dotfolders (`.git`, `.idea`, `.vscode`, ...) are
 * skipped by prefix rather than by name.
 */
const EXCLUDED_DIRECTORIES = new Set(['node_modules']);

const isExcludedDirectory = (name: string): boolean => name.startsWith('.') || EXCLUDED_DIRECTORIES.has(name);

export const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []): string[] => {
  // Sorted because `readdirSync` order is not defined: without this, which file wins a
  // name collision - or which config is picked up first - can differ between machines
  const files = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  files.forEach((file) => {
    const filePath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      if (isExcludedDirectory(file.name)) {
        return;
      }

      getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
};

export const readJson = (path) => {
  const file = fs.readFileSync(path, { encoding: 'utf-8' });

  return JSON.parse(file);
};

/**
 * @description Locate and load `asena-config.ts`.
 *
 * The config sits in the project root in every supported layout, so that is checked
 * directly before falling back to a walk. The fallback is also order-dependent - the
 * first match wins and `readdirSync` order is not defined - which is the second reason
 * to prefer the direct hit.
 * @returns {Promise<IocConfig | null>} The config, or null when there is none
 */
export const readConfigFile = async (): Promise<IocConfig | null> => {
  const folderPath = path.join(process.cwd());
  const rootConfig = path.join(folderPath, CONFIG_FILE_NAME);

  if (fs.existsSync(rootConfig)) {
    return importConfigFile(rootConfig);
  }

  const files: string[] = getAllFiles(folderPath);

  for (const file of files) {
    if (file.endsWith(CONFIG_FILE_NAME)) {
      return importConfigFile(file);
    }
  }

  return null;
};

const importConfigFile = async (file: string): Promise<IocConfig> => {
  try {
    return (await import(file)).default as IocConfig;
  } catch (e) {
    console.error('Cannot read config file', e);

    throw new Error('AsenaConfig file cannot read.');
  }
};
