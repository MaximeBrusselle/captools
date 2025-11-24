import cds from "@sap/cds";
import fs from "fs";
import path from "path";
import chalk from "chalk";

/**
 * Reads the header row from a CSV file.
 *
 * @private
 * @param {string} filePath - The path to the CSV file.
 * @returns {string[]} - An array of header names, or an empty array if reading fails.
 */
function getCsvHeaders(filePath) {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const firstLine = content.split(/\r?\n/)[0];
		if (!firstLine) return [];
		if (firstLine.includes(";")) return firstLine.split(";").map((h) => h.trim().replace(/^"|"$/g, ""));
		return firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
	} catch (e) {
		return [];
	}
}

/**
 * Validates the header row of a CSV file against the CDS entity definition.
 *
 * @private
 * @param {string} filePath - The path to the CSV file.
 * @param {string} entityName - The name of the CDS entity.
 * @param {object} csn - The compiled CDS model (CSN).
 * @param {number} traceLevel - The level of output detail.
 * @returns {{hasErrors: boolean, hasWarnings: boolean}} - The validation result.
 */
function validateHeaderRow(filePath, entityName, csn, traceLevel) {
	const def = csn.definitions[entityName];
	if (!def) return false;

	const headers = getCsvHeaders(filePath);
	const expected = [];
	const managedFields = ["createdAt", "createdBy", "modifiedAt", "modifiedBy"];
	let hasErrors = false;
	let hasWarnings = false;

	for (const name in def.elements) {
		const element = def.elements[name];

		if (element.virtual || element["@cds.persistence.skip"]) continue;

		// Managed fields are optional
		if (managedFields.includes(name)) continue;

		if (element.type === "cds.Association" || element.type === "cds.Composition") {
			// Skip to-many
			if (element.cardinality && element.cardinality.max === "*") continue;

			// Skip compositions (parent entity doesn't need header for children)
			if (element.type === "cds.Composition") continue;

			// To-one Association
			if (element.type === "cds.Association") {
				const target = csn.definitions[element.target];
				if (target) {
					const keys = Object.keys(target.elements).filter((k) => target.elements[k].key);
					keys.forEach((k) => expected.push(`${name}_${k}`));
				}
			}
		} else {
			// Normal property
			expected.push(name);
		}
	}

	// Check for missing columns (schema -> CSV)
	const missing = expected.filter((e) => !headers.includes(e));
	const missingKeys = missing.filter((e) => {
		// Check if it's a key field (but not association key - those are warnings)
		if (e.includes("_")) {
			// This is an association key - treat as warning, not error
			return false;
		}
		return def.elements[e] && def.elements[e].key;
	});
	const missingNonKeys = missing.filter((e) => !missingKeys.includes(e));

	// Check for extra columns (CSV -> schema)
	const extra = headers.filter((h) => {
		// Skip managed fields
		if (managedFields.includes(h)) return false;

		// Check if it's in expected columns
		if (expected.includes(h)) return false;

		// Check if it's a foreign key pattern (column_id) that might match an association
		if (h.includes("_")) {
			const [baseName, keyName] = h.split("_");
			const element = def.elements[baseName];

			// If there's a to-one association with this base name, it's valid
			if (element && (element.type === "cds.Association" || element.type === "cds.Composition") && (!element.cardinality || element.cardinality.max !== "*")) {
				return false; // Not extra - it's a valid foreign key
			}
		}

		// Check if it matches a property name with different casing
		const lowerH = h.toLowerCase();
		for (const name in def.elements) {
			if (name.toLowerCase() === lowerH) {
				return false; // Not extra - it's a case mismatch
			}
		}

		return true; // It's truly extra
	});

	// Report errors for extra columns (always shown - trace level 0+)
	if (extra.length > 0) {
		console.error(chalk.red(`❌ HEADER ERROR: Entity [${entityName}]`));
		console.error(chalk.red(`    File: ${path.basename(filePath)}`));
		console.error(chalk.red(`    Extra Columns: ${extra.join(", ")}`));
		console.error(chalk.red(`    👉 Remove columns that don't exist in the schema.\n`));
		hasErrors = true;
	}

	// Report errors for missing key columns (always shown - trace level 0+)
	if (missingKeys.length > 0) {
		console.error(chalk.red(`❌ HEADER ERROR: Entity [${entityName}]`));
		console.error(chalk.red(`    File: ${path.basename(filePath)}`));
		console.error(chalk.red(`    Missing Key Columns: ${missingKeys.join(", ")}`));
		console.error(chalk.red(`    👉 Add missing key columns to the CSV header.\n`));
		hasErrors = true;
	}

	// Report warnings for missing non-key columns (trace level 1+)
	if (missingNonKeys.length > 0 && traceLevel >= 1) {
		console.warn(chalk.yellow(`⚠️  HEADER WARNING: Entity [${entityName}]`));
		console.warn(chalk.yellow(`    File: ${path.basename(filePath)}`));
		console.warn(chalk.yellow(`    Missing Non-Key Columns: ${missingNonKeys.join(", ")}`));
		console.warn(chalk.yellow(`    👉 Consider adding these columns to the CSV header.\n`));
		hasWarnings = true;
	}

	// Report success for files with no issues (trace level 2)
	if (!hasErrors && !hasWarnings && traceLevel >= 2) {
		console.log(chalk.green(`✅ HEADER OK: Entity [${entityName}]`));
		console.log(chalk.green(`    File: ${path.basename(filePath)}`));
		console.log(chalk.green(`    All headers match the schema perfectly.\n`));
	}

	return { hasErrors, hasWarnings };
}

