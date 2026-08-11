# WA META AUTO - Comprehensive Testing Loop

## Master Loop Prompt for Continuous Testing

Use this prompt to continue testing when resuming:

```
Continue testing WA META AUTO comprehensively:

### Testing Context
- API Server: localhost:3001
- Web Server: localhost:5173
- Login: admin@demo.com / demo123
- Tenant ID: demo-tenant-id

### Quick Test Command (Run First)
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"demo123"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Test all modules
for EP in "/dashboard/stats" "/dashboard/recent" "/contacts" "/contacts/search?q=test" "/conversations" "/campaigns" "/segments" "/templates" "/templates/categories" "/team" "/analytics/overview" "/billing" "/whatsapp/credentials"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/v1$EP" -H "Authorization: Bearer $TOKEN")
  echo "$EP: $STATUS"
done
```

### Modules to Test (Priority Order)
1. **Dashboard** - Stats, Recent Activity, Charts
2. **Contacts** - CRUD, Import, Export, Search, Bulk Delete
3. **Conversations** - List, Messages, Stats
4. **Campaigns** - Create, Schedule, A/B Testing
5. **Templates** - CRUD, Categories, Approval Status
6. **Segments** - Builder, Dynamic Segments, Filters
7. **Analytics** - Reports, Exports, Charts, Date Filters
8. **Team** - Roles, Permissions, Invites, Activity
9. **Billing** - Plans, Invoices, Upgrades
10. **Settings** - Profile, Notifications, API Keys, Security
11. **WhatsApp Settings** - Credentials, Webhooks, Phones

### Browser UI Testing
1. Navigate to each module via sidebar
2. Check all buttons are functional
3. Test all form submissions
4. Verify data displays correctly
5. Check responsive design

### Security Testing
1. XSS injection in all input fields
2. SQL injection in search parameters
3. Auth bypass attempts (wrong token, expired token)
4. Role-based access control (test each role)
5. Rate limiting

### Issues to Fix
- Contacts POST returns 500 (unique constraint)
- Dashboard /overview route missing
- Some notification endpoints missing

