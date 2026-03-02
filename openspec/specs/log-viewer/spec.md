# Log Viewer

## Purpose

Define the HTTP-based log viewer that allows operators to browse, filter, and search application logs from a web browser without requiring direct server access.

## Requirements

### Requirement: GET /logs returns an HTML log viewer page
The system SHALL expose a `GET /logs` HTTP endpoint that returns a complete HTML page displaying log entries from the past 7 days. No authentication is required.

#### Scenario: Accessing the log viewer
- **WHEN** a browser sends `GET /logs`
- **THEN** the server SHALL respond with `Content-Type: text/html` and HTTP 200

#### Scenario: No log files available
- **WHEN** the `logs/` directory is empty or does not exist
- **THEN** the page SHALL display a message indicating no logs are available

### Requirement: Log entries are displayed in a readable format
Each log entry SHALL be rendered as a structured row showing: timestamp, log level badge, reqId, and message. Additional fields SHALL be expandable.

#### Scenario: Log row rendering
- **WHEN** a log entry is displayed
- **THEN** it SHALL show time, level (color-coded badge), reqId, and msg fields

#### Scenario: Expanding additional fields
- **WHEN** the user clicks on a log row
- **THEN** all additional JSON fields SHALL be revealed inline

### Requirement: Log viewer supports filtering by level
The user SHALL be able to filter log entries by one or more log levels (error, warn, info, debug). The filter SHALL apply without a page reload.

#### Scenario: Filtering by error level
- **WHEN** the user selects "error" filter
- **THEN** only log entries with level "error" SHALL be visible

#### Scenario: Showing all levels
- **WHEN** no filter is active
- **THEN** all log entries SHALL be visible

### Requirement: Log viewer supports filtering by time range
The user SHALL be able to select a time range: Today, Yesterday, or Last 7 days. Default is Last 7 days.

#### Scenario: Selecting Today
- **WHEN** the user selects the "Today" time range
- **THEN** only log entries from the current calendar day SHALL be displayed

#### Scenario: Default time range
- **WHEN** the page loads without a time range selected
- **THEN** log entries from the past 7 days SHALL be displayed

### Requirement: Log viewer supports text search on message field
The user SHALL be able to search for a substring within the `msg` field. Results update without a page reload.

#### Scenario: Searching for a keyword
- **WHEN** the user types a keyword in the search box
- **THEN** only log entries whose `msg` contains that keyword (case-insensitive) SHALL be displayed

### Requirement: Log entries are sorted newest first
Log entries SHALL be displayed with the most recent entry at the top.

#### Scenario: Sort order
- **WHEN** the log viewer renders entries
- **THEN** entries SHALL be ordered by `time` descending
