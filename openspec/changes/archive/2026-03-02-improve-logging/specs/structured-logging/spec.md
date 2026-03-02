## ADDED Requirements

### Requirement: Logger supports pretty output in development
The logger SHALL use `pino-pretty` transport when `NODE_ENV` is not `production`, producing human-readable colored output. In production, it SHALL output JSON.

#### Scenario: Development environment
- **WHEN** the application starts with `NODE_ENV=development`
- **THEN** log output SHALL be formatted in a human-readable colored format

#### Scenario: Production environment
- **WHEN** the application starts with `NODE_ENV=production`
- **THEN** log output SHALL be in JSON format

### Requirement: Webhook events are logged on arrival
The system SHALL log incoming webhook requests at `info` level, including botId and event count. Individual event types SHALL be logged at `debug` level.

#### Scenario: Webhook received
- **WHEN** a POST request arrives at the webhook endpoint
- **THEN** the system SHALL log botId and the number of events at `info` level

#### Scenario: Individual event processing
- **WHEN** each event is processed in event-router
- **THEN** the system SHALL log event type and source at `debug` level

### Requirement: LINE API calls are logged
The system SHALL log LINE API reply and push calls at `info` level (before call) and log the outcome (success or failure).

#### Scenario: Successful reply
- **WHEN** `replyMessage` succeeds
- **THEN** the system SHALL log the botId and replyToken prefix at `info` level

#### Scenario: Successful push
- **WHEN** `pushMessage` succeeds
- **THEN** the system SHALL log the botId and recipient at `info` level

### Requirement: Notion API calls are logged
The system SHALL log all Notion API requests at `debug` level, including HTTP method and path. Response status SHALL be logged at `debug` level.

#### Scenario: Notion API request
- **WHEN** `notionGet`, `notionPost`, or `notionPatch` is called
- **THEN** the system SHALL log the method and path at `debug` level

#### Scenario: Notion API error
- **WHEN** a Notion API call returns a non-OK status
- **THEN** the system SHALL log the error details at `error` level before throwing
