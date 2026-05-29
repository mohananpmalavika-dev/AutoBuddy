"""
Corporate Portal API Test Suite
"""

import pytest
from datetime import datetime


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-admin-token"}


@pytest.fixture
def company_id():
    return "corp_001"


# Company Registration Tests
class TestCompanyManagement:

    @pytest.mark.asyncio
    async def test_register_company(self, client, auth_headers):
        """Test registering a new corporate company."""
        payload = {
            "company_name": "TechCorp India",
            "registration_number": "REG-12345",
            "industry": "IT",
            "employee_count": 500,
            "contact_email": "admin@techcorp.com"
        }
        response = await client.post(
            "/api/v1/corporate/company/register",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        company = data["data"]
        assert company["company_name"] == "TechCorp India"
        assert company["subscription_status"] in ["trial", "basic", "professional", "enterprise"]

    @pytest.mark.asyncio
    async def test_get_company_details(self, client, auth_headers, company_id):
        """Test retrieving company details."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        company = data["data"]
        assert company["company_id"] == company_id or company["id"] == company_id


# Employee Management Tests
class TestEmployeeManagement:

    @pytest.mark.asyncio
    async def test_add_employee(self, client, auth_headers, company_id):
        """Test adding employee to corporate program."""
        payload = {
            "employee_id": "EMP-001",
            "name": "Rajesh Kumar",
            "email": "rajesh@techcorp.com",
            "department": "Engineering",
            "job_title": "Senior Engineer",
            "monthly_ride_budget": 5000,
            "rides_per_month_limit": 20
        }
        response = await client.post(
            f"/api/v1/corporate/company/{company_id}/employees",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        employee = data["data"]
        assert employee["name"] == "Rajesh Kumar"
        assert employee["monthly_ride_budget"] == 5000

    @pytest.mark.asyncio
    async def test_list_employees(self, client, auth_headers, company_id):
        """Test listing company employees."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}/employees",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert isinstance(data["data"], list)

    @pytest.mark.asyncio
    async def test_get_employee_profile(self, client, auth_headers, company_id):
        """Test getting employee profile."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}/employees/emp_001",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        employee = data["data"]
        assert "budget_spent_this_month" in employee
        assert "rides_used_this_month" in employee


# Policy Management Tests
class TestPolicyManagement:

    @pytest.mark.asyncio
    async def test_create_policy(self, client, auth_headers, company_id):
        """Test creating ride policy."""
        payload = {
            "policy_name": "Office to Home",
            "policy_type": "predefined_routes",
            "description": "Predefined routes for office to home",
            "origin_location": "TechCorp HQ",
            "destination_location": "Employee home"
        }
        response = await client.post(
            f"/api/v1/corporate/company/{company_id}/policies",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        policy = data["data"]
        assert policy["policy_type"] == "predefined_routes"
        assert policy["is_active"] == True

    @pytest.mark.asyncio
    async def test_list_policies(self, client, auth_headers, company_id):
        """Test listing company policies."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}/policies",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["data"], list)


# Ride Request Tests
class TestRideRequests:

    @pytest.mark.asyncio
    async def test_request_corporate_ride(self, client, auth_headers, company_id):
        """Test requesting a corporate ride."""
        payload = {
            "company_id": company_id,
            "employee_id": "emp_001",
            "pickup_location": "Office",
            "dropoff_location": "Airport",
            "estimated_cost": 450,
            "ride_type": "premium"
        }
        response = await client.post(
            "/api/v1/corporate/ride-requests",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        ride_request = data["data"]
        assert ride_request["company_id"] == company_id
        assert ride_request["status"] in ["approved", "pending", "rejected"]

    @pytest.mark.asyncio
    async def test_list_ride_requests(self, client, auth_headers, company_id):
        """Test listing ride requests."""
        response = await client.get(
            f"/api/v1/corporate/ride-requests/{company_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["data"], list)

    @pytest.mark.asyncio
    async def test_approve_ride_request(self, client, auth_headers):
        """Test approving a ride request."""
        payload = {"approver_id": "manager_001"}
        response = await client.post(
            "/api/v1/corporate/ride-requests/req_001/approve",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["approval_status"] == "approved"

    @pytest.mark.asyncio
    async def test_reject_ride_request(self, client, auth_headers):
        """Test rejecting a ride request."""
        payload = {"reason": "Destination not in approved list"}
        response = await client.post(
            "/api/v1/corporate/ride-requests/req_002/reject",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["approval_status"] == "rejected"


# Invoice Tests
class TestInvoicing:

    @pytest.mark.asyncio
    async def test_list_invoices(self, client, auth_headers, company_id):
        """Test listing company invoices."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}/invoices",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        invoices = data["data"]
        assert isinstance(invoices, list)
        if invoices:
            assert "invoice_number" in invoices[0]
            assert "total_amount" in invoices[0]

    @pytest.mark.asyncio
    async def test_get_invoice_details(self, client, auth_headers, company_id):
        """Test retrieving detailed invoice."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}/invoices/inv_001",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        invoice = data["data"]
        assert "employee_breakdown" in invoice
        assert invoice["payment_status"] in ["draft", "sent", "paid", "overdue"]

    @pytest.mark.asyncio
    async def test_download_invoice(self, client, auth_headers, company_id):
        """Test downloading invoice as PDF."""
        response = await client.post(
            f"/api/v1/corporate/company/{company_id}/invoices/inv_001/download",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "download_url" in data["data"]


# Cost Center Tests
class TestCostCenters:

    @pytest.mark.asyncio
    async def test_list_cost_centers(self, client, auth_headers, company_id):
        """Test listing cost centers."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}/cost-centers",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["data"], list)


# Expense Report Tests
class TestExpenseReports:

    @pytest.mark.asyncio
    async def test_create_expense_report(self, client, auth_headers, company_id):
        """Test creating expense report."""
        payload = {
            "report_period": "2024-03",
            "total_rides": 15,
            "total_cost": 3500
        }
        response = await client.post(
            f"/api/v1/corporate/company/{company_id}/employees/emp_001/expense-reports",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        report = data["data"]
        assert report["approval_status"] == "draft"

    @pytest.mark.asyncio
    async def test_submit_expense_report(self, client, auth_headers):
        """Test submitting expense report."""
        response = await client.post(
            "/api/v1/corporate/expense-reports/report_001/submit",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["approval_status"] == "submitted"


# Analytics Tests
class TestAnalytics:

    @pytest.mark.asyncio
    async def test_get_corporate_dashboard(self, client, auth_headers, company_id):
        """Test retrieving corporate dashboard."""
        response = await client.get(
            f"/api/v1/corporate/company/{company_id}/analytics/dashboard",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        dashboard = data["data"]
        assert "metrics" in dashboard
        assert "active_employees" in dashboard["metrics"]
        assert "policy_compliance_rate" in dashboard["metrics"]
        assert "pending_approvals" in dashboard
