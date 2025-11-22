import fs from "fs";
import path from "path";
import chalk from "chalk";

function getNextVersion(outputDir) {
	if (!fs.existsSync(outputDir)) {
		return "v1";
	}
	const dirs = fs.readdirSync(outputDir).filter((f) => fs.statSync(path.join(outputDir, f)).isDirectory() && /^v\d+$/.test(f));
	if (dirs.length === 0) return "v1";

	const versions = dirs.map((d) => parseInt(d.substring(1)));
	const maxVersion = Math.max(...versions);
	return `v${maxVersion + 1}`;
}

export function createHanaInserts(filePath) {
	throw new Error("Not implemented yet");
}

export function createPostgresInserts(filePath) {
	const filename = path.basename(filePath, ".csv");
	// Tablename from filename: replace hyphens with underscores and lowercase
	const tableName = filename.replace(/-/g, "_").toLowerCase();

	const content = fs.readFileSync(filePath, "utf-8");
	const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");

	if (lines.length === 0) return "";

	// Detect delimiter (comma or semicolon) from the first line
	const firstLine = lines[0];
	const delimiter = firstLine.includes(";") ? ";" : ",";

	// Headers: lowercase and trimmed
	const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

	const values = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];

		// Basic CSV splitting (Note: This assumes no delimiters inside values)
		// We support quoted values by stripping the quotes, but complex CSV parsing is limited without a library.
		const rawValues = line.split(delimiter);

		// Pad with empty strings if row is shorter than headers
		if (rawValues.length < headers.length) {
			const missing = headers.length - rawValues.length;
			for (let k = 0; k < missing; k++) {
				rawValues.push("");
			}
		}

		const row = rawValues.map((val) => {
			let v = val.trim();

			// Remove surrounding quotes if present
			if (v.startsWith('"') && v.endsWith('"')) {
				v = v.slice(1, -1);
			}

			// Handle NULLs (empty or explicit NULL)
			if (v === "" || v.toUpperCase() === "NULL") {
				return "NULL";
			}

			// Escape single quotes for SQL
			v = v.replace(/'/g, "''");

			// Return quoted string
			return `'${v}'`;
		});

		values.push(`(${row.join(", ")})`);
	}

	if (values.length === 0) return "";

	const sql = `INSERT INTO ${tableName} (${headers.join(", ")}) VALUES\n    ${values.join(",\n    ")};`;

	return sql;
}

export async function generateInserts(targetDb, traceLevel = 0) {
	console.log(chalk.blue(`\n🚀 Generating ${targetDb} inserts...`));

	// Find CSV files
	const dataFolders = ["db/data", "db/csv", "db/src/csv"];
	let csvFiles = [];

	dataFolders.forEach((folder) => {
		if (fs.existsSync(folder)) {
			const files = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".csv"));
			files.forEach((f) => {
				csvFiles.push(path.join(folder, f));
			});
		}
	});

	// Fallback: check root if no files found in db folders (based on user provided file example)
	if (csvFiles.length === 0) {
		const rootFiles = fs.readdirSync(".").filter((f) => f.toLowerCase().endsWith(".csv"));
		rootFiles.forEach((f) => csvFiles.push(f));
	}

	if (csvFiles.length === 0) {
		console.log(chalk.red("❌ No CSV files found to process."));
		return;
	}

	// Prepare output directory
	const outputRoot = "captools-inserts";
	if (!fs.existsSync(outputRoot)) {
		fs.mkdirSync(outputRoot);
	}
	const version = getNextVersion(outputRoot);
	const outputDir = path.join(outputRoot, version);
	fs.mkdirSync(outputDir);

	if (traceLevel >= 2) {
		console.log(chalk.white(`📂 Output directory: ${chalk.bold(outputDir)}`));
	}
	if (traceLevel >= 1) {
		console.log(chalk.gray(`🔍 Found ${csvFiles.length} CSV files.`));
	}

	let count = 0;
	let errors = 0;

	for (const filePath of csvFiles) {
		try {
			const filename = path.basename(filePath);
			if (traceLevel >= 1) {
				process.stdout.write(chalk.gray(`   Processing ${filename}... `));
			}

			let sql = "";
			if (targetDb === "postgres") {
				sql = createPostgresInserts(filePath);
			} else if (targetDb === "hana") {
				createHanaInserts(filePath);
			} else {
				throw new Error(`Unknown target DB: ${targetDb}`);
			}

			if (sql) {
				const sqlFilename = filename.replace(/\.csv$/i, ".sql");
				fs.writeFileSync(path.join(outputDir, sqlFilename), sql);
				if (traceLevel >= 2) {
					console.log(chalk.green("OK"));
				} else if (traceLevel >= 1) {
					console.log(chalk.green("OK"));
				}
				count++;
			} else {
				if (traceLevel >= 1) {
					console.log(chalk.yellow("Skipped (empty)"));
				}
			}
		} catch (err) {
			if (traceLevel >= 1) {
				console.log(chalk.red("Error"));
			}
			console.error(chalk.red(`   ❌ ${err.message}`));
			errors++;
		}
	}

	console.log(chalk.green(`\n✨ Generated ${count} SQL files in ${version}.`));
	if (errors > 0) {
		console.log(chalk.red(`   ${errors} errors encountered.`));
	}
}
