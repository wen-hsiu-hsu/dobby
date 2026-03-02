## MODIFIED Requirements

### Requirement: USERS repository
The USERS repository SHALL support: findByUserId, findByCustomName, create, update, incrementMessageCount. All operations SHALL use the standard Notion REST API (`/databases/{id}/query`) via native `fetch`, not the SDK's internal `dataSources` API.

#### Scenario: Find by userId
- **WHEN** `usersRepository.findByUserId(userId)` is called
- **THEN** a NotionUser object or null is returned

#### Scenario: Correct property name mapping
- **WHEN** reading or writing USERS database records
- **THEN** the repository SHALL use property names matching the actual Notion schema: `user_id` (title), `Custom Name` (rich_text), `is_admin` (checkbox), `message_counts` (number), `groups` (multi_select), `multi-chat` (multi_select)

#### Scenario: API error propagation
- **WHEN** the Notion REST API returns a non-2xx response
- **THEN** the repository SHALL throw an error with the Notion error body included in the message
