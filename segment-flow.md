# Segments

This guide describes how the Segments feature works in Kriscel WA, including creation, filtering, previewing, syncing, AI suggestions, and campaign integration.

## What it does

Segments are tenant-scoped dynamic audience groups that filter contacts by conditions such as tag, city, country, language, company, message count, last message date, or creation date. A segment defines a set of rules (conditions + match type) and evaluates them live against the contact database whenever previewed, synced, or used in a campaign.

Each tenant can create up to their plan's `maxSegments` limit (default 5). The segments page shows each segment's name, description, condition summary, total synced contacts, and actions for preview, sync, edit, and delete.

## Creating a segment

1. Sign in to a tenant account and open **Segments** from the app menu.
2. Click **New Segment**.
3. Enter a **Segment Name** (required) and optional **Description**.
4. Choose the **Match Type**:
   - **Match ALL conditions (AND):** A contact must satisfy every condition to be included.
   - **Match ANY condition (OR):** A contact only needs to satisfy one condition to be included.
5. Add one or more **Conditions**. Each condition consists of a field, an operator, and a value.
6. Optionally, use the **AI Suggest** panel (if AI is configured) to describe your target audience in plain language and have conditions generated automatically.
7. Click **Create Segment**.

## Editing a segment

1. On the segment card, click the **Edit** (pencil) icon.
2. Modify the name, description, match type, or conditions.
3. Click **Save Changes**.

Editing a segment's conditions does not automatically re-sync its contact membership. Click **Sync** on the segment card after editing to update the materialized contact list.

## Condition fields and operators

### Available fields

| Field | Description | Supported operators |
| --- | --- | --- |
| `tag` | Contact tag name | `equals` (matches a tag by name) |
| `city` | Contact's city | All string operators |
| `country` | Contact's country | All string operators |
| `language` | Contact's language | All string operators |
| `company` | Contact's company | All string operators |
| `totalMessagesSent` | Number of messages sent to contact | `equals`, `greater_than`, `less_than` |
| `lastMessageAt` | Date of last message | `within_days`, `is_empty`, `is_not_empty` |
| `createdAt` | Contact creation date | `within_days`, `is_empty`, `is_not_empty` |

### Available operators

| Operator | Label | Description |
| --- | --- | --- |
| `equals` | equals | Exact match (case-insensitive for strings) |
| `not_equals` | not equals | Does not match |
| `contains` | contains | String contains value (case-insensitive) |
| `not_contains` | not contains | String does not contain value |
| `starts_with` | starts with | String starts with value |
| `ends_with` | ends with | String ends with value |
| `is_empty` | is empty | Field is null or empty string |
| `is_not_empty` | is not empty | Field is not null and not empty |
| `greater_than` | > | Numeric greater than |
| `less_than` | < | Numeric less than |
| `within_days` | within (days) | Date is within the last N days |

### How conditions are evaluated

Conditions are translated into live Prisma `where` clauses at query time:

- **String fields** (city, country, language, company): Matched case-insensitively using Prisma's `mode: 'insensitive'`.
- **Tag field**: Matched via the `ContactTag` → `Tag` relation (`tags: { some: { tag: { name: value } } }`).
- **Numeric fields** (totalMessagesSent): Compared directly as numbers.
- **Date fields** (lastMessageAt, createdAt): `within_days` calculates a date N days ago and filters `gte` that date.
- **Match ALL**: Conditions are combined with `AND`.
- **Match ANY**: Conditions are combined with `OR`.

## Previewing a segment

Click **Preview** on a segment card to see a sample of matching contacts (up to 20) and the total count. The preview runs the segment's conditions live against the current contact data — it does not use the materialized `ContactSegment` table.

## Syncing a segment

Click the **Sync** (refresh) button on a segment card to materialize the segment's membership:

1. The API evaluates the segment's conditions against all tenant contacts.
2. Existing `ContactSegment` rows for that segment are deleted.
3. New `ContactSegment` rows are created for every matching contact.
4. The segment's `totalContacts` count is updated.

Sync is important after editing conditions or after contacts have been added/updated, so the segment card shows an accurate count.

## AI-powered segment suggestions

If an AI provider is configured for the tenant, the **Describe who you want to target** input appears in the create modal:

