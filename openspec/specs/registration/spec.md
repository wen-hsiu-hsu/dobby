## Purpose

Handle guest (零打) registration and unregistration for the next Saturday event via LINE bot commands.

## Requirements

### Requirement: Guest slot capacity calculation
The system SHALL calculate available guest slots based on courts, season membership, absentees, and current guests.

#### Scenario: Capacity formula
- **WHEN** calculating guest slots
- **THEN** availableSlots = (courts × 7) - seasonMembers + absentees - currentGuests
- **AND** displayed remainingSlots SHALL be clamped to a minimum of 0

#### Scenario: Capacity exceeded
- **WHEN** requested slots exceed available capacity and actor is not admin
- **THEN** an error message is returned indicating remaining slots
- **AND** no Notion data is modified

#### Scenario: Admin bypasses capacity
- **WHEN** the actor is an admin user
- **THEN** capacity check is skipped and all requested slots are added

### Requirement: Mutex-protected registration update
The system SHALL use an in-process mutex keyed on eventPageId to prevent concurrent registration conflicts.

#### Scenario: Lock acquired
- **WHEN** a registration request arrives and no lock exists for the eventPageId
- **THEN** the lock is acquired, registration proceeds, lock is released in finally block

#### Scenario: Lock busy
- **WHEN** a registration request arrives and a lock already exists for the eventPageId
- **THEN** "系統繁忙" message is returned to the user without modifying Notion

#### Scenario: Lock auto-release
- **WHEN** a lock has been held for more than 10 seconds
- **THEN** the lock is automatically released

### Requirement: Re-read data inside lock
The system SHALL re-read the latest Notion data after acquiring the mutex lock.

#### Scenario: Fresh data read
- **WHEN** the mutex lock is acquired
- **THEN** the system queries Notion for the current state of the event page before making changes

### Requirement: Season member +N registration
Season members registering +N SHALL add "{Name}的朋友" guest entries (their own season slot is pre-counted).

#### Scenario: Season member +1
- **WHEN** a season member sends "@Dobby +1"
- **THEN** "{Name}的朋友" is added to the 零打 multi_select field

#### Scenario: Season member +2
- **WHEN** a season member sends "@Dobby +2"
- **THEN** "{Name}的朋友" and "{Name}的朋友2" are added to 零打 multi_select

### Requirement: Non-season member registration
Any registered LINE user (not a season member) MAY register as a zero-da guest.

#### Scenario: Non-season member +1
- **WHEN** a non-season member sends "@Dobby +1"
- **THEN** their display name is added directly to 零打 multi_select

#### Scenario: Non-season member +2
- **WHEN** a non-season member sends "@Dobby +2"
- **THEN** "{Name}" and "{Name} 2" are added to 零打 multi_select

### Requirement: Unregister (-N) removes guest entries
The system SHALL remove the actor's guest entries from 零打 multi_select.

#### Scenario: Unregister
- **WHEN** a user sends "@Dobby -1" or "@Dobby -N"
- **THEN** their entries (name or "{Name}的朋友" variants) are removed from 零打

### Requirement: Rich reply after registration
After a successful registration or unregistration, the system SHALL reply with a summary.

#### Scenario: Success reply format
- **WHEN** registration or unregistration succeeds
- **THEN** the reply includes: date, total guest slots, numbered guest list, remaining slots, absentee names, total headcount
- **AND** remaining slots is displayed as 0 if the actual value is negative
