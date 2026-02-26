## ADDED Requirements

### Requirement: LINE webhook signature verification
The server SHALL verify LINE webhook signatures before processing any event.

#### Scenario: Valid signature accepted
- **WHEN** POST /webhook/:botId is received with a valid X-Line-Signature header
- **THEN** the server processes the events and returns 200 OK

#### Scenario: Invalid signature rejected
- **WHEN** POST /webhook/:botId is received with an invalid or missing X-Line-Signature
- **THEN** the server returns 400 and discards the request

#### Scenario: Bot ID routing
- **WHEN** POST /webhook/dobby is received
- **THEN** Dobby channel secret is used for signature verification
- **WHEN** POST /webhook/batting is received
- **THEN** 球來就打 channel secret is used for signature verification

### Requirement: Immediate 200 response with fire-and-forget processing
The server SHALL return 200 OK immediately upon receiving a valid webhook, before processing events.

#### Scenario: Fast response
- **WHEN** a valid webhook is received
- **THEN** 200 OK is returned within 100ms, before any Notion API calls
- **AND** event processing continues asynchronously in the background

#### Scenario: Processing error does not affect response
- **WHEN** an error occurs during async event processing
- **THEN** the error is logged but does not affect the already-sent 200 response

### Requirement: Health check endpoint
The server SHALL expose a health check endpoint.

#### Scenario: Health check
- **WHEN** GET /health is called
- **THEN** 200 OK is returned with `{ status: "ok" }`
