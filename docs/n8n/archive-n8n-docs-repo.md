# n8n Documentation Project

n8n is a fair-code licensed workflow automation platform that combines AI capabilities with business process automation. This documentation repository hosts comprehensive guides, API references, and integration documentation for n8n, covering everything from basic setup to advanced development. Built with MkDocs Material theme and Python-based custom macros, it provides an extensive resource for users ranging from no-code beginners to experienced developers building custom integrations.

The documentation serves multiple audiences: end users learning to build workflows, developers creating custom nodes, and administrators deploying self-hosted instances. It includes interactive workflow previews, template widgets that fetch trending workflows from the n8n API, detailed technical references for over 500+ built-in integrations, an AI-powered assistant via Kapa widget, and user feedback tracking. The docs use a modular structure with reusable snippets, custom Jinja2 macros for dynamic content, automated navigation configuration, and utility scripts to maintain consistency across the large content library. The project also generates LLM-optimized documentation output via the llmstxt plugin for AI assistant integration.

## Building and Serving Documentation

### Local development server
```bash
# Clone with submodules (for n8n team members with Insiders theme access)
git clone --recurse-submodules git@github.com:n8n-io/n8n-docs.git
cd n8n-docs

# Set up virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install _submodules/insiders  # For n8n team members

# Serve with live reload
mkdocs serve --strict

# Output:
# INFO     -  Building documentation...
# INFO     -  Cleaning site directory
# INFO     -  Documentation built in 2.34 seconds
# [I 250113 10:30:45 server:335] Serving on http://127.0.0.1:8000
```

### External contributors setup
```bash
# Fork and clone
git clone https://github.com/<your-username>/n8n-docs.git
cd n8n-docs

# Use free Material theme instead of Insiders
pip install -r requirements.txt
pip install mkdocs-material

# Serve locally
mkdocs serve --strict
```

### Speed up development builds
```bash
# Dirty builds (only rebuild changed files)
mkdocs serve --strict --dirty

# Skip template widget API calls
export NO_TEMPLATE=true && mkdocs serve --strict

# On Windows PowerShell
$env:NO_TEMPLATE='true'; mkdocs serve --strict
```

## Custom Macro Functions

### templatesWidget - Display trending workflow templates
```python
# In any Markdown file
[[ templatesWidget('HTTP Request', 'http-request', 3) ]]

# Generates HTML widget with template cards:
# <div class="n8n-templates-widget">
#   <div class="n8n-templates-widget-template">
#     <strong>Sync GitHub Issues to Notion</strong>
#     <p class="n8n-templates-name">by n8n Community</p>
#     <a href="https://n8n.io/workflows/123-sync-github-issues-to-notion/">View template details</a>
#   </div>
#   ...
# </div>

# API call made internally:
# GET https://api.n8n.io/api/templates/search?rows=3&search=HTTP+Request&page=1&sort=views:desc
```

### workflowDemo - Embed interactive workflow preview
```python
# From remote URL
[[ workflowDemo('https://api.n8n.io/api/workflows/templates/1750') ]]

# From local file
[[ workflowDemo('file:///send-email-notification.json') ]]

# Generates embedded preview:
# <div class='n8n-workflow-preview'>
#   <n8n-demo
#     hidecanvaserrors='true'
#     clicktointeract='true'
#     frame='false'
#     workflow='{"nodes":[...],"connections":{...}}'
#   ></n8n-demo>
#   <a href="https://n8n.io/workflows/1750-..." target="_blank">View template details</a>
# </div>
```

### custom_slugify - Generate URL-safe slugs
```python
# In main.py macro definition
def custom_slugify(string):
    if not isinstance(string, str):
        raise ValueError("slugify: string argument expected")

    slug = ''.join(
        CHAR_MAP.get(ch, ch).replace('-', ' ')
        for ch in unicodedata.normalize('NFKC', string)
    )

    slug = re.sub(r'[^\w\s$*_+~.()\'"!\-:@]+', '', slug)
    slug = re.sub(r'[^A-Za-z0-9\s]', '', slug).strip()
    slug = re.sub(r'\s+', '-', slug).lower()

    return slug

# Example usage:
# custom_slugify("HTTP Request Node (v2)")
# Returns: "http-request-node-v2"
```

