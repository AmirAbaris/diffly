# Path Traversal via Unsanitized Zip Archive Extraction

## Description
A microservice provides file extraction capabilities for user-uploaded archive bundles (.zip). The extractor iterates over all entries inside the archive using `unzipper` and writes each extracted file to disk under a target destination folder using `path.join(destinationDirectory, file.path)`.

## Threat Model
Archive entry names (`file.path`) are not guaranteed to be relative or safe. A maliciously crafted ZIP archive containing entry filenames with directory traversal sequences (such as `../../../../etc/passwd` or `../../app/config.js`) will cause `path.join` to resolve to paths outside the intended `destinationDirectory`. This enables arbitrary file overwrite or creation (Zip Slip / CWE-22), leading to remote code execution or system compromise.
