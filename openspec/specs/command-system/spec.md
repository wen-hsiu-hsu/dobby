## ADDED Requirements

### Requirement: @Dobby prefix detection
The system SHALL only process commands that start with "@Dobby".

#### Scenario: Command detected
- **WHEN** a message text starts with "@Dobby"
- **THEN** the message is routed to the command system

#### Scenario: Non-command message
- **WHEN** a message text does not start with "@Dobby"
- **THEN** the message is routed to auto-reply (not command system)

### Requirement: Command routing
The system SHALL route @Dobby commands to the correct handler based on exact text matching or prefix matching.

#### Scenario: Dobby intro
- **WHEN** message text trimmed equals "@Dobby" exactly
- **THEN** the introduce handler is invoked

#### Scenario: Owe command
- **WHEN** message text equals "@Dobby owe" or "@Dobby 欠"
- **THEN** the owe handler is invoked

#### Scenario: Command list
- **WHEN** message text equals "@Dobby command" or "@Dobby 指令"
- **THEN** the command-list handler is invoked

#### Scenario: Participants command
- **WHEN** message text equals "@Dobby participants", "@Dobby people", or "@Dobby 報名人"
- **THEN** the participants handler is invoked

#### Scenario: News command
- **WHEN** message text equals "@Dobby news", "@Dobby announcement", or "@Dobby 公告"
- **THEN** the news handler is invoked

#### Scenario: Payment command
- **WHEN** message text equals "@Dobby payment" or "@Dobby 付款"
- **THEN** the payment handler is invoked

#### Scenario: Registration/leave commands
- **WHEN** message text starts with "@Dobby +", "@Dobby -", "@Dobby ＋", "@Dobby －", "@Dobby 假", "@Dobby 銷假", or "@Dobby @"
- **THEN** the registration/leave handler is invoked

### Requirement: Admin-only next command
The system SHALL restrict the `next` command to admin users only.

#### Scenario: Admin executes next
- **WHEN** an admin user sends "@Dobby next" (optionally with query params `?-=N&c=N`)
- **THEN** the next-event handler is invoked with optional offCounts and courts overrides

#### Scenario: Non-admin blocked
- **WHEN** a non-admin user sends "@Dobby next"
- **THEN** no response is sent (silently ignored)

### Requirement: Registration parser mentionee resolution
The system SHALL determine the registration target from mentionees in the message.

#### Scenario: Self registration (no mentionee)
- **WHEN** mentionees list is empty or contains only @Dobby
- **THEN** isSelf = true, actor is the target

#### Scenario: Mention target
- **WHEN** mentionees list contains at least one user-type mentionee (excluding @Dobby)
- **THEN** the LAST user-type mentionee's userId is used as targetUserId

#### Scenario: Invalid target format
- **WHEN** a non-@ target name is provided after the command (e.g., "@Dobby +1 SomeName")
- **THEN** parserError is set and a format error message is returned to the user