## Writing Integration Documentation

### Create new node documentation
```markdown
---
title: HTTP Request node documentation
description: Learn how to use the HTTP Request node in n8n.
contentType: [integration, reference]
priority: critical
---

# HTTP Request node

The HTTP Request node allows you to make HTTP requests to query data from any app or service with a REST API.

## Node parameters

### Method

Select the method to use for the request:

- DELETE
- GET
- POST
- PUT

### URL

Enter the endpoint you want to use.

### Authentication

n8n recommends using the **Predefined Credential Type** option when available.

## Templates and examples

[[ templatesWidget(page.title, 'http-request') ]]
```

### Using reusable snippets
```markdown
# In your documentation file
---
title: Google Sheets node
---

# Google Sheets

--8<-- "_snippets/integrations/builtin/app-nodes/googlesheets/node-options.md"

## Authentication

--8<-- "_snippets/integrations/managed-google-oauth.md"
```

### Embedding workflow examples
```markdown
# Show interactive workflow
Here's an example workflow:

[[ workflowDemo('file:///api-endpoint-example.json') ]]

# The workflow file at docs/_workflows/api-endpoint-example.json contains:
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "parameters": {
        "httpMethod": "POST",
        "path": "api/users"
      }
    }
  ],
  "connections": {}
}
```

## MkDocs Configuration

### Configure navigation structure
```yaml
# In mkdocs.yml
site_name: n8n Docs
site_url: https://docs.n8n.io/
repo_url: https://github.com/n8n-io/n8n-docs

theme:
  name: material
  custom_dir: _overrides
  favicon: _images/favicon.ico
  font: false
  language: custom
  logo: _images/n8n-docs-icon.svg
  features:
    - announce.dismiss
    - content.action.edit
    - content.code.annotate
    - content.tabs.link
    - content.code.copy
    - content.tooltips
    - navigation.footer
    - navigation.indexes
    - navigation.path
    - navigation.sections
    - navigation.tabs
    - navigation.top
    - navigation.tracking

validation:
  nav:
    omitted_files: warn
    not_found: warn
    absolute_links: warn
  links:
    not_found: warn
    anchors: warn
    absolute_links: relative_to_docs
    unrecognized_links: warn

plugins:
  - search
  - exclude:
      glob:
       # - integrations/builtin/*
  - glightbox:
      touchNavigation: false
      loop: false
      effect: zoom
      slide_effect: none
      width: auto
      height: auto
      zoomable: false
      draggable: false
      auto_caption: false
      caption_position: bottom
  - macros:
      include_yaml:
        - _yaml/data-functions.yml
      j2_block_start_string: "[[%"
      j2_block_end_string: "%]]"
      j2_variable_start_string: "[["
      j2_variable_end_string: "]]"
  - tags:
      enabled: true
  - privacy:
      assets: false
      links: true
      links_attr_map:
        target: _blank
        rel: external
  - llmstxt:
      markdown_description: |
        Documentation for n8n, a workflow automation platform. This file helps LLMs understand and use the documentation more effectively.
      full_output: llms-full.txt
      sections:
        All documentation:
          - "*.md"

markdown_extensions:
  - abbr
  - attr_list
  - md_in_html
  - meta
  - material.extensions.preview:
      configurations:
        - sources:
            include:
              - release-notes.md
        - targets:
            include:
              - glossary.md
  - pymdownx.blocks.admonition:
      types:
        - note
        - info
        - tip
        - question
        - warning
        - danger
        - details
  - pymdownx.details
  - pymdownx.emoji:
      emoji_index: !!python/name:material.extensions.emoji.twemoji
      emoji_generator: !!python/name:material.extensions.emoji.to_svg
  - pymdownx.highlight:
      linenums: true
  - pymdownx.inlinehilite
  - pymdownx.keys
  - pymdownx.snippets:
      auto_append:
        - _glossary/main.md
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
      preserve_tabs: true
  - pymdownx.tasklist:
      custom_checkbox: true
  - pymdownx.tabbed:
      alternate_style: true
  - sane_lists
  - tables
  - toc:
      permalink: "#"

# Import navigation from separate file
INHERIT: ./nav.yml
```

