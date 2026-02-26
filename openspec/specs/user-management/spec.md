## ADDED Requirements

### Requirement: Non-blocking user tracking on every message
The system SHALL fire-and-forget user tracking on every message event without blocking the command response.

#### Scenario: User tracking is async
- **WHEN** a message event is received
- **THEN** user tracking runs in the background
- **AND** command processing is not delayed by user tracking

### Requirement: New user creation
The system SHALL create a USERS record for users not yet in Notion.

#### Scenario: First-time user
- **WHEN** a message is received from a userId not found in USERS
- **THEN** a new USERS page is created with the userId and source group/room info

### Requirement: Message count increment and group merge
The system SHALL increment message_counts and merge group membership for existing users.

#### Scenario: Existing user
- **WHEN** a message is received from a known userId
- **THEN** message_counts is incremented
- **AND** the source groupId/roomId is added to groups/multi-chat if not already present

### Requirement: Source-based field mapping
The group membership field SHALL be determined by the event source type.

#### Scenario: Group source
- **WHEN** source.type === 'group'
- **THEN** the groupId is added to the groups multi_select field

#### Scenario: Room source
- **WHEN** source.type === 'room'
- **THEN** the roomId is added to the multi-chat multi_select field

#### Scenario: User source
- **WHEN** source.type === 'user'
- **THEN** no group/room field is updated
