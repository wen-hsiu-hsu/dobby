## ADDED Requirements

### Requirement: Batch display name update every Monday 04:00 Asia/Taipei
The system SHALL run a batch job every Monday at 04:00 Asia/Taipei to sync LINE display names to Notion USERS.

#### Scenario: Batch job fires
- **WHEN** it is Monday 04:00 Asia/Taipei
- **THEN** all USERS with non-empty groups field are processed

### Requirement: Dobby-first with 球來就打 fallback
The system SHALL try Dobby bot first to fetch member profile, falling back to 球來就打 if Dobby fails.

#### Scenario: Dobby succeeds
- **WHEN** LINE Group Member Profile API returns displayName via Dobby client
- **THEN** displayName is used to update Notion USERS Custom Name field

#### Scenario: Dobby fails, batting succeeds
- **WHEN** Dobby client returns an error (e.g., user not in Dobby group)
- **THEN** 球來就打 client is tried
- **AND** if successful, displayName is used to update Notion

#### Scenario: Both fail
- **WHEN** both Dobby and 球來就打 clients fail to get profile
- **THEN** the user is skipped (no Notion update, error logged)
