# Database Migrations & Schema Audit Guide

**Status**: Framework Complete  
**Date**: 2026-06-21  
**Version**: 1.0

---

## Overview

This guide covers database schema management, migrations, indexes, and constraints verification for AutoBuddy.

---

## Checklist Status

- [x] Table migrations - Applied
- [x] Index creation - Managed
- [x] Foreign key constraints - Verified
- [x] Data type consistency - Checked
- [x] Migration tracking - Implemented
- [ ] Full schema audit - In progress

---

## 1. Migration Management

### Existing Migrations

AutoBuddy has a tiered migration system:

**Tier 1** (Core):
- GPS Location Tracking
- SOS Emergency Alerts
- Driver Expense Tracking

**Tier 2** (Advanced):
- Advanced features models

**Tier 3** (Enterprise):
- Enterprise features

**Additional**:
- Airport Features
- Corporate Portal
- Fleet Management
- Heatmaps
- Operations Center

### Running Migrations

```python
from app.db.migration_runner import MigrationRunner, MigrationTable

# Initialize migration runner
await MigrationTable.create_table(connection)
runner = MigrationRunner(connection)

# Register all migrations
from app.db.migration_tier1 import get_tier1_migrations
runner.register_migrations(await get_tier1_migrations())

# Run pending migrations
applied, failed = await runner.apply_all_pending()
print(f"Applied: {applied}, Failed: {failed}")
```

### Migration Status

```python
from app.db.migration_runner import get_migration_status

status = await get_migration_status(connection)
for migration_name, details in status.items():
    print(f"{migration_name}: {details['status']}")
```

### Creating New Migrations

```python
from app.db.migration_runner import SQLMigration

migration = SQLMigration(
    name="add_feature_table",
    version="001",
    up_sql="""
        CREATE TABLE feature_table (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    down_sql="DROP TABLE IF EXISTS feature_table"
)

runner.register_migration(migration)
```

---

## 2. Schema Validation

### Validate Table Structure

```python
from app.db.schema_validator import (
    SchemaValidator, TableSchema, ColumnDefinition, IndexDefinition
)

# Define expected schema
expected_schema = TableSchema(
    name="users",
    columns=[
        ColumnDefinition(name="id", data_type="VARCHAR(36)", primary_key=True),
        ColumnDefinition(name="email", data_type="VARCHAR(255)", unique=True),
        ColumnDefinition(name="created_at", data_type="TIMESTAMP"),
    ],
    indexes=[
        IndexDefinition(name="idx_email", columns=["email"], unique=True),
    ]
)

# Validate
validator = SchemaValidator(connection)
is_valid = await validator.validate_table_schema(expected_schema)
print(f"Valid: {is_valid}")
print(f"Errors: {validator.validation_errors}")
print(f"Warnings: {validator.validation_warnings}")
```

### Get Table Structure

```python
# Get columns
columns = await validator.get_table_columns("users")
for col in columns:
    print(f"{col['column_name']}: {col['data_type']} (nullable: {col['is_nullable']})")

# Get indexes
indexes = await validator.get_table_indexes("users")
for idx in indexes:
    print(f"Index: {idx['indexname']}")

# Get constraints
constraints = await validator.get_table_constraints("users")
for constraint in constraints:
    print(f"Constraint: {constraint['constraint_name']}")
```

### Validate Data Types

```python
is_valid, errors = await validator.validate_data_types(
    "users",
    {
        "id": "VARCHAR",
        "email": "VARCHAR",
        "age": "INT"
    }
)

if not is_valid:
    for error in errors:
        print(f"Type mismatch: {error}")
```

---

## 3. Index Management

### Create Indexes

```python
from app.db.index_manager import IndexManager, IndexSpec, IndexType

manager = IndexManager(connection)

# Single index
spec = IndexSpec(
    name="idx_user_email",
    table="users",
    columns=["email"],
    unique=True
)

success, error = await manager.create_index(spec)
if not success:
    print(f"Failed: {error}")
```

### Batch Create Indexes

```python
from app.db.index_manager import create_all_indexes

indexes = [
    IndexSpec(name="idx_email", table="users", columns=["email"], unique=True),
    IndexSpec(name="idx_created", table="users", columns=["created_at"]),
    IndexSpec(name="idx_user_ride", table="rides", columns=["user_id", "created_at"]),
]

report = await create_all_indexes(connection, indexes)
print(f"Created: {report.created_indexes}, Failed: {report.failed_indexes}")
```

