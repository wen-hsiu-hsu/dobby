## ADDED Requirements

### Requirement: Keyword matching from JSON data source
The system SHALL load auto-reply rules from `src/data/auto-reply.json` at startup and match against incoming messages.

#### Scenario: Keyword matched
- **WHEN** a non-command message contains a keyword from auto-reply.json (case-sensitive includes)
- **THEN** the corresponding reply text is sent to the user
- **AND** only the first matching rule is used

#### Scenario: No keyword matched
- **WHEN** a non-command message contains no matching keyword
- **THEN** no reply is sent (silent)

### Requirement: Admin users skip auto-reply
The system SHALL not send auto-replies to admin users.

#### Scenario: Admin message skipped
- **WHEN** a message from an admin user matches a keyword
- **THEN** no auto-reply is sent

### Requirement: Auto-reply data is static JSON
The auto-reply rules SHALL be loaded once at startup from `src/data/auto-reply.json` and held in memory.

#### Scenario: Rules loaded at startup
- **WHEN** the server starts
- **THEN** `src/data/auto-reply.json` is loaded into memory
- **AND** no file reads occur during request processing
