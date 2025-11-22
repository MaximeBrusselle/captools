#!/usr/bin/env node

import chalk from "chalk";
import inquirer from "inquirer";

import { validateCsvFilenames, validateCsvHeaders, validateCsvs } from "./tools/validate-csv.js";
import { generateInserts } from "./tools/create-inserts.js";
import checkDeployConfig from "./tools/check-deploy-config.js";

// Parse arguments
const args = process.argv.slice(2);
let traceLevel = 1;
let command = null;
let showHelp = false;

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--tracelevel") {
		if (i + 1 < args.length) {
			const level = parseInt(args[i + 1], 10);
			if (!isNaN(level) && [0, 1, 2].includes(level)) {
				traceLevel = level;
				i++; // Skip value
			} else {
				console.error(chalk.red("Invalid trace level. Use 0, 1, or 2."));
				process.exit(1);
			}
		} else {
			console.error(chalk.red("Missing value for --tracelevel"));
			process.exit(1);
		}
	} else if (arg === "--help") {
		showHelp = true;
	} else if (!arg.startsWith("-")) {
		command = arg;
	}
}

if (showHelp) {
	console.log(`
${chalk.bold("Usage:")} captools [command] [options]

${chalk.bold("Options:")}
  --tracelevel <level>   Set trace level (0=errors only, 1=errors and warnings, 2=Everything). Default: 1
  --help                 Show this help message

${chalk.bold("Commands:")}
  validatecsv-filenames      Validate CSV filenames match schema
  validatecsv-headers        Validate CSV header rows match schema
  validatecsv                Validate both filenames and headers
  generate-inserts-postgres  Generate SQL inserts for Postgres
  generate-inserts-hana      Generate SQL inserts for SAP HANA
  check-deploy-config        Check deployment configuration

${chalk.dim("If no command is provided, interactive mode is started.")}
`);
	process.exit(0);
}

if (command) {
	try {
		switch (command) {
			case "validatecsv-filenames":
				await validateCsvFilenames(traceLevel);
				break;
			case "validatecsv-headers":
				await validateCsvHeaders(traceLevel);
				break;
			case "validatecsv":
				await validateCsvs(traceLevel);
				break;
			case "generate-inserts-postgres":
				await generateInserts("postgres", traceLevel);
				break;
			case "generate-inserts-hana":
				await generateInserts("hana", traceLevel);
				break;
			case "check-deploy-config":
				await checkDeployConfig(traceLevel);
				break;
			default:
				console.error(chalk.red(`Unknown command: ${command}`));
				console.log("Use --help to see available commands.");
				process.exit(1);
		}
	} catch (error) {
		console.error(chalk.red(error));
		process.exit(1);
	}
} else {
	// Interactive Mode
	const answers = await inquirer.prompt([
		{
			type: "rawlist",
			name: "tool",
			message: "What do you want to do?",
			choices: ["🌱 Validate CSV seeding files", "🔨 Generate SQL Inserts", "🚀 Check deployment configuration"],
		},
	]);

	try {
		switch (answers.tool) {
			case "🌱 Validate CSV seeding files":
				const csvAnswers = await inquirer.prompt([
					{
						type: "rawlist",
						name: "csv",
						message: "Select the thing you want to validate",
						choices: ["📋 Validate filenames match schema", "🔍 Validate header rows match schema", "🔍 Validate both"],
					},
				]);
				switch (csvAnswers.csv) {
					case "📋 Validate filenames match schema":
						await validateCsvFilenames(traceLevel);
						break;
					case "🔍 Validate header rows match schema":
						await validateCsvHeaders(traceLevel);
						break;
					case "🔍 Validate both":
						await validateCsvs(traceLevel);
						break;
					default:
						console.log(chalk.red("Unknown option selected"));
				}
				break;
			case "🔨 Generate SQL Inserts":
				const dbAnswers = await inquirer.prompt([
					{
						type: "rawlist",
						name: "db",
						message: "Select target database",
						choices: ["🐘 Postgres", "🌲 SAP HANA"],
					},
				]);
				if (dbAnswers.db === "🐘 Postgres") {
					await generateInserts("postgres", traceLevel);
				} else {
					await generateInserts("hana", traceLevel);
				}
				break;
			case "🚀 Check deployment configuration":
				await checkDeployConfig(traceLevel);
				break;
			default:
				console.log(chalk.red("Unknown option selected"));
		}
	} catch (error) {
		console.error(chalk.red(error));
	}
}