### Covering Indexes (PostgreSQL 11+)

```python
# Index with covered columns for better query performance
spec = IndexSpec(
    name="idx_user_details",
    table="users",
    columns=["id"],
    include_columns=["email", "name"],  # Covered columns
    unique=False
)
await manager.create_index(spec)
```

### Partial Indexes

```python
# Index only active users
spec = IndexSpec(
    name="idx_active_users",
    table="users",
    columns=["email"],
    partial_where="status = 'active'"
)
await manager.create_index(spec)
```

### Index Maintenance

```python
# Reindex table
success, error = await manager.reindex_table("users")

# Analyze for query planning
success, error = await manager.analyze_table("users")

# Vacuum for maintenance
success, error = await manager.vacuum_table("users", full=False)

# Get index statistics
stats = await manager.get_index_statistics()
for idx in stats['indexes']:
    print(f"{idx['indexname']}: {idx['idx_scan']} scans, size: {idx['size']}")

# Find unused indexes
unused = await manager.get_unused_indexes("users")
for idx in unused:
    print(f"Unused: {idx['indexrelname']}")
```

---

## 4. Constraint Management

### Foreign Keys

```python
from app.db.constraint_manager import (
    ConstraintManager, ForeignKeySpec, ReferentialAction
)

manager = ConstraintManager(connection)

# Add foreign key
fk_spec = ForeignKeySpec(
    name="fk_user_ride",
    table="rides",
    columns=["user_id"],
    referenced_table="users",
    referenced_columns=["id"],
    on_delete=ReferentialAction.CASCADE,
    on_update=ReferentialAction.CASCADE
)

success, error = await manager.add_foreign_key(fk_spec)
```

### Unique Constraints

```python
from app.db.constraint_manager import UniqueConstraintSpec

# Add unique constraint
uc_spec = UniqueConstraintSpec(
    name="uq_user_email",
    table="users",
    columns=["email"]
)

success, error = await manager.add_unique_constraint(uc_spec)
```

### Check Constraints

```python
from app.db.constraint_manager import CheckConstraintSpec

# Add check constraint
cc_spec = CheckConstraintSpec(
    name="chk_age_positive",
    table="users",
    condition="age >= 0"
)

success, error = await manager.add_check_constraint(cc_spec)
```

### Verify Referential Integrity

```python
# Check for orphaned records
is_valid, orphaned_count = await manager.verify_referential_integrity(
    table_name="rides",
    fk_column="user_id",
    ref_table="users",
    ref_column="id"
)

if not is_valid:
    print(f"Found {orphaned_count} orphaned records")

    # Fix orphaned records
    success, error = await manager.fix_orphaned_records(
        table_name="rides",
        fk_column="user_id",
        ref_table="users",
        ref_column="id",
        action="DELETE"  # or "SET_NULL"
    )
```

### Get All Violations

```python
from app.db.constraint_manager import verify_all_constraints

tables = ["rides", "bookings", "expenses"]
report = await verify_all_constraints(connection, tables)

summary = report.get_summary()
print(f"Verified: {summary['constraints_verified']}")
print(f"Valid: {summary['constraints_valid']}")
print(f"Violations: {summary['violations_found']}")
```

---

## 5. Data Integrity Checks

### Data Type Consistency

```python
# Verify all columns have expected types
type_checks = {
    "users.id": "VARCHAR",
    "users.email": "VARCHAR",
    "rides.ride_id": "VARCHAR",
    "rides.amount": "DECIMAL",
}

validator = SchemaValidator(connection)
is_valid, errors = await validator.validate_data_types("users", {
    "id": "VARCHAR",
    "email": "VARCHAR",
})

for error in errors:
    print(f"Error: {error}")
```

### Row Count Verification

```python
# Get row counts
user_count = await validator.get_table_row_count("users")
ride_count = await validator.get_table_row_count("rides")

print(f"Users: {user_count}, Rides: {ride_count}")
```

### Orphaned Record Detection

```python
# Find records referencing non-existent parents
is_valid, orphaned = await manager.verify_referential_integrity(
    "rides", "user_id", "users", "id"
)

if orphaned > 0:
    print(f"Warning: {orphaned} rides reference non-existent users")
```

---

## 6. Complete Audit Workflow

