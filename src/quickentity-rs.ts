import child_process from "child_process"
import { logger } from "./core-singleton"

// Shim for QuickEntity 3.0 executable

const execCommand = function (command: string) {
	logger.verbose(`Executing QN 3.0 command ${command}`)
	child_process.execSync(command)
}

export async function convert(game: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string, output: string) {
	execCommand(
		`"Third-Party\\quickentity-rs.exe" entity convert --input-factory "${TEMP}" --input-factory-meta "${TEMPmeta}" --input-blueprint "${TBLU}" --input-blueprint-meta "${TBLUmeta}" --output "${output}"`
	)
}

export async function generate(game: string, input: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string) {
	execCommand(
		`"Third-Party\\quickentity-rs.exe" entity generate --input "${input}" --output-factory "${TEMP}" --output-factory-meta "${TEMPmeta}" --output-blueprint "${TBLU}" --output-blueprint-meta "${TBLUmeta}"`
	)
}

export async function applyPatchJSON(original: string, patch: string, output: string) {
	execCommand(`"Third-Party\\quickentity-rs.exe" patch apply --input "${original}" --patch "${patch}" --output "${output}"`)
}