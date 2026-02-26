# Structural & Database Blocks

## Divider
- **Type**: `divider`
- **Properties**: Empty object.

```json
{
  "type": "divider",
  "divider": {}
}
```

## Table of Contents
- **Type**: `table_of_contents`
- **Properties**:
  - `color` (string)

```json
{
  "type": "table_of_contents",
  "table_of_contents": {
    "color": "default"
  }
}
```

## Breadcrumb
- **Type**: `breadcrumb`
- **Properties**: Empty object.

```json
{
  "type": "breadcrumb",
  "breadcrumb": {}
}
```

## Child Database
- **Type**: `child_database`
- **Properties**:
  - `title` (string): Read-only title of the database.

```json
{
  "type": "child_database",
  "child_database": {
    "title": "My Database"
  }
}
```

## Equation
- **Type**: `equation`
- **Properties**:
  - `expression` (string): LaTeX expression.

```json
{
  "type": "equation",
  "equation": {
    "expression": "e=mc^2"
  }
}
```
