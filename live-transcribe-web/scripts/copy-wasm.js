#!/usr/bin/env node

/**
 * Build script to copy ONNX WebAssembly files to the public directory
 *
 * This script automatically detects and copies all WASM files from the
 * onnxruntime-web package to the public directory, making them available
 * for the ONNX runtime when running in the browser.
 *
 * Usage:
 *   npm run copy-wasm    # Copy WASM files manually
 *   npm run build        # Automatically copies WASM files before building
 *   npm run dev          # Automatically copies WASM files before starting dev server
 *
 * The WASM files are required for the WASM backend option in the application.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.join(
  __dirname,
  "..",
  "node_modules",
  "onnxruntime-web",
  "dist"
);
const targetDir = path.join(__dirname, "..", "public");

// Check if onnxruntime-web is installed
if (!fs.existsSync(sourceDir)) {
  console.error(
    "❌ onnxruntime-web not found in node_modules. Please run: npm install"
  );
  process.exit(1);
}

// Get all .wasm files from the onnxruntime-web dist directory
let wasmFiles = [];
try {
  const files = fs.readdirSync(sourceDir);
  wasmFiles = files.filter((file) => file.endsWith(".wasm"));
} catch (error) {
  console.error(
    "❌ Failed to read onnxruntime-web dist directory:",
    error.message
  );
  process.exit(1);
}

if (wasmFiles.length === 0) {
  console.error("❌ No WASM files found in onnxruntime-web dist directory");
  process.exit(1);
}

console.log(`Found ${wasmFiles.length} WASM file(s) in onnxruntime-web`);
console.log("Copying ONNX WASM files for web deployment...");

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`Created directory: ${targetDir}`);
}

let copiedCount = 0;

// Copy each WASM file
wasmFiles.forEach((fileName) => {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(targetDir, fileName);

  try {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✓ Copied: ${fileName}`);
    copiedCount++;
  } catch (error) {
    console.error(`✗ Failed to copy ${fileName}:`, error.message);
  }
});

console.log(
  `\nWASM file copy complete! Copied ${copiedCount} of ${wasmFiles.length} files.`
);

if (copiedCount === 0) {
  console.error(
    "\n❌ No WASM files were copied. Check if onnxruntime-web is installed."
  );
  process.exit(1);
} else if (copiedCount < wasmFiles.length) {
  console.warn(
    "\n⚠ Some WASM files were not found. This may cause issues with WASM backend."
  );
}
