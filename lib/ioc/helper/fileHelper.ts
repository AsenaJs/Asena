import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IocConfig } from '../types';
// create file helper class

export const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []): string[] => {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);

    if (fs.statSync(filePath).isDirectory()) {
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

export const readConfigFile = async (): Promise<IocConfig | null> => {
  const folderPath = path.join(process.cwd());
  const files: string[] = getAllFiles(folderPath);

  for (const file of files) {
    if (file.endsWith('asena-config.ts')) {
      try {
        return (await import(file)).default as IocConfig;
      } catch (e) {
        console.error('Cannot read config file', e);

        throw new Error('AsenaConfig file cannot read.');
      }
    }
  }

  return null;
};
