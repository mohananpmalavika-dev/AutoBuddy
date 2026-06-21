"""
Database Schema Validator
Verifies table structure, indexes, and constraints
Location: backend/app/db/schema_validator.py
"""

import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class ColumnType(Enum):
    """SQL column data types"""
    VARCHAR = "VARCHAR"
    INT = "INT"
    BIGINT = "BIGINT"
    DECIMAL = "DECIMAL"
    FLOAT = "FLOAT"
    BOOLEAN = "BOOLEAN"
    TIMESTAMP = "TIMESTAMP"
    TEXT = "TEXT"
    UUID = "UUID"
    JSONB = "JSONB"

@dataclass
class ColumnDefinition:
    """Column schema definition"""
    name: str
    data_type: str
    nullable: bool = True
    primary_key: bool = False
    unique: bool = False
    default: Optional[str] = None
    check_constraint: Optional[str] = None

@dataclass
class IndexDefinition:
    """Index schema definition"""
    name: str
    columns: List[str]
    unique: bool = False

@dataclass
class ForeignKeyDefinition:
    """Foreign key schema definition"""
    name: str
    columns: List[str]
    referenced_table: str
    referenced_columns: List[str]
    on_delete: str = "RESTRICT"
    on_update: str = "RESTRICT"

@dataclass
class TableSchema:
    """Complete table schema definition"""
    name: str
    columns: List[ColumnDefinition]
    indexes: List[IndexDefinition] = None
    foreign_keys: List[ForeignKeyDefinition] = None
    check_constraints: List[str] = None

    def __post_init__(self):
        if self.indexes is None:
            self.indexes = []
        if self.foreign_keys is None:
            self.foreign_keys = []
        if self.check_constraints is None:
            self.check_constraints = []