/**
 * Validates that CSV filenames match the CDS entity names.
 *
 * @public
 * @async
 * @param {number} traceLevel - The level of output detail.
 * @returns {Promise<void>} - A promise that resolves when validation is complete.
 */
export async function validateCsvFilenames(traceLevel) {
	console.log("🔍 Loading CDS model for filename validation...");
	const csn = await cds.load("*");

	// 1. Gather all CSVs (ignoring case for now)
	const dataFolders = ["db/data", "db/csv", "db/src/csv"];
	let diskFiles = [];

	dataFolders.forEach((folder) => {
		if (fs.existsSync(folder)) {
			const files = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".csv"));
			files.forEach((f) => {
				diskFiles.push({
					actualName: f,
					lowerName: f.toLowerCase(),
					folder: folder,
				});
			});
		}
	});

	if (diskFiles.length === 0) {
		console.error("❌ No CSV files found. Check your folder structure.");
		return;
	}

	console.log(`📂 Found ${diskFiles.length} CSV files. Checking filenames against entities...\n`);

	let warnings = 0;
	let errors = 0;

	// Get entities and sort them alphabetically
	const entities = Object.keys(csn.definitions)
		.filter((name) => {
			const def = csn.definitions[name];
			return def.kind === "entity" && !name.startsWith("sap.common") && !def["@cds.persistence.skip"];
		})
		.sort();

	// Create a lowercase lookup map for entity names
	const entityLookup = {};
	entities.forEach((name) => {
		entityLookup[name.toLowerCase()] = name;
	});

	for (let diskFile of diskFiles) {
		// Extract entity name from filename (remove .csv extension)
		const fileBaseName = diskFile.actualName.replace(/\.csv$/i, "");

		// Check if this looks like a function/action CSV (contains a dot in the name)
		if (fileBaseName.includes(".")) {
			// Only show function/action warnings at trace level 1+
			if (traceLevel >= 1) {
				console.warn(chalk.yellow(`⚠️  FUNCTION/ACTION CSV: File [${diskFile.actualName}]`));
				console.warn(chalk.yellow(`    Entity: ${fileBaseName}`));
				console.warn(chalk.yellow(`    👉 This appears to be a function/action, not an entity. CSV files should not exist for functions/actions.\n`));
			}
			warnings++;
			continue;
		}

		// Convert hyphens back to dots for entity lookup
		const entityNameFromFile = fileBaseName.replace(/-/g, ".");
		const entityNameLower = entityNameFromFile.toLowerCase();

		// Check if entity exists (case-insensitive)
		const correctEntityName = entityLookup[entityNameLower];

		if (!correctEntityName) {
			// Always show entity not found errors (trace level 0+)
			console.error(chalk.red(`❌ ENTITY NOT FOUND: File [${diskFile.actualName}]`));
			console.error(chalk.red(`    Expected entity: ${entityNameFromFile}`));
			console.error(chalk.red(`    👉 No matching entity found in schema. Check for typos.\n`));
			errors++;
			continue;
		}

		// Entity exists - now check for exact match
		const strictName = correctEntityName.replace(/\./g, "-") + ".csv";

		if (diskFile.actualName === strictName) {
			// Perfect match (trace level 2)
			if (traceLevel >= 2) {
				console.log(chalk.green(`✅ FILENAME OK: Entity [${correctEntityName}]`));
				console.log(chalk.green(`    File: ${diskFile.actualName}`));
				console.log(chalk.green(`    Filename matches entity name perfectly.\n`));
			}
		} else if (entityNameFromFile !== correctEntityName) {
			// Case mismatch in entity name - this is an error (always shown - trace level 0+)
			console.error(chalk.red(`❌ ENTITY CASE ERROR: File [${diskFile.actualName}]`));
			console.error(chalk.red(`    File entity: ${entityNameFromFile}`));
			console.error(chalk.red(`    Schema entity: ${correctEntityName}`));
			console.error(chalk.red(`    Expected filename: ${strictName}`));
			console.error(chalk.red(`    👉 Entity name case must match exactly.\n`));
			errors++;
		} else {
			// Just a filename case mismatch (trace level 1+)
			if (traceLevel >= 1) {
				console.warn(chalk.yellow(`⚠️  CASE MISMATCH: Entity [${correctEntityName}]`));
				console.warn(chalk.yellow(`    Expects: ${strictName}`));
				console.warn(chalk.yellow(`    Found:   ${diskFile.actualName}`));
				console.warn(chalk.yellow(`    👉 Rename the file to match the entity casing exactly.\n`));
			}
			warnings++;
		}
	}

	// Also check for missing CSV files for entities (trace level 2)
	for (let entityName of entities) {
		const strictName = entityName.replace(/\./g, "-") + ".csv";
		const hasFile = diskFiles.some((f) => f.actualName === strictName);

		if (!hasFile && traceLevel >= 2) {
			console.log(chalk.blue(`ℹ️  NO CSV: Entity [${entityName}]`));
			console.log(chalk.blue(`    Expected file: ${strictName}`));
			console.log(chalk.blue(`    👉 No CSV file found for this entity.\n`));
		}
	}

	console.log("---------------------------------------------------");
	if (errors > 0 || warnings > 0) {
		console.log(`Findings: ${chalk.red(errors)} Errors, ${chalk.yellow(warnings)} Warnings.`);
	} else {
		console.log("🎉 Perfect match. No naming issues found.");
	}
}

