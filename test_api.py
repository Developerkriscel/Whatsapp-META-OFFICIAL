import urllib.request, json

BASE = "http://localhost:3001"

def login(email, pw):
    data = json.dumps({"email": email, "password": pw}).encode()
    req = urllib.request.Request(f"{BASE}/api/v1/auth/login", data=data, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["data"]["accessToken"]

def get(path, token=""):
    try:
        h = {"Authorization": f"Bearer {token}"} if token else {}
        req = urllib.request.Request(f"{BASE}{path}", headers=h)
        resp = json.loads(urllib.request.urlopen(req).read())
        return "OK" if resp.get("success") or isinstance(resp, list) else f"FAIL: {resp.get('message', resp.get('error', '')[:40]}"
    except Exception as e:
        return f"ERROR: {str(e)[:50]}"

def post(path, token, data, method="POST"):
    try:
        req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(data).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        req.get_method = lambda: method
        resp = json.loads(urllib.request.urlopen(req).read())
        return "OK" if resp.get("success") or isinstance(resp, list) else f"FAIL: {resp.get('message', resp.get('error', '')[:40]}"
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        return f"HTTP {e.code}: {body.get('message', body.get('error', '')[:40]}"
    except Exception as e:
        return f"ERROR: {str(e)[:50]}"

t = login("admin@demo.com", "demo123")
sa = login("admin@whatsapp-saas.com", "admin123")

pages = [
    ("Dashboard", "/api/v1/dashboard", t),
    ("Contacts", "/api/v1/contacts", t),
    ("Conversations", "/api/v1/conversations", t),
    ("Campaigns", "/api/v1/campaigns", t),
    ("Templates", "/api/v1/templates", t),
    ("Segments", "/api/v1/segments", t),
    ("Tags", "/api/v1/tags", t),
    ("BotFlows", "/api/v1/chatbot/flows", t),
    ("WhatsApp Phones", "/api/v1/whatsapp/phone-numbers", t),
    ("Settings", "/api/v1/settings", t),
    ("Analytics", "/api/v1/analytics/overview", t),
    ("Team", "/api/v1/team", t),
    ("Billing", "/api/v1/billing", t),
    ("BillingPlans", "/api/v1/billing/plans", t),
    ("Addons", "/api/v1/addons", t),
]

sa_pages = [
    ("SA Dashboard", "/api/v1/superadmin/dashboard", sa),
    ("SA Tenants", "/api/v1/superadmin/tenants", sa),
    ("SA Tickets", "/api/v1/superadmin/tickets", sa),
    ("SA AuditLogs", "/api/v1/superadmin/audit-logs", sa),
    ("SA Plans", "/api/v1/superadmin/plans", sa),
    ("SA Settings", "/api/v1/superadmin/settings", sa),
    ("SA Billing", "/api/v1/superadmin/billing", sa),
]

write_ops = [
    ("POST /contacts", "/api/v1/contacts", t, {"phone": "+15550000001", "name": "API Test", "email": "test@demo.com"}),
    ("POST /segments", "/api/v1/segments", t, {"name": "API Seg", "description": "Test"}),
    ("POST /tags", "/api/v1/tags", t, {"name": "api-test-tag", "color": "blue"}),
    ("POST /chatbot/flows", "/api/v1/chatbot/flows", t, {"name": "API Flow", "description": "Test"}),
    ("POST /campaigns", "/api/v1/campaigns", t, {"name": "API Camp", "audienceType": "all"}),
    ("PATCH /auth/me", "/api/v1/auth/me", t, {"name": "Admin Updated"}),
    ("POST /auth/logout", "/api/v1/auth/logout", t, {}),
    ("POST /auth/forgot-password", "/api/v1/auth/forgot-password", "", {"email": "admin@demo.com"}),
    ("POST /register", "/api/v1/auth/register", "", {"name": "New User", "email": "newuser@test.com", "password": "test12345678", "tenantName": "New Tenant"}),
]

print("=" * 60)
print("FULL SYSTEM TEST")
print("=" * 60)
print(f"\nTENANT PAGES ({t[:20]}...):")
for name, path, token in pages:
    print(f"  {name:20s}: {get(path, token)}")

print(f"\nSUPERADMIN PAGES ({sa[:20]}...):")
for name, path, token in sa_pages:
    print(f"  {name:20s}: {get(path, token)}")

print(f"\nWRITE OPERATIONS:")
for name, path, token, data in write_ops:
    method = "POST" if "me" not in path else "PATCH"
    print(f"  {name:30s}: {post(path, token, data, method)}")

print(f"\nPUBLIC:")
print(f"  {'GET /plans':20s}: {get('/api/v1/plans')}")

print("\n" + "=" * 60)
print("ALL TESTS DONE")
print("=" * 60)
