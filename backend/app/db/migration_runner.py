"""
Unified Database Migration Runner
Manages and executes all database migrations
Location: backend/app/db/migration_runner.py
"""

import logging
from typing import List, Dict, Optional, Tuple
from enum import Enum
from datetime import datetime
from abc import ABC, abstractmethod
import hashlib

logger = logging.getLogger(__name__)

class MigrationStatus(Enum):
    """Migration execution status"""
    PENDING = "pending"
    APPLIED = "applied"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"

class MigrationRecord:
    """Record of a migration execution"""

    def __init__(
        self,
        name: str,
        version: str,
        status: MigrationStatus,
        applied_at: Optional[datetime] = None,
        error: Optional[str] = None,
        checksum: Optional[str] = None
    ):
        self.name = name
        self.version = version
        self.status = status
        self.applied_at = applied_at or datetime.now()
        self.error = error
        self.checksum = checksum

class BaseMigration(ABC):
    """Base class for all migrations"""

    def __init__(self, name: str, version: str):
        self.name = name
        self.version = version
        self.description = ""
        self.timestamp = datetime.now()

    @abstractmethod
    async def up(self, connection):
        """Apply migration"""
        pass

    @abstractmethod
    async def down(self, connection):
        """Rollback migration"""
        pass

    def get_checksum(self) -> str:
        """Generate checksum for migration"""
        migration_str = f"{self.name}{self.version}{self.__class__.__doc__}"
        return hashlib.md5(migration_str.encode()).hexdigest()

class SQLMigration(BaseMigration):
    """SQL-based migration"""

    def __init__(self, name: str, version: str, up_sql: str, down_sql: str = ""):
        super().__init__(name, version)
        self.up_sql = up_sql
        self.down_sql = down_sql

    async def up(self, connection):
        """Execute up migration"""
        try:
            await connection.execute(self.up_sql)
            logger.info(f"Migration {self.name} v{self.version} applied successfully")
        except Exception as e:
            logger.error(f"Migration {self.name} v{self.version} failed: {str(e)}")
            raise

    async def down(self, connection):
        """Execute down migration"""
        if not self.down_sql:
            logger.warning(f"No rollback SQL defined for {self.name}")
            return
        try:
            await connection.execute(self.down_sql)
            logger.info(f"Migration {self.name} v{self.version} rolled back")
        except Exception as e:
            logger.error(f"Rollback of {self.name} failed: {str(e)}")
            raise

