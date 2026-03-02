## Context

The project uses `@notionhq/client` v5.9.0, which is a non-standard fork that exposes an internal `dataSources` API (calling `/data_sources/{id}/query`). This endpoint is not the standard Notion public API and does not accept regular database IDs, causing 404 errors. The standard Notion REST API (`/databases/{id}/query`) works correctly and is what the integration permissions model is designed for.

Additionally, the property names used in code did not match the actual USERS database schema in Notion.

## Goals / Non-Goals

**Goals:**
- Fix USERS repository to use the standard Notion REST API
- Align property names with actual Notion database schema
- Preserve the existing public interface of `users-repository.ts`

**Non-Goals:**
- Fixing other repositories (calendar, people, season, announcement) — they may use different SDK paths; address separately if needed
- Upgrading or replacing the Notion SDK package
- Adding new USERS repository functionality

## Decisions

### Use native `fetch` instead of SDK for users-repository

**Decision**: Replace all Notion SDK calls in `users-repository.ts` with direct `fetch` calls to the Notion REST API.

**Rationale**: The SDK's `dataSources.query` calls a non-public endpoint. Switching to raw `fetch` with the standard `/databases/{id}/query` endpoint is more reliable, transparent, and independent of SDK internals. The affected file is self-contained, so there's no impact on other modules.

**Alternatives considered**:
- Downgrade SDK to an older version that uses `databases.query` — rejected because the correct older API version is unknown and risks other breakage
- Patch the SDK — rejected as too fragile and hard to maintain

## Risks / Trade-offs

- [Risk] Other repositories also use the SDK `dataSources` API → Mitigation: Out of scope for this fix; verify other repos separately
- [Trade-off] Losing SDK type safety for raw fetch responses → Mitigation: Use `any` internally, maintain typed public interface unchanged
