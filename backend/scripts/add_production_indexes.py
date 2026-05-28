"""
Database Migration Runner - Apply critical indexes and schema updates
Run: python add_production_indexes.py
"""

import os
import psycopg2
from psycopg2 import sql
import sys
from datetime import datetime

# Configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "autobuddy")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


class IndexMigration:
    def __init__(self):
        self.connection = None
        self.cursor = None
        self.migrations_applied = []
        self.migrations_failed = []
    
    def connect(self):
        """Establish database connection"""
        try:
            self.connection = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                connect_timeout=10
            )
            self.cursor = self.connection.cursor()
            print(f"{Colors.GREEN}✓ Connected to database{Colors.RESET}")
            return True
        except Exception as e:
            print(f"{Colors.RED}✗ Connection failed: {str(e)}{Colors.RESET}")
            return False
    
    def close(self):
        """Close connection"""
        if self.cursor:
            self.cursor.close()
        if self.connection:
            self.connection.close()
    
    def apply_migration(self, name: str, sql_command: str, check_sql: str = None):
        """Apply a single migration"""
        try:
            print(f"\n{Colors.BLUE}Applying: {name}...{Colors.RESET}")
            
            # Check if already applied
            if check_sql:
                try:
                    self.cursor.execute(check_sql)
                    result = self.cursor.fetchone()
                    if result and result[0]:
                        print(f"{Colors.YELLOW}! Already applied (skipping){Colors.RESET}")
                        self.migrations_applied.append(name)
                        return True
                except:
                    pass
            
            # Execute migration
            self.cursor.execute(sql_command)
            self.connection.commit()
            
            print(f"{Colors.GREEN}✓ Applied: {name}{Colors.RESET}")
            self.migrations_applied.append(name)
            return True
        
        except Exception as e:
            self.connection.rollback()
            print(f"{Colors.RED}✗ Failed: {str(e)}{Colors.RESET}")
            self.migrations_failed.append((name, str(e)))
            return False
    
    def run_all_migrations(self):
        """Apply all critical migrations"""
        print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}APPLYING PRODUCTION INDEXES{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*60}{Colors.RESET}")
        
        # Migration 1: Rides table indexes
        self.apply_migration(
            "Index rides(driver_id, created_at)",
            """
            CREATE INDEX IF NOT EXISTS idx_rides_driver_created 
            ON rides(driver_id, created_at DESC)
            WHERE status IN ('completed', 'cancelled', 'no_show');
            """,
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rides_driver_created')"
        )
        
        # Migration 2: Bookings table indexes
        self.apply_migration(
            "Index bookings(passenger_id, created_at)",
            """
            CREATE INDEX IF NOT EXISTS idx_bookings_passenger_created 
            ON bookings(passenger_id, created_at DESC)
            WHERE status IN ('completed', 'cancelled');
            """,
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bookings_passenger_created')"
        )
        
        # Migration 3: Support tickets indexes
        self.apply_migration(
            "Index support_tickets(status, assigned_to)",
            """
            CREATE INDEX IF NOT EXISTS idx_support_tickets_status_assigned 
            ON support_tickets(status, assigned_to)
            WHERE status != 'closed';
            """,
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_support_tickets_status_assigned')"
        )
        
        # Migration 4: Ratings indexes
        self.apply_migration(
            "Index ratings(user_id, created_at)",
            """
            CREATE INDEX IF NOT EXISTS idx_ratings_user_created 
            ON ratings(user_id, created_at DESC);
            """,
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ratings_user_created')"
        )
        
        # Migration 5: Audit logs indexes
        self.apply_migration(
            "Index audit_logs(user_id, action_type)",
            """
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action 
            ON audit_logs(user_id, action_type, created_at DESC);
            """,
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_user_action')"
        )
        
        # Migration 6: Additional performance indexes
        self.apply_migration(
            "Index rides(status, created_at)",
            """
            CREATE INDEX IF NOT EXISTS idx_rides_status_created 
            ON rides(status, created_at DESC);
            """,
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rides_status_created')"
        )
        
        # Migration 7: Users table indexes
        self.apply_migration(
            "Index users(email)",
            """
            CREATE INDEX IF NOT EXISTS idx_users_email 
            ON users(email);
            """,
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_email')"
        )
        
        # Migration 8: Push notifications
        self.apply_migration(
            "Create push_notification_subscriptions table",
            """
            CREATE TABLE IF NOT EXISTS push_notification_subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                device_token TEXT NOT NULL UNIQUE,
                device_type VARCHAR(50),
                platform VARCHAR(50),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, device_token)
            );
            CREATE INDEX IF NOT EXISTS idx_push_notifications_user_active 
            ON push_notification_subscriptions(user_id) 
            WHERE is_active = true;
            """,
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_notification_subscriptions')"
        )
        
        # Migration 9: Accessibility settings
        self.apply_migration(
            "Create accessibility_settings table",
            """
            CREATE TABLE IF NOT EXISTS accessibility_settings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                high_contrast BOOLEAN DEFAULT false,
                large_text BOOLEAN DEFAULT false,
                bold_text BOOLEAN DEFAULT false,
                reduce_motion BOOLEAN DEFAULT false,
                screen_reader BOOLEAN DEFAULT false,
                text_to_speech BOOLEAN DEFAULT false,
                voice_control BOOLEAN DEFAULT false,
                closed_captions BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_accessibility_user 
            ON accessibility_settings(user_id);
            """,
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accessibility_settings')"
        )
        
        # Migration 10: Vacuum and analyze
        print(f"\n{Colors.BLUE}Optimizing database...{Colors.RESET}")
        try:
            self.cursor.execute("VACUUM ANALYZE")
            self.connection.commit()
            print(f"{Colors.GREEN}✓ Database optimized{Colors.RESET}")
        except Exception as e:
            print(f"{Colors.YELLOW}! Optimization skipped: {str(e)}{Colors.RESET}")
    
    def generate_report(self):
        """Generate migration report"""
        print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}MIGRATION REPORT{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*60}{Colors.RESET}")
        
        print(f"\n{Colors.GREEN}✓ Applied ({len(self.migrations_applied)}){Colors.RESET}")
        for name in self.migrations_applied:
            print(f"  - {name}")
        
        if self.migrations_failed:
            print(f"\n{Colors.RED}✗ Failed ({len(self.migrations_failed)}){Colors.RESET}")
            for name, error in self.migrations_failed:
                print(f"  - {name}: {error}")
        
        total = len(self.migrations_applied) + len(self.migrations_failed)
        status_symbol = Colors.GREEN + "✓" + Colors.RESET if not self.migrations_failed else Colors.RED + "✗" + Colors.RESET
        
        print(f"\n{status_symbol} {len(self.migrations_applied)}/{total} migrations applied")
        print(f"\n{Colors.BOLD}Next Steps:{Colors.RESET}")
        print(f"  1. Run: python verify_database.py")
        print(f"  2. Test database queries for performance")
        print(f"  3. Deploy to production")
        
        return len(self.migrations_failed) == 0


def main():
    """Main entry point"""
    migrator = IndexMigration()
    
    if not migrator.connect():
        sys.exit(1)
    
    try:
        migrator.run_all_migrations()
        success = migrator.generate_report()
        
        if success:
            sys.exit(0)
        else:
            sys.exit(1)
    
    finally:
        migrator.close()


if __name__ == "__main__":
    main()
