## ADDED Requirements

### Requirement: Weekly scheduled push on Sunday 09:00 Asia/Taipei
The system SHALL send a weekly push message every Sunday at 09:00 Asia/Taipei time to the Dobby group.

#### Scenario: Scheduler fires
- **WHEN** it is Sunday 09:00 Asia/Taipei
- **THEN** the weekly push routine is triggered
- **AND** the message is sent to LINE_DOBBY_GROUP_ID

#### Scenario: Scheduler disabled in test
- **WHEN** NODE_ENV === 'test'
- **THEN** cron jobs are not registered

### Requirement: Push message content
The push message SHALL include next Saturday's game info: date, absentees, courts, expected attendees, and available guest slots with price.

#### Scenario: Normal game day
- **WHEN** the next Saturday calendar event is of type "打球"
- **THEN** the message includes date, leave list, court count, expected members, and guest slot count with price

#### Scenario: Suspended game
- **WHEN** the next Saturday calendar event type includes "暫停"
- **THEN** a suspension notice is sent instead

#### Scenario: No calendar event found
- **WHEN** no calendar event exists for next Saturday
- **THEN** a warning message is sent indicating no event found

### Requirement: Push only to Dobby group (production)
The scheduled push SHALL only send to the real Dobby group, not to 球來就打.

#### Scenario: Production push target
- **WHEN** the scheduler runs
- **THEN** the message is sent to LINE_DOBBY_GROUP_ID using the Dobby LINE client
