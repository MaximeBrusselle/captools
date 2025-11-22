import fs from "fs";
import path from "path";
import chalk from "chalk";

export default async function checkDeployConfig(traceLevel = 1) {
	console.log("🔍 Checking deployment configuration...");

	const appFolder = "app";
	let errors = 0;
	let warnings = 0;

	// Check if app folder exists
	if (!fs.existsSync(appFolder)) {
		console.error(chalk.red("❌ No app folder found. Expected folder: app/"));
		return;
	}

	// Get all app directories
	const appDirs = fs
		.readdirSync(appFolder, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)
		.filter((dirName) => {
			// Skip router/approuter folders that only have package.json
			if (dirName.toLowerCase() === "router" || dirName.toLowerCase() === "approuter") {
				const dirPath = path.join(appFolder, dirName);
				const files = fs.readdirSync(dirPath);
				if (!fs.existsSync(path.join(dirPath, "webapp"))) {
					if (traceLevel >= 2) {
						console.log(chalk.gray(`⏭️  Skipping ${dirName} (no webapp folder)`));
					}
					return false;
				}
			}
			return true;
		});

	if (appDirs.length === 0) {
		console.error(chalk.red("❌ No app directories found in app/ folder"));
		return;
	}

	console.log(`📂 Found ${appDirs.length} app directories. Checking configuration...\n`);

	const appConfigs = [];

	// Check each app directory
	for (const appName of appDirs) {
		const appPath = path.join(appFolder, appName);
		
		const requiredFiles = ["ui5-deploy.yaml", "ui5.yaml", "xs-app.json", "package.json", "webapp/manifest.json"];

		let appErrors = 0;
		let appWarnings = 0;
		let appMessages = [];

		// Check required files exist
		for (const file of requiredFiles) {
			const filePath = path.join(appPath, file);
			if (!fs.existsSync(filePath)) {
				appMessages.push(chalk.red(`  ❌ Missing: ${file}`));
				appErrors++;
				errors++;
			}
		}

		// Get expected names from manifest.json
		let expectedAppId = "";
		let expectedArchiveName = "";
		const manifestPath = path.join(appPath, "webapp/manifest.json");
		if (fs.existsSync(manifestPath)) {
			try {
				const manifestContent = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
				if (manifestContent["sap.app"] && manifestContent["sap.app"].id) {
					expectedAppId = manifestContent["sap.app"].id;
					// Convert dots to empty string for archive name (e.g., com.ardo.containerapp -> comardocontainerapp)
					expectedArchiveName = expectedAppId.replace(/\./g, "");
				}
			} catch (err) {
				appMessages.push(chalk.red(`  ❌ Error parsing manifest.json: ${err.message}`));
				appErrors++;
				errors++;
			}
		}

		// Check ui5.yaml and ui5-deploy.yaml for correct app name
		for (const yamlFile of ["ui5.yaml", "ui5-deploy.yaml"]) {
			const yamlPath = path.join(appPath, yamlFile);
			if (fs.existsSync(yamlPath)) {
				try {
					const yamlContent = fs.readFileSync(yamlPath, "utf8");
					if (expectedAppId && !yamlContent.includes(`name: ${expectedAppId}`)) {
						appMessages.push(chalk.red(`  ❌ ${yamlFile}: name should be '${expectedAppId}' (from manifest.json sap.app.id)`));
						appErrors++;
						errors++;
					} else if (expectedAppId && yamlContent.includes(`name: ${expectedAppId}`) && traceLevel >= 2) {
						appMessages.push(chalk.green(`  ✅ ${yamlFile}: name correctly set to '${expectedAppId}'`));
					}
				} catch (err) {
					appMessages.push(chalk.red(`  ❌ Error reading ${yamlFile}: ${err.message}`));
					appErrors++;
					errors++;
				}
			}
		}

		// Check ui5-deploy.yaml for correct archiveName
		const deployYamlPath = path.join(appPath, "ui5-deploy.yaml");
		if (fs.existsSync(deployYamlPath)) {
			try {
				const deployYamlContent = fs.readFileSync(deployYamlPath, "utf8");
				if (expectedArchiveName && !deployYamlContent.includes(`archiveName: ${expectedArchiveName}`)) {
					appMessages.push(chalk.red(`  ❌ ui5-deploy.yaml: archiveName should be '${expectedArchiveName}' (sap.app.id without dots)`));
					appErrors++;
					errors++;
				} else if (expectedArchiveName && deployYamlContent.includes(`archiveName: ${expectedArchiveName}`) && traceLevel >= 2) {
					appMessages.push(chalk.green(`  ✅ ui5-deploy.yaml: archiveName correctly set to '${expectedArchiveName}'`));
				}
			} catch (err) {
				appMessages.push(chalk.red(`  ❌ Error reading ui5-deploy.yaml: ${err.message}`));
				appErrors++;
				errors++;
			}
		}

		// Check manifest.json for crossNavigation
		if (fs.existsSync(manifestPath)) {
			try {
				const manifestContent = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

				if (manifestContent["sap.app"] && manifestContent["sap.app"].crossNavigation) {
					const crossNav = manifestContent["sap.app"].crossNavigation;
					if (crossNav.inbounds && Object.keys(crossNav.inbounds).length > 0) {
						// Check structure of inbounds
						for (const [key, inbound] of Object.entries(crossNav.inbounds)) {
							const missingProps = [];
							if (!inbound.semanticObject) missingProps.push('semanticObject');
							if (!inbound.action) missingProps.push('action');
							if (!inbound.signature) missingProps.push('signature');
							
							if (missingProps.length > 0) {
								if (traceLevel >= 1) {
									appMessages.push(chalk.yellow(`    ⚠️  Inbound '${key}': missing required properties: ${missingProps.join(', ')}`));
								}
								appWarnings++;
								warnings++;
							}
							
							// Check if key follows the correct pattern: ${semanticObject}-${action}
							if (inbound.semanticObject && inbound.action) {
								const expectedKey = `${inbound.semanticObject}-${inbound.action}`;
								if (key !== expectedKey) {
									appMessages.push(chalk.red(`  ❌ manifest.json: inbound key '${key}' should be '${expectedKey}' (semanticObject-action)`));
									appErrors++;
									errors++;
								} else if (traceLevel >= 2) {
									appMessages.push(chalk.green(`  ✅ manifest.json: inbound key '${key}' correctly follows pattern`));
								}
							}
						}
						
						if (traceLevel >= 2 && Object.keys(crossNav.inbounds).length > 0) {
							appMessages.push(chalk.green(`  ✅ manifest.json: crossNavigation.inbounds properly configured`));
						}
					} else {
						appMessages.push(chalk.red(`  ❌ manifest.json: crossNavigation.inbounds is empty or missing`));
						appErrors++;
						errors++;
					}
				} else {
					appMessages.push(chalk.red(`  ❌ manifest.json: missing crossNavigation under sap.app`));
					appErrors++;
					errors++;
				}

				// Check for sap.cloud.service
				if (manifestContent["sap.cloud"] && manifestContent["sap.cloud"].service) {
					if (traceLevel >= 2) {
						appMessages.push(chalk.green(`  ✅ manifest.json: sap.cloud.service properly configured`));
					}
				} else {
					if (traceLevel >= 1) {
						appMessages.push(chalk.yellow(`  ⚠️  manifest.json: missing sap.cloud.service property`));
					}
					appWarnings++;
					warnings++;
				}
			} catch (err) {
				appMessages.push(chalk.red(`  ❌ Error parsing manifest.json: ${err.message}`));
				appErrors++;
				errors++;
			}
		}

		// Show apps based on trace level
		if ((traceLevel === 0 && appErrors > 0) || 
			(traceLevel === 1 && (appErrors > 0 || appWarnings > 0)) || 
			(traceLevel >= 2)) {
			console.log(`🔍 Checking app: ${chalk.blue(appName)}`);
			appMessages.forEach(message => console.log(message));
			console.log(""); // Empty line between apps
		}

		appConfigs.push({
			name: appName,
			archiveName: expectedArchiveName,
			hasErrors: appErrors > 0,
		});
	}

	// Check mta.yaml
	const mtaPath = "mta.yaml";
	let mtaErrors = 0;
	let mtaMessages = [];

	if (!fs.existsSync(mtaPath)) {
		mtaMessages.push(chalk.red("❌ mta.yaml not found in project root"));
		mtaErrors++;
		errors++;
	} else {
		try {
			const mtaContent = fs.readFileSync(mtaPath, "utf8");

			// Check if all apps are in app-content build parameters
			const hasAppContent = mtaContent.includes("app-content");
			if (!hasAppContent) {
				mtaMessages.push(chalk.red("❌ mta.yaml: no app-content module found"));
				mtaErrors++;
				errors++;
			} else {
				if (traceLevel >= 2) {
					mtaMessages.push(chalk.green("✅ mta.yaml: app-content module found"));
				}
				
				// Check if each app is mentioned as a module and in the app-content requires section
				for (const appConfig of appConfigs) {
					// Check for module definition
					const modulePattern = new RegExp(`- name: ${appConfig.archiveName}\\s+type: html5\\s+path: app/${appConfig.name}`, "m");
					if (!modulePattern.test(mtaContent)) {
						mtaMessages.push(chalk.red(`  ❌ App '${appConfig.name}' module not found in mta.yaml (expected name: ${appConfig.archiveName})`));
						mtaErrors++;
						errors++;
					} else if (traceLevel >= 2) {
						mtaMessages.push(chalk.green(`  ✅ App '${appConfig.name}' module correctly defined in mta.yaml`));
					}

					// Check for app-content requires section
					const artifactPattern = new RegExp(`- artifacts:\\s+- ${appConfig.archiveName}\\.zip\\s+name: ${appConfig.archiveName}`, "m");
					if (!artifactPattern.test(mtaContent)) {
						mtaMessages.push(chalk.red(`  ❌ App '${appConfig.name}' not found in app-content requires section (expected artifact: ${appConfig.archiveName}.zip)`));
						mtaErrors++;
						errors++;
					} else if (traceLevel >= 2) {
						mtaMessages.push(chalk.green(`  ✅ App '${appConfig.name}' correctly referenced in app-content requires section`));
					}
				}
			}
		} catch (err) {
			mtaMessages.push(chalk.red(`❌ Error reading mta.yaml: ${err.message}`));
			mtaErrors++;
			errors++;
		}
	}

	// Show mta.yaml section based on trace level
	if ((traceLevel === 0 && mtaErrors > 0) || 
		(traceLevel >= 1 && mtaMessages.length > 0)) {
		console.log("🔍 Checking mta.yaml...");
		mtaMessages.forEach(message => console.log(message));
		console.log(""); // Empty line
	}

	console.log("---------------------------------------------------");
	if (errors > 0 || warnings > 0) {
		console.log(`Findings: ${chalk.red(errors)} Errors, ${chalk.yellow(warnings)} Warnings.`);
		if (errors > 0) {
			console.log(chalk.red("🚨 Deployment configuration has critical issues that need to be fixed."));
		}
	} else {
		console.log("🎉 Perfect! All deployment configurations are correct.");
	}
}
