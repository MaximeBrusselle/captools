import cds from "@sap/cds";
import fs from "fs";
import path from "path";
import chalk from "chalk";

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
			if (element && 
				(element.type === "cds.Association" || element.type === "cds.Composition") &&
				(!element.cardinality || element.cardinality.max !== "*")) {
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

	// Report errors for extra columns (trace level 0+)
	if (extra.length > 0) {
		console.error(chalk.red(`❌ HEADER ERROR: Entity [${entityName}]`));
		console.error(chalk.red(`    File: ${path.basename(filePath)}`));
		console.error(chalk.red(`    Extra Columns: ${extra.join(", ")}`));
		console.error(chalk.red(`    👉 Remove columns that don't exist in the schema.\n`));
		hasErrors = true;
	}

	// Report errors for missing key columns (trace level 0+)
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

	for (let name of entities) {
		const def = csn.definitions[name];

		// 1. Calculate the Strict Requirement
		// Namespace dots become hyphens. Underscores remain underscores.
		const strictName = name.replace(/\./g, "-") + ".csv";
		const strictNameLower = strictName.toLowerCase();

		// 2. Look for matches
		const exactMatch = diskFiles.find((f) => f.actualName === strictName);
		const caseMatch = diskFiles.find((f) => f.lowerName === strictNameLower);

		// 3. Look for "Lazy" matches (missing namespace)
		const shortName = name.split(".").pop() + ".csv"; // e.g., ProductGroup.csv
		const lazyMatch = diskFiles.find((f) => f.lowerName === shortName.toLowerCase());

		// Report issues based on trace level
		if (caseMatch && !exactMatch) {
			// Case mismatch warning (trace level 1+)
			if (traceLevel >= 1) {
				console.warn(chalk.yellow(`⚠️  CASE MISMATCH: Entity [${name}]`));
				console.warn(chalk.yellow(`    Expects: ${strictName}`));
				console.warn(chalk.yellow(`    Found:   ${caseMatch.actualName}`));
				console.warn(chalk.yellow(`    👉 Rename the file to match the entity casing exactly.\n`));
			}
			warnings++;
		} else if (lazyMatch && !exactMatch && !caseMatch) {
			// Namespace error (trace level 0+)
			console.error(chalk.red(`❌ NAMESPACE ERROR: Entity [${name}]`));
			console.error(chalk.red(`    Expects: ${strictName}`));
			console.error(chalk.red(`    Found:   ${lazyMatch.actualName}`));
			console.error(chalk.red(`    👉 You MUST prefix the filename with the namespace.\n`));
			errors++;
		} else if (exactMatch && traceLevel >= 2) {
			// Perfect match (trace level 2)
			console.log(chalk.green(`✅ FILENAME OK: Entity [${name}]`));
			console.log(chalk.green(`    File: ${exactMatch.actualName}`));
			console.log(chalk.green(`    Filename matches entity name perfectly.\n`));
		}
	}

	console.log("---------------------------------------------------");
	if (errors > 0 || warnings > 0) {
		console.log(`Findings: ${chalk.red(errors)} Errors, ${chalk.yellow(warnings)} Warnings.`);
	} else {
		console.log("🎉 Perfect match. No naming issues found.");
	}
}

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

export async function validateCsvs(traceLevel) {
	await validateCsvFilenames(traceLevel);
	console.log("");
	await validateCsvHeaders(traceLevel);
}