### Using Mermaid diagrams
```markdown
# Mermaid diagram support is enabled via pymdownx.superfences
# Create flowcharts, sequence diagrams, and more

```mermaid
graph LR
    A[Webhook Trigger] --> B[HTTP Request]
    B --> C[Set Node]
    C --> D[Send Email]
```

# Renders as an interactive diagram in the documentation
```

## API Reference Integration

### Set up Scalar API documentation
```html
<!-- In docs/api/api-reference.md -->
---
template: api.html
hide:
    - toc
    - navigation
    - feedback
    - kapaButton
---

<div id="app"></div>

<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>

<script>
Scalar.createApiReference('#app', {
    url: '/api/v1/openapi.yml',
    proxyUrl: 'https://proxy.scalar.com',
    servers: [
        {
            url: 'https://{instance}.app.n8n.cloud/api/v1',
            description: 'n8n cloud instance',
            variables: {
                instance: { default: 'your-instance-name' }
            }
        },
        {
            url: '{url}/api/v1',
            description: 'self-hosted n8n instance',
            variables: {
                url: { default: 'https://example.com' }
            }
        }
    ],
    forceDarkModeState: 'light',
    hideDarkModeToggle: true,
    hideClientButton: true
})
</script>
```

### Document API authentication
```markdown
---
description: Authentication for n8n's public REST API.
contentType: howto
---

# API authentication

n8n uses API keys to authenticate API calls.

## Create an API key

1. Log in to n8n
2. Go to **Settings** > **n8n API**
3. Select **Create an API key**
4. Copy **My API Key**

## Call the API using your key

```shell
# Get all active workflows
curl -X 'GET' \
  '<N8N_HOST>:<N8N_PORT>/api/v1/workflows?active=true' \
  -H 'accept: application/json' \
  -H 'X-N8N-API-KEY: <your-api-key>'

