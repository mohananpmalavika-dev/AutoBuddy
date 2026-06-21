"""
Database Constraint Manager
Manages foreign keys and other constraints
Location: backend/app/db/constraint_manager.py
"""

import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class ConstraintType(Enum):
    """Constraint types"""
    PRIMARY_KEY = "PRIMARY KEY"
    FOREIGN_KEY = "FOREIGN KEY"
    UNIQUE = "UNIQUE"
    CHECK = "CHECK"
    NOT_NULL = "NOT NULL"

class ReferentialAction(Enum):
    """Referential action options"""
    CASCADE = "CASCADE"
    RESTRICT = "RESTRICT"
    SET_NULL = "SET NULL"
    SET_DEFAULT = "SET DEFAULT"
    NO_ACTION = "NO ACTION"

@dataclass
class ForeignKeySpec:
    """Foreign key specification"""
    name: str
    table: str
    columns: List[str]
    referenced_table: str
    referenced_columns: List[str]
    on_delete: ReferentialAction = ReferentialAction.RESTRICT
    on_update: ReferentialAction = ReferentialAction.RESTRICT

@dataclass
class UniqueConstraintSpec:
    """Unique constraint specification"""
    name: str
    table: str
    columns: List[str]

@dataclass
class CheckConstraintSpec:
    """Check constraint specification"""
    name: str
    table: str
    condition: str