/**
 * Validates that CSV headers match the CDS entity definitions.
 *
 * @public
 * @async
 * @param {number} traceLevel - The level of output detail.
 * @returns {Promise<void>} - A promise that resolves when validation is complete.
 */
export async function validateCsvHeaders(traceLevel) {
	console.log("🔍 Loading CDS model for header validation...");
	const csn = await cds.load("*");

	// 1. Gather all CSVs
	const dataFolders = ["db/data", "db/csv", "db/src/csv"];
	let diskFiles = [];

	dataFolders.forEach((folder) => {
		if (fs.existsSync(folder)) {
			const files = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".csv"));
			files.forEach((f) => {
				diskFiles.push({
					actualName: f,
					lowerName: f.toLowerCase(),
					folder: folder,
				});
			});
		}
	});

	if (diskFiles.length === 0) {
		console.error("❌ No CSV files found. Check your folder structure.");
		return;
	}

	console.log(`📂 Found ${diskFiles.length} CSV files. Checking headers against entities...\n`);

	let errors = 0;
	let warnings = 0;

	// Get entities and sort them alphabetically
	const entities = Object.keys(csn.definitions)
		.filter((name) => {
			const def = csn.definitions[name];
			return def.kind === "entity" && !name.startsWith("sap.common") && !def["@cds.persistence.skip"];
		})
		.sort();

	for (let name of entities) {
		// Calculate the expected filename
		const strictName = name.replace(/\./g, "-") + ".csv";

		// Look for exact match
		const exactMatch = diskFiles.find((f) => f.actualName === strictName);

		if (exactMatch) {
			const result = validateHeaderRow(path.join(exactMatch.folder, exactMatch.actualName), name, csn, traceLevel);
			if (result.hasErrors) errors++;
			if (result.hasWarnings) warnings++;
		}
	}

	console.log("---------------------------------------------------");
	if (errors > 0 || warnings > 0) {
		console.log(`Findings: ${chalk.red(errors)} Header Errors, ${chalk.yellow(warnings)} Header Warnings.`);
	} else {
		console.log("🎉 Perfect! All CSV headers are correct.");
	}
}

/**
 * Runs both filename and header validation for CSV files.
 *
 * @public
 * @async
 * @param {number} traceLevel - The level of output detail.
 * @returns {Promise<void>} - A promise that resolves when validation is complete.
 */
export async function validateCsvs(traceLevel) {
	await validateCsvFilenames(traceLevel);
	console.log("");
	await validateCsvHeaders(traceLevel);
}
