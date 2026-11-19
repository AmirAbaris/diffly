#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SPECS_DIR="${SKILL_DIR}/specs"

JAR_PATH="${TLC_JAR:-$HOME/.cache/diffly-tlc/tla2tools.jar}"
TLA_VERSION="v1.8.0"
TLA_URL="https://github.com/tlaplus/tlaplus/releases/download/${TLA_VERSION}/tla2tools.jar"

if ! command -v java >/dev/null 2>&1; then
    echo "Error: 'java' not found in PATH. Install a JRE/JDK (11+) to run TLC." >&2
    exit 1
fi

if [[ ! -f "${JAR_PATH}" ]]; then
    mkdir -p "$(dirname "${JAR_PATH}")"
    if ! command -v curl >/dev/null 2>&1; then
        echo "Error: '${JAR_PATH}' is missing and 'curl' is not available to download ${TLA_URL}." >&2
        exit 1
    fi
    echo "Downloading tla2tools.jar (${TLA_VERSION}) to ${JAR_PATH}..."
    curl -fsSL "${TLA_URL}" -o "${JAR_PATH}.tmp"
    mv "${JAR_PATH}.tmp" "${JAR_PATH}"
fi

TMP_META_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "${TMP_META_DIR}" "${SPECS_DIR}/states" "${SKILL_DIR}/states" "./states"
}
trap cleanup EXIT

cd "${SPECS_DIR}"
java -XX:+UseParallelGC -cp "${JAR_PATH}" tlc2.TLC \
    -deadlock \
    -metadir "${TMP_META_DIR}" \
    -config OwnershipClaim.cfg \
    OwnershipClaim.tla
