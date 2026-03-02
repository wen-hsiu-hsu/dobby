## ADDED Requirements

### Requirement: Shared Notion fetch helpers
The system SHALL centralise all Notion REST API HTTP calls in `src/services/notion/notion-fetch.ts`, exporting `notionGet`, `notionPost`, and `notionPatch`. No repository SHALL import from `notion-client.ts` for data operations.

#### Scenario: Shared module used by all repositories
- **WHEN** any repository needs to call the Notion REST API
- **THEN** it imports helpers from `notion-fetch.ts`, not from `notion-client.ts`

#### Scenario: Non-2xx response throws error
- **WHEN** the Notion REST API returns a non-2xx status
- **THEN** the helper SHALL throw an `Error` with the Notion error body in the message

## MODIFIED Requirements

### Requirement: Calendar repository
The calendar repository SHALL support: findByDate (next Saturday), updateAbsentees (add/remove), updateGuests (zero-play multi_select). All operations SHALL use the standard Notion REST API via `notion-fetch.ts`, not the SDK.

#### Scenario: Find by date
- **WHEN** `calendarRepository.findByDate(dateString)` is called
- **THEN** the matching CalendarEvent or null is returned

#### Scenario: Update absentees
- **WHEN** `calendarRepository.updateAbsentees(pageId, absenteePageIds)` is called
- **THEN** the Absentees relation property is updated via PATCH `/pages/{pageId}`

#### Scenario: Update guests
- **WHEN** `calendarRepository.updateGuests(pageId, guests)` is called
- **THEN** the Guests multi_select property is updated via PATCH `/pages/{pageId}`

### Requirement: Season repository
The season repository SHALL support: findByName (e.g., "2026-Q1") and findAll. All operations SHALL use the standard Notion REST API via `notion-fetch.ts`, not the SDK.

#### Scenario: Find current season
- **WHEN** `seasonRepository.findByName(quarterString)` is called
- **THEN** the SeasonRecord with memberIds, courts, guestPrice is returned

#### Scenario: Find all seasons
- **WHEN** `seasonRepository.findAll()` is called
- **THEN** all SeasonRecords are returned

### Requirement: Announcement repository
The announcement repository SHALL support: findByName + fetching block children for content rendering. All operations SHALL use the standard Notion REST API via `notion-fetch.ts`, not the SDK.

#### Scenario: Get announcement blocks
- **WHEN** `announcementRepository.getBlocks(pageId)` is called
- **THEN** all child blocks are returned via GET `/blocks/{pageId}/children`

### Requirement: People repository
The people repository SHALL support: findByPageIds, findByName. All operations SHALL use the standard Notion REST API via `notion-fetch.ts`, not the SDK.

#### Scenario: Find by page IDs
- **WHEN** `peopleRepository.findByPageIds([id1, id2])` is called
- **THEN** an array of PersonRecords is returned via GET `/pages/{id}` for each ID

#### Scenario: Find by name
- **WHEN** `peopleRepository.findByName(name)` is called
- **THEN** a PersonRecord or null is returned via POST `/databases/{id}/query`
