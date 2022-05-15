import type { Config, Manifest } from "../../../src/types"

import json5 from "json5"
import memoize from "lodash.memoize"
import merge from "lodash.mergewith"

export const FrameworkVersion = "1.5.5"

export function getConfig() {
	const config: Config = json5.parse(String(window.fs.readFileSync("../config.json", "utf8")))

	// Remove duplicate items in load order
	config.loadOrder = config.loadOrder.filter((value, index, array) => array.indexOf(value) == index)

	// Remove non-existent mods from load order
	config.loadOrder = config.loadOrder.filter((value) => {
		try {
			getModFolder(value)
			return true
		} catch {
			return false
		}
	})

	// Validate mod options
	config.loadOrder.forEach((mod) => {
		if (modIsFramework(mod)) {
			const manifest = getManifestFromModID(mod)!

			if (manifest.options) {
				if (!config.modOptions[mod]) {
					merge(
						config,
						{
							modOptions: {
								[mod]: [
									...manifest.options
										.filter((a) => (a.type == "checkbox" || a.type == "select" ? a.enabledByDefault : false))
										.map((a) => (a.type == "select" ? a.group + ":" + a.name : a.name))
								]
							}
						},
						(orig, src) => {
							if (Array.isArray(orig)) {
								return src
							}
						}
					)
				} // Select default options when a mod has no options set

				config.modOptions[mod].push(
					...manifest.options
						.filter((a) => a.type == "select" && a.enabledByDefault)
						.filter((a) => !config.modOptions[mod].some((b) => b.split(":").length > 1 && b.split(":")[0] != a.name))
						.map((a) => (a.type == "select" ? a.group + ":" + a.name : a.name))
				) // Select default options in select type IF there is no selected option

				for (let i = config.modOptions[mod].length - 1; i >= 0; i--) {
					if (
						!manifest.options.some((a) => a.type == "checkbox" && a.name == config.modOptions[mod][i]) &&
						!manifest.options.some((a) => a.type == "select" && a.group + ":" + a.name == config.modOptions[mod][i])
					) {
						if (manifest.options.some((a) => a.type == "select" && a.name == config.modOptions[mod][i])) {
							// There's a select and it's using the old name format (just the name), change it to the new format (group:name)
							config.modOptions[mod][i] =
								// @ts-expect-error TypeScript doesn't think that a select has a group apparently
								manifest.options.find((a) => a.type == "select" && a.name == config.modOptions[mod][i])!.group +
								":" +
								manifest.options.find((a) => a.type == "select" && a.name == config.modOptions[mod][i])!.name
						} else {
							// Remove it, it doesn't exist
							config.modOptions[mod].splice(i, 1)
						}
					}
				} // Remove non-existent options and update from the old name format in select options

				for (let i = config.modOptions[manifest.id].length - 1; i >= 0; i--) {
					if (
						manifest.options.find(
							(a) => (a.type == "checkbox" && a.name == config.modOptions[manifest.id][i]) || (a.type == "select" && a.group + ":" + a.name == config.modOptions[manifest.id][i])
						)?.requirements
					) {
						if (
							!manifest.options
								.find(
									(a) => (a.type == "checkbox" && a.name == config.modOptions[manifest.id][i]) || (a.type == "select" && a.group + ":" + a.name == config.modOptions[manifest.id][i])
								)!
								.requirements!.every((a) => config.loadOrder.includes(a))
						) {
							config.modOptions[manifest.id].splice(i, 1)
						}
					}
				} // Disable mod options that require non-present mods

				merge(
					config,
					{
						modOptions: config.modOptions
					},
					(orig, src) => {
						if (Array.isArray(orig)) {
							return src
						}
					}
				)
			}
		}
	})

	setConfig(config)
	return config
}

export function setConfig(config: Config) {
	window.fs.writeFileSync("../config.json", json5.stringify(config))
}

export function mergeConfig(configToMerge: Partial<Config>) {
	const config = getConfig()
	setConfig(
		merge(config, configToMerge, (orig, src) => {
			if (Array.isArray(orig)) {
				return src
			}
		})
	)
}

