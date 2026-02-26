## ADDED Requirements

### Requirement: Repository pattern for all Notion DBs
The system SHALL access Notion via typed Repository classes, never calling the Notion client directly from handlers.

#### Scenario: Repository abstraction
- **WHEN** a handler needs Notion data
- **THEN** it calls a Repository method (e.g., `calendarRepository.findByDate(date)`)
- **AND** the Repository handles all Notion API formatting and error handling

### Requirement: Property helper centralization
All Notion property read/write format conversions SHALL be centralized in `property-helpers.ts`.

#### Scenario: Property reading
- **WHEN** reading a rich_text property
- **THEN** `getRichText(page, 'Custom Name')` returns the plain text string or null

### Requirement: USERS repository
The USERS repository SHALL support: findByUserId, findByCustomName, create, update, incrementMessageCount.

#### Scenario: Find by userId
- **WHEN** `usersRepository.findByUserId(userId)` is called
- **THEN** a NotionUser object or null is returned

### Requirement: Calendar repository
The calendar repository SHALL support: findByDate (next Saturday), updateAbsentees (add/remove), updateGuests (zero-play multi_select).

#### Scenario: Find by date
- **WHEN** `calendarRepository.findByDate(dateString)` is called
- **THEN** the matching CalendarEvent or null is returned

### Requirement: Season repository
The season repository SHALL support: findByName (e.g., "2026-Q1") to retrieve member list and court count.

#### Scenario: Find current season
- **WHEN** `seasonRepository.findByName(quarterString)` is called
- **THEN** the SeasonRecord with memberIds, courts, guestPrice is returned

### Requirement: Announcement repository
The announcement repository SHALL support: findByName + fetching block children for content rendering.

#### Scenario: Get announcement blocks
- **WHEN** `announcementRepository.getBlocks(name)` is called
- **THEN** all child blocks with their content are returned in order

### Requirement: People repository
The people repository SHALL support: findByPageIds, findByName.

#### Scenario: Find by page IDs
- **WHEN** `peopleRepository.findByPageIds([id1, id2])` is called
- **THEN** an array of people records is returned
