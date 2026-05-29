"""
Corporate Portal MongoDB Migration
Creates collections and indexes for B2B ride management
"""

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def create_corporate_portal_indexes(db: AsyncIOMotorDatabase):
    """
    Create all collections and indexes for corporate portal.
    
    Collections:
    - corporate_companies: Main company records
    - corporate_employees: Enrolled employees
    - corporate_policies: Ride policies per company
    - corporate_ride_requests: Ride requests with approval tracking
    - corporate_approval_workflows: Multi-step approvals
    - corporate_invoices: Monthly billing
    - corporate_cost_centers: Department budgets
    - corporate_expense_reports: Employee expense tracking
    """
    
    try:
        # ====== Collection 1: corporate_companies ======
        companies_col = db["corporate_companies"]
        
        exists = "corporate_companies" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_companies")
            logger.info("Created collection: corporate_companies")
        
        await companies_col.create_index([("company_name", 1)])
        await companies_col.create_index([("registration_number", 1)], unique=True)
        await companies_col.create_index([("created_at", 1)])
        await companies_col.create_index([("subscription_status", 1)])
        logger.info("Created indexes for corporate_companies")
        
        # ====== Collection 2: corporate_employees ======
        employees_col = db["corporate_employees"]
        
        exists = "corporate_employees" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_employees")
            logger.info("Created collection: corporate_employees")
        
        await employees_col.create_index([("company_id", 1), ("user_id", 1)])
        await employees_col.create_index([("company_id", 1), ("email", 1)])
        await employees_col.create_index([("company_id", 1), ("department", 1)])
        await employees_col.create_index([("is_active", 1)])
        await employees_col.create_index([("joined_date", -1)])
        logger.info("Created indexes for corporate_employees")
        
        # ====== Collection 3: corporate_policies ======
        policies_col = db["corporate_policies"]
        
        exists = "corporate_policies" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_policies")
            logger.info("Created collection: corporate_policies")
        
        await policies_col.create_index([("company_id", 1)])
        await policies_col.create_index([("company_id", 1), ("policy_type", 1)])
        await policies_col.create_index([("is_active", 1)])
        logger.info("Created indexes for corporate_policies")
        
        # ====== Collection 4: corporate_ride_requests ======
        ride_requests_col = db["corporate_ride_requests"]
        
        exists = "corporate_ride_requests" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_ride_requests")
            logger.info("Created collection: corporate_ride_requests")
        
        await ride_requests_col.create_index([("company_id", 1), ("employee_id", 1)])
        await ride_requests_col.create_index([("company_id", 1), ("status", 1)])
        await ride_requests_col.create_index([("company_id", 1), ("approval_status", 1)])
        await ride_requests_col.create_index([("ride_date", -1)])
        await ride_requests_col.create_index([("requested_at", 1)], expireAfterSeconds=2592000)  # 30 days TTL
        logger.info("Created indexes for corporate_ride_requests")
        
        # ====== Collection 5: corporate_approval_workflows ======
        workflows_col = db["corporate_approval_workflows"]
        
        exists = "corporate_approval_workflows" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_approval_workflows")
            logger.info("Created collection: corporate_approval_workflows")
        
        await workflows_col.create_index([("company_id", 1), ("ride_request_id", 1)])
        await workflows_col.create_index([("is_approved", 1), ("is_rejected", 1)])
        await workflows_col.create_index([("expires_at", 1)], expireAfterSeconds=0)  # TTL at expires_at
        logger.info("Created indexes for corporate_approval_workflows")
        
        # ====== Collection 6: corporate_invoices ======
        invoices_col = db["corporate_invoices"]
        
        exists = "corporate_invoices" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_invoices")
            logger.info("Created collection: corporate_invoices")
        
        await invoices_col.create_index([("company_id", 1)])
        await invoices_col.create_index([("company_id", 1), ("billing_month", -1)])
        await invoices_col.create_index([("invoice_number", 1)], unique=True)
        await invoices_col.create_index([("status", 1)])
        await invoices_col.create_index([("payment_due_date", 1)])
        logger.info("Created indexes for corporate_invoices")
        
        # ====== Collection 7: corporate_cost_centers ======
        cost_centers_col = db["corporate_cost_centers"]
        
        exists = "corporate_cost_centers" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_cost_centers")
            logger.info("Created collection: corporate_cost_centers")
        
        await cost_centers_col.create_index([("company_id", 1)])
        await cost_centers_col.create_index([("company_id", 1), ("cost_center_code", 1)])
        logger.info("Created indexes for corporate_cost_centers")
        
        # ====== Collection 8: corporate_expense_reports ======
        reports_col = db["corporate_expense_reports"]
        
        exists = "corporate_expense_reports" in await db.list_collection_names()
        if not exists:
            await db.create_collection("corporate_expense_reports")
            logger.info("Created collection: corporate_expense_reports")
        
        await reports_col.create_index([("company_id", 1), ("employee_id", 1)])
        await reports_col.create_index([("company_id", 1), ("report_period", -1)])
        await reports_col.create_index([("approval_status", 1)])
        logger.info("Created indexes for corporate_expense_reports")
        
        logger.info("✅ Corporate Portal collections and indexes created successfully")
        
    except Exception as e:
        logger.error(f"❌ Error creating corporate portal indexes: {e}")
        raise