class MigrationRunner:
    """Manages migration execution"""

    def __init__(self, connection):
        self.connection = connection
        self.migrations: List[BaseMigration] = []
        self.applied_migrations: Dict[str, MigrationRecord] = {}

    def register_migration(self, migration: BaseMigration):
        """Register a migration"""
        self.migrations.append(migration)
        logger.debug(f"Registered migration: {migration.name} v{migration.version}")

    def register_migrations(self, migrations: List[BaseMigration]):
        """Register multiple migrations"""
        for migration in migrations:
            self.register_migration(migration)

    async def get_applied_migrations(self) -> Dict[str, MigrationRecord]:
        """Get list of applied migrations from database"""
        try:
            query = "SELECT name, version, applied_at, checksum FROM migrations WHERE status = 'applied' ORDER BY version"
            result = await self.connection.fetch(query)
            self.applied_migrations = {
                f"{row['name']}_{row['version']}": MigrationRecord(
                    name=row['name'],
                    version=row['version'],
                    status=MigrationStatus.APPLIED,
                    applied_at=row['applied_at'],
                    checksum=row['checksum']
                )
                for row in result
            }
            return self.applied_migrations
        except Exception as e:
            logger.warning(f"Could not fetch applied migrations: {str(e)}")
            return {}

    async def get_pending_migrations(self) -> List[BaseMigration]:
        """Get list of pending migrations"""
        applied = await self.get_applied_migrations()
        pending = [
            m for m in self.migrations
            if f"{m.name}_{m.version}" not in applied
        ]
        return pending

    async def apply_migration(self, migration: BaseMigration) -> Tuple[bool, Optional[str]]:
        """Apply a single migration"""
        try:
            await migration.up(self.connection)
            checksum = migration.get_checksum()

            # Record migration
            query = """
                INSERT INTO migrations (name, version, status, applied_at, checksum)
                VALUES (:name, :version, 'applied', :applied_at, :checksum)
                ON CONFLICT (name, version) DO UPDATE SET status = 'applied'
            """
            await self.connection.execute(
                query,
                {
                    "name": migration.name,
                    "version": migration.version,
                    "applied_at": datetime.now(),
                    "checksum": checksum
                }
            )

            logger.info(f"✓ Applied: {migration.name} v{migration.version}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Failed: {migration.name} v{migration.version} - {error_msg}")

            # Record failure
            try:
                query = """
                    INSERT INTO migrations (name, version, status, error)
                    VALUES (:name, :version, 'failed', :error)
                    ON CONFLICT (name, version) DO UPDATE SET status = 'failed', error = :error
                """
                await self.connection.execute(
                    query,
                    {"name": migration.name, "version": migration.version, "error": error_msg}
                )
            except Exception:
                pass

            return False, error_msg

    async def apply_all_pending(self) -> Tuple[int, int]:
        """Apply all pending migrations"""
        pending = await self.get_pending_migrations()
        if not pending:
            logger.info("No pending migrations")
            return 0, 0

        logger.info(f"Found {len(pending)} pending migrations")

        applied_count = 0
        failed_count = 0

        for migration in pending:
            success, error = await self.apply_migration(migration)
            if success:
                applied_count += 1
            else:
                failed_count += 1

        logger.info(f"Migration complete: {applied_count} applied, {failed_count} failed")
        return applied_count, failed_count

    async def rollback_migration(self, migration: BaseMigration) -> Tuple[bool, Optional[str]]:
        """Rollback a single migration"""
        try:
            await migration.down(self.connection)

            # Update migration status
            query = """
                UPDATE migrations SET status = 'rolled_back'
                WHERE name = :name AND version = :version
            """
            await self.connection.execute(
                query,
                {"name": migration.name, "version": migration.version}
            )

            logger.info(f"✓ Rolled back: {migration.name} v{migration.version}")
            return True, None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"✗ Rollback failed: {migration.name} v{migration.version} - {error_msg}")
            return False, error_msg

    async def get_migration_status(self) -> Dict[str, Dict]:
        """Get status of all migrations"""
        status = {}
        for migration in self.migrations:
            key = f"{migration.name}_{migration.version}"
            applied = await self.get_applied_migrations()
            if key in applied:
                record = applied[key]
                status[key] = {
                    "name": migration.name,
                    "version": migration.version,
                    "status": record.status.value,
                    "applied_at": record.applied_at.isoformat() if record.applied_at else None,
                    "checksum": record.checksum
                }
            else:
                status[key] = {
                    "name": migration.name,
                    "version": migration.version,
                    "status": MigrationStatus.PENDING.value,
                    "applied_at": None,
                    "checksum": None
                }
        return status

class MigrationTable:
    """Creates and manages the migrations tracking table"""

    @staticmethod
    async def create_table(connection):
        """Create migrations tracking table"""
        query = """
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                version VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                checksum VARCHAR(32),
                error TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, version)
            );

            CREATE INDEX IF NOT EXISTS ix_migrations_status ON migrations(status);
            CREATE INDEX IF NOT EXISTS ix_migrations_name_version ON migrations(name, version);
        """
        try:
            await connection.execute(query)
            logger.info("Migrations table created/verified")
        except Exception as e:
            logger.error(f"Failed to create migrations table: {str(e)}")
            raise

# Export helpers
async def run_all_migrations(connection):
    """Convenience function to run all migrations"""
    await MigrationTable.create_table(connection)
    runner = MigrationRunner(connection)
    # Migrations will be registered by migration modules
    applied, failed = await runner.apply_all_pending()
    return applied, failed

async def get_migration_status(connection):
    """Get status of all migrations"""
    runner = MigrationRunner(connection)
    return await runner.get_migration_status()