class SchemaValidator:
    """Validates database schema"""

    def __init__(self, connection):
        self.connection = connection
        self.validation_errors: List[str] = []
        self.validation_warnings: List[str] = []

    async def validate_table_exists(self, table_name: str) -> bool:
        """Check if table exists"""
        query = """
            SELECT EXISTS(
                SELECT FROM information_schema.tables
                WHERE table_name = :table_name
            )
        """
        try:
            result = await self.connection.fetchval(query, {"table_name": table_name})
            return result
        except Exception as e:
            logger.error(f"Error checking table existence: {str(e)}")
            return False

    async def get_table_columns(self, table_name: str) -> List[Dict]:
        """Get all columns for a table"""
        query = """
            SELECT
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = :table_name
            ORDER BY ordinal_position
        """
        try:
            columns = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in columns]
        except Exception as e:
            logger.error(f"Error fetching columns: {str(e)}")
            return []

    async def get_table_indexes(self, table_name: str) -> List[Dict]:
        """Get all indexes for a table"""
        query = """
            SELECT
                indexname,
                indexdef
            FROM pg_indexes
            WHERE tablename = :table_name
        """
        try:
            indexes = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in indexes]
        except Exception as e:
            logger.error(f"Error fetching indexes: {str(e)}")
            return []

    async def get_table_constraints(self, table_name: str) -> List[Dict]:
        """Get all constraints for a table"""
        query = """
            SELECT
                constraint_name,
                constraint_type,
                column_name
            FROM information_schema.constraint_column_usage
            WHERE table_name = :table_name
        """
        try:
            constraints = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in constraints]
        except Exception as e:
            logger.error(f"Error fetching constraints: {str(e)}")
            return []

    async def get_foreign_keys(self, table_name: str) -> List[Dict]:
        """Get all foreign keys for a table"""
        query = """
            SELECT
                constraint_name,
                column_name,
                foreign_table_name,
                foreign_column_name
            FROM information_schema.referential_constraints
            JOIN information_schema.constraint_column_usage ON constraint_name = name
            WHERE table_name = :table_name
        """
        try:
            fks = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in fks]
        except Exception as e:
            logger.error(f"Error fetching foreign keys: {str(e)}")
            return []

    async def validate_table_schema(self, expected_schema: TableSchema) -> bool:
        """Validate table against expected schema"""
        # Check table exists
        if not await self.validate_table_exists(expected_schema.name):
            self.validation_errors.append(f"Table '{expected_schema.name}' does not exist")
            return False

        # Check columns
        actual_columns = await self.get_table_columns(expected_schema.name)
        actual_column_names = {col['column_name'] for col in actual_columns}

        for expected_col in expected_schema.columns:
            if expected_col.name not in actual_column_names:
                self.validation_errors.append(
                    f"Column '{expected_col.name}' missing from table '{expected_schema.name}'"
                )
            else:
                # Check data type
                actual_col = next((c for c in actual_columns if c['column_name'] == expected_col.name), None)
                if actual_col and actual_col['data_type'].upper() != expected_col.data_type.upper():
                    self.validation_warnings.append(
                        f"Column '{expected_col.name}' data type mismatch: "
                        f"expected {expected_col.data_type}, got {actual_col['data_type']}"
                    )

        # Check indexes
        actual_indexes = await self.get_table_indexes(expected_schema.name)
        actual_index_names = {idx['indexname'] for idx in actual_indexes}

        for expected_idx in expected_schema.indexes:
            if expected_idx.name not in actual_index_names:
                self.validation_warnings.append(
                    f"Index '{expected_idx.name}' missing from table '{expected_schema.name}'"
                )

        # Check foreign keys
        actual_fks = await self.get_foreign_keys(expected_schema.name)
        actual_fk_names = {fk['constraint_name'] for fk in actual_fks}

        for expected_fk in expected_schema.foreign_keys:
            if expected_fk.name not in actual_fk_names:
                self.validation_warnings.append(
                    f"Foreign key '{expected_fk.name}' missing from table '{expected_schema.name}'"
                )

        return len(self.validation_errors) == 0

    async def validate_data_types(self, table_name: str, column_checks: Dict[str, str]) -> Tuple[bool, List[str]]:
        """Validate data type consistency"""
        errors = []
        columns = await self.get_table_columns(table_name)

        for col_name, expected_type in column_checks.items():
            column = next((c for c in columns if c['column_name'] == col_name), None)
            if not column:
                errors.append(f"Column '{col_name}' not found in table '{table_name}'")
            elif column['data_type'].upper() != expected_type.upper():
                errors.append(
                    f"Column '{col_name}' type mismatch: expected {expected_type}, got {column['data_type']}"
                )

        return len(errors) == 0, errors

    async def get_table_row_count(self, table_name: str) -> Optional[int]:
        """Get row count for a table"""
        query = f"SELECT COUNT(*) FROM {table_name}"
        try:
            count = await self.connection.fetchval(query)
            return count
        except Exception as e:
            logger.error(f"Error counting rows in {table_name}: {str(e)}")
            return None

    async def validate_no_orphaned_rows(self, table_name: str, fk_definition: ForeignKeyDefinition) -> Tuple[bool, int]:
        """Check for orphaned foreign key references"""
        # Build query to find orphaned rows
        fk_col = fk_definition.columns[0]
        ref_col = fk_definition.referenced_columns[0]

        query = f"""
            SELECT COUNT(*)
            FROM {table_name} t
            LEFT JOIN {fk_definition.referenced_table} r ON t.{fk_col} = r.{ref_col}
            WHERE t.{fk_col} IS NOT NULL AND r.{ref_col} IS NULL
        """

        try:
            count = await self.connection.fetchval(query)
            return count == 0, count
        except Exception as e:
            logger.error(f"Error checking orphaned rows: {str(e)}")
            return False, -1

class SchemaReport:
    """Report on schema validation"""

    def __init__(self):
        self.tables_validated = 0
        self.tables_valid = 0
        self.tables_invalid = 0
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def add_table_result(self, table_name: str, is_valid: bool, errors: List[str] = None, warnings: List[str] = None):
        """Add validation result for table"""
        self.tables_validated += 1
        if is_valid:
            self.tables_valid += 1
        else:
            self.tables_invalid += 1

        if errors:
            self.errors.extend([f"{table_name}: {e}" for e in errors])
        if warnings:
            self.warnings.extend([f"{table_name}: {w}" for w in warnings])

    def is_valid(self) -> bool:
        """Check if all validations passed"""
        return self.tables_invalid == 0 and len(self.errors) == 0

    def get_summary(self) -> Dict:
        """Get validation summary"""
        return {
            "tables_validated": self.tables_validated,
            "tables_valid": self.tables_valid,
            "tables_invalid": self.tables_invalid,
            "total_errors": len(self.errors),
            "total_warnings": len(self.warnings),
            "is_valid": self.is_valid(),
            "errors": self.errors[:10],  # First 10 errors
            "warnings": self.warnings[:10]  # First 10 warnings
        }

# Export helpers
async def validate_schema(connection, table_schemas: List[TableSchema]) -> SchemaReport:
    """Validate multiple table schemas"""
    validator = SchemaValidator(connection)
    report = SchemaReport()

    for schema in table_schemas:
        is_valid = await validator.validate_table_schema(schema)
        report.add_table_result(
            schema.name,
            is_valid,
            validator.validation_errors,
            validator.validation_warnings
        )
        validator.validation_errors = []
        validator.validation_warnings = []

    return report
