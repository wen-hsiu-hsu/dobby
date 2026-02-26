## ADDED Requirements

### Requirement: Season member leave restriction
Only season members (whose pageId exists in season's memberIds) SHALL be able to request leave.

#### Scenario: Non-season member attempts leave
- **WHEN** a non-season member sends "@Dobby 假"
- **THEN** an error message is returned indicating they are not a season member

### Requirement: Leave idempotency
The system SHALL handle duplicate leave requests gracefully.

#### Scenario: Already on leave
- **WHEN** a user already in the absentees list sends "@Dobby 假"
- **THEN** an appropriate message is returned without duplicate Notion update

#### Scenario: Already not on leave for cancel
- **WHEN** a user not in the absentees list sends "@Dobby 銷假"
- **THEN** an appropriate message is returned without unnecessary Notion update

### Requirement: Leave updates calendar absentees relation
The system SHALL update the 請假人 relation field in the calendar event page.

#### Scenario: Leave recorded
- **WHEN** a valid season member sends "@Dobby 假"
- **THEN** their People List pageId is added to the calendar event's 請假人 relation
- **AND** a confirmation message with their name is sent

#### Scenario: Leave cancelled
- **WHEN** a valid season member sends "@Dobby 銷假"
- **THEN** their People List pageId is removed from the calendar event's 請假人 relation
- **AND** a confirmation message with their name is sent
