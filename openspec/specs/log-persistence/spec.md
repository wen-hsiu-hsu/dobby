# Log Persistence

## Purpose

Define how application log entries are persisted to disk, including file format, rotation, retention, and durability across container restarts.

## Requirements

### Requirement: Logs are written to daily JSON files
The system SHALL write all log entries to `logs/YYYY-MM-DD.json` using NDJSON format. A new file SHALL be created for each calendar day. File rotation SHALL happen automatically at midnight.

#### Scenario: Log file created on startup
- **WHEN** the application starts in production
- **THEN** a log file SHALL be created at `logs/<today>.json` if it does not already exist

#### Scenario: Log rotation at midnight
- **WHEN** the calendar day changes
- **THEN** the system SHALL start writing to a new file named `logs/<new-date>.json`

#### Scenario: Concurrent stdout output preserved
- **WHEN** the application writes a log entry to file
- **THEN** the same entry SHALL also be written to stdout

### Requirement: Log files older than 7 days are automatically deleted
The system SHALL delete log files whose date is more than 7 calendar days before the current date. Cleanup SHALL run at application startup and once every 24 hours.

#### Scenario: Old log files deleted at startup
- **WHEN** the application starts
- **THEN** any `logs/*.json` file older than 7 days SHALL be deleted

#### Scenario: Periodic cleanup
- **WHEN** 24 hours have elapsed since last cleanup
- **THEN** the system SHALL scan `logs/` and delete files older than 7 days

#### Scenario: Files within retention window preserved
- **WHEN** cleanup runs
- **THEN** log files dated within the last 7 days SHALL NOT be deleted

### Requirement: Log directory is persisted across container restarts
The `logs/` directory SHALL be mounted as a Docker volume so that log files survive container restarts and redeployments.

#### Scenario: Volume mount configured
- **WHEN** the container is started via Docker Compose
- **THEN** the `logs/` directory SHALL be backed by a persistent named volume