1. Type a plain-language description, e.g. "customers who haven't messaged in 30 days" or "leads from Mumbai".
2. Click **Suggest**.
3. The API sends the description along with the available fields and operators to the configured AI model.
4. The AI returns proposed conditions and a match type.
5. The proposed conditions are validated against supported fields/operators and run through the same query builder to return a real `estimatedCount`.
6. Click **Use these conditions** to populate the form.

The AI suggestion route is `POST /segments/suggest`. It requires `segments:create` permission.

## Using segments in campaigns

Segments are a primary audience source for campaigns:

1. When creating a campaign, set **Audience Type** to `segment`.
2. Select one or more segments.
3. The campaign send process evaluates each selected segment's conditions live (not from the materialized `ContactSegment` table) to build the recipient list.
4. Only contacts with `isActive: true` and `consentStatus: 'OPTED_IN'` are included.
5. If multiple segments are selected, their conditions are combined with `OR` — a contact matching any selected segment is included.

This means campaigns always use the latest contact data without requiring a manual sync first.

## Deleting a segment

1. Click the **Delete** (trash) icon on a segment card.
2. Confirm in the dialog.
3. The segment and all its `ContactSegment` membership rows are permanently removed (cascade delete).

Deleting a segment does not affect contacts themselves or any campaigns that have already been sent using that segment.

## Useful API routes

All routes are mounted under the API's versioned prefix (typically `/api/v1`):

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/segments` | List all tenant segments |
| `POST` | `/segments` | Create a new segment |
| `GET` | `/segments/:segmentId` | Get segment details |
| `PATCH` | `/segments/:segmentId` | Update segment name, description, or rules |
| `DELETE` | `/segments/:segmentId` | Delete a segment |
| `GET` | `/segments/:segmentId/preview` | Preview matching contacts (live query, up to 20) |
| `POST` | `/segments/:segmentId/sync` | Materialize segment membership and update contact count |
| `POST` | `/segments/suggest` | AI-generated segment conditions from plain-language goal |

All segment routes are tenant-scoped. Create, update, delete, and sync require the corresponding `segments` permission.

## Data model

### Segment table

| Column | Type | Description |
| --- | --- | --- |
| `id` | String (cuid) | Primary key |
| `tenantId` | String | Owning tenant |
| `name` | String | Segment name (unique per tenant) |
| `description` | String? | Optional description |
| `query` | JSON | Filter criteria: `{ type: 'all' | 'any', conditions: [{ field, operator, value }] }` |
| `queryHash` | String | Hash of the query for deduplication |
| `totalContacts` | Int | Last synced contact count |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

### ContactSegment table (materialized membership)

| Column | Type | Description |
| --- | --- | --- |
| `id` | String (cuid) | Primary key |
| `contactId` | String | FK to Contact |
| `segmentId` | String | FK to Segment |
| `createdAt` | DateTime | When the membership was recorded |

Unique constraint: `(contactId, segmentId)` — a contact can only appear once per segment.

## Demo walkthrough

1. Open **Segments** and click **New Segment**.
2. Name it "Active Indian Customers".
3. Set match type to **Match ALL**.
4. Add conditions:
   - `country` → `equals` → `India`
   - `lastMessageAt` → `within_days` → `30`
5. Click **Create Segment**.
6. Click **Preview** to see matching contacts.
7. Click **Sync** to materialize the membership and update the contact count.
8. Go to **Campaigns**, create a new campaign, set audience to **Segment**, and select "Active Indian Customers".

## Troubleshooting checklist

- **Segment shows 0 contacts:** Click Sync to re-evaluate conditions. Check that contacts exist with matching field values (e.g. country is actually stored as "India", not "IN").
- **AI suggest returns nothing:** Verify the AI provider is configured for the tenant (Super Admin → AI Settings). Try rephrasing the description.
- **Campaign sends to wrong contacts:** Campaigns evaluate segment conditions live, not from the synced membership. Check that conditions are correct and contact `consentStatus` is `OPTED_IN`.
- **Duplicate segment name error:** Segment names must be unique per tenant. Choose a different name.
- **Segment limit reached:** The tenant's plan limits the number of segments (`maxSegments`). Upgrade the plan or delete unused segments.
