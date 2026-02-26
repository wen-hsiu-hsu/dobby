## ADDED Requirements

### Requirement: Welcome message on join and memberJoined events
The system SHALL send a welcome message when the bot joins a group or when new members join.

#### Scenario: Bot joins group (join event)
- **WHEN** a join event is received
- **THEN** the INTRODUCE announcement from Notion is fetched
- **AND** a textV2 message is sent with {USER} and {MANAGER} substitutions

#### Scenario: Member joins group (memberJoined event)
- **WHEN** a memberJoined event is received
- **THEN** a welcome message is sent mentioning the new member and the manager

### Requirement: textV2 mention substitution
The welcome message SHALL use LINE textV2 format with mention substitutions for @user and @manager.

#### Scenario: {USER} substitution
- **WHEN** the INTRODUCE template contains {USER}
- **THEN** it is replaced with a mention of the joining user's userId

#### Scenario: {MANAGER} substitution
- **WHEN** the INTRODUCE template contains {MANAGER}
- **THEN** it is replaced with a mention of the hardcoded manager userId
