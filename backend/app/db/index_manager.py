"""
Database Index Manager
Creates and verifies indexes for performance
Location: backend/app/db/index_manager.py
"""

import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class IndexType(Enum):
    """Index types"""
    BTREE = "BTREE"
    HASH = "HASH"
    GIST = "GIST"
    GIN = "GIN"
    BRIN = "BRIN"

@dataclass
class IndexSpec:
    """Index specification"""
    name: str
    table: str
    columns: List[str]
    index_type: IndexType = IndexType.BTREE
    unique: bool = False
    partial_where: Optional[str] = None  # Partial index condition
    include_columns: List[str] = None  # Covering index columns (PostgreSQL 11+)

    def __post_init__(self):
        if self.include_columns is None:
            self.include_columns = []

@dataclass
class IndexInfo:
    """Information about an existing index"""
    name: str
    table: str
    columns: List[str]
    unique: bool
    valid: bool
    index_type: str

class IndexManager:
    """Manages database indexes"""

    def __init__(self, connection):
        self.connection = connection

    async def create_index(self, spec: IndexSpec, if_not_exists: bool = True) -> Tuple[bool, Optional[str]]:
        """Create an index"""
        try:
            if_not_exists_clause = "IF NOT EXISTS" if if_not_exists else ""
            unique_clause = "UNIQUE" if spec.unique else ""
            columns_str = ", ".join(spec.columns)
            include_clause = ""

            if spec.include_columns:
                include_clause = f" INCLUDE ({', '.join(spec.include_columns)})"

            partial_clause = ""
            if spec.partial_where:
                partial_clause = f" WHERE {spec.partial_where}"

            query = f"""
                CREATE {unique_clause} INDEX {if_not_exists_clause} {spec.name}
                ON {spec.table} USING {spec.index_type.value} ({columns_str}){include_clause}{partial_clause}
            """

            await self.connection.execute(query)
            logger.info(f"✓ Created index: {spec.name} on {spec.table}({columns_str})")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to create index {spec.name}: {error_msg}")
            return False, error_msg

    async def drop_index(self, index_name: str, if_exists: bool = True) -> Tuple[bool, Optional[str]]:
        """Drop an index"""
        try:
            if_exists_clause = "IF EXISTS" if if_exists else ""
            query = f"DROP INDEX {if_exists_clause} {index_name}"
            await self.connection.execute(query)
            logger.info(f"✓ Dropped index: {index_name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to drop index {index_name}: {error_msg}")
            return False, error_msg

    async def index_exists(self, index_name: str) -> bool:
        """Check if index exists"""
        query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_indexes WHERE indexname = :index_name
            )
        """
        try:
            result = await self.connection.fetchval(query, {"index_name": index_name})
            return result
        except Exception as e:
            logger.error(f"Error checking index existence: {str(e)}")
            return False

    async def get_table_indexes(self, table_name: str) -> List[IndexInfo]:
        """Get all indexes for a table"""
        query = """
            SELECT
                indexname,
                tablename,
                indexdef,
                schemaname
            FROM pg_indexes
            WHERE tablename = :table_name
        """
        try:
            indexes = await self.connection.fetch(query, {"table_name": table_name})
            result = []

            for idx in indexes:
                # Parse index definition to extract details
                index_def = idx['indexdef']
                columns = self._extract_columns_from_def(index_def)
                unique = "UNIQUE" in index_def.upper()
                index_type = self._extract_index_type(index_def)

                result.append(IndexInfo(
                    name=idx['indexname'],
                    table=idx['tablename'],
                    columns=columns,
                    unique=unique,
                    valid=True,
                    index_type=index_type
                ))

            return result
        except Exception as e:
            logger.error(f"Error fetching indexes for {table_name}: {str(e)}")
            return []

    async def get_missing_indexes(self, expected_indexes: List[IndexSpec]) -> List[IndexSpec]:
        """Find indexes that should exist but don't"""
        missing = []

        for spec in expected_indexes:
            exists = await self.index_exists(spec.name)
            if not exists:
                missing.append(spec)

        return missing

    async def get_unused_indexes(self, table_name: str) -> List[Dict]:
        """Get unused indexes for a table"""
        query = """
            SELECT
                indexrelname,
                idx_scan,
                idx_tup_read,
                idx_tup_fetch
            FROM pg_stat_user_indexes
            WHERE relname = :table_name AND idx_scan = 0
            ORDER BY indexrelname
        """
        try:
            unused = await self.connection.fetch(query, {"table_name": table_name})
            return [dict(row) for row in unused]
        except Exception as e:
            logger.error(f"Error finding unused indexes: {str(e)}")
            return []

    async def get_index_size(self, index_name: str) -> Optional[int]:
        """Get size of an index in bytes"""
        query = """
            SELECT pg_relation_size(:index_name)
        """
        try:
            size = await self.connection.fetchval(query, {"index_name": index_name})
            return size
        except Exception as e:
            logger.error(f"Error getting index size: {str(e)}")
            return None

    async def reindex_table(self, table_name: str) -> Tuple[bool, Optional[str]]:
        """Reindex all indexes for a table"""
        try:
            query = f"REINDEX TABLE CONCURRENTLY {table_name}"
            await self.connection.execute(query)
            logger.info(f"✓ Reindexed table: {table_name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to reindex table {table_name}: {error_msg}")
            return False, error_msg

    async def analyze_table(self, table_name: str) -> Tuple[bool, Optional[str]]:
        """Analyze table for query planning"""
        try:
            query = f"ANALYZE {table_name}"
            await self.connection.execute(query)
            logger.info(f"✓ Analyzed table: {table_name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to analyze table {table_name}: {error_msg}")
            return False, error_msg

    async def vacuum_table(self, table_name: str, full: bool = False) -> Tuple[bool, Optional[str]]:
        """Vacuum table for maintenance"""
        try:
            full_clause = "FULL" if full else ""
            query = f"VACUUM {full_clause} {table_name}"
            await self.connection.execute(query)
            logger.info(f"✓ Vacuumed table: {table_name}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed to vacuum table {table_name}: {error_msg}")
            return False, error_msg

    async def create_indexes_batch(self, specs: List[IndexSpec]) -> Tuple[int, int]:
        """Create multiple indexes"""
        created = 0
        failed = 0

        for spec in specs:
            success, _ = await self.create_index(spec)
            if success:
                created += 1
            else:
                failed += 1

        logger.info(f"Batch index creation: {created} created, {failed} failed")
        return created, failed

    async def get_index_statistics(self) -> Dict:
        """Get statistics on all indexes"""
        query = """
            SELECT
                schemaname,
                tablename,
                indexname,
                idx_scan,
                idx_tup_read,
                idx_tup_fetch,
                pg_size_pretty(pg_relation_size(indexrelid)) as size
            FROM pg_stat_user_indexes
            ORDER BY idx_scan DESC
        """
        try:
            stats = await self.connection.fetch(query)
            return {
                "total_indexes": len(stats),
                "indexes": [dict(row) for row in stats]
            }
        except Exception as e:
            logger.error(f"Error getting index statistics: {str(e)}")
            return {"error": str(e)}

    @staticmethod
    def _extract_columns_from_def(index_def: str) -> List[str]:
        """Extract column names from index definition"""
        # Simple parsing - may need enhancement for complex indexes
        try:
            start = index_def.find("(") + 1
            end = index_def.find(")")
            if start > 0 and end > start:
                cols_str = index_def[start:end]
                return [c.strip() for c in cols_str.split(",")]
        except Exception:
            pass
        return []

    @staticmethod
    def _extract_index_type(index_def: str) -> str:
        """Extract index type from definition"""
        if "USING" in index_def:
            parts = index_def.split("USING")
            if len(parts) > 1:
                return parts[1].split()[0].strip()
        return "BTREE"

class IndexReport:
    """Report on index status"""

    def __init__(self):
        self.created_indexes = 0
        self.failed_indexes = 0
        self.missing_indexes: List[str] = []
        self.unused_indexes: List[str] = []
        self.errors: List[str] = []

    def get_summary(self) -> Dict:
        """Get report summary"""
        return {
            "created_indexes": self.created_indexes,
            "failed_indexes": self.failed_indexes,
            "missing_indexes": self.missing_indexes,
            "unused_indexes": self.unused_indexes,
            "total_issues": self.failed_indexes + len(self.missing_indexes),
            "errors": self.errors
        }

# Export helpers
async def create_all_indexes(connection, index_specs: List[IndexSpec]) -> IndexReport:
    """Create all specified indexes"""
    manager = IndexManager(connection)
    report = IndexReport()

    for spec in index_specs:
        success, error = await manager.create_index(spec)
        if success:
            report.created_indexes += 1
        else:
            report.failed_indexes += 1
            if error:
                report.errors.append(f"{spec.name}: {error}")

    return report