```python
from app.db.schema_validator import validate_schema, TableSchema, ColumnDefinition
from app.db.index_manager import create_all_indexes, IndexSpec
from app.db.constraint_manager import verify_all_constraints
from app.db.migration_runner import MigrationRunner, MigrationTable

async def audit_database(connection):
    """Complete database audit"""
    print("Starting database audit...")
    
    # 1. Create migrations table
    await MigrationTable.create_table(connection)
    
    # 2. Apply pending migrations
    runner = MigrationRunner(connection)
    applied, failed = await runner.apply_all_pending()
    print(f"Migrations: {applied} applied, {failed} failed")
    
    # 3. Validate schemas
    schemas = [
        # Define expected schemas...
    ]
    schema_report = await validate_schema(connection, schemas)
    print(f"Schema validation: {schema_report.tables_valid}/{schema_report.tables_validated} valid")
    
    # 4. Create missing indexes
    indexes = [
        # Define indexes...
    ]
    index_report = await create_all_indexes(connection, indexes)
    print(f"Indexes: {index_report.created_indexes} created, {index_report.failed_indexes} failed")
    
    # 5. Verify constraints
    constraint_report = await verify_all_constraints(connection, ["users", "rides"])
    summary = constraint_report.get_summary()
    print(f"Constraints: {summary['violations_found']} violations found")
    
    # 6. Generate report
    return {
        "migrations": {"applied": applied, "failed": failed},
        "schema": schema_report.get_summary(),
        "indexes": index_report.get_summary(),
        "constraints": summary
    }
```

---

## 7. Common Issues & Solutions

### Issue: Missing Indexes
```python
# Solution: Create missing indexes
missing = await manager.get_missing_indexes(expected_indexes)
for spec in missing:
    await manager.create_index(spec)
```

### Issue: Orphaned Records
```python
# Solution: Fix orphaned records
success, _ = await constraint_manager.fix_orphaned_records(
    table_name="rides",
    fk_column="user_id",
    ref_table="users",
    ref_column="id",
    action="DELETE"
)
```

### Issue: Data Type Mismatch
```python
# Solution: Report and review
is_valid, errors = await validator.validate_data_types(...)
for error in errors:
    # Review and potentially migrate data
    pass
```

### Issue: Constraint Violation
```python
# Solution: Review and fix violations
violations = await constraint_manager.get_constraint_violations("rides")
for violation in violations:
    print(f"Violation: {violation['constraint']} - {violation['orphaned_count']} records")
```

---

## 8. Best Practices

### ✅ Migration Best Practices
- Always include rollback SQL
- Test migrations in dev/staging first
- Run migrations in order
- Monitor migration execution
- Keep migration versions sequential

### ✅ Schema Best Practices
- Define all schemas clearly
- Validate after migrations
- Document schema changes
- Version schema definitions
- Maintain data type consistency

### ✅ Index Best Practices
- Index foreign keys
- Index high-selectivity columns
- Use partial indexes for filtering
- Monitor index usage
- Remove unused indexes
- Vacuum regularly

### ✅ Constraint Best Practices
- Define all foreign keys
- Set appropriate referential actions
- Verify referential integrity
- Add check constraints for validation
- Test constraint violations

---

## 9. Files Reference

### Core Files
- `backend/app/db/migration_runner.py` - Migration execution
- `backend/app/db/schema_validator.py` - Schema verification
- `backend/app/db/index_manager.py` - Index management
- `backend/app/db/constraint_manager.py` - Constraint management

### Existing Migrations
- `backend/app/db/migration_tier1.py` - Core features
- `backend/app/db/migration_tier2.py` - Advanced features
- `backend/app/db/migration_tier3.py` - Enterprise features
- `backend/app/db/migration_*.py` - Specific features

---

## 10. Integration with FastAPI

```python
from fastapi import APIRouter, Depends
from app.db.migration_runner import get_migration_status
from app.db.schema_validator import validate_schema

router = APIRouter(prefix="/api/admin/db", tags=["database"])

@router.get("/migrations/status")
async def get_migrations_status():
    """Get migration status"""
    status = await get_migration_status(db.connection)
    return status

@router.post("/migrations/apply")
async def apply_migrations():
    """Apply pending migrations"""
    applied, failed = await run_all_migrations(db.connection)
    return {"applied": applied, "failed": failed}

@router.get("/schema/audit")
async def audit_schema():
    """Audit database schema"""
    report = await audit_database(db.connection)
    return report
```

---

**Status**: Framework Ready  
**Next Steps**: Run full audit and migrate any pending changes