export function sortMods() {
	const config = getConfig()

	// "You are without a doubt the worst sorting algorithm I've ever heard of."
	// "But you have heard of me."
	let doAnotherCycle = true
	let cycle = 0
	while (doAnotherCycle && cycle < 100) {
		cycle++
		doAnotherCycle = false

		console.log(`Cycle ${cycle}:`)

		config.loadOrder = ["dummy-1", ...config.loadOrder.filter((a) => a != "dummy-1" && a != "dummy-2"), "dummy-2"]
		let modsToSort = JSON.parse(JSON.stringify(config.loadOrder)).filter((a) => a != "dummy-1" && a != "dummy-2")

		modSorting: while (modsToSort.length) {
			for (const mod of modsToSort) {
				if (modIsFramework(mod)) {
					const modManifest = getManifestFromModID(mod)

					modManifest.options || (modManifest.options = [])

					modManifest.loadBefore || (modManifest.loadBefore = [])
					modManifest.loadBefore.push(
						modManifest.options
							.filter(
								(a) =>
									config.modOptions[modManifest.id].includes(a.name) ||
												config.modOptions[modManifest.id].includes(a.group + ":" + a.name) ||
												(a.type == "requirement" && a.mods.every((b) => config.loadOrder.includes(b)))
							)
							.map((a) => a.loadBefore)
							.filter((a) => a)
							.flat(1)
					)

					modManifest.loadAfter || (modManifest.loadAfter = [])
					modManifest.loadAfter.push(
						modManifest.options
							.filter(
								(a) =>
									config.modOptions[modManifest.id].includes(a.name) ||
												config.modOptions[modManifest.id].includes(a.group + ":" + a.name) ||
												(a.type == "requirement" && a.mods.every((b) => config.loadOrder.includes(b)))
							)
							.map((a) => a.loadAfter)
							.filter((a) => a)
							.flat(1)
					)

					for (const modToLoadBefore of modManifest.loadBefore) {
						// Move the mod to just before where the other mod is
						if (config.loadOrder.includes(modToLoadBefore) && config.loadOrder.indexOf(modToLoadBefore) < config.loadOrder.indexOf(mod)) {
							if (config.loadOrder.indexOf(modToLoadBefore) - 1 == 0) {
								config.loadOrder = config.loadOrder.filter((a) => a != mod)
								config.loadOrder.unshift(mod)
							} else {
								config.loadOrder.splice(config.loadOrder.indexOf(modToLoadBefore) - 1, 0, config.loadOrder.splice(config.loadOrder.indexOf(mod), 1)[0])
							}
							console.log(`Moved ${mod} to before ${modToLoadBefore}`, config.loadOrder)
							modsToSort = modsToSort.filter((a) => a != mod)
							doAnotherCycle = true
							continue modSorting
						}
					}

					for (const modToLoadAfter of modManifest.loadAfter) {
						// Move the mod to just after where the other mod is
						if (config.loadOrder.includes(modToLoadAfter) && config.loadOrder.indexOf(modToLoadAfter) > config.loadOrder.indexOf(mod)) {
							config.loadOrder.splice(config.loadOrder.indexOf(modToLoadAfter) + 1, 0, config.loadOrder.splice(config.loadOrder.indexOf(mod), 1)[0])
							console.log(`Moved ${mod} to after ${modToLoadAfter}`, config.loadOrder)
							modsToSort = modsToSort.filter((a) => a != mod)
							doAnotherCycle = true
							continue modSorting
						}
					}
				}

				modsToSort = modsToSort.filter((a) => a != mod)
				continue modSorting
			}
		}
	}

	config.loadOrder = config.loadOrder.filter((a) => a != "dummy-1" && a != "dummy-2")

	if (cycle < 100) {
		setConfig(config)
		return true
	} else {
		return false
	}
}

export const getModFolder = memoize(function (id: string) {
	const folder = modIsFramework(id)
		? window.fs
			.readdirSync(window.path.join("..", "Mods"))
			.find(
				(a) =>
					window.fs.existsSync(window.path.join("..", "Mods", a, "manifest.json")) &&
						json5.parse(String(window.fs.readFileSync(window.path.join("..", "Mods", a, "manifest.json"), "utf8"))).id == id
			) // Find mod by ID
		: window.path.join("..", "Mods", id) // Mod is an RPKG mod, use folder name

	if (!folder) {
		throw new Error(`Couldn't find mod ${id}`)
	}

	return window.path.resolve(window.path.join("..", "Mods", folder))
})

export const modIsFramework = memoize(function (id: string) {
	return !(
		(
			window.fs.existsSync(window.path.join("..", "Mods", id)) && // mod exists in folder
			!window.fs.existsSync(window.path.join("..", "Mods", id, "manifest.json")) && // mod has no manifest
			window
				.klaw(window.path.join("..", "Mods", id))
				.filter((a) => a.stats.size > 0)
				.map((a) => a.path)
				.some((a) => a.endsWith(".rpkg"))
		) // mod contains RPKG files
	)
})

export const getManifestFromModID = memoize(function (id: string): Manifest {
	if (modIsFramework(id)) {
		return json5.parse(String(window.fs.readFileSync(window.path.join(getModFolder(id), "manifest.json"), "utf8")))
	} else {
		throw new Error(`Mod ${id} is not a framework mod`)
	}
})

export const getAllMods = memoize(function () {
	return window.fs
		.readdirSync(window.path.join("..", "Mods"))
		.map((a) => window.path.resolve(window.path.join("..", "Mods", a)))
		.map((a) =>
			window.fs.existsSync(window.path.join(a, "manifest.json"))
				? (json5.parse(String(window.fs.readFileSync(window.path.join(a, "manifest.json"), "utf8"))).id as string)
				: a.split(window.path.sep).pop()!
		)
})