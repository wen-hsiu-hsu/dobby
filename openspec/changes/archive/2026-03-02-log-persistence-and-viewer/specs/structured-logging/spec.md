## MODIFIED Requirements

### Requirement: Logger supports pretty output in development
The logger SHALL use `pino-pretty` transport when `NODE_ENV` is not `production`, producing human-readable colored output to stdout only (no file output in development). In production, it SHALL output JSON to both stdout and a daily log file via `pino.multistream`.

#### Scenario: Development environment
- **WHEN** the application starts with `NODE_ENV=development`
- **THEN** log output SHALL be formatted in a human-readable colored format to stdout
- **THEN** no log file SHALL be written

#### Scenario: Production environment
- **WHEN** the application starts with `NODE_ENV=production`
- **THEN** log output SHALL be in JSON format written to both stdout and `logs/<today>.json`
