# CAP Tools

A set of command-line tools to streamline SAP Cloud Application Programming (CAP) development, specifically focused on data seeding, SQL generation, and deployment configuration checks.

## Features

- **CSV Validation**: Validates that your CSV seed files match your CDS model definitions.
  - Checks filenames against entity names (including namespaces).
  - Checks CSV headers against entity elements (missing keys, extra columns, etc.).
- **SQL Generation**: Generates SQL `INSERT` statements from your CSV seed data.
  - Supports PostgreSQL (HANA support coming soon).
  - Handles proper quoting and NULL values.
- **Deployment Config Check**: Validates your project structure for deployment.
  - Checks `mta.yaml`, `ui5.yaml`, `ui5-deploy.yaml`, and `manifest.json`.
  - Verifies consistency of App IDs and archive names across configuration files.

## Installation

You can install this tool globally or as a dev dependency in your project.

### Global Installation

```bash
npm install -g captools
```

### Local Installation

```bash
npm install --save-dev captools
```

## Usage

You can run the tool in interactive mode by simply typing `captools` (if installed globally) or `npx captools` (if local).

```bash
captools
```

This will launch a menu where you can select the desired operation.

### Command Line Interface

You can also run specific commands directly:

```bash
captools [command] [options]
```

#### Available Commands

| Command                     | Description                                                               |
| --------------------------- | ------------------------------------------------------------------------- |
| `validatecsv`               | Validate both CSV filenames and headers against the CDS model.            |
| `validatecsv-filenames`     | Check if CSV filenames match entity names (e.g., `namespace-Entity.csv`). |
| `validatecsv-headers`       | Check if CSV headers match entity properties defined in CDS.              |
| `generate-inserts-postgres` | Generate PostgreSQL `INSERT` statements from CSV files.                   |
| `generate-inserts-hana`     | Generate SAP HANA `INSERT` statements (Coming Soon).                      |
| `check-deploy-config`       | Analyze `app/` folder and `mta.yaml` for deployment configuration errors. |

#### Options

- `--tracelevel <level>`: Set the output verbosity.
  - `0`: Errors only
  - `1`: Errors and Warnings (Default)
  - `2`: Verbose (Everything, including success messages)
- `--help`: Shows help message.

### Examples

**Validate all CSVs with verbose output:**

```bash
captools validatecsv --tracelevel 2
```

**Generate Postgres SQL inserts:**

```bash
captools generate-inserts-postgres
```

**Check deployment configuration:**

```bash
captools check-deploy-config
```

## Tool Details

### 1. CSV Validation

This tool expects your CSV files to be located in `db/data`, `db/csv`, or `db/src/csv`. It loads your CDS model using `@sap/cds` and compares it against the files found.

- **Filename Rules**: Expects filenames to match `Namespace-EntityName.csv`.
- **Header Rules**:
  - **Errors**: Missing key columns, columns not in schema.
  - **Warnings**: Missing non-key columns.
  - **Ignored**: Managed fields (`createdAt`, `modifiedAt`, etc.) are ignored.

### 2. SQL Generation

Converts CSV data into SQL scripts.

- **Input**: CSV files in `db/data`, `db/csv`, or `db/src/csv`.
- **Output**: Creates a `captools-inserts/vX` folder with `.sql` files.
- **Postgres**: Handles quoting, NULLs, and boolean values appropriate for Postgres.

### 3. Deployment Config Check

Scans your `app/` directory and `mta.yaml` to ensure consistency.

- Verifies `sap.app.id` in `manifest.json`.
- Checks that `ui5.yaml` and `ui5-deploy.yaml` use the correct name/archiveName.
- Validates `crossNavigation` inbouds in `manifest.json`.
- Ensures all apps are correctly defined in `mta.yaml` (modules and build parameters).

## License

MIT