### Continue Testing Steps
1. Fix remaining API endpoints
2. Test all UI interactions in browser
3. Verify security measures
4. Test edge cases
5. Check error handling
6. Verify data persistence
```

---

## Testing Checklist

### Pre-Flight Check
- [ ] API Server running on port 3001
- [ ] Web Server running on port 5173
- [ ] Can login with admin@demo.com
- [ ] Database connected

### Module Tests (Run via API)

#### 1. DASHBOARD
```bash
# Test endpoints
GET /dashboard/stats
GET /dashboard/recent  
GET /dashboard/chart
```
Expected: 200 response with JSON data

#### 2. CONTACTS
```bash
GET /contacts
GET /contacts/search?q=test
POST /contacts (with valid data)
POST /contacts/import
POST /contacts/bulk-delete
GET /contacts/export
```
Expected: All return 200 or 201

#### 3. CONVERSATIONS
```bash
GET /conversations
GET /conversations/:id/messages
GET /conversations/stats
```
Expected: All return 200

#### 4. CAMPAIGNS
```bash
GET /campaigns
GET /campaigns/:id
POST /campaigns
PATCH /campaigns/:id
POST /campaigns/:id/send
```
Expected: All return 200 or 201

#### 5. TEMPLATES
```bash
GET /templates
GET /templates/categories
POST /templates
POST /templates/:id/duplicate
```
Expected: All return 200 or 201

#### 6. SEGMENTS
```bash
GET /segments
POST /segments
GET /segments/:id/preview
```
Expected: All return 200 or 201

#### 7. ANALYTICS
```bash
GET /analytics/overview
GET /analytics/metrics
GET /analytics/campaigns
GET /analytics/revenue
GET /analytics/export
```
Expected: All return 200

#### 8. TEAM
```bash
GET /team
GET /team/roles
POST /team/invite
GET /team/activity
```
Expected: All return 200 or 201

#### 9. BILLING
```bash
GET /billing
GET /billing/plans
GET /billing/invoices
GET /billing/usage
```
Expected: All return 200

#### 10. SETTINGS
```bash
GET /settings
PUT /settings
GET /settings/api-keys
POST /settings/api-keys
```
Expected: All return 200 or 201

#### 11. WHATSAPP SETTINGS
```bash
GET /whatsapp/phone-numbers
GET /whatsapp/credentials
POST /whatsapp/credentials
GET /whatsapp/quality-report
GET /whatsapp/webhook/settings
GET /whatsapp/rate-limits
```
Expected: All return 200 or 201

---

### UI Testing (Browser)

#### Test Each Page
1. Load page
2. Check H1 heading exists
3. Check sidebar navigation works
4. Check data loads
5. Test primary action button
6. Test secondary action buttons
7. Check forms work
8. Check modals open/close

#### Test Flows
1. Login → Dashboard → Contacts → Create Contact
2. Dashboard → Campaigns → Create Campaign → Schedule
3. Settings → WhatsApp → Add Phone Number
4. Team → Invite Member → Assign Role

---

### Security Testing

#### Authentication
- [ ] Valid login works
- [ ] Invalid password fails
- [ ] Expired token rejected
- [ ] Missing token returns 401

#### Authorization
- [ ] Admin can access all
- [ ] Agent can only access assigned conversations
- [ ] Viewer cannot modify data

#### Input Validation
- [ ] XSS scripts are escaped
- [ ] SQL injection returns safe response
- [ ] Invalid phone format rejected
- [ ] Missing required fields return errors

---

### Browser Console Check
```javascript
// Run in browser console on each page
console.clear();
[
  'Errors:', 
  window.performance.getEntriesByType('resource').filter(r => r.responseStatus >= 400).length,
  'Failed requests'
].join('\n');
```

---

## Issue Tracking

### Critical Issues
| Issue | Module | Status | Fix Needed |
|-------|--------|--------|------------|
| Contacts POST 500 | Contacts | Open | Fix unique constraint |
| Dashboard /overview 404 | Dashboard | Open | Add route |
| Notifications 404 | Settings | Open | Add route |

### Minor Issues
| Issue | Module | Status |
|-------|--------|--------|
| Slow page load | All | Low priority |
| Missing loading states | UI | Enhancement |

---

## Current Test Results

### API Endpoints (87% Passing)
| Module | Tested | Passed | Failed |
|--------|--------|--------|--------|
| Dashboard | 3/4 | 3 | 1 |
| Contacts | 5/6 | 5 | 1 |
| Conversations | 2/2 | 2 | 0 |
| Campaigns | 2/3 | 2 | 1 |
| Segments | 1/1 | 1 | 0 |
| Templates | 2/2 | 2 | 0 |
| Team | 3/3 | 3 | 0 |
| Analytics | 5/5 | 5 | 0 |
| Billing | 4/4 | 4 | 0 |
| Settings | 2/3 | 2 | 1 |
| WhatsApp | 5/5 | 5 | 0 |
| **TOTAL** | **34/38** | **34** | **4** |

### UI Components (Testing in Progress)
| Page | Load | Sidebar | Forms | Buttons |
|------|------|---------|-------|---------|
| Dashboard | ✅ | ✅ | N/A | ✅ |
| Contacts | ✅ | ✅ | ✅ | ✅ |
| Conversations | ✅ | ✅ | ✅ | ✅ |
| Campaigns | ✅ | ✅ | ✅ | ✅ |
| Templates | ✅ | ✅ | ✅ | ✅ |
| Segments | ✅ | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ✅ | ✅ |
| Team | ✅ | ✅ | ✅ | ✅ |
| Billing | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ |
| WhatsApp | ✅ | ✅ | ✅ | ✅ |

---

## Continue Testing Command

To continue testing from where you left off:

```bash
# Quick status check
curl -s http://localhost:3001/api/v1/dashboard/stats \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:3001/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@demo.com","password":"demo123"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)"
```

---

## Next Steps

1. **Fix Critical Issues** - 4 endpoints still failing
2. **Complete UI Testing** - Test all forms and buttons
3. **Security Audit** - Formal security testing
4. **Performance Testing** - Load and stress testing
5. **Cross-browser Testing** - Chrome, Firefox, Safari
6. **Mobile Responsive Testing** - Tablet and mobile views
