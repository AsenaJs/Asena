// Non-class exports sit next to the components on purpose: the scan must step over them
// without reading metadata from a string, a number or a plain object.
export const SCAN_FOLDER_GREETING = 'hello';

export const SCAN_FOLDER_LIMIT = 3;

export const scanFolderConfig = { retries: 3 };
