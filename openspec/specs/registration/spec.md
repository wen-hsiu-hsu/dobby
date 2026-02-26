## ADDED Requirements

### Requirement: Guest slot capacity calculation
The system SHALL calculate available guest slots based on courts and season membership.

#### Scenario: Capacity formula
- **WHEN** calculating guest slots
- **THEN** availableSlots = (courts × 7) - (seasonMembers - absentees)
- **AND** availableSlots SHALL NOT be negative

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
Season members registering +N SHALL add "{Name}的朋友" guest entries for N > 1.

#### Scenario: Season member +1
- **WHEN** a season member sends "@Dobby +1"
- **THEN** their own name is added to the 零打 multi_select field

#### Scenario: Season member +2
- **WHEN** a season member sends "@Dobby +2"
- **THEN** "{Name}" and "{Name}的朋友" are added to 零打 multi_select

#### Scenario: Capacity exceeded
- **WHEN** requested slots exceed available capacity and actor is not admin
- **THEN** only the available number of slots are added (partial add)
- **AND** the reply message indicates how many were actually added

### Requirement: Unregister (-N) removes guest entries
The system SHALL remove the actor's guest entries from 零打 multi_select.

#### Scenario: Unregister
- **WHEN** a user sends "@Dobby -1" or "@Dobby -N"
- **THEN** their entries (name + "{Name}的朋友" variants) are removed from 零打
