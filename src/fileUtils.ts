import * as fs from "fs";
import * as path from "path";

/**
 * Reads and parses a JSON file if it exists.
 *
 * @param filePath - The path to the JSON file.
 * @returns The parsed JSON object or null if the file does not exist.
 */
export async function readAndParseJsonFile(filePath: string): Promise<any | null> {
  try {
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.warn(`File does not exist: ${filePath}`);
      return null;
    }

    // Read the file content
    const fileContent = await fs.promises.readFile(filePath, "utf-8");

    // Parse the JSON content
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading or parsing JSON file: ${filePath}`, error);
    return null;
  }
}
/**
 * Ensures the directory exists and writes the given data as JSON to the specified file path.
 * @param filePath - The path to the JSON file.
 * @param data - The data to write.
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    if (!directoryExistsSync(dir)) await fs.promises.mkdir(dir, { recursive: true }); // Always try to create the directory
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing JSON file: ${filePath}`, error);
    throw error;
  }
}

export function directoryExistsSync(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