class ConstraintManager:
    """Manages database constraints"""

    def __init__(self, connection):
        self.connection = connection

    async def add_foreign_key(self, spec: ForeignKeySpec) -> Tuple[bool, Optional[str]]:
        """Add a foreign key constraint"""
        try:
            columns_str = ", ".join(spec.columns)
            ref_columns_str = ", ".join(spec.referenced_columns)

            query = f"""
                ALTER TABLE {spec.table}
                ADD CONSTRAINT {spec.name}
                FOREIGN KEY ({columns_str})
                REFERENCES {spec.referenced_table} ({ref_columns_str})
                ON DELETE {spec.on_delete.value}
                ON UPDATE {spec.on_update.value}
            """

            await self.connection.execute(query)
            logger.info(f"✓ Added foreign key: {spec.name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to add foreign key {spec.name}: {error_msg}")
            return False, error_msg

    async def drop_foreign_key(self, table_name: str, constraint_name: str) -> Tuple[bool, Optional[str]]:
        """Drop a foreign key constraint"""
        try:
            query = f"""
                ALTER TABLE {table_name}
                DROP CONSTRAINT {constraint_name}
            """
            await self.connection.execute(query)
            logger.info(f"✓ Dropped foreign key: {constraint_name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to drop foreign key {constraint_name}: {error_msg}")
            return False, error_msg

    async def add_unique_constraint(self, spec: UniqueConstraintSpec) -> Tuple[bool, Optional[str]]:
        """Add a unique constraint"""
        try:
            columns_str = ", ".join(spec.columns)

            query = f"""
                ALTER TABLE {spec.table}
                ADD CONSTRAINT {spec.name}
                UNIQUE ({columns_str})
            """

            await self.connection.execute(query)
            logger.info(f"✓ Added unique constraint: {spec.name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to add unique constraint {spec.name}: {error_msg}")
            return False, error_msg

    async def add_check_constraint(self, spec: CheckConstraintSpec) -> Tuple[bool, Optional[str]]:
        """Add a check constraint"""
        try:
            query = f"""
                ALTER TABLE {spec.table}
                ADD CONSTRAINT {spec.name}
                CHECK ({spec.condition})
            """

            await self.connection.execute(query)
            logger.info(f"✓ Added check constraint: {spec.name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to add check constraint {spec.name}: {error_msg}")
            return False, error_msg

    async def get_foreign_keys(self, table_name: str) -> List[Dict]:
        """Get all foreign keys for a table"""
        query = """
            SELECT
                constraint_name,
                table_name,
                column_name,
                foreign_table_name,
                foreign_column_name
            FROM information_schema.key_column_usage
            WHERE table_name = :table_name
            AND referenced_table_name IS NOT NULL
        """
        try:
            fks = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in fks]
        except Exception as e:
            logger.error(f"Error fetching foreign keys: {str(e)}")
            return []

    async def get_unique_constraints(self, table_name: str) -> List[Dict]:
        """Get all unique constraints for a table"""
        query = """
            SELECT
                constraint_name,
                column_name
            FROM information_schema.constraint_column_usage
            WHERE table_name = :table_name
            AND constraint_type = 'UNIQUE'
        """
        try:
            constraints = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in constraints]
        except Exception as e:
            logger.error(f"Error fetching unique constraints: {str(e)}")
            return []

    async def get_check_constraints(self, table_name: str) -> List[Dict]:
        """Get all check constraints for a table"""
        query = """
            SELECT
                constraint_name,
                check_clause
            FROM information_schema.check_constraints
            WHERE table_name = :table_name
        """
        try:
            constraints = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in constraints]
        except Exception as e:
            logger.error(f"Error fetching check constraints: {str(e)}")
            return []

    async def verify_referential_integrity(
        self,
        table_name: str,
        fk_column: str,
        ref_table: str,
        ref_column: str
    ) -> Tuple[bool, int]:
        """Check for orphaned records (referential integrity violations)"""
        query = f"""
            SELECT COUNT(*)
            FROM {table_name} t
            LEFT JOIN {ref_table} r ON t.{fk_column} = r.{ref_column}
            WHERE t.{fk_column} IS NOT NULL AND r.{ref_column} IS NULL
        """
        try:
            count = await self.connection.fetchval(query)
            return count == 0, count
        except Exception as e:
            logger.error(f"Error verifying referential integrity: {str(e)}")
            return False, -1

    async def fix_orphaned_records(
        self,
        table_name: str,
        fk_column: str,
        ref_table: str,
        ref_column: str,
        action: str = "DELETE"
    ) -> Tuple[bool, Optional[str]]:
        """Fix orphaned records"""
        try:
            if action == "DELETE":
                query = f"""
                    DELETE FROM {table_name} t
                    WHERE {fk_column} NOT IN (SELECT {ref_column} FROM {ref_table})
                    AND {fk_column} IS NOT NULL
                """
            elif action == "SET_NULL":
                query = f"""
                    UPDATE {table_name}
                    SET {fk_column} = NULL
                    WHERE {fk_column} NOT IN (SELECT {ref_column} FROM {ref_table})
                """
            else:
                return False, f"Unknown action: {action}"

            result = await self.connection.execute(query)
            logger.info(f"✓ Fixed orphaned records in {table_name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to fix orphaned records: {error_msg}")
            return False, error_msg

    async def get_constraint_violations(self, table_name: str) -> List[Dict]:
        """Get all constraint violations in a table"""
        violations = []

        # Check foreign keys
        fks = await self.get_foreign_keys(table_name)
        for fk in fks:
            is_valid, orphaned_count = await self.verify_referential_integrity(
                table_name,
                fk['column_name'],
                fk['foreign_table_name'],
                fk['foreign_column_name']
            )
            if not is_valid:
                violations.append({
                    "type": "foreign_key_violation",
                    "constraint": fk['constraint_name'],
                    "column": fk['column_name'],
                    "orphaned_count": orphaned_count
                })

        return violations

    async def add_constraints_batch(
        self,
        foreign_keys: List[ForeignKeySpec] = None,
        unique_constraints: List[UniqueConstraintSpec] = None,
        check_constraints: List[CheckConstraintSpec] = None
    ) -> Tuple[int, int]:
        """Add multiple constraints"""
        added = 0
        failed = 0

        if foreign_keys:
            for fk in foreign_keys:
                success, _ = await self.add_foreign_key(fk)
                if success:
                    added += 1
                else:
                    failed += 1

        if unique_constraints:
            for uc in unique_constraints:
                success, _ = await self.add_unique_constraint(uc)
                if success:
                    added += 1
                else:
                    failed += 1

        if check_constraints:
            for cc in check_constraints:
                success, _ = await self.add_check_constraint(cc)
                if success:
                    added += 1
                else:
                    failed += 1

        logger.info(f"Batch constraint addition: {added} added, {failed} failed")
        return added, failed

class ConstraintReport:
    """Report on constraint status"""

    def __init__(self):
        self.constraints_verified = 0
        self.constraints_valid = 0
        self.violations: List[Dict] = []
        self.errors: List[str] = []

    def get_summary(self) -> Dict:
        """Get report summary"""
        return {
            "constraints_verified": self.constraints_verified,
            "constraints_valid": self.constraints_valid,
            "violations_found": len(self.violations),
            "total_errors": len(self.errors),
            "violations": self.violations[:10],
            "errors": self.errors[:5]
        }

# Export helpers
async def verify_all_constraints(connection, tables: List[str]) -> ConstraintReport:
    """Verify all constraints in specified tables"""
    manager = ConstraintManager(connection)
    report = ConstraintReport()

    for table in tables:
        violations = await manager.get_constraint_violations(table)
        report.constraints_verified += 1
        if not violations:
            report.constraints_valid += 1
        else:
            report.violations.extend(violations)

    return report