# Expected response:
{
  "data": [
    {
      "id": "123",
      "name": "My Workflow",
      "active": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```
```

## Content Guidelines

### Code block formatting
```markdown
# Use language-specific syntax highlighting
```javascript
// JavaScript code with proper highlighting
const workflow = {
  nodes: [
    { name: 'Start', type: 'n8n-nodes-base.start' }
  ]
};
```

```python
# Python code example
import json

def process_data(items):
    return [item['value'] for item in items]
```

```bash
# Shell commands
npm install n8n -g
n8n start
```
```

### Using admonitions and callouts
```markdown
/// note | Feature availability
The n8n API isn't available during the free trial.
///

/// tip | Use the API playground
Trying out the API in the playground can help you understand how APIs work.
///

/// warning | Important
Never commit your API keys to version control.
///

/// danger | Breaking change
This feature was removed in version 1.0.0.
///

/// details | Click to expand
This content is hidden by default and can be expanded by the user.
///
```

### Using linked content tabs
```markdown
# Tabs that stay synchronized across the page when switching
=== "Python"
    ```python
    import n8n
    client = n8n.Client(api_key="your-key")
    ```

=== "JavaScript"
    ```javascript
    const n8n = require('n8n-api');
    const client = new n8n.Client({ apiKey: 'your-key' });
    ```

=== "cURL"
    ```bash
    curl -H "X-N8N-API-KEY: your-key" https://api.n8n.io
    ```

# All tabs with the same label will switch together across the page
```

### Adding custom metadata
```markdown
---
title: Webhook node documentation
description: Learn how to use the Webhook node in n8n.
contentType: [integration, reference]
priority: critical
tags:
  - webhook
  - trigger node
hide:
  - tags
  - feedback
  - kapaButton
---

# Webhook node

Content here...
```

## Interactive Features

### Kapa AI Widget - AI-powered documentation assistant
```javascript
// Configured in docs/_extra/javascript/kapa_widget.js
document.addEventListener("DOMContentLoaded", function () {
  var script = document.createElement("script");
  script.src = "https://widget.kapa.ai/kapa-widget.bundle.js";
  script.setAttribute("data-website-id", "d2598b63-bfa7-4ddd-a0ac-e6c69f4d0653");
  script.setAttribute("data-project-name", "n8n");
  script.setAttribute("data-project-color", "#EA4B71");
  script.setAttribute("data-project-logo", "/_images/assets/n8n-icon-kapa-modal.png");
  script.setAttribute("data-button-hide", true);
  script.setAttribute("data-modal-size", "900px");
  script.setAttribute("data-user-analytics-cookie-enabled", false);
  // Enable MCP (Model Context Protocol) for enhanced AI capabilities
  script.setAttribute("data-mcp-enabled", true);
  script.setAttribute("data-mcp-server-url", "https://n8n.mcp.kapa.ai/");
  script.async = true;
  document.head.appendChild(script);
});

// Track Kapa interactions with Plausible - multiple event types
Kapa("onAskAIAnswerCompleted", ({ threadId, questionAnswerId, question, answer }) => {
  plausible("Kapa Question", {
    props: {
      page: window.location.href,
      kapaThreadId: threadId,
      question,
      answer
    }
  })
});

// Track link clicks within AI answers
Kapa("onAskAILinkClick", ({ href, threadId, questionAnswerId, question, answer }) => {
  plausible("Kapa Link In Answer Clicked", {
    props: {
      page: window.location.href,
      link: href,
      kapaThreadId: threadId,
      question,
      answer
    }
  })
});

// Track source citation clicks
Kapa("onAskAISourceClick", ({ source, threadId, questionAnswerId, question, answer }) => {
  plausible("Kapa Link In Listed Sources Clicked", {
    props: {
      page: window.location.href,
      source: source.url,
      kapaThreadId: threadId,
      question,
      answer
    }
  })
});

// Hide Kapa button on specific pages via frontmatter:
// hide:
//   - kapaButton
```

### User Feedback System
```javascript
// Configured in docs/_extra/javascript/feedback.js
function handleRating(rating) {
  // Send event to Google Analytics with error handling
  if (typeof gtag !== 'undefined') {
    try {
      gtag('event', 'feedback', {
        'feedback_rating': rating,
        'page_location': window.location.href,
        'page_title': document.title
      });
    } catch (error) {
      console.error('Error sending GA event:', error);
    }
  } else {
    console.warn('Google Analytics (gtag) not found. Event not sent.');
  }

  if (rating === 'positive') {
    showElement('n8n-feedback-thank-you-message');
  } else {
    showElement('n8n-feedback-comment');
  }
}

// Track detailed feedback submissions with error handling
function submitFeedback() {
  const feedbackText = document.getElementById('n8n-feedback-input').value;
  if (typeof gtag !== 'undefined') {
    try {
      const eventParams = {
        'feedback_text': feedbackText,
        'page_location': window.location.href,
        'page_title': document.title,
        'feedback_length': feedbackText.length
      };
      gtag('event', 'feedback_submitted', eventParams);
      plausible("Feedback Comment", {
        props: {
          page: eventParams.page_location,
          feedback_text: eventParams.feedback_text,
          feedback_length: eventParams.feedback_length
        }
      });
    } catch (error) {
      console.error('Error sending GA event:', error);
    }
  }
  showElement('n8n-feedback-thank-you-message');
}

// Auto-focus and Enter key support for feedback input
function showElement(id) {
  // Hide all feedback elements
  document.getElementById('n8n-ratings-feedback').style.display = 'none';
  document.getElementById('n8n-feedback-thank-you-message').style.display = 'none';
  document.getElementById('n8n-feedback-comment').style.display = 'none';
  document.getElementById(id).style.display = 'flex';

  // Focus the input if showing the feedback form
  if (id === 'n8n-feedback-comment') {
    setTimeout(() => {
      const input = document.getElementById('n8n-feedback-input');
      input.focus();
      input.onkeydown = function(e) {
        if (e.key === 'Enter') {
          submitFeedback();
        }
      };
    }, 0);
  }
}

// Hide feedback on specific pages via frontmatter:
// hide:
//   - feedback
```

## Navigation Structure

### Define navigation hierarchy
```yaml
# In nav.yml
nav:
  - Home: index.md
  - Try it out:
    - try-it-out/index.md
  - Integrations:
    - integrations/index.md
    - Built-in nodes:
      - integrations/builtin/node-types.md
      - Core nodes:
        - integrations/builtin/core-nodes/index.md
      - App nodes:
        - integrations/builtin/app-nodes/index.md
  - Code:
    - code/index.md
    - Expressions: code/expressions.md
    - Code node: code/code-node.md
  - API:
    - api/index.md
    - Authentication: api/authentication.md
    - API Reference: api/api-reference.md
  - Hosting:
    - hosting/index.md
```

## Testing and Validation

### Built-in MkDocs validation
```yaml
# In mkdocs.yml - automatic validation during builds
validation:
  nav:
    omitted_files: warn      # Warn about files not in navigation
    not_found: warn          # Warn about missing nav files
    absolute_links: warn     # Warn about absolute nav links
  links:
    not_found: warn          # Warn about broken internal links
    anchors: warn            # Warn about invalid anchor links
    absolute_links: relative_to_docs  # Resolve absolute links relative to docs
    unrecognized_links: warn # Warn about unrecognized link patterns

# Validation runs automatically during 'mkdocs build --strict'
# Warnings become errors in strict mode, failing the build
```

### Run validation checks
```bash
# Check for broken links with Lychee
lychee --config lychee.toml docs/

# Configuration in lychee.toml:
# - Cache results for 2 days
# - 2 threads for checking
# - Max 5 concurrent checks
# - 20 second timeout per link
# - Output to _lychee/output.md

# Build with strict mode (fail on warnings)
mkdocs build --strict

# Expected output:
INFO     -  Building documentation...
INFO     -  Cleaning site directory
INFO     -  Documentation built in 5.67 seconds

# Check for Vale style issues
vale docs/
```

### Preview before deploying
```bash
# Build static site
mkdocs build

# Serve built site
cd site
python -m http.server 8000

# Access at http://localhost:8000
```

## Working with Glossary Terms

### Define glossary terms
```markdown
# In _glossary/main.md
*[API]: Application Programming Interface - a set of protocols for building software
*[webhook]: A way for an app to provide real-time information to other applications
*[workflow]: A collection of nodes connected together to automate a process
```

### Use glossary in documentation
```markdown
# Terms automatically get tooltips
When you create a [workflow](/glossary.md#workflow-n8n), you can use
[webhooks](/glossary.md#webhook) to trigger execution via [API](/glossary.md#api) calls.

# Renders with interactive glossary tooltips on hover
```

## Documentation Utilities

### pageinfo.py - Extract content metrics
```bash
# Extract contentType and word count from all docs
python _doctools/pageinfo.py --dir docs --print

# Output format (saves to pageinfo.csv):
# File: docs/api/authentication.md
# Word Count: 423
# contentType: howto

# Use cases:
# - Content audits and gap analysis
# - Identifying documentation that needs contentType metadata
# - Tracking documentation growth over time
```

### change_link_style.py - Convert URL links to file links
```bash
# Convert URL-style links to markdown file path links
python _doctools/change_link_style.py --dir docs

# Before: [Link text](/code/expressions)
# After:  [Link text](/docs/code/expressions.md)

# Use cases:
# - Preparing docs for systems that prefer file-path links
# - Ensuring links work in both web and local environments
# - Bulk link format standardization
```

## Data Transformation Functions

### Using YAML-defined functions in docs
```yaml
# _yaml/data-functions.yml defines 80+ transformation functions
# These are rendered in documentation using Jinja2 templates

# String functions
df_string:
  - funcName: base64Encode
    returns: A base64 encoded string
    description: Encode a string as base64
  - funcName: extractEmail
    returns: String
    description: Extracts an email from a string

# Array functions
df_array:
  - funcName: removeDuplicates
    args:
      - argName: key
        optional: true
    returns: Array
    description: Removes duplicates from an array
```

### Example in documentation
```markdown
# The data-functions.yml is included in macros plugin
# Access in markdown files via Jinja2 variables

<!-- Display all string functions -->
[[% for func in df_string %]]
### [[ func.funcName ]]
[[ func.description ]]
[[% endfor %]]
```

## LLM Integration

### Generate LLM-optimized documentation
```yaml
# In mkdocs.yml
plugins:
  - llmstxt:
      markdown_description: |
        Documentation for n8n workflow automation platform.
      full_output: llms-full.txt
      sections:
        All documentation:
          - "*.md"

# Generates:
# - llms.txt: Condensed version for LLM context
# - llms-full.txt: Complete documentation in LLM-friendly format

# Use cases:
# - Training AI assistants on n8n documentation
# - Providing context to LLMs for n8n-related queries
# - Creating embeddings for semantic search
```

### Access LLM-formatted docs
```bash
# After building, files are available at:
# site/llms.txt
# site/llms-full.txt

# Deploy configuration (netlify.toml):
[build]
  command = "pip install _submodules/insiders && mkdocs build --strict"
  publish = "site"

# Security headers in production
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    Content-Security-Policy = "frame-ancestors 'none'"
```

## n8n Documentation Project Summary

The n8n documentation serves as the comprehensive knowledge base for one of the leading open-source workflow automation platforms. Its primary use cases include onboarding new users through quickstart guides, providing detailed technical references for 500+ integrations, documenting the REST API for programmatic access, and offering self-hosting guides for infrastructure deployment. The docs support both no-code users building visual workflows and developers creating custom nodes or API integrations. The project includes an enhanced AI-powered assistant (Kapa widget) with granular analytics tracking for answer completions, link clicks, and source citations, a robust user feedback system with error handling for Google Analytics and Plausible events, and generates LLM-friendly documentation formats to enable AI assistants to answer questions about n8n effectively. Built-in validation checks ensure documentation quality by detecting broken links, missing navigation entries, and invalid anchors during the build process.

Integration patterns focus on modular, reusable content through snippet includes and custom Jinja2 macros that fetch live data from the n8n template API. The build system uses MkDocs with Material theme featuring advanced capabilities including linked content tabs that synchronize across pages, Mermaid diagram support for visual workflow documentation, automatic preview generation for internal links, and comprehensive markdown extensions for admonitions, code highlighting, emoji support, and task lists. Contributors can preview changes locally with hot reload using dirty builds or template API skipping for faster iteration. The system supports both the Insiders theme for team members and the free Material theme for external contributors. Security is enforced through Content-Security-Policy headers and X-Frame-Options in production deployments. All documentation follows a consistent structure with frontmatter metadata, reusable snippets, interactive code examples with syntax highlighting and line numbers, automated glossary tooltips, navigation path breadcrumbs, and LLM-optimized outputs to ensure maintainability and accessibility across the large content library.
